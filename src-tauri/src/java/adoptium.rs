#![allow(dead_code)]
use crate::error::LauncherError;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

/// Client for the Adoptium API to download Java runtimes.
/// API docs: https://api.adoptium.net/q/swagger-ui/
pub struct AdoptiumClient {
    client: reqwest::Client,
}

#[derive(Debug, Deserialize)]
pub struct AdoptiumRelease {
    binary: AdoptiumBinary,
    version: AdoptiumVersion,
}

#[derive(Debug, Deserialize)]
struct AdoptiumBinary {
    package: AdoptiumPackage,
    os: String,
    architecture: String,
}

#[derive(Debug, Deserialize)]
struct AdoptiumPackage {
    link: String,
    checksum: Option<String>,
    name: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct AdoptiumVersion {
    major: u32,
    minor: u32,
    security: u32,
    build: Option<u32>,
}

#[derive(Clone, serde::Serialize)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: f64,
    pub step: String,
}

impl AdoptiumClient {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    /// Fetches the latest JDK release for the given major version and platform.
    pub async fn fetch_latest_release(
        &self,
        major_version: u32,
    ) -> Result<AdoptiumRelease, LauncherError> {
        let os = current_os();
        let arch = current_arch();

        let url = format!(
            "https://api.adoptium.net/v3/assets/latest/{}/hotspot\
             ?architecture={}&image_type=jdk&os={}&vendor=eclipse",
            major_version, arch, os
        );

        let releases: Vec<AdoptiumRelease> = self.client
            .get(&url)
            .header("Accept", "application/json")
            .send()
            .await?
            .json()
            .await?;

        releases.into_iter().next().ok_or_else(|| {
            LauncherError::JavaNotFound(format!(
                "No Adoptium JDK {} release found for {}/{}",
                major_version, os, arch
            ))
        })
    }

    /// Downloads and extracts a JDK release to the specified directory.
    pub async fn download_jdk(
        &self,
        app: &AppHandle,
        release: &AdoptiumRelease,
        dest_dir: &Path,
    ) -> Result<PathBuf, LauncherError> {
        let url = &release.binary.package.link;
        let total_bytes = release.binary.package.size;
        let filename = &release.binary.package.name;

        // Download the archive
        let archive_path = dest_dir.join(filename);
        std::fs::create_dir_all(dest_dir)?;

        let response = self.client.get(url).send().await?;
        let mut downloaded: u64 = 0;
        let mut file = std::fs::File::create(&archive_path)?;

        let mut stream = response.bytes_stream();
        use futures_util::StreamExt;
        use std::io::Write;

        while let Some(chunk) = stream.next().await {
            let chunk = chunk?;
            file.write_all(&chunk)?;
            downloaded += chunk.len() as u64;

            // Emit progress event
            let _ = app.emit("java-download-progress", DownloadProgress {
                downloaded_bytes: downloaded,
                total_bytes,
                percent: (downloaded as f64 / total_bytes as f64) * 100.0,
                step: "Downloading Java".to_string(),
            });
        }
        drop(file);

        // Extract the archive
        let extract_dir = dest_dir.join(format!("temurin-{}", release.version.major));
        std::fs::create_dir_all(&extract_dir)?;

        let _ = app.emit("java-download-progress", DownloadProgress {
            downloaded_bytes: total_bytes,
            total_bytes,
            percent: 100.0,
            step: "Extracting Java".to_string(),
        });

        if filename.ends_with(".zip") {
            extract_zip(&archive_path, &extract_dir)?;
        } else if filename.ends_with(".tar.gz") {
            extract_tar_gz(&archive_path, &extract_dir)?;
        }

        // Clean up archive
        std::fs::remove_file(&archive_path).ok();

        // Find the java executable in the extracted directory
        let java_exe = find_java_in_dir(&extract_dir)?;

        Ok(java_exe)
    }
}

fn extract_zip(archive: &Path, dest: &Path) -> Result<(), LauncherError> {
    let file = std::fs::File::open(archive)?;
    let mut zip = zip::ZipArchive::new(file)?;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        let name = entry.name().to_string();

        // Strip the top-level directory (e.g., "jdk-25.0.1+10/")
        let stripped = name.split('/').skip(1).collect::<Vec<_>>().join("/");
        if stripped.is_empty() { continue; }

        let out_path = dest.join(&stripped);

        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut out)?;
        }
    }

    Ok(())
}

fn extract_tar_gz(archive: &Path, dest: &Path) -> Result<(), LauncherError> {
    #[allow(unused_imports)]
    use std::io::Read;
    let file = std::fs::File::open(archive)?;
    let gz = flate2::read::GzDecoder::new(file);
    let mut tar = tar::Archive::new(gz);

    // Extract with top-level directory stripping
    for entry in tar.entries()? {
        let mut entry = entry?;
        let path = entry.path()?.into_owned();
        let stripped: PathBuf = path.components().skip(1).collect();
        if stripped.as_os_str().is_empty() { continue; }

        let out_path = dest.join(&stripped);
        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&out_path)?;
        } else {
            if let Some(parent) = out_path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            let mut out = std::fs::File::create(&out_path)?;
            std::io::copy(&mut entry, &mut out)?;
        }
    }

    Ok(())
}

fn find_java_in_dir(dir: &Path) -> Result<PathBuf, LauncherError> {
    let exe_name = if cfg!(windows) { "java.exe" } else { "java" };
    let java = dir.join("bin").join(exe_name);
    if java.exists() {
        return Ok(java);
    }

    // Search one level deep
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let candidate = entry.path().join("bin").join(exe_name);
            if candidate.exists() {
                return Ok(candidate);
            }
        }
    }

    Err(LauncherError::JavaNotFound(format!(
        "java executable not found in {}",
        dir.display()
    )))
}

fn current_os() -> &'static str {
    if cfg!(target_os = "windows") { "windows" }
    else if cfg!(target_os = "macos") { "mac" }
    else { "linux" }
}

fn current_arch() -> &'static str {
    if cfg!(target_arch = "x86_64") { "x64" }
    else if cfg!(target_arch = "aarch64") { "aarch64" }
    else { "x64" }
}

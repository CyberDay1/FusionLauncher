use crate::error::LauncherError;
use crate::minecraft::library;
use crate::minecraft::manifest::{self, VersionDetail};
use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
pub struct InstallProgress {
    pub step: String,
    pub item: String,
    pub current: u32,
    pub total: u32,
    pub percent: f64,
}

/// Downloads a complete Minecraft installation for an instance.
pub async fn install_minecraft(
    app: &AppHandle,
    client: &reqwest::Client,
    version_id: &str,
    game_dir: &Path,
    assets_dir: &Path,
    is_server: bool,
) -> Result<(), LauncherError> {
    // Step 1: Fetch version manifest
    emit_progress(app, "Fetching version manifest", version_id, 0, 5);
    let manifest = manifest::fetch_version_manifest(client).await?;

    let version_entry = manifest.versions.iter()
        .find(|v| v.id == version_id)
        .ok_or_else(|| LauncherError::McVersionNotFound(version_id.to_string()))?;

    // Step 2: Fetch version detail
    emit_progress(app, "Fetching version details", version_id, 1, 5);
    let detail = manifest::fetch_version_detail(client, &version_entry.url).await?;

    // Step 3: Download game JAR
    emit_progress(app, "Downloading game JAR", version_id, 2, 5);
    let versions_dir = game_dir.join("versions").join(version_id);
    std::fs::create_dir_all(&versions_dir)?;

    let jar_entry = if is_server {
        detail.downloads.server.as_ref()
    } else {
        detail.downloads.client.as_ref()
    };

    if let Some(entry) = jar_entry {
        let jar_path = versions_dir.join(format!("{}.jar", version_id));
        if !jar_path.exists() {
            download_file(client, &entry.url, &jar_path).await?;
        }
    }

    // Save version JSON
    let json_path = versions_dir.join(format!("{}.json", version_id));
    let json_content = serde_json::to_string_pretty(&detail)?;
    std::fs::write(&json_path, json_content)?;

    // Step 4: Download libraries
    emit_progress(app, "Downloading libraries", "", 3, 5);
    let libraries_dir = game_dir.join("libraries");
    std::fs::create_dir_all(&libraries_dir)?;

    let total_libs = detail.libraries.len() as u32;
    for (i, lib) in detail.libraries.iter().enumerate() {
        // Check OS rules
        if let Some(ref rules) = lib.rules {
            if !manifest::evaluate_rules(rules) {
                continue;
            }
        }

        if let Some(ref downloads) = lib.downloads {
            if let Some(ref artifact) = downloads.artifact {
                let lib_path = libraries_dir.join(&artifact.path);
                if !lib_path.exists() {
                    if let Some(parent) = lib_path.parent() {
                        std::fs::create_dir_all(parent)?;
                    }
                    download_file(client, &artifact.url, &lib_path).await?;
                }
            }
        } else {
            // Library without download info — resolve from Maven coord
            let lib_path = library::maven_to_path(&libraries_dir, &lib.name);
            if !lib_path.exists() {
                // Try Maven Central
                let maven_url = maven_central_url(&lib.name);
                if let Some(parent) = lib_path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                match download_file(client, &maven_url, &lib_path).await {
                    Ok(_) => {}
                    Err(_) => {
                        tracing::warn!("Could not download library: {}", lib.name);
                    }
                }
            }
        }

        let _ = app.emit("mc-download-progress", InstallProgress {
            step: "Downloading libraries".to_string(),
            item: lib.name.clone(),
            current: i as u32 + 1,
            total: total_libs,
            percent: ((i + 1) as f64 / total_libs as f64) * 100.0,
        });
    }

    // Step 5: Download assets (client only)
    if !is_server {
        emit_progress(app, "Downloading assets", "", 4, 5);
        download_assets(app, client, &detail, assets_dir).await?;
    }

    // Step 6: Done
    emit_progress(app, "Installation complete", version_id, 5, 5);

    Ok(())
}

/// Downloads the asset index + all asset objects for a MC version.
pub async fn download_assets(
    app: &AppHandle,
    client: &reqwest::Client,
    detail: &VersionDetail,
    assets_dir: &Path,
) -> Result<(), LauncherError> {
    let index_id = &detail.asset_index.id;
    let indexes_dir = assets_dir.join("indexes");
    let objects_dir = assets_dir.join("objects");
    std::fs::create_dir_all(&indexes_dir)?;
    std::fs::create_dir_all(&objects_dir)?;

    // Download asset index JSON
    let index_path = indexes_dir.join(format!("{}.json", index_id));
    if !index_path.exists() {
        download_file(client, &detail.asset_index.url, &index_path).await?;
    }

    // Parse the index to get all asset objects
    let index_content = std::fs::read_to_string(&index_path)?;
    let index: AssetIndex = serde_json::from_str(&index_content)
        .map_err(|e| LauncherError::Other(format!("Failed to parse asset index: {}", e)))?;

    // Deduplicate by hash (many assets share the same file)
    let mut unique_hashes: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut to_download: Vec<(String, u64)> = Vec::new();
    for obj in index.objects.values() {
        if unique_hashes.insert(obj.hash.clone()) {
            let prefix = &obj.hash[..2];
            let obj_path = objects_dir.join(prefix).join(&obj.hash);
            if !obj_path.exists() {
                to_download.push((obj.hash.clone(), obj.size));
            }
        }
    }

    let total = to_download.len() as u32;
    if total == 0 {
        return Ok(());
    }

    // Download missing assets (batch with progress)
    for (i, (hash, _size)) in to_download.iter().enumerate() {
        let prefix = &hash[..2];
        let obj_path = objects_dir.join(prefix).join(hash);
        std::fs::create_dir_all(obj_path.parent().unwrap())?;

        let url = format!("https://resources.download.minecraft.net/{}/{}", prefix, hash);
        download_file(client, &url, &obj_path).await?;

        // Emit progress every 50 assets to avoid flooding
        if i % 50 == 0 || i as u32 == total - 1 {
            let _ = app.emit("mc-download-progress", InstallProgress {
                step: "Downloading assets".to_string(),
                item: format!("{}/{}", i + 1, total),
                current: i as u32 + 1,
                total,
                percent: ((i + 1) as f64 / total as f64) * 100.0,
            });
        }
    }

    Ok(())
}

#[derive(Debug, serde::Deserialize)]
struct AssetIndex {
    objects: std::collections::HashMap<String, AssetObject>,
}

#[derive(Debug, serde::Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

/// Downloads a file from a URL to a local path.
pub async fn download_file(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
) -> Result<(), LauncherError> {
    let response = client.get(url).send().await?;

    if !response.status().is_success() {
        return Err(LauncherError::Download(format!(
            "HTTP {} for {}",
            response.status(),
            url
        )));
    }

    let bytes = response.bytes().await?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(dest, &bytes)?;

    Ok(())
}

/// Constructs a Maven Central URL from a Maven coordinate.
fn maven_central_url(coordinate: &str) -> String {
    let parts: Vec<&str> = coordinate.split(':').collect();
    if parts.len() < 3 {
        return format!("https://repo1.maven.org/maven2/{}", coordinate);
    }

    let group = parts[0];
    let artifact = parts[1];
    let version = parts[2];

    format!(
        "https://repo1.maven.org/maven2/{}/{}/{}/{}-{}.jar",
        group.replace('.', "/"),
        artifact,
        version,
        artifact,
        version
    )
}

fn emit_progress(app: &AppHandle, step: &str, item: &str, current: u32, total: u32) {
    let _ = app.emit("mc-download-progress", InstallProgress {
        step: step.to_string(),
        item: item.to_string(),
        current,
        total,
        percent: (current as f64 / total as f64) * 100.0,
    });
}

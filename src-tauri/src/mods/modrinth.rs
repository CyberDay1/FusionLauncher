use crate::error::LauncherError;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const MODRINTH_API: &str = "https://api.modrinth.com/v2";
const USER_AGENT: &str = "FusionLauncher/0.1.0 (https://github.com/CyberDay1/FusionLauncher)";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModrinthProject {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub author: String,
    pub downloads: u64,
    pub icon_url: Option<String>,
    pub categories: Vec<String>,
    pub client_side: String,
    pub server_side: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModrinthVersion {
    pub id: String,
    pub project_id: String,
    pub version_number: String,
    pub name: String,
    pub game_versions: Vec<String>,
    pub loaders: Vec<String>,
    pub files: Vec<ModrinthFile>,
    #[serde(default)]
    pub dependencies: Vec<ModrinthDependency>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModrinthFile {
    pub url: String,
    pub filename: String,
    pub size: u64,
    pub primary: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModrinthDependency {
    pub version_id: Option<String>,
    pub project_id: Option<String>,
    pub dependency_type: String, // "required", "optional", "incompatible"
}

/// Full project detail (from /project/{id} endpoint).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModrinthProjectDetail {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub body: String,                    // Full markdown description
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub followers: u64,
    pub categories: Vec<String>,
    pub client_side: String,
    pub server_side: String,
    pub license: Option<ModrinthLicense>,
    pub source_url: Option<String>,
    pub issues_url: Option<String>,
    pub wiki_url: Option<String>,
    pub discord_url: Option<String>,
    pub donation_urls: Option<Vec<ModrinthDonation>>,
    pub gallery: Option<Vec<ModrinthGalleryImage>>,
    pub published: String,
    pub updated: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModrinthLicense {
    pub id: Option<String>,
    pub name: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModrinthDonation {
    pub id: String,
    pub platform: String,
    pub url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModrinthGalleryImage {
    pub url: String,
    pub title: Option<String>,
    pub description: Option<String>,
}

/// Paginated search result.
#[derive(Clone, Debug, Serialize)]
pub struct SearchResult {
    pub mods: Vec<ModrinthProject>,
    pub total_hits: u64,
}

/// Result of installing a mod with its dependencies.
#[derive(Clone, Debug, Serialize)]
pub struct InstallResult {
    pub installed: Vec<String>,  // filenames of installed mods
    pub skipped: Vec<String>,    // already present
    pub failed: Vec<String>,     // failed to download
}

#[derive(Debug, Deserialize)]
struct SearchResponse {
    hits: Vec<SearchHit>,
    total_hits: u64,
}

#[derive(Debug, Deserialize)]
struct SearchHit {
    project_id: String,
    slug: String,
    title: String,
    description: String,
    author: String,
    downloads: u64,
    icon_url: Option<String>,
    categories: Vec<String>,
    client_side: String,
    server_side: String,
}

fn hit_to_project(h: SearchHit) -> ModrinthProject {
    ModrinthProject {
        project_id: h.project_id, slug: h.slug, title: h.title,
        description: h.description, author: h.author, downloads: h.downloads,
        icon_url: h.icon_url, categories: h.categories,
        client_side: h.client_side, server_side: h.server_side,
    }
}

/// Searches Modrinth for mods matching the query, with pagination.
pub async fn search_mods(
    client: &reqwest::Client,
    query: &str,
    mc_version: &str,
    offset: u32,
    limit: u32,
) -> Result<SearchResult, LauncherError> {
    let facets = format!(r#"[["versions:{}"],["project_type:mod"]]"#, mc_version);
    let limit_str = limit.to_string();
    let offset_str = offset.to_string();

    let response: SearchResponse = client
        .get(format!("{}/search", MODRINTH_API))
        .query(&[
            ("query", query),
            ("facets", facets.as_str()),
            ("limit", limit_str.as_str()),
            ("offset", offset_str.as_str()),
        ])
        .header("User-Agent", USER_AGENT)
        .send().await?.json().await?;

    Ok(SearchResult {
        mods: response.hits.into_iter().map(hit_to_project).collect(),
        total_hits: response.total_hits,
    })
}

/// Gets trending/popular mods for a MC version, with pagination.
pub async fn get_trending_mods(
    client: &reqwest::Client,
    mc_version: &str,
    offset: u32,
    limit: u32,
) -> Result<SearchResult, LauncherError> {
    let facets = format!(r#"[["versions:{}"],["project_type:mod"]]"#, mc_version);
    let limit_str = limit.to_string();
    let offset_str = offset.to_string();

    let response: SearchResponse = client
        .get(format!("{}/search", MODRINTH_API))
        .query(&[
            ("facets", facets.as_str()),
            ("limit", limit_str.as_str()),
            ("offset", offset_str.as_str()),
            ("index", "downloads"),
        ])
        .header("User-Agent", USER_AGENT)
        .send().await?.json().await?;

    Ok(SearchResult {
        mods: response.hits.into_iter().map(hit_to_project).collect(),
        total_hits: response.total_hits,
    })
}

/// Gets full project details from Modrinth.
pub async fn get_project_detail(
    client: &reqwest::Client,
    project_id: &str,
) -> Result<ModrinthProjectDetail, LauncherError> {
    let detail: ModrinthProjectDetail = client
        .get(format!("{}/project/{}", MODRINTH_API, project_id))
        .header("User-Agent", USER_AGENT)
        .send().await?.json().await?;
    Ok(detail)
}

/// Gets available versions for a project filtered by MC version.
pub async fn get_versions(
    client: &reqwest::Client,
    project_id: &str,
    mc_version: &str,
) -> Result<Vec<ModrinthVersion>, LauncherError> {
    let versions: Vec<ModrinthVersion> = client
        .get(format!("{}/project/{}/version", MODRINTH_API, project_id))
        .query(&[("game_versions", &format!(r#"["{}"]"#, mc_version))])
        .header("User-Agent", USER_AGENT)
        .send().await?.json().await?;
    Ok(versions)
}

/// Gets a specific version by ID.
pub async fn get_version(
    client: &reqwest::Client,
    version_id: &str,
) -> Result<ModrinthVersion, LauncherError> {
    let version: ModrinthVersion = client
        .get(format!("{}/version/{}", MODRINTH_API, version_id))
        .header("User-Agent", USER_AGENT)
        .send().await?.json().await?;
    Ok(version)
}

/// Installs a mod and all its required dependencies.
/// Recursively resolves the dependency tree, skipping already-installed mods.
pub async fn install_mod_with_deps(
    client: &reqwest::Client,
    project_id: &str,
    mc_version: &str,
    mods_dir: &std::path::Path,
) -> Result<InstallResult, LauncherError> {
    let mut result = InstallResult {
        installed: vec![], skipped: vec![], failed: vec![],
    };

    // Track which projects we've already processed to avoid cycles
    let mut processed: HashSet<String> = HashSet::new();

    // Get existing mod filenames to detect already-installed mods
    let existing: HashSet<String> = if mods_dir.exists() {
        std::fs::read_dir(mods_dir)?
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                if name.ends_with(".jar") || name.ends_with(".jar.disabled") {
                    Some(name)
                } else {
                    None
                }
            })
            .collect()
    } else {
        HashSet::new()
    };

    install_recursive(
        client, project_id, mc_version, mods_dir,
        &mut processed, &existing, &mut result,
    ).await?;

    Ok(result)
}

fn install_recursive<'a>(
    client: &'a reqwest::Client,
    project_id: &'a str,
    mc_version: &'a str,
    mods_dir: &'a std::path::Path,
    processed: &'a mut HashSet<String>,
    existing: &'a HashSet<String>,
    result: &'a mut InstallResult,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), LauncherError>> + Send + 'a>> {
  Box::pin(async move {
    if processed.contains(project_id) {
        return Ok(());
    }
    processed.insert(project_id.to_string());

    // Get the latest version for this MC version
    let versions = get_versions(client, project_id, mc_version).await?;
    let version = match versions.first() {
        Some(v) => v.clone(),
        None => {
            result.failed.push(format!("No version found for {}", project_id));
            return Ok(());
        }
    };

    // Find the primary file
    let file = match version.files.iter().find(|f| f.primary).or(version.files.first()) {
        Some(f) => f.clone(),
        None => {
            result.failed.push(format!("No file for {}", project_id));
            return Ok(());
        }
    };

    // Check if already installed
    if existing.contains(&file.filename) {
        result.skipped.push(file.filename.clone());
    } else {
        // Download the mod
        std::fs::create_dir_all(mods_dir)?;
        match crate::minecraft::downloader::download_file(
            client, &file.url, &mods_dir.join(&file.filename)
        ).await {
            Ok(_) => {
                tracing::info!("Installed mod: {}", file.filename);
                result.installed.push(file.filename.clone());
            }
            Err(e) => {
                tracing::warn!("Failed to download {}: {}", file.filename, e);
                result.failed.push(file.filename.clone());
            }
        }
    }

    // Resolve required dependencies recursively
    for dep in &version.dependencies {
        if dep.dependency_type != "required" {
            continue;
        }

        if let Some(ref dep_project_id) = dep.project_id {
            install_recursive(
                client, dep_project_id, mc_version, mods_dir,
                processed, existing, result,
            ).await?;
        } else if let Some(ref dep_version_id) = dep.version_id {
            // Resolve the version to get its project_id
            match get_version(client, dep_version_id).await {
                Ok(dep_version) => {
                    install_recursive(
                        client, &dep_version.project_id, mc_version, mods_dir,
                        processed, existing, result,
                    ).await?;
                }
                Err(e) => {
                    result.failed.push(format!("dep {}: {}", dep_version_id, e));
                }
            }
        }
    }

    Ok(())
  })
}

/// Downloads a single mod file to the mods directory.
pub async fn download_mod(
    client: &reqwest::Client,
    file: &ModrinthFile,
    mods_dir: &std::path::Path,
) -> Result<std::path::PathBuf, LauncherError> {
    let dest = mods_dir.join(&file.filename);
    crate::minecraft::downloader::download_file(client, &file.url, &dest).await?;
    Ok(dest)
}

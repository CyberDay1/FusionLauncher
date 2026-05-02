use crate::error::LauncherError;
use serde::{Deserialize, Serialize};

const MODRINTH_API: &str = "https://api.modrinth.com/v2";

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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModrinthFile {
    pub url: String,
    pub filename: String,
    pub size: u64,
    pub primary: bool,
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

/// Searches Modrinth for mods matching the query.
pub async fn search_mods(
    client: &reqwest::Client,
    query: &str,
    mc_version: &str,
) -> Result<Vec<ModrinthProject>, LauncherError> {
    let facets = format!(
        r#"[["versions:{}"],["project_type:mod"]]"#,
        mc_version
    );

    let response: SearchResponse = client
        .get(format!("{}/search", MODRINTH_API))
        .query(&[
            ("query", query),
            ("facets", &facets),
            ("limit", "20"),
        ])
        .header("User-Agent", "FusionLauncher/0.1.0")
        .send()
        .await?
        .json()
        .await?;

    Ok(response.hits.into_iter().map(|h| ModrinthProject {
        project_id: h.project_id,
        slug: h.slug,
        title: h.title,
        description: h.description,
        author: h.author,
        downloads: h.downloads,
        icon_url: h.icon_url,
        categories: h.categories,
        client_side: h.client_side,
        server_side: h.server_side,
    }).collect())
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
        .header("User-Agent", "FusionLauncher/0.1.0")
        .send()
        .await?
        .json()
        .await?;

    Ok(versions)
}

/// Downloads a mod file to the mods directory.
pub async fn download_mod(
    client: &reqwest::Client,
    file: &ModrinthFile,
    mods_dir: &std::path::Path,
) -> Result<std::path::PathBuf, LauncherError> {
    let dest = mods_dir.join(&file.filename);
    crate::minecraft::downloader::download_file(client, &file.url, &dest).await?;
    Ok(dest)
}

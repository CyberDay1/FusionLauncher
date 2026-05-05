use crate::error::LauncherError;
use serde::{Deserialize, Serialize};

const GITHUB_API_BASE: &str = "https://api.github.com/repos/CyberDay1/FusionLoader/releases";

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GithubRelease {
    pub tag_name: String,
    pub name: Option<String>,
    pub prerelease: bool,
    pub assets: Vec<GithubAsset>,
    pub published_at: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GithubAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
    pub content_type: String,
}

/// Fetches available Fusion Loader releases from GitHub.
pub async fn fetch_releases(client: &reqwest::Client) -> Result<Vec<GithubRelease>, LauncherError> {
    let releases: Vec<GithubRelease> = client
        .get(GITHUB_API_BASE)
        .header("User-Agent", "FusionLauncher/0.1.0")
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await?
        .json()
        .await?;
    Ok(releases)
}

/// Fetches the best matching release for a given MC version.
/// Prefers releases tagged with the MC version (e.g., "v0.1.0-1.21.1"),
/// then falls back to the latest non-prerelease.
pub async fn fetch_release_for_version(
    client: &reqwest::Client,
    mc_version: &str,
) -> Result<GithubRelease, LauncherError> {
    let releases = fetch_releases(client).await?;

    // Try to find a release tagged for this MC version
    if let Some(versioned) = releases.iter().find(|r| {
        r.tag_name.contains(mc_version) || r.name.as_deref().unwrap_or("").contains(mc_version)
    }) {
        return Ok(versioned.clone());
    }

    // Fall back to latest non-prerelease
    releases
        .into_iter()
        .find(|r| !r.prerelease)
        .ok_or_else(|| LauncherError::Download("No Fusion Loader releases found".to_string()))
}

/// Fetches the latest release (non-prerelease).
pub async fn fetch_latest_release(client: &reqwest::Client) -> Result<GithubRelease, LauncherError> {
    let releases = fetch_releases(client).await?;
    releases
        .into_iter()
        .find(|r| !r.prerelease)
        .ok_or_else(|| LauncherError::Download("No Fusion Loader releases found".to_string()))
}

/// Finds the installer JAR asset in a release.
pub fn find_installer_asset(release: &GithubRelease) -> Option<&GithubAsset> {
    release.assets.iter().find(|a| {
        a.name.starts_with("fusion-installer") && a.name.ends_with(".jar")
    })
}

/// Finds individual module JAR assets in a release.
pub fn find_module_assets(release: &GithubRelease) -> Vec<&GithubAsset> {
    release.assets.iter().filter(|a| {
        a.name.starts_with("fusion-") && a.name.ends_with(".jar")
            && !a.name.contains("installer")
    }).collect()
}

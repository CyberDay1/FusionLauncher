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

/// Fetches the latest release (non-prerelease).
pub async fn fetch_latest_release(client: &reqwest::Client) -> Result<GithubRelease, LauncherError> {
    let releases = fetch_releases(client).await?;
    releases
        .into_iter()
        .find(|r| !r.prerelease)
        .or_else(|| None)
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

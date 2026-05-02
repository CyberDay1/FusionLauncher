use crate::error::LauncherError;
use serde::{Deserialize, Serialize};

const VERSION_MANIFEST_URL: &str =
    "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

#[derive(Debug, Deserialize, Serialize)]
pub struct VersionManifest {
    pub latest: LatestVersions,
    pub versions: Vec<VersionEntry>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LatestVersions {
    pub release: String,
    pub snapshot: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct VersionEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub version_type: String,
    pub url: String,
    pub time: String,
    #[serde(rename = "releaseTime")]
    pub release_time: String,
    pub sha1: String,
}

/// Full version detail (fetched from version-specific URL)
#[derive(Debug, Deserialize, Serialize)]
pub struct VersionDetail {
    pub id: String,
    #[serde(rename = "mainClass")]
    pub main_class: String,
    pub libraries: Vec<Library>,
    pub downloads: Downloads,
    #[serde(rename = "assetIndex")]
    pub asset_index: AssetIndexInfo,
    pub arguments: Option<Arguments>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Library {
    pub name: String,
    pub downloads: Option<LibraryDownloads>,
    pub rules: Option<Vec<Rule>>,
    pub natives: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LibraryDownloads {
    pub artifact: Option<LibraryArtifact>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct LibraryArtifact {
    pub path: String,
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Downloads {
    pub client: Option<DownloadEntry>,
    pub server: Option<DownloadEntry>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DownloadEntry {
    pub sha1: String,
    pub size: u64,
    pub url: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct AssetIndexInfo {
    pub id: String,
    pub sha1: String,
    pub size: u64,
    #[serde(rename = "totalSize")]
    pub total_size: u64,
    pub url: String,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Arguments {
    pub game: Option<Vec<serde_json::Value>>,
    pub jvm: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Rule {
    pub action: String,
    pub os: Option<OsRule>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct OsRule {
    pub name: Option<String>,
    pub arch: Option<String>,
}

/// Fetches the top-level version manifest from Mojang.
pub async fn fetch_version_manifest(client: &reqwest::Client) -> Result<VersionManifest, LauncherError> {
    let manifest: VersionManifest = client
        .get(VERSION_MANIFEST_URL)
        .send()
        .await?
        .json()
        .await?;
    Ok(manifest)
}

/// Fetches the detailed version info for a specific MC version.
pub async fn fetch_version_detail(
    client: &reqwest::Client,
    version_url: &str,
) -> Result<VersionDetail, LauncherError> {
    let detail: VersionDetail = client
        .get(version_url)
        .send()
        .await?
        .json()
        .await?;
    Ok(detail)
}

/// Evaluates Mojang launcher rules to determine if a library applies.
/// Mirrors GameProvider.evaluateRules() exactly.
pub fn evaluate_rules(rules: &[Rule]) -> bool {
    let os_name = current_os_name();
    let mut allowed = false;

    for rule in rules {
        let mut matches = true;

        if let Some(ref os) = rule.os {
            if let Some(ref name) = os.name {
                matches = name == os_name;
            }
        }

        if matches {
            allowed = rule.action == "allow";
        }
    }

    allowed
}

fn current_os_name() -> &'static str {
    if cfg!(target_os = "windows") { "windows" }
    else if cfg!(target_os = "macos") { "osx" }
    else { "linux" }
}

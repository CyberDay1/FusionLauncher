use crate::error::LauncherError;
use crate::mods::scanner::ModInfo;
use serde::Serialize;

/// A mod that has an update available on Modrinth.
#[derive(Clone, Debug, Serialize)]
pub struct ModUpdate {
    pub filename: String,
    pub mod_id: String,
    pub name: String,
    pub current_version: String,
    pub latest_version: String,
    pub latest_url: String,
    pub latest_filename: String,
    pub latest_size: u64,
}

/// Checks installed mods against Modrinth for available updates.
pub async fn check_for_updates(
    client: &reqwest::Client,
    installed_mods: &[ModInfo],
    mc_version: &str,
) -> Result<Vec<ModUpdate>, LauncherError> {
    let mut updates = Vec::new();

    for mod_info in installed_mods {
        if mod_info.mod_id == "unknown" || mod_info.mod_id.is_empty() {
            continue;
        }

        // Search Modrinth for this mod by ID
        match crate::mods::modrinth::get_versions(client, &mod_info.mod_id, mc_version).await {
            Ok(versions) => {
                if let Some(latest) = versions.first() {
                    // Compare version strings
                    if latest.version_number != mod_info.version {
                        let file = latest.files.iter().find(|f| f.primary)
                            .or(latest.files.first());

                        if let Some(file) = file {
                            updates.push(ModUpdate {
                                filename: mod_info.filename.clone(),
                                mod_id: mod_info.mod_id.clone(),
                                name: mod_info.name.clone(),
                                current_version: mod_info.version.clone(),
                                latest_version: latest.version_number.clone(),
                                latest_url: file.url.clone(),
                                latest_filename: file.filename.clone(),
                                latest_size: file.size,
                            });
                        }
                    }
                }
            }
            Err(_) => {
                // Skip mods that can't be found on Modrinth
            }
        }
    }

    Ok(updates)
}

/// Updates a mod by downloading the new version and removing the old one.
pub async fn apply_update(
    client: &reqwest::Client,
    update: &ModUpdate,
    mods_dir: &std::path::Path,
) -> Result<(), LauncherError> {
    // Download new version
    let new_path = mods_dir.join(&update.latest_filename);
    crate::minecraft::downloader::download_file(client, &update.latest_url, &new_path).await?;

    // Remove old version
    let old_path = mods_dir.join(&update.filename);
    if old_path.exists() && update.filename != update.latest_filename {
        std::fs::remove_file(&old_path)?;
    }

    Ok(())
}

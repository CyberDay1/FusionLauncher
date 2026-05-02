use crate::error::LauncherError;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BackupInfo {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub size_bytes: u64,
    pub created_at: String,
    pub world_name: String,
}

/// Creates a ZIP backup of a world directory.
pub fn create_backup(
    world_dir: &Path,
    backup_dir: &Path,
    world_name: &str,
) -> Result<BackupInfo, LauncherError> {
    if !world_dir.exists() {
        return Err(LauncherError::Other(format!(
            "World directory not found: {}",
            world_dir.display()
        )));
    }

    std::fs::create_dir_all(backup_dir)?;

    let timestamp = Utc::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_name = format!("{}_{}.zip", world_name, timestamp);
    let backup_path = backup_dir.join(&backup_name);

    let file = std::fs::File::create(&backup_path)?;
    let mut zip = zip::ZipWriter::new(file);

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .compression_level(Some(6));

    // Walk the world directory and add all files
    add_directory_to_zip(&mut zip, world_dir, world_dir, options)?;

    zip.finish()?;

    let size = std::fs::metadata(&backup_path)?.len();

    Ok(BackupInfo {
        id: uuid::Uuid::new_v4().to_string(),
        name: backup_name,
        path: backup_path,
        size_bytes: size,
        created_at: Utc::now().to_rfc3339(),
        world_name: world_name.to_string(),
    })
}

fn add_directory_to_zip(
    zip: &mut zip::ZipWriter<std::fs::File>,
    base_dir: &Path,
    current_dir: &Path,
    options: zip::write::SimpleFileOptions,
) -> Result<(), LauncherError> {
    for entry in std::fs::read_dir(current_dir)?.flatten() {
        let path = entry.path();
        let relative = path.strip_prefix(base_dir)
            .map_err(|e| LauncherError::Other(e.to_string()))?;

        if path.is_dir() {
            // Skip session.lock (MC holds it open)
            if path.file_name().map(|n| n == "session.lock").unwrap_or(false) {
                continue;
            }
            zip.add_directory(relative.to_string_lossy(), options)?;
            add_directory_to_zip(zip, base_dir, &path, options)?;
        } else {
            // Skip session.lock and temp files
            let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            if name == "session.lock" || name.ends_with(".tmp") {
                continue;
            }

            zip.start_file(relative.to_string_lossy(), options)?;
            let data = std::fs::read(&path)?;
            zip.write_all(&data)?;
        }
    }
    Ok(())
}

/// Lists all backups in a backup directory.
pub fn list_backups(backup_dir: &Path) -> Result<Vec<BackupInfo>, LauncherError> {
    let mut backups = Vec::new();

    if !backup_dir.exists() {
        return Ok(backups);
    }

    for entry in std::fs::read_dir(backup_dir)?.flatten() {
        let path = entry.path();
        if !path.extension().map(|e| e == "zip").unwrap_or(false) {
            continue;
        }

        let metadata = entry.metadata()?;
        let filename = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // Parse world name from filename (world_20260502_120000.zip)
        let world_name = filename.rsplit('_').skip(2).collect::<Vec<_>>()
            .into_iter().rev().collect::<Vec<_>>().join("_");

        backups.push(BackupInfo {
            id: uuid::Uuid::new_v4().to_string(),
            name: filename,
            path: path.clone(),
            size_bytes: metadata.len(),
            created_at: metadata.modified()
                .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
                .unwrap_or_default(),
            world_name: if world_name.is_empty() { "world".to_string() } else { world_name },
        });
    }

    backups.sort_by(|a, b| b.created_at.cmp(&a.created_at)); // Newest first
    Ok(backups)
}

/// Deletes a backup file.
pub fn delete_backup(backup_path: &Path) -> Result<(), LauncherError> {
    std::fs::remove_file(backup_path)?;
    Ok(())
}

use std::path::{Path, PathBuf};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

/// Finds the latest screenshot in an instance's screenshots directory.
/// Returns it as a base64-encoded data URL for display in the frontend.
pub fn get_latest_screenshot(game_dir: &Path) -> Option<String> {
    let screenshots_dir = game_dir.join("screenshots");
    if !screenshots_dir.exists() {
        return None;
    }

    // Find the most recently modified PNG in screenshots/
    let mut latest: Option<(PathBuf, std::time::SystemTime)> = None;

    if let Ok(entries) = std::fs::read_dir(&screenshots_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.extension().map(|e| e == "png").unwrap_or(false) {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                if let Ok(modified) = meta.modified() {
                    match &latest {
                        None => latest = Some((path, modified)),
                        Some((_, prev_time)) if modified > *prev_time => {
                            latest = Some((path, modified));
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    let (screenshot_path, _) = latest?;

    // Read and encode as base64 data URL
    // For performance, resize to a small thumbnail first
    let data = std::fs::read(&screenshot_path).ok()?;

    // Just return the raw PNG as base64 — the browser will handle display
    // For large screenshots this could be slow; in production we'd resize
    let encoded = BASE64.encode(&data);
    Some(format!("data:image/png;base64,{}", encoded))
}

/// Gets all screenshots for an instance, sorted newest first.
pub fn list_screenshots(game_dir: &Path) -> Vec<ScreenshotInfo> {
    let screenshots_dir = game_dir.join("screenshots");
    let mut screenshots = Vec::new();

    if !screenshots_dir.exists() {
        return screenshots;
    }

    if let Ok(entries) = std::fs::read_dir(&screenshots_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.extension().map(|e| e == "png").unwrap_or(false) {
                continue;
            }
            if let Ok(meta) = entry.metadata() {
                screenshots.push(ScreenshotInfo {
                    filename: path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    path: path.clone(),
                    size_bytes: meta.len(),
                    modified: meta.modified()
                        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                        .unwrap_or_default(),
                });
            }
        }
    }

    screenshots.sort_by(|a, b| b.modified.cmp(&a.modified));
    screenshots
}

#[derive(Clone, serde::Serialize)]
pub struct ScreenshotInfo {
    pub filename: String,
    pub path: PathBuf,
    pub size_bytes: u64,
    pub modified: String,
}

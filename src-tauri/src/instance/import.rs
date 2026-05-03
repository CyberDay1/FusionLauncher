use serde::Serialize;
use std::path::PathBuf;

/// Detectable Minecraft installations that can be imported.
#[derive(Clone, Debug, Serialize)]
pub struct DetectedInstall {
    pub name: String,
    pub path: PathBuf,
    pub source: String,       // "vanilla", "curseforge", "prism", "multimc", "atlauncher"
    pub mc_version: String,
    pub mod_count: u32,
    pub world_count: u32,
}

/// Scans common locations for existing Minecraft installations.
pub fn detect_installations() -> Vec<DetectedInstall> {
    let mut found = Vec::new();

    // Vanilla .minecraft
    if let Some(appdata) = std::env::var("APPDATA").ok() {
        let vanilla = PathBuf::from(&appdata).join(".minecraft");
        if vanilla.exists() {
            found.push(scan_install("Vanilla Minecraft", &vanilla, "vanilla"));
        }
    }

    // CurseForge
    if let Some(userprofile) = std::env::var("USERPROFILE").ok() {
        let cf = PathBuf::from(&userprofile).join("curseforge").join("minecraft").join("Install");
        if cf.exists() {
            found.push(scan_install("CurseForge", &cf, "curseforge"));
        }
        // CurseForge instances
        let cf_instances = PathBuf::from(&userprofile).join("curseforge").join("minecraft").join("Instances");
        if cf_instances.exists() {
            if let Ok(entries) = std::fs::read_dir(&cf_instances) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        found.push(scan_install(
                            &format!("CurseForge: {}", name),
                            &entry.path(),
                            "curseforge",
                        ));
                    }
                }
            }
        }
    }

    // Prism Launcher
    if let Some(appdata) = std::env::var("APPDATA").ok() {
        let prism = PathBuf::from(&appdata).join("PrismLauncher").join("instances");
        if prism.exists() {
            if let Ok(entries) = std::fs::read_dir(&prism) {
                for entry in entries.flatten() {
                    let mc_dir = entry.path().join(".minecraft");
                    if mc_dir.exists() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        found.push(scan_install(
                            &format!("Prism: {}", name),
                            &mc_dir,
                            "prism",
                        ));
                    }
                }
            }
        }
    }

    // MultiMC
    if let Some(appdata) = std::env::var("APPDATA").ok() {
        let mmc = PathBuf::from(&appdata).join("MultiMC").join("instances");
        if mmc.exists() {
            if let Ok(entries) = std::fs::read_dir(&mmc) {
                for entry in entries.flatten() {
                    let mc_dir = entry.path().join(".minecraft");
                    if mc_dir.exists() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        found.push(scan_install(
                            &format!("MultiMC: {}", name),
                            &mc_dir,
                            "multimc",
                        ));
                    }
                }
            }
        }
    }

    // ATLauncher
    if let Some(appdata) = std::env::var("APPDATA").ok() {
        let atl = PathBuf::from(&appdata).join("ATLauncher").join("instances");
        if atl.exists() {
            if let Ok(entries) = std::fs::read_dir(&atl) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        found.push(scan_install(
                            &format!("ATLauncher: {}", name),
                            &entry.path(),
                            "atlauncher",
                        ));
                    }
                }
            }
        }
    }

    found
}

fn scan_install(name: &str, path: &PathBuf, source: &str) -> DetectedInstall {
    let mods_dir = path.join("mods");
    let saves_dir = path.join("saves");
    let world_dir = path.join("world"); // server

    let mod_count = if mods_dir.exists() {
        std::fs::read_dir(&mods_dir)
            .map(|entries| entries.flatten().filter(|e| {
                e.path().extension().map(|ext| ext == "jar").unwrap_or(false)
            }).count() as u32)
            .unwrap_or(0)
    } else { 0 };

    let world_count = if saves_dir.exists() {
        std::fs::read_dir(&saves_dir)
            .map(|entries| entries.flatten().filter(|e| e.path().is_dir()).count() as u32)
            .unwrap_or(0)
    } else if world_dir.exists() {
        1
    } else { 0 };

    // Try to detect MC version from version.json or logs
    let mc_version = detect_mc_version(path);

    DetectedInstall {
        name: name.to_string(),
        path: path.clone(),
        source: source.to_string(),
        mc_version,
        mod_count,
        world_count,
    }
}

fn detect_mc_version(path: &PathBuf) -> String {
    // Check versions dir for installed versions
    let versions_dir = path.join("versions");
    if versions_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&versions_dir) {
            let mut versions: Vec<String> = entries.flatten()
                .filter(|e| e.path().is_dir())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| n.starts_with("1.") || n.starts_with("2"))
                .collect();
            versions.sort();
            if let Some(latest) = versions.last() {
                return latest.clone();
            }
        }
    }
    "unknown".to_string()
}

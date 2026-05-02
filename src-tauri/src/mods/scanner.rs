use crate::error::LauncherError;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModInfo {
    pub filename: String,
    pub mod_id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub authors: Vec<String>,
    pub origin: String,    // "fabric", "neoforge", "unknown"
    pub enabled: bool,     // .jar = true, .jar.disabled = false
    pub file_size: u64,
}

/// Scans a mods directory and reads metadata from each JAR.
pub fn scan_mods_directory(mods_dir: &Path) -> Result<Vec<ModInfo>, LauncherError> {
    let mut mods = Vec::new();

    if !mods_dir.exists() {
        return Ok(mods);
    }

    for entry in std::fs::read_dir(mods_dir)?.flatten() {
        let path = entry.path();
        let filename = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let enabled = filename.ends_with(".jar");
        let is_mod = enabled || filename.ends_with(".jar.disabled");

        if !is_mod { continue; }

        let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);

        match read_mod_metadata(&path) {
            Ok(mut info) => {
                info.filename = filename;
                info.enabled = enabled;
                info.file_size = file_size;
                mods.push(info);
            }
            Err(_) => {
                // Unknown mod — create minimal entry
                mods.push(ModInfo {
                    filename,
                    mod_id: "unknown".to_string(),
                    name: path.file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default(),
                    version: "?".to_string(),
                    description: String::new(),
                    authors: vec![],
                    origin: "unknown".to_string(),
                    enabled,
                    file_size,
                });
            }
        }
    }

    mods.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(mods)
}

fn read_mod_metadata(jar_path: &Path) -> Result<ModInfo, LauncherError> {
    let file = std::fs::File::open(jar_path)?;
    let mut archive = zip::ZipArchive::new(file)?;

    // Try Fabric first (fabric.mod.json)
    if let Ok(mut entry) = archive.by_name("fabric.mod.json") {
        let mut content = String::new();
        entry.read_to_string(&mut content)?;
        return parse_fabric_metadata(&content);
    }

    // Try NeoForge (META-INF/neoforge.mods.toml)
    if let Ok(mut entry) = archive.by_name("META-INF/neoforge.mods.toml") {
        let mut content = String::new();
        entry.read_to_string(&mut content)?;
        return parse_neoforge_metadata(&content);
    }

    // Try legacy Forge (mcmod.info)
    if let Ok(mut entry) = archive.by_name("mcmod.info") {
        let mut content = String::new();
        entry.read_to_string(&mut content)?;
        return parse_forge_legacy_metadata(&content);
    }

    Err(LauncherError::Other("No mod metadata found in JAR".to_string()))
}

fn parse_fabric_metadata(json: &str) -> Result<ModInfo, LauncherError> {
    let obj: serde_json::Value = serde_json::from_str(json)?;

    let mod_id = obj.get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let name = obj.get("name")
        .and_then(|v| v.as_str())
        .unwrap_or(&mod_id)
        .to_string();

    let version = obj.get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("?")
        .to_string();

    let description = obj.get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let authors = obj.get("authors")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    v.as_str().map(|s| s.to_string())
                        .or_else(|| v.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(ModInfo {
        filename: String::new(),
        mod_id,
        name,
        version,
        description,
        authors,
        origin: "fabric".to_string(),
        enabled: true,
        file_size: 0,
    })
}

fn parse_neoforge_metadata(toml_str: &str) -> Result<ModInfo, LauncherError> {
    let value: toml::Value = toml::from_str(toml_str)
        .map_err(|e| LauncherError::Other(format!("TOML parse error: {}", e)))?;

    let mods = value.get("mods")
        .and_then(|v| v.as_array())
        .ok_or_else(|| LauncherError::Other("No [[mods]] section".to_string()))?;

    let first = mods.first()
        .ok_or_else(|| LauncherError::Other("Empty [[mods]] array".to_string()))?;

    let mod_id = first.get("modId")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();

    let name = first.get("displayName")
        .and_then(|v| v.as_str())
        .unwrap_or(&mod_id)
        .to_string();

    let version = first.get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("?")
        .to_string();

    let description = first.get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let authors = first.get("authors")
        .and_then(|v| v.as_str())
        .map(|s| vec![s.to_string()])
        .unwrap_or_default();

    Ok(ModInfo {
        filename: String::new(),
        mod_id,
        name,
        version,
        description,
        authors,
        origin: "neoforge".to_string(),
        enabled: true,
        file_size: 0,
    })
}

fn parse_forge_legacy_metadata(json: &str) -> Result<ModInfo, LauncherError> {
    // mcmod.info is a JSON array
    let arr: serde_json::Value = serde_json::from_str(json)?;
    let first = arr.as_array()
        .and_then(|a| a.first())
        .ok_or_else(|| LauncherError::Other("Empty mcmod.info".to_string()))?;

    Ok(ModInfo {
        filename: String::new(),
        mod_id: first.get("modid").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
        name: first.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown").to_string(),
        version: first.get("version").and_then(|v| v.as_str()).unwrap_or("?").to_string(),
        description: first.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        authors: first.get("authorList")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default(),
        origin: "forge".to_string(),
        enabled: true,
        file_size: 0,
    })
}

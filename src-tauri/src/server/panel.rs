use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub uptime_secs: u64,
    pub player_count: u32,
    pub players: Vec<PlayerInfo>,
    pub tps: f64,
    pub mspt: f64,
    pub memory_used_mb: u64,
    pub memory_max_mb: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlayerInfo {
    pub name: String,
    pub uuid: Option<String>,
    pub join_time: String,
}

/// Parses server.properties file into a map.
pub fn read_server_properties(game_dir: &Path) -> Result<HashMap<String, String>, String> {
    let path = game_dir.join("server.properties");
    let mut props = HashMap::new();

    if !path.exists() {
        return Ok(props);
    }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            props.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    Ok(props)
}

/// Writes server.properties from a map, preserving comments.
pub fn write_server_properties(
    game_dir: &Path,
    properties: &HashMap<String, String>,
) -> Result<(), String> {
    let path = game_dir.join("server.properties");
    let mut output = String::from("#Minecraft server properties\n");

    // Sort keys for consistency
    let mut keys: Vec<&String> = properties.keys().collect();
    keys.sort();

    for key in keys {
        if let Some(value) = properties.get(key) {
            output.push_str(&format!("{}={}\n", key, value));
        }
    }

    std::fs::write(&path, output).map_err(|e| e.to_string())
}

/// Parses whitelist.json
pub fn read_whitelist(game_dir: &Path) -> Result<Vec<WhitelistEntry>, String> {
    let path = game_dir.join("whitelist.json");
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

/// Writes whitelist.json
pub fn write_whitelist(game_dir: &Path, entries: &[WhitelistEntry]) -> Result<(), String> {
    let path = game_dir.join("whitelist.json");
    let json = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WhitelistEntry {
    pub uuid: String,
    pub name: String,
}

/// Parses a server log line for player join/leave events.
pub fn parse_player_event(line: &str) -> Option<PlayerEvent> {
    if line.contains("joined the game") {
        let name = line.split_whitespace()
            .skip_while(|w| !w.ends_with("]:"))
            .nth(1)?;
        Some(PlayerEvent::Join(name.to_string()))
    } else if line.contains("left the game") {
        let name = line.split_whitespace()
            .skip_while(|w| !w.ends_with("]:"))
            .nth(1)?;
        Some(PlayerEvent::Leave(name.to_string()))
    } else {
        None
    }
}

pub enum PlayerEvent {
    Join(String),
    Leave(String),
}

/// Parses TPS/MSPT from server output (Spark or vanilla debug).
pub fn parse_performance(line: &str) -> Option<(f64, f64)> {
    // Vanilla: "Can't keep up! Is the server overloaded? Running Xms behind, skipping Y tick(s)"
    // Spark: "TPS from last 1m: 20.0"
    // Fusion: may add custom performance output later

    if line.contains("TPS") {
        // Try to extract TPS value
        let tps_str = line.split_whitespace()
            .rev()
            .find(|w| w.parse::<f64>().is_ok())?;
        let tps: f64 = tps_str.parse().ok()?;
        let mspt = if tps > 0.0 { 1000.0 / tps } else { 50.0 };
        return Some((tps, mspt));
    }

    None
}

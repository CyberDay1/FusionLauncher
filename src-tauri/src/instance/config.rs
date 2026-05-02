use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Configuration for a single game instance (client or server).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InstanceConfig {
    /// Unique instance ID (UUID)
    pub id: String,

    /// Display name
    pub name: String,

    /// Whether this is a client or server instance
    pub instance_type: InstanceType,

    /// Minecraft version (e.g., "26.1.2")
    pub minecraft_version: String,

    /// Fusion Loader version (e.g., "0.1.0-alpha.1")
    pub fusion_version: String,

    /// Override Java path (None = use global setting)
    pub java_path: Option<PathBuf>,

    /// Minimum memory (MB)
    pub min_memory_mb: u32,

    /// Maximum memory (MB)
    pub max_memory_mb: u32,

    /// Additional JVM arguments
    pub jvm_args: Vec<String>,

    /// Additional game arguments
    pub game_args: Vec<String>,

    /// When the instance was created
    pub created_at: DateTime<Utc>,

    /// Last time the instance was launched
    pub last_played: Option<DateTime<Utc>>,

    /// Custom icon (base64 or path)
    pub icon: Option<String>,

    /// Installation status
    pub install_status: InstallStatus,

    // --- Server-specific ---

    /// Server port (server instances only)
    pub server_port: Option<u16>,

    /// RCON port (server instances only)
    pub rcon_port: Option<u16>,

    /// RCON password
    pub rcon_password: Option<String>,

    /// Auto-restart on crash
    pub auto_restart: bool,

    /// Delay before restart (seconds)
    pub restart_delay_secs: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum InstanceType {
    Client,
    Server,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub enum InstallStatus {
    /// Not yet installed — needs full download
    NotInstalled,
    /// Currently installing
    Installing,
    /// Fully installed and ready to launch
    Ready,
    /// Update available
    UpdateAvailable,
    /// Installation failed
    Failed(String),
}

impl InstanceConfig {
    /// Creates a new instance with defaults.
    pub fn new(name: String, instance_type: InstanceType, mc_version: String, fusion_version: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            instance_type,
            minecraft_version: mc_version,
            fusion_version,
            java_path: None,
            min_memory_mb: 512,
            max_memory_mb: 4096,
            jvm_args: vec![],
            game_args: vec![],
            created_at: Utc::now(),
            last_played: None,
            icon: None,
            install_status: InstallStatus::NotInstalled,
            server_port: None,
            rcon_port: None,
            rcon_password: None,
            auto_restart: false,
            restart_delay_secs: 10,
        }
    }
}

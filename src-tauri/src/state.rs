use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::RwLock;

use crate::instance::config::InstanceConfig;
use crate::java::runtime::JavaRuntime;
use crate::process::monitor::ProcessHandle;

/// Global application state shared across all Tauri commands.
/// Wrapped in RwLock for thread-safe concurrent access.
pub struct AppState {
    /// All managed instances
    pub instances: RwLock<HashMap<String, InstanceConfig>>,

    /// Running processes (instance_id -> handle)
    pub processes: RwLock<HashMap<String, ProcessHandle>>,

    /// Detected/downloaded Java runtime
    pub java_runtime: RwLock<Option<JavaRuntime>>,

    /// Launcher settings
    pub settings: RwLock<LauncherSettings>,

    /// Base data directory (%APPDATA%/FusionLauncher or ~/.fusion-launcher)
    pub data_dir: PathBuf,
}

impl AppState {
    pub fn new() -> Self {
        let data_dir = directories::ProjectDirs::from("dev", "fusionloader", "FusionLauncher")
            .map(|dirs| dirs.data_dir().to_path_buf())
            .unwrap_or_else(|| PathBuf::from("fusion-launcher-data"));

        // Ensure data directory exists
        std::fs::create_dir_all(&data_dir).ok();

        Self {
            instances: RwLock::new(HashMap::new()),
            processes: RwLock::new(HashMap::new()),
            java_runtime: RwLock::new(None),
            settings: RwLock::new(LauncherSettings::default()),
            data_dir,
        }
    }

    /// Path to the instances directory
    pub fn instances_dir(&self) -> PathBuf {
        self.data_dir.join("instances")
    }

    /// Path to the shared Java runtimes directory
    pub fn java_dir(&self) -> PathBuf {
        self.data_dir.join("java")
    }

    /// Path to the shared assets directory (MC assets shared across instances)
    pub fn assets_dir(&self) -> PathBuf {
        self.data_dir.join("assets")
    }

    /// Path to the launcher settings file
    pub fn settings_path(&self) -> PathBuf {
        self.data_dir.join("settings.json")
    }

    /// Load settings from disk
    pub fn load_settings(&self) {
        let path = self.settings_path();
        if path.exists() {
            if let Ok(json) = std::fs::read_to_string(&path) {
                if let Ok(settings) = serde_json::from_str::<LauncherSettings>(&json) {
                    *self.settings.write().unwrap() = settings;
                }
            }
        }
    }

    /// Load all instances from disk (called at startup).
    pub fn load_instances(&self) {
        let dir = self.instances_dir();
        if !dir.exists() { return; }

        let mut loaded = 0u32;
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if !entry.path().is_dir() { continue; }
                let config_path = entry.path().join("instance.json");
                if !config_path.exists() { continue; }
                if let Ok(json) = std::fs::read_to_string(&config_path) {
                    if let Ok(config) = serde_json::from_str::<InstanceConfig>(&json) {
                        let id = config.id.clone();
                        self.instances.write().unwrap().insert(id, config);
                        loaded += 1;
                    }
                }
            }
        }
        if loaded > 0 {
            tracing::info!("Loaded {} instance(s) from disk", loaded);
        }
    }

    /// Save settings to disk
    pub fn save_settings(&self) {
        let path = self.settings_path();
        let settings = self.settings.read().unwrap().clone();
        if let Ok(json) = serde_json::to_string_pretty(&settings) {
            std::fs::write(&path, json).ok();
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LauncherSettings {
    /// Override Java path (None = use auto-detected/downloaded)
    pub java_path: Option<String>,

    /// Default minimum memory (MB)
    pub default_min_memory_mb: u32,

    /// Default maximum memory (MB)
    pub default_max_memory_mb: u32,

    /// Additional JVM arguments
    pub default_jvm_args: Vec<String>,

    /// UI theme
    pub theme: Theme,

    /// Accent color hex (e.g., "#6366f1")
    #[serde(default = "default_accent_color")]
    pub accent_color: String,

    /// Update channel
    pub update_channel: UpdateChannel,

    /// Close launcher window when game launches
    pub close_on_launch: bool,

    /// Minimize to system tray instead of closing
    pub minimize_to_tray: bool,

    /// Check for updates on startup
    pub check_updates_on_start: bool,
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            java_path: None,
            default_min_memory_mb: 512,
            default_max_memory_mb: 4096,
            default_jvm_args: vec![],
            theme: Theme::Dark,
            accent_color: default_accent_color(),
            update_channel: UpdateChannel::Stable,
            close_on_launch: false,
            minimize_to_tray: true,
            check_updates_on_start: true,
        }
    }
}

fn default_accent_color() -> String {
    "#6366f1".to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Theme {
    Dark,
    Light,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum UpdateChannel {
    Stable,
    Beta,
}

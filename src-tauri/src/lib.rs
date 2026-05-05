pub mod error;
pub mod state;
pub mod java;
pub mod minecraft;
pub mod fusion;
pub mod instance;
pub mod process;
pub mod mods;
pub mod server;
pub mod backup;
pub mod system;
pub mod auth;

use instance::config::{InstanceConfig, InstanceType};
use java::runtime::JavaRuntime;
use minecraft::manifest::VersionEntry;
use tauri::Emitter;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();
    app_state.load_settings();
    app_state.load_instances();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_launcher_info,
            get_settings,
            update_settings,
            detect_java,
            get_mc_versions,
            create_instance,
            list_instances,
            update_instance,
            install_instance,
            launch_instance,
            stop_instance,
            get_process_status,
            scan_mods,
            toggle_mod,
            search_modrinth,
            get_trending_mods,
            install_mod_with_deps,
            get_mod_detail,
            get_mod_versions,
            get_server_properties,
            set_server_properties,
            send_server_command,
            create_backup,
            list_backups,
            check_for_updates,
            get_instance_thumbnail,
            quit_app,
            start_ms_login,
            poll_ms_login,
            complete_ms_login,
            get_account,
            logout,
            refresh_account,
            detect_installs,
            quick_play,
            check_mod_updates,
            apply_mod_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Fusion Launcher");
}

// --- Initial commands ---

#[tauri::command]
async fn get_launcher_info() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "name": "Fusion Launcher",
        "version": "0.1.0",
        "tauri_version": "2.x",
    }))
}

#[tauri::command]
async fn get_settings(
    state: tauri::State<'_, AppState>,
) -> Result<state::LauncherSettings, String> {
    let settings = state.settings.read().map_err(|e| e.to_string())?;
    Ok(settings.clone())
}

#[tauri::command]
async fn update_settings(
    state: tauri::State<'_, AppState>,
    settings: state::LauncherSettings,
) -> Result<(), String> {
    *state.settings.write().map_err(|e| e.to_string())? = settings;
    state.save_settings();
    Ok(())
}

// --- Java detection ---

#[tauri::command]
async fn detect_java() -> Result<Vec<JavaRuntime>, String> {
    Ok(java::detector::detect_installations())
}

// --- MC versions ---

#[tauri::command]
async fn get_mc_versions() -> Result<Vec<VersionEntry>, String> {
    let client = reqwest::Client::new();
    let manifest = minecraft::manifest::fetch_version_manifest(&client)
        .await
        .map_err(|e| e.to_string())?;
    let releases: Vec<VersionEntry> = manifest.versions
        .into_iter()
        .filter(|v| v.version_type == "release")
        .take(20)
        .collect();
    Ok(releases)
}

// --- Instance management ---

#[tauri::command]
async fn create_instance(
    state: tauri::State<'_, AppState>,
    name: String,
    instance_type: String,
    mc_version: String,
) -> Result<InstanceConfig, String> {
    let inst_type = if instance_type == "server" { InstanceType::Server } else { InstanceType::Client };
    let config = InstanceConfig::new(name, inst_type, mc_version, "0.1.0-alpha.1".to_string());

    let inst_dir = state.instances_dir().join(&config.id);
    let game_dir = inst_dir.join(".minecraft");
    std::fs::create_dir_all(game_dir.join("mods")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(game_dir.join("config")).map_err(|e| e.to_string())?;

    let config_path = inst_dir.join("instance.json");
    let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(&config_path, json).map_err(|e| e.to_string())?;

    state.instances.write().map_err(|e| e.to_string())?
        .insert(config.id.clone(), config.clone());

    Ok(config)
}

#[tauri::command]
async fn list_instances(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<InstanceConfig>, String> {
    let instances = state.instances.read().map_err(|e| e.to_string())?;
    Ok(instances.values().cloned().collect())
}

#[tauri::command]
async fn update_instance(
    state: tauri::State<'_, AppState>,
    instance_id: String,
    java_path: Option<String>,
    min_memory_mb: Option<u32>,
    max_memory_mb: Option<u32>,
    jvm_args: Option<Vec<String>>,
    auto_restart: Option<bool>,
    restart_delay: Option<u32>,
) -> Result<(), String> {
    let mut instances = state.instances.write().map_err(|e| e.to_string())?;
    let config = instances.get_mut(&instance_id)
        .ok_or_else(|| format!("Instance not found: {}", instance_id))?;

    if let Some(jp) = java_path {
        config.java_path = if jp.is_empty() { None } else { Some(std::path::PathBuf::from(jp)) };
    }
    if let Some(min) = min_memory_mb { config.min_memory_mb = min; }
    if let Some(max) = max_memory_mb { config.max_memory_mb = max; }
    if let Some(args) = jvm_args { config.jvm_args = args; }
    if let Some(ar) = auto_restart { config.auto_restart = ar; }
    if let Some(rd) = restart_delay { config.restart_delay_secs = rd; }

    // Persist to disk
    let config_path = state.instances_dir().join(&instance_id).join("instance.json");
    if let Ok(json) = serde_json::to_string_pretty(config) {
        std::fs::write(&config_path, json).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- Install + Launch ---

#[tauri::command]
async fn install_instance(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    instance_id: String,
) -> Result<(), String> {
    instance::manager::install_instance(&app, &state, &instance_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn launch_instance(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    instance_id: String,
) -> Result<(), String> {
    let config = {
        let instances = state.instances.read().map_err(|e| e.to_string())?;
        instances.get(&instance_id)
            .ok_or_else(|| format!("Instance not found: {}", instance_id))?
            .clone()
    };

    // Ensure installed
    if config.install_status != instance::config::InstallStatus::Ready {
        return Err("Instance not installed. Run install first.".to_string());
    }

    // Resolve paths
    let inst_dir = state.instances_dir().join(&instance_id);
    let game_dir = inst_dir.join(".minecraft");
    let libraries_dir = game_dir.join("libraries");
    let assets_dir = state.assets_dir();

    // Get Java path — prefer per-instance override, fall back to global
    let java_path = if let Some(ref instance_java) = config.java_path {
        instance_java.clone()
    } else {
        let rt = state.java_runtime.read().map_err(|e| e.to_string())?;
        rt.as_ref()
            .ok_or("No Java runtime available".to_string())?
            .path.clone()
    };

    // Load account for auth
    let account = auth::microsoft::load_account(&state.data_dir);

    // Build and spawn the process
    let mut cmd = process::launcher::ProcessLauncher::build_command(
        &config, &game_dir, &libraries_dir, &java_path, &assets_dir,
        account.as_ref().map(|a| a.username.as_str()),
        account.as_ref().map(|a| a.uuid.as_str()),
        account.as_ref().map(|a| a.access_token.as_str()),
    ).map_err(|e| e.to_string())?;

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn: {}", e))?;

    let pid = child.id().unwrap_or(0);

    // Stream stdout/stderr
    if let Some(stdout) = child.stdout.take() {
        if let Some(stderr) = child.stderr.take() {
            process::log_stream::stream_process_output(
                app.clone(), instance_id.clone(), stdout, stderr
            );
        }
    }

    // Store process handle
    let handle = process::monitor::ProcessHandle {
        instance_id: instance_id.clone(),
        child,
        stdin_tx: tokio::sync::mpsc::channel(100).0,
        status: process::monitor::ProcessStatus::Running { pid },
        started_at: std::time::Instant::now(),
    };

    state.processes.write().map_err(|e| e.to_string())?
        .insert(instance_id.clone(), handle);

    let _ = app.emit("process-status", serde_json::json!({
        "instance_id": instance_id,
        "status": "running",
        "pid": pid,
    }));

    Ok(())
}

#[tauri::command]
async fn stop_instance(
    state: tauri::State<'_, AppState>,
    instance_id: String,
) -> Result<(), String> {
    let handle = {
        let mut processes = state.processes.write().map_err(|e| e.to_string())?;
        processes.remove(&instance_id)
    };
    if let Some(mut handle) = handle {
        handle.child.kill().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn get_process_status(
    state: tauri::State<'_, AppState>,
    instance_id: String,
) -> Result<serde_json::Value, String> {
    let processes = state.processes.read().map_err(|e| e.to_string())?;
    if let Some(handle) = processes.get(&instance_id) {
        Ok(serde_json::json!({
            "running": true,
            "status": format!("{:?}", handle.status),
        }))
    } else {
        Ok(serde_json::json!({
            "running": false,
            "status": "stopped",
        }))
    }
}

// --- Mod management ---

#[tauri::command]
async fn scan_mods(
    state: tauri::State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<mods::scanner::ModInfo>, String> {
    let mods_dir = state.instances_dir()
        .join(&instance_id)
        .join(".minecraft")
        .join("mods");
    mods::scanner::scan_mods_directory(&mods_dir).map_err(|e| e.to_string())
}

#[tauri::command]
async fn toggle_mod(
    state: tauri::State<'_, AppState>,
    instance_id: String,
    filename: String,
    enabled: bool,
) -> Result<(), String> {
    let mods_dir = state.instances_dir()
        .join(&instance_id)
        .join(".minecraft")
        .join("mods");

    let current = mods_dir.join(&filename);
    let new_name = if enabled {
        filename.strip_suffix(".disabled").unwrap_or(&filename).to_string()
    } else {
        format!("{}.disabled", filename)
    };
    let target = mods_dir.join(&new_name);

    if current.exists() && current != target {
        std::fs::rename(&current, &target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn search_modrinth(
    query: String,
    mc_version: String,
    offset: Option<u32>,
) -> Result<mods::modrinth::SearchResult, String> {
    let client = reqwest::Client::new();
    mods::modrinth::search_mods(&client, &query, &mc_version, offset.unwrap_or(0), 20)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_trending_mods(
    mc_version: String,
    offset: Option<u32>,
) -> Result<mods::modrinth::SearchResult, String> {
    let client = reqwest::Client::new();
    mods::modrinth::get_trending_mods(&client, &mc_version, offset.unwrap_or(0), 20)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn install_mod_with_deps(
    state: tauri::State<'_, AppState>,
    instance_id: String,
    project_id: String,
    mc_version: String,
) -> Result<mods::modrinth::InstallResult, String> {
    let mods_dir = state.instances_dir()
        .join(&instance_id)
        .join(".minecraft")
        .join("mods");
    let client = reqwest::Client::new();
    mods::modrinth::install_mod_with_deps(&client, &project_id, &mc_version, &mods_dir)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_mod_detail(
    project_id: String,
) -> Result<mods::modrinth::ModrinthProjectDetail, String> {
    let client = reqwest::Client::new();
    mods::modrinth::get_project_detail(&client, &project_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_mod_versions(
    project_id: String,
    mc_version: String,
) -> Result<Vec<mods::modrinth::ModrinthVersion>, String> {
    let client = reqwest::Client::new();
    mods::modrinth::get_versions(&client, &project_id, &mc_version)
        .await
        .map_err(|e| e.to_string())
}

// --- Server management ---

#[tauri::command]
async fn get_server_properties(
    state: tauri::State<'_, AppState>,
    instance_id: String,
) -> Result<std::collections::HashMap<String, String>, String> {
    let game_dir = state.instances_dir()
        .join(&instance_id)
        .join(".minecraft");
    server::panel::read_server_properties(&game_dir)
}

#[tauri::command]
async fn set_server_properties(
    state: tauri::State<'_, AppState>,
    instance_id: String,
    properties: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    let game_dir = state.instances_dir()
        .join(&instance_id)
        .join(".minecraft");
    server::panel::write_server_properties(&game_dir, &properties)
}

#[tauri::command]
async fn send_server_command(
    state: tauri::State<'_, AppState>,
    instance_id: String,
    command: String,
) -> Result<(), String> {
    let tx = {
        let processes = state.processes.read().map_err(|e| e.to_string())?;
        processes.get(&instance_id)
            .map(|h| h.stdin_tx.clone())
    };
    if let Some(tx) = tx {
        tx.send(command).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- Backup ---

#[tauri::command]
async fn create_backup(
    state: tauri::State<'_, AppState>,
    instance_id: String,
) -> Result<backup::creator::BackupInfo, String> {
    let inst_dir = state.instances_dir().join(&instance_id);
    let game_dir = inst_dir.join(".minecraft");

    // Determine world directory
    let world_dir = if game_dir.join("saves").exists() {
        // Client — find first world in saves/
        let mut world = game_dir.join("saves").join("world");
        if let Ok(entries) = std::fs::read_dir(game_dir.join("saves")) {
            if let Some(first) = entries.flatten().next() {
                world = first.path();
            }
        }
        world
    } else {
        game_dir.join("world") // Server
    };

    let backup_dir = inst_dir.join("backups");
    let world_name = world_dir.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "world".to_string());

    backup::creator::create_backup(&world_dir, &backup_dir, &world_name)
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn list_backups(
    state: tauri::State<'_, AppState>,
    instance_id: String,
) -> Result<Vec<backup::creator::BackupInfo>, String> {
    let backup_dir = state.instances_dir().join(&instance_id).join("backups");
    backup::creator::list_backups(&backup_dir).map_err(|e| e.to_string())
}

// --- Update check ---

#[derive(serde::Serialize)]
struct UpdateInfo {
    available: bool,
    latest_version: String,
    current_version: String,
    release_url: String,
    release_notes: String,
}

#[tauri::command]
async fn check_for_updates() -> Result<UpdateInfo, String> {
    let client = reqwest::Client::builder()
        .user_agent("FusionLauncher/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;

    let current_version = "0.1.0-alpha.1";

    match fusion::releases::fetch_latest_release(&client).await {
        Ok(release) => {
            let latest = release.tag_name.trim_start_matches('v').to_string();
            let available = latest != current_version;
            let notes = release.name.unwrap_or_default();

            Ok(UpdateInfo {
                available,
                latest_version: latest,
                current_version: current_version.to_string(),
                release_url: format!(
                    "https://github.com/CyberDay1/FusionLoader/releases/tag/{}",
                    release.tag_name
                ),
                release_notes: notes,
            })
        }
        Err(_) => Ok(UpdateInfo {
            available: false,
            latest_version: current_version.to_string(),
            current_version: current_version.to_string(),
            release_url: String::new(),
            release_notes: String::new(),
        }),
    }
}

// --- Instance thumbnail (screenshot) ---

#[tauri::command]
async fn get_instance_thumbnail(
    state: tauri::State<'_, AppState>,
    instance_id: String,
) -> Result<Option<String>, String> {
    let game_dir = state.instances_dir()
        .join(&instance_id)
        .join(".minecraft");
    Ok(instance::screenshots::get_latest_screenshot(&game_dir))
}

#[tauri::command]
async fn quit_app(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

// --- Microsoft Auth (auth code flow with localhost redirect) ---

#[tauri::command]
async fn start_ms_login() -> Result<auth::microsoft::DeviceCodeInfo, String> {
    let client = reqwest::Client::new();
    auth::microsoft::request_device_code(&client).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn poll_ms_login(
    state: tauri::State<'_, AppState>,
) -> Result<Option<auth::microsoft::MinecraftAccount>, String> {
    let client = reqwest::Client::new();

    let tokens = auth::microsoft::poll_for_token(&client).await.map_err(|e| e.to_string())?;

    let (ms_token, ms_refresh) = match tokens {
        None => return Ok(None), // Still waiting
        Some(t) => t,
    };

    let account = auth::microsoft::authenticate_minecraft(&client, &ms_token, &ms_refresh)
        .await.map_err(|e| e.to_string())?;

    auth::microsoft::save_account(&state.data_dir, &account).map_err(|e| e.to_string())?;
    Ok(Some(account))
}

#[tauri::command]
async fn complete_ms_login() -> Result<(), String> {
    // Kept for backward compat — device code flow uses poll_ms_login instead
    Ok(())
}

#[tauri::command]
async fn get_account(
    state: tauri::State<'_, AppState>,
) -> Result<Option<auth::microsoft::MinecraftAccount>, String> {
    Ok(auth::microsoft::load_account(&state.data_dir))
}

#[tauri::command]
async fn logout(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let path = state.data_dir.join("account.json");
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn refresh_account(
    state: tauri::State<'_, AppState>,
) -> Result<Option<auth::microsoft::MinecraftAccount>, String> {
    let existing = auth::microsoft::load_account(&state.data_dir);
    let account = match existing {
        None => return Ok(None),
        Some(a) => a,
    };

    if auth::microsoft::is_token_valid(&account) {
        return Ok(Some(account));
    }

    // Token expired — refresh
    let client = reqwest::Client::new();
    let (new_ms_token, new_refresh) = auth::microsoft::refresh_token(&client, &account.refresh_token)
        .await
        .map_err(|e| e.to_string())?;

    let refreshed = auth::microsoft::authenticate_minecraft(&client, &new_ms_token, &new_refresh)
        .await
        .map_err(|e| e.to_string())?;

    auth::microsoft::save_account(&state.data_dir, &refreshed)
        .map_err(|e| e.to_string())?;

    Ok(Some(refreshed))
}

// --- Instance import ---

#[tauri::command]
async fn detect_installs() -> Result<Vec<instance::import::DetectedInstall>, String> {
    Ok(instance::import::detect_installations())
}

// --- Quick Play (Home page Play Client button) ---

#[tauri::command]
async fn quick_play(
    state: tauri::State<'_, AppState>,
    instance_type: String,
) -> Result<String, String> {
    // Find or create a default instance — returns the instance ID
    // Frontend will then call install_instance + launch_instance
    let inst_type_filter = if instance_type == "server" { "Server" } else { "Client" };

    // Look for existing instance of the right type
    {
        let instances = state.instances.read().map_err(|e| e.to_string())?;
        if let Some(existing) = instances.values().find(|i| i.instance_type.to_string() == inst_type_filter) {
            return Ok(existing.id.clone());
        }
    }

    // No instance exists — create one
    let name = if instance_type == "server" { "My Server" } else { "My Client" };
    let inst_type = if instance_type == "server" { instance::config::InstanceType::Server } else { instance::config::InstanceType::Client };
    let config = instance::config::InstanceConfig::new(
        name.to_string(), inst_type, "26.1.2".to_string(), "0.1.0-alpha.1".to_string()
    );

    let inst_dir = state.instances_dir().join(&config.id);
    let game_dir = inst_dir.join(".minecraft");
    std::fs::create_dir_all(game_dir.join("mods")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(game_dir.join("config")).map_err(|e| e.to_string())?;

    let config_path = inst_dir.join("instance.json");
    std::fs::write(&config_path, serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;

    let id = config.id.clone();
    state.instances.write().map_err(|e| e.to_string())?.insert(id.clone(), config);

    Ok(id)
}

// --- Mod update checker ---

#[tauri::command]
async fn check_mod_updates(
    state: tauri::State<'_, AppState>,
    instance_id: String,
    mc_version: String,
) -> Result<Vec<mods::updates::ModUpdate>, String> {
    let mods_dir = state.instances_dir().join(&instance_id).join(".minecraft").join("mods");
    let installed = mods::scanner::scan_mods_directory(&mods_dir).map_err(|e| e.to_string())?;
    let client = reqwest::Client::new();
    mods::updates::check_for_updates(&client, &installed, &mc_version).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn apply_mod_update(
    state: tauri::State<'_, AppState>,
    instance_id: String,
    filename: String,
    url: String,
    new_filename: String,
) -> Result<(), String> {
    let mods_dir = state.instances_dir().join(&instance_id).join(".minecraft").join("mods");
    let client = reqwest::Client::new();

    // Download new
    crate::minecraft::downloader::download_file(&client, &url, &mods_dir.join(&new_filename))
        .await.map_err(|e| e.to_string())?;

    // Remove old
    let old = mods_dir.join(&filename);
    if old.exists() && filename != new_filename {
        std::fs::remove_file(&old).map_err(|e| e.to_string())?;
    }

    Ok(())
}

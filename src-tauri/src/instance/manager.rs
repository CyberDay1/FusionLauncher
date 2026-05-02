use crate::error::LauncherError;
use crate::instance::config::{InstanceConfig, InstallStatus};
use crate::state::AppState;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};

/// Full install pipeline for an instance.
/// Downloads everything needed: Java → MC → Fusion → Dependencies
pub async fn install_instance(
    app: &AppHandle,
    state: &AppState,
    instance_id: &str,
) -> Result<(), LauncherError> {
    let client = reqwest::Client::builder()
        .user_agent("FusionLauncher/0.1.0")
        .build()?;

    let config = {
        let instances = state.instances.read().map_err(|e| LauncherError::Other(e.to_string()))?;
        instances.get(instance_id)
            .ok_or_else(|| LauncherError::InstanceNotFound(instance_id.to_string()))?
            .clone()
    };

    // Update status to Installing
    update_install_status(state, instance_id, InstallStatus::Installing)?;

    let inst_dir = state.instances_dir().join(instance_id);
    let game_dir = inst_dir.join(".minecraft");
    let libraries_dir = game_dir.join("libraries");

    // Step 1: Ensure Java is available
    let _ = app.emit("install-progress", serde_json::json!({
        "step": "Checking Java", "current": 1, "total": 6, "percent": 0
    }));

    let java_path = ensure_java(app, state).await?;

    // Step 2: Download Minecraft
    let _ = app.emit("install-progress", serde_json::json!({
        "step": "Downloading Minecraft", "current": 2, "total": 6, "percent": 16
    }));

    let is_server = config.instance_type == crate::instance::config::InstanceType::Server;
    crate::minecraft::downloader::install_minecraft(
        app, &client, &config.minecraft_version, &game_dir, is_server
    ).await?;

    // Step 3: Download Fusion Loader release
    let _ = app.emit("install-progress", serde_json::json!({
        "step": "Downloading Fusion Loader", "current": 3, "total": 6, "percent": 33
    }));

    let release = crate::fusion::releases::fetch_latest_release(&client).await?;
    crate::fusion::modules::install_fusion_modules(
        app, &client, &release, &libraries_dir, &config.fusion_version
    ).await?;

    // Step 4: Download Fusion dependencies (Mixin, ASM, etc.)
    let _ = app.emit("install-progress", serde_json::json!({
        "step": "Downloading Dependencies", "current": 4, "total": 6, "percent": 50
    }));

    crate::fusion::modules::install_fusion_dependencies(
        app, &client, &libraries_dir
    ).await?;

    // Step 5: Download assets (client only)
    if !is_server {
        let _ = app.emit("install-progress", serde_json::json!({
            "step": "Downloading Assets", "current": 5, "total": 6, "percent": 66
        }));
        // Asset download is handled by MC's own asset system on first launch
        // We just ensure the assets directory exists
        let assets_dir = state.assets_dir();
        std::fs::create_dir_all(&assets_dir)?;
    }

    // Step 6: Mark as ready
    update_install_status(state, instance_id, InstallStatus::Ready)?;

    let _ = app.emit("install-progress", serde_json::json!({
        "step": "Complete", "current": 6, "total": 6, "percent": 100
    }));

    tracing::info!("Instance {} installed successfully", instance_id);
    Ok(())
}

/// Ensures Java 25 is available, downloading if needed.
async fn ensure_java(app: &AppHandle, state: &AppState) -> Result<PathBuf, LauncherError> {
    // Check if we already have a runtime
    {
        let runtime = state.java_runtime.read().map_err(|e| LauncherError::Other(e.to_string()))?;
        if let Some(ref rt) = *runtime {
            if rt.version.meets_minimum(25) {
                return Ok(rt.path.clone());
            }
        }
    }

    // Try detecting installed Java
    let detections = crate::java::detector::detect_installations();
    if let Some(rt) = detections.iter().find(|r| r.version.meets_minimum(25)) {
        let path = rt.path.clone();
        *state.java_runtime.write().map_err(|e| LauncherError::Other(e.to_string()))? = Some(rt.clone());
        return Ok(path);
    }

    // Download from Adoptium
    let adoptium = crate::java::adoptium::AdoptiumClient::new();
    let release = adoptium.fetch_latest_release(25).await?;
    let java_dir = state.java_dir();
    let java_path = adoptium.download_jdk(app, &release, &java_dir).await?;

    // Cache the runtime
    let runtime = crate::java::runtime::JavaRuntime {
        path: java_path.clone(),
        version: crate::java::runtime::JavaVersion { major: 25, minor: 0, patch: 0 },
        vendor: "Temurin".to_string(),
        arch: "x64".to_string(),
    };
    *state.java_runtime.write().map_err(|e| LauncherError::Other(e.to_string()))? = Some(runtime);

    Ok(java_path)
}

fn update_install_status(state: &AppState, instance_id: &str, status: InstallStatus) -> Result<(), LauncherError> {
    let mut instances = state.instances.write().map_err(|e| LauncherError::Other(e.to_string()))?;
    if let Some(config) = instances.get_mut(instance_id) {
        config.install_status = status;
        // Save to disk
        let config_path = state.instances_dir().join(instance_id).join("instance.json");
        if let Ok(json) = serde_json::to_string_pretty(config) {
            std::fs::write(&config_path, json).ok();
        }
    }
    Ok(())
}

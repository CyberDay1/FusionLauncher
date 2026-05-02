pub mod error;
pub mod state;
pub mod java;
pub mod instance;
pub mod process;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState::new();
    app_state.load_settings();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_launcher_info,
            get_settings,
            update_settings,
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

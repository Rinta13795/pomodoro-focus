use std::fs;
use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use tauri::State;

use crate::models::Config;
use crate::state::AppState;

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Result<Config, String> {
    let config = state.config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

#[tauri::command]
pub fn save_config(state: State<AppState>, config: Config) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())?;

    let mut current_config = state.config.lock().map_err(|e| e.to_string())?;
    *current_config = config.clone();

    let mut app_blocker = state.app_blocker.lock().map_err(|e| e.to_string())?;
    app_blocker.update_blocked_apps(config.blocked_apps.clone());

    let mut site_blocker = state.site_blocker.lock().map_err(|e| e.to_string())?;
    site_blocker.update_blocked_sites(config.blocked_sites.clone());

    let mut scheduler = state.scheduler.lock().map_err(|e| e.to_string())?;
    scheduler.update_schedules(config.schedules.clone());

    Ok(())
}

#[tauri::command]
pub fn get_config_path() -> Result<String, String> {
    Config::config_path()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

fn bg_path() -> Result<std::path::PathBuf, String> {
    Config::config_dir().map(|d| d.join("bg.jpg")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_background(state: State<AppState>, source_path: String) -> Result<String, String> {
    let dest = bg_path()?;
    fs::copy(&source_path, &dest).map_err(|e| format!("复制图片失败: {}", e))?;
    let dest_str = dest.to_string_lossy().to_string();

    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.custom_bg_path = Some(dest_str);
    config.save().map_err(|e| e.to_string())?;

    let data = fs::read(&dest).map_err(|e| e.to_string())?;
    Ok(BASE64.encode(&data))
}

#[tauri::command]
pub fn clear_background(state: State<AppState>) -> Result<(), String> {
    let dest = bg_path()?;
    let _ = fs::remove_file(&dest);

    let mut config = state.config.lock().map_err(|e| e.to_string())?;
    config.custom_bg_path = None;
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_background() -> Result<Option<String>, String> {
    let dest = bg_path()?;
    if !dest.exists() {
        return Ok(None);
    }
    let data = fs::read(&dest).map_err(|e| e.to_string())?;
    Ok(Some(BASE64.encode(&data)))
}

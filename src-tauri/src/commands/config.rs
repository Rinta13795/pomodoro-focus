use std::fs;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use tauri::State;

use crate::models::Config;
use crate::state::AppState;
use crate::{platform, storage};

#[tauri::command]
pub fn get_config(state: State<AppState>) -> Config {
    state.config.lock().unwrap().clone()
}

/// 保存配置。黑名单在下一次开始专注时生效。
#[tauri::command]
pub fn save_config(state: State<AppState>, config: Config) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())?;
    *state.config.lock().unwrap() = config;
    Ok(())
}

#[tauri::command]
pub fn get_config_path() -> Result<String, String> {
    Config::path()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_platform() -> &'static str {
    platform::NAME
}

fn bg_path() -> Result<std::path::PathBuf, String> {
    storage::data_file("bg.jpg").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_background(state: State<AppState>, source_path: String) -> Result<String, String> {
    let dest = bg_path()?;
    if let Some(dir) = dest.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    fs::copy(&source_path, &dest).map_err(|e| format!("复制图片失败: {}", e))?;
    let mut config = state.config.lock().unwrap();
    config.custom_bg_path = Some(dest.to_string_lossy().to_string());
    config.save().map_err(|e| e.to_string())?;
    let data = fs::read(&dest).map_err(|e| e.to_string())?;
    Ok(BASE64.encode(data))
}

#[tauri::command]
pub fn clear_background(state: State<AppState>) -> Result<(), String> {
    let _ = fs::remove_file(bg_path()?);
    let mut config = state.config.lock().unwrap();
    config.custom_bg_path = None;
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_background() -> Result<Option<String>, String> {
    let path = bg_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(Some(BASE64.encode(data)))
}

use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub fn block_sites(state: State<AppState>) -> Result<(), String> {
    let site_blocker = state.site_blocker.lock().map_err(|e| e.to_string())?;
    site_blocker.block_sites().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unblock_sites(state: State<AppState>) -> Result<(), String> {
    let site_blocker = state.site_blocker.lock().map_err(|e| e.to_string())?;
    site_blocker.unblock_sites().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_blocked_sites(state: State<AppState>) -> Result<Vec<String>, String> {
    let site_blocker = state.site_blocker.lock().map_err(|e| e.to_string())?;
    Ok(site_blocker.get_blocked_sites().clone())
}

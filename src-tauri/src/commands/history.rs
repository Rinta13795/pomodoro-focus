use tauri::{AppHandle, Emitter};

use crate::models::history;
use crate::models::{FocusRecord, Planner};

#[tauri::command]
pub fn get_history() -> Vec<FocusRecord> {
    history::load()
}

#[tauri::command]
pub fn set_record_note(app: AppHandle, id: String, note: Option<String>) -> Result<(), String> {
    history::set_note(&id, note).map_err(|e| e.to_string())?;
    let _ = app.emit("history-updated", ());
    Ok(())
}

#[tauri::command]
pub fn get_planner() -> Planner {
    Planner::load()
}

#[tauri::command]
pub fn save_planner(planner: Planner) -> Result<(), String> {
    planner.save().map_err(|e| e.to_string())
}

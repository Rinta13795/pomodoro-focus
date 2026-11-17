use crate::platform;

#[tauri::command]
pub async fn get_installed_apps() -> Vec<String> {
    platform::installed_apps()
}

#[tauri::command]
pub async fn get_app_icon(app_name: String) -> Result<String, String> {
    platform::app_icon_base64(&app_name)
}

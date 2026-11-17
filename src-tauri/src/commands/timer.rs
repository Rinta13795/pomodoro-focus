use tauri::{AppHandle, State};

use crate::models::TimerStatus;
use crate::services::focus;
use crate::state::AppState;

#[tauri::command]
pub async fn start_focus(
    app: AppHandle,
    minutes: Option<u32>,
    seconds: Option<u32>,
    label: Option<String>,
    task_id: Option<String>,
) -> Result<TimerStatus, String> {
    // 等待管理员授权可能很久，放到阻塞线程池，不卡界面也不占用异步运行时
    tauri::async_runtime::spawn_blocking(move || focus::start(&app, minutes, seconds, label, task_id))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn pause_focus(app: AppHandle) -> Result<TimerStatus, String> {
    focus::pause(&app)
}

#[tauri::command]
pub fn resume_focus(app: AppHandle) -> Result<TimerStatus, String> {
    focus::resume(&app)
}

/// 结束当前会话。工作阶段只能通过紧急取消结束（学霸模式），这里只用于跳过休息。
#[tauri::command]
pub async fn stop_focus(app: AppHandle, state: State<'_, AppState>) -> Result<TimerStatus, String> {
    if state.timer_status.lock().unwrap().in_work_phase() {
        return Err("专注中只能使用紧急取消".to_string());
    }
    Ok(focus::stop(&app))
}

#[tauri::command]
pub async fn emergency_cancel(app: AppHandle) -> Result<TimerStatus, String> {
    focus::emergency_cancel(&app)
}

#[tauri::command]
pub fn get_timer_status(state: State<AppState>) -> TimerStatus {
    state.timer_status.lock().unwrap().clone()
}

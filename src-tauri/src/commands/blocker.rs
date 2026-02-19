use std::sync::atomic::Ordering;
use tauri::{AppHandle, Manager, State};

use crate::state::AppState;

#[tauri::command]
pub fn check_and_kill_blocked_apps(state: State<AppState>) -> Result<Vec<String>, String> {
    let app_blocker = state.app_blocker.lock().map_err(|e| e.to_string())?;
    app_blocker
        .check_and_kill_blocked()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn is_app_running(state: State<AppState>, app_name: String) -> Result<bool, String> {
    let app_blocker = state.app_blocker.lock().map_err(|e| e.to_string())?;
    Ok(app_blocker.is_app_running(&app_name))
}

#[tauri::command]
pub fn get_blocked_apps(state: State<AppState>) -> Result<Vec<String>, String> {
    let app_blocker = state.app_blocker.lock().map_err(|e| e.to_string())?;
    Ok(app_blocker.get_blocked_apps().clone())
}

#[tauri::command]
pub fn hide_overlay_window(app_handle: AppHandle, state: State<AppState>) -> Result<(), String> {
    // 递增代数，使旧的重置线程失效
    let gen = state.suppress_generation.fetch_add(1, Ordering::SeqCst) + 1;

    // 设置抑制标志，防止轮询线程立刻重新弹出
    state.overlay_suppressed.store(true, Ordering::SeqCst);

    if let Some(overlay) = app_handle.get_webview_window("overlay") {
        let _ = overlay.set_always_on_top(false);
        let _ = overlay.set_fullscreen(false);
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(500));
            if let Some(overlay) = handle.get_webview_window("overlay") {
                let _ = overlay.hide();
                println!("覆盖窗口已隐藏");
            }
            if let Some(main_win) = handle.get_webview_window("main") {
                let _ = main_win.show();
                let _ = main_win.set_focus();
            }
        });
    }

    // 5秒后自动重置抑制标志（仅当代数匹配时才重置）
    let suppressed = state.overlay_suppressed.clone();
    let generation = state.suppress_generation.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        if generation.load(Ordering::SeqCst) == gen {
            suppressed.store(false, Ordering::SeqCst);
            println!("overlay 抑制标志已重置");
        }
    });

    Ok(())
}

#[tauri::command]
pub fn close_overlay_window(app_handle: AppHandle) -> Result<(), String> {
    if let Some(overlay) = app_handle.get_webview_window("overlay") {
        overlay.destroy().map_err(|e| e.to_string())?;
        println!("覆盖窗口已关闭");
    }
    Ok(())
}

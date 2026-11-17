use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager, State};

use crate::state::AppState;

/// 用户在覆盖窗口点“回去专注”：隐藏覆盖窗口，5 秒内不再弹出。
#[tauri::command]
pub fn hide_overlay_window(app: AppHandle, state: State<AppState>) {
    let generation = state.suppress_generation.fetch_add(1, Ordering::SeqCst) + 1;
    state.overlay_suppressed.store(true, Ordering::SeqCst);

    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.set_always_on_top(false);
        let _ = overlay.set_fullscreen(false);
        let handle = app.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(500));
            if let Some(overlay) = handle.get_webview_window("overlay") {
                let _ = overlay.hide();
            }
            if let Some(main) = handle.get_webview_window("main") {
                let _ = main.show();
                let _ = main.set_focus();
            }
        });
    }

    let suppressed = state.overlay_suppressed.clone();
    let current = state.suppress_generation.clone();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(5));
        if current.load(Ordering::SeqCst) == generation {
            suppressed.store(false, Ordering::SeqCst);
        }
    });
}

#[tauri::command]
pub fn close_overlay_window(app: AppHandle) -> Result<(), String> {
    if let Some(overlay) = app.get_webview_window("overlay") {
        overlay.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

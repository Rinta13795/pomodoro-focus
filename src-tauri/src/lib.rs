pub mod commands;
pub mod errors;
pub mod models;
pub mod platform;
pub mod services;
pub mod state;
pub mod storage;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WindowEvent,
};

use models::Config;
use services::{focus, local_server};
use state::AppState;

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "打开主界面", true, None::<&str>)?;
    let start = MenuItem::with_id(app, "start", "开始专注", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &start, &quit])?;
    let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

    TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("番茄专注")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "start" => {
                let app = app.clone();
                // 可能弹出管理员授权，放到后台线程
                std::thread::spawn(move || {
                    if let Err(e) = focus::start(&app, None, None, None, None) {
                        log::warn!("托盘开始专注失败: {}", e);
                        show_main(&app);
                    }
                });
            }
            "quit" => {
                let state = app.state::<AppState>();
                if state.timer_status.lock().unwrap().in_work_phase() {
                    // 专注中退出会让 App 拦截失效，只能用紧急取消结束
                    show_main(app);
                    return;
                }
                state.cleanup_on_exit();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = Config::load().unwrap_or_else(|e| {
        eprintln!("加载配置失败: {}，使用默认配置", e);
        Config::default()
    });

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new(config))
        .invoke_handler(tauri::generate_handler![
            commands::config::get_config,
            commands::config::save_config,
            commands::config::get_config_path,
            commands::config::get_platform,
            commands::config::set_background,
            commands::config::clear_background,
            commands::config::get_background,
            commands::timer::start_focus,
            commands::timer::pause_focus,
            commands::timer::resume_focus,
            commands::timer::stop_focus,
            commands::timer::emergency_cancel,
            commands::timer::get_timer_status,
            commands::history::get_history,
            commands::history::set_record_note,
            commands::history::get_planner,
            commands::history::save_planner,
            commands::apps::get_installed_apps,
            commands::apps::get_app_icon,
            commands::overlay::hide_overlay_window,
            commands::overlay::close_overlay_window,
        ])
        .setup(|app| {
            if let Err(e) = setup_tray(app.handle()) {
                log::error!("设置系统托盘失败: {}", e);
            }
            let state = app.state::<AppState>();
            local_server::start(local_server::ServerState {
                timer_running: state.timer_running.clone(),
                config: state.config.clone(),
            });
            focus::restore(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if window.label() == "overlay" {
                    let _ = window.minimize();
                } else {
                    // 关闭主窗口只是隐藏到托盘
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = &event {
                if code.is_none() {
                    api.prevent_exit();
                } else {
                    app.state::<AppState>().cleanup_on_exit();
                }
            }
        });
}

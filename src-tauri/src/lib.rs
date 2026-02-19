pub mod commands;
pub mod errors;
pub mod models;
pub mod services;
pub mod state;

use std::sync::atomic::Ordering;
use std::sync::Arc;

use models::{Config, FocusSession};
use services::{LocalServer, Scheduler, ServerState, SiteBlocker};
use state::AppState;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WindowEvent,
};

fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "打开主界面", true, None::<&str>)?;
    let start_item = MenuItem::with_id(app, "start", "开始专注", true, None::<&str>)?;
    let stop_item = MenuItem::with_id(app, "stop", "停止专注", true, None::<&str>)?;
    let mode_item = MenuItem::with_id(app, "mode", "模式：手动", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show_item, &start_item, &stop_item, &mode_item, &quit_item],
    )?;

    let icon = Image::from_path("icons/32x32.png").unwrap_or_else(|_| {
        Image::from_bytes(include_bytes!("../icons/32x32.png")).expect("Failed to load tray icon")
    });

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .menu(&menu)
        .tooltip("番茄专注")
        .on_menu_event(move |app, event| {
            let state = app.state::<AppState>();

            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "start" => {
                    if !state.timer_running.load(Ordering::SeqCst) {
                        // 通过前端调用 start_focus
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.eval("window.__TAURI__.core.invoke('start_focus')");
                        }
                    }
                }
                "stop" => {
                    if state.timer_running.load(Ordering::SeqCst) {
                        // 通过前端调用 stop_focus
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.eval("window.__TAURI__.core.invoke('stop_focus')");
                        }
                    }
                }
                "mode" => {
                    let current_mode = state.is_scheduled_mode();
                    let new_mode = if current_mode { "manual" } else { "scheduled" };
                    state.set_mode(new_mode);

                    // 更新托盘菜单
                    let _ = update_tray_menu(app);
                }
                "quit" => {
                    // 清理并退出
                    state.cleanup_on_exit();
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn update_tray_menu(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let state = app.state::<AppState>();
    let is_scheduled = state.is_scheduled_mode();
    let _mode_text = if is_scheduled {
        "模式：定时 ✓"
    } else {
        "模式：手动 ✓"
    };

    // 托盘菜单会在下次点击时更新
    println!("模式切换为: {}", if is_scheduled { "定时" } else { "手动" });

    Ok(())
}

fn start_scheduler_if_needed(app_handle: AppHandle, state: Arc<AppState>) {
    if !state.is_scheduled_mode() {
        return;
    }

    let config = state.config.lock().unwrap();
    let schedules = config.schedules.clone();
    drop(config);

    let mut scheduler_thread = state.scheduler_thread.lock().unwrap();

    // 如果已经在运行，先停止
    if scheduler_thread.running_flag.load(Ordering::SeqCst) {
        scheduler_thread.running_flag.store(false, Ordering::SeqCst);
        if let Some(handle) = scheduler_thread.handle.take() {
            let _ = handle.join();
        }
    }

    scheduler_thread.running_flag.store(true, Ordering::SeqCst);
    let running_flag = Arc::clone(&scheduler_thread.running_flag);

    let state_clone = Arc::clone(&state);
    let app_handle_clone = app_handle.clone();

    let handle = Scheduler::start_polling(schedules, running_flag, move |is_in_schedule| {
        let was_active = state_clone.scheduled_focus_active.load(Ordering::SeqCst);

        if is_in_schedule && !was_active {
            // 进入时间段，自动开始专注
            println!("定时触发：进入专注时间段");
            state_clone.scheduled_focus_active.store(true, Ordering::SeqCst);

            // 触发开始专注
            if let Some(window) = app_handle_clone.get_webview_window("main") {
                let _ = window.eval("window.__TAURI__.core.invoke('start_focus')");
            }
        } else if !is_in_schedule && was_active {
            // 离开时间段，自动停止专注
            println!("定时触发：离开专注时间段");
            state_clone.scheduled_focus_active.store(false, Ordering::SeqCst);

            // 触发停止专注
            if let Some(window) = app_handle_clone.get_webview_window("main") {
                let _ = window.eval("window.__TAURI__.core.invoke('stop_focus')");
            }
        }
    });

    scheduler_thread.handle = Some(handle);
    state.scheduler_running.store(true, Ordering::SeqCst);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let config = Config::load().unwrap_or_else(|e| {
        eprintln!("加载配置失败: {}, 使用默认配置", e);
        Config::default()
    });

    let is_scheduled_mode = config.mode == "scheduled";
    let app_state = AppState::new(config);

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::get_config_path,
            commands::set_background,
            commands::clear_background,
            commands::get_background,
            commands::start_focus,
            commands::pause_focus,
            commands::resume_focus,
            commands::stop_focus,
            commands::get_timer_status,
            commands::emergency_cancel,
            commands::check_and_kill_blocked_apps,
            commands::is_app_running,
            commands::get_blocked_apps,
            commands::close_overlay_window,
            commands::hide_overlay_window,
            commands::block_sites,
            commands::unblock_sites,
            commands::get_blocked_sites,
            commands::get_installed_apps,
            commands::get_app_icon,
        ])
        .setup(move |app| {
            // 启动时检查并清理残留的网站屏蔽（仅在没有活跃会话时清理）
            let has_active_session = matches!(FocusSession::load(), Ok(Some(_)));
            if !has_active_session {
                if let Err(e) = SiteBlocker::cleanup_if_needed() {
                    eprintln!("清理残留屏蔽记录失败: {}", e);
                }
            }

            // 设置系统托盘
            if let Err(e) = setup_tray(app.handle()) {
                eprintln!("设置系统托盘失败: {}", e);
            }

            // 启动本地 HTTP 服务（供浏览器扩展轮询）
            let state = app.state::<AppState>();
            let server_state = Arc::new(ServerState {
                timer_running: Arc::clone(&state.timer_running),
                config: Arc::clone(&state.config),
            });
            LocalServer::start(server_state);

            // 检查是否有未完成的专注会话，恢复计时
            commands::restore_focus(app.handle());

            // 如果是定时模式，启动调度器
            // 注意：定时调度功能暂时禁用，需要重构
            // if is_scheduled_mode {
            //     let app_handle = app.handle().clone();
            //     start_scheduler_if_needed(app_handle, state);
            // }

            app.handle().plugin(tauri_plugin_dialog::init())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let label = window.label();
                if label == "overlay" {
                    // 覆盖窗口：阻止关闭，改为最小化
                    api.prevent_close();
                    let _ = window.minimize();
                } else {
                    // 主窗口：隐藏而不是退出
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { api, code, .. } = &event {
                if code.is_none() {
                    // 用户点击关闭按钮，阻止退出
                    api.prevent_exit();
                } else {
                    // 真正退出时清理
                    let state = app_handle.state::<AppState>();
                    state.cleanup_on_exit();
                }
            }
        });
}

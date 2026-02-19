use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::models::{FocusSession, TimerState, TimerStatus};
use crate::services::SiteBlocker;
use crate::state::AppState;

fn start_timer_thread(
    app_handle: AppHandle,
    timer_status: Arc<std::sync::Mutex<TimerStatus>>,
    stop_signal: Arc<std::sync::atomic::AtomicBool>,
    pause_signal: Arc<std::sync::atomic::AtomicBool>,
    timer_running: Arc<std::sync::atomic::AtomicBool>,
) {
    // 读取初始剩余秒数，计算结束时间戳（基于墙钟，待机后自动补偿）
    let initial_remaining = {
        let status = timer_status.lock().unwrap();
        status.remaining_seconds as u64
    };
    let mut end_time = SystemTime::now() + Duration::from_secs(initial_remaining);
    let mut paused_at: Option<SystemTime> = None;

    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_millis(500));

            if stop_signal.load(Ordering::SeqCst) {
                break;
            }

            // 暂停处理：记录暂停时刻，恢复时补偿 end_time
            if pause_signal.load(Ordering::SeqCst) {
                if paused_at.is_none() {
                    paused_at = Some(SystemTime::now());
                }
                continue;
            } else if let Some(pt) = paused_at.take() {
                let paused_duration = SystemTime::now()
                    .duration_since(pt)
                    .unwrap_or(Duration::ZERO);
                end_time += paused_duration;
            }

            let mut status = timer_status.lock().unwrap();

            if status.state == TimerState::Idle {
                break;
            }

            if status.state == TimerState::Paused {
                continue;
            }

            // 基于墙钟计算剩余秒数
            let remaining = end_time
                .duration_since(SystemTime::now())
                .unwrap_or(Duration::ZERO)
                .as_secs() as u32;

            status.remaining_seconds = remaining;
            let _ = app_handle.emit("timer-update", status.clone());

            if remaining == 0 {
                if status.state == TimerState::Working {
                    let break_seconds = status.break_minutes * 60;
                    status.state = TimerState::Breaking;
                    status.remaining_seconds = break_seconds;
                    status.total_seconds = break_seconds;
                    let _ = app_handle.emit("timer-work-complete", ());
                    let _ = app_handle.emit("timer-update", status.clone());
                    drop(status);
                    // 重新计算休息结束时间
                    end_time = SystemTime::now() + Duration::from_secs(break_seconds as u64);
                } else if status.state == TimerState::Breaking {
                    status.state = TimerState::Idle;
                    status.remaining_seconds = 0;
                    status.total_seconds = 0;
                    let _ = app_handle.emit("timer-break-complete", ());
                    let _ = app_handle.emit("timer-update", status.clone());
                    drop(status);

                    // 自然结束清理
                    timer_running.store(false, Ordering::SeqCst);
                    FocusSession::delete();

                    if let Some(overlay) = app_handle.get_webview_window("overlay") {
                        let _ = overlay.destroy();
                    }

                    let state = app_handle.state::<AppState>();
                    state.stop_app_blocker();
                    let blocked_sites = {
                        let sb = state.site_blocker.lock().unwrap();
                        sb.get_blocked_sites().clone()
                    };
                    thread::spawn(move || {
                        let blocker = SiteBlocker::new(blocked_sites);
                        if let Err(e) = blocker.unblock_sites() {
                            eprintln!("自然结束后解除屏蔽失败: {}", e);
                        }
                    });

                    break;
                }
            }
        }
    });
}

#[tauri::command]
pub fn start_focus(
    app_handle: AppHandle,
    state: State<AppState>,
    minutes: Option<u32>,
    seconds: Option<u32>,
) -> Result<TimerStatus, String> {
    state.stop_timer_thread();

    let monthly_remaining = {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        let work = minutes.unwrap_or(config.pomodoro.work_minutes);
        let extra = seconds.unwrap_or(0);
        let brk = config.pomodoro.break_minutes;
        let remaining = config.pomodoro.get_monthly_emergency_remaining();
        // 持久化可能更新的 reset_month
        if let Err(e) = config.save() {
            eprintln!("保存月度重置信息失败: {}", e);
        }
        (work, extra, brk, remaining)
    };
    let work_minutes = monthly_remaining.0;
    let extra_seconds = monthly_remaining.1;
    let break_minutes = monthly_remaining.2;
    let emergency_remaining = monthly_remaining.3;

    // 保存用户选择的专注时长到配置
    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        config.pomodoro.last_focus_duration = work_minutes;
        if let Err(e) = config.save() {
            eprintln!("保存 last_focus_duration 失败: {}", e);
        }
    }

    // 先屏蔽网站（需要管理员权限，可能弹出密码框）
    // 必须在启动倒计时之前完成，避免密码输入时间被计入专注时长
    {
        let site_blocker = state.site_blocker.lock().map_err(|e| e.to_string())?;
        site_blocker.block_sites().map_err(|e| {
            format!("屏蔽网站失败: {}", e)
        })?;
    }

    let total_seconds = work_minutes * 60 + extra_seconds;

    // 持久化会话时间戳，用于重启恢复
    let now_ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let work_end_ts = now_ts + total_seconds as u64;
    let break_end_ts = work_end_ts + (break_minutes * 60) as u64;
    let session = FocusSession {
        state: "working".to_string(),
        work_end_time: work_end_ts,
        break_end_time: break_end_ts,
        work_minutes,
        break_minutes,
        emergency_remaining,
    };
    if let Err(e) = session.save() {
        eprintln!("保存会话失败: {}", e);
    }

    {
        let mut timer_status = state.timer_status.lock().map_err(|e| e.to_string())?;
        timer_status.state = TimerState::Working;
        timer_status.remaining_seconds = total_seconds;
        timer_status.total_seconds = total_seconds;
        timer_status.emergency_remaining = emergency_remaining;
        timer_status.previous_state = None;
        timer_status.work_minutes = work_minutes;
        timer_status.break_minutes = break_minutes;
    }

    state.timer_running.store(true, Ordering::SeqCst);
    state.emergency_remaining.store(emergency_remaining, Ordering::SeqCst);

    let timer_status_clone = Arc::clone(&state.timer_status);
    let timer_thread = state.timer_thread.lock().map_err(|e| e.to_string())?;
    let stop_signal = Arc::clone(&timer_thread.stop_signal);
    let pause_signal = Arc::clone(&timer_thread.pause_signal);
    drop(timer_thread);

    start_timer_thread(app_handle.clone(), timer_status_clone, stop_signal, pause_signal, Arc::clone(&state.timer_running));

    // 启动 App 拦截
    state.start_app_blocker(app_handle);

    let status = state.timer_status.lock().map_err(|e| e.to_string())?;
    Ok(status.clone())
}

#[tauri::command]
pub fn pause_focus(state: State<AppState>) -> Result<TimerStatus, String> {
    let mut timer_status = state.timer_status.lock().map_err(|e| e.to_string())?;

    if timer_status.state == TimerState::Idle {
        return Err("计时器未运行".to_string());
    }

    if timer_status.state == TimerState::Paused {
        return Err("计时器已暂停".to_string());
    }

    timer_status.previous_state = Some(timer_status.state);
    timer_status.state = TimerState::Paused;

    let timer_thread = state.timer_thread.lock().map_err(|e| e.to_string())?;
    timer_thread.pause_signal.store(true, Ordering::SeqCst);

    Ok(timer_status.clone())
}

#[tauri::command]
pub fn resume_focus(state: State<AppState>) -> Result<TimerStatus, String> {
    let mut timer_status = state.timer_status.lock().map_err(|e| e.to_string())?;

    if timer_status.state != TimerState::Paused {
        return Err("计时器未暂停".to_string());
    }

    timer_status.state = timer_status.previous_state.unwrap_or(TimerState::Working);
    timer_status.previous_state = None;

    let timer_thread = state.timer_thread.lock().map_err(|e| e.to_string())?;
    timer_thread.pause_signal.store(false, Ordering::SeqCst);

    Ok(timer_status.clone())
}

#[tauri::command]
pub fn stop_focus(app_handle: AppHandle, state: State<AppState>) -> Result<TimerStatus, String> {
    state.stop_timer_thread();
    FocusSession::delete();

    let mut timer_status = state.timer_status.lock().map_err(|e| e.to_string())?;
    timer_status.state = TimerState::Idle;
    timer_status.remaining_seconds = 0;
    timer_status.total_seconds = 0;
    timer_status.previous_state = None;

    state.timer_running.store(false, Ordering::SeqCst);

    // 停止 App 拦截
    state.stop_app_blocker();

    // 主动广播 idle 状态给所有窗口
    let _ = app_handle.emit("timer-update", timer_status.clone());

    // 关闭覆盖窗口
    close_overlay(&app_handle);

    // 解除网站屏蔽（后台线程，不阻塞 UI）
    unblock_sites_async(&state);

    Ok(timer_status.clone())
}

#[tauri::command]
pub fn get_timer_status(state: State<AppState>) -> Result<TimerStatus, String> {
    let timer_status = state.timer_status.lock().map_err(|e| e.to_string())?;
    Ok(timer_status.clone())
}

#[tauri::command]
pub fn emergency_cancel(app_handle: AppHandle, state: State<AppState>) -> Result<TimerStatus, String> {
    let mut timer_status = state.timer_status.lock().map_err(|e| e.to_string())?;

    if timer_status.state == TimerState::Idle {
        return Err("计时器未运行".to_string());
    }

    if timer_status.emergency_remaining == 0 {
        return Err("紧急取消次数已用完".to_string());
    }

    timer_status.emergency_remaining -= 1;
    let remaining = timer_status.emergency_remaining;
    drop(timer_status);

    // 持久化已用次数到 config.json
    {
        let mut config = state.config.lock().map_err(|e| e.to_string())?;
        let current_month = chrono::Local::now().format("%Y-%m").to_string();
        config.pomodoro.emergency_used_count += 1;
        config.pomodoro.emergency_reset_month = current_month;
        if let Err(e) = config.save() {
            eprintln!("保存紧急取消次数失败: {}", e);
        }
    }

    state.stop_timer_thread();
    FocusSession::delete();

    let mut timer_status = state.timer_status.lock().map_err(|e| e.to_string())?;
    timer_status.state = TimerState::Idle;
    timer_status.remaining_seconds = 0;
    timer_status.total_seconds = 0;
    timer_status.previous_state = None;
    timer_status.emergency_remaining = remaining;

    state.timer_running.store(false, Ordering::SeqCst);
    state.emergency_remaining.store(remaining, Ordering::SeqCst);

    // 停止 App 拦截
    state.stop_app_blocker();

    // 主动广播 idle 状态给所有窗口（确保主窗口立即收到）
    let _ = app_handle.emit("timer-update", timer_status.clone());

    // 关闭覆盖窗口
    close_overlay(&app_handle);

    // 解除网站屏蔽（后台线程，不阻塞 UI）
    unblock_sites_async(&state);

    Ok(timer_status.clone())
}

/// 关闭覆盖窗口（使用 destroy 绕过 on_window_event 的 prevent_close）
fn close_overlay(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("overlay") {
        let _ = window.destroy();
        println!("覆盖窗口已关闭");
    }
}

/// 在后台线程中解除网站屏蔽，不阻塞 UI
fn unblock_sites_async(state: &State<AppState>) {
    let blocked_sites = {
        let site_blocker = state.site_blocker.lock().unwrap();
        site_blocker.get_blocked_sites().clone()
    };
    thread::spawn(move || {
        let blocker = SiteBlocker::new(blocked_sites);
        if let Err(e) = blocker.unblock_sites() {
            eprintln!("后台解除屏蔽失败: {}", e);
        }
    });
}

/// 从持久化的 session 恢复专注计时（应用启动时调用）
pub fn restore_focus(app_handle: &AppHandle) {
    let session = match FocusSession::load() {
        Ok(Some(s)) => {
            println!("[restore_focus] 找到会话文件: state={}, work_end={}, break_end={}", s.state, s.work_end_time, s.break_end_time);
            s
        }
        Ok(None) => {
            println!("[restore_focus] 无会话文件，跳过恢复");
            return;
        }
        Err(e) => {
            eprintln!("[restore_focus] 加载会话文件失败: {}", e);
            return;
        }
    };

    let now_ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    println!("[restore_focus] now_ts={}, work_end={}, break_end={}", now_ts, session.work_end_time, session.break_end_time);

    // 判断当前处于哪个阶段
    if now_ts >= session.break_end_time {
        // 整个会话已过期，清理 session 和残留屏蔽
        println!("[restore_focus] 会话已过期，清理 session 和屏蔽记录");
        FocusSession::delete();
        if let Err(e) = SiteBlocker::cleanup_if_needed() {
            eprintln!("[restore_focus] 清理残留屏蔽失败: {}", e);
        }
        return;
    }

    let state = app_handle.state::<AppState>();

    let (timer_state, remaining_seconds, total_seconds) = if now_ts < session.work_end_time {
        // 仍在工作阶段
        let remaining = (session.work_end_time - now_ts) as u32;
        let total = session.work_minutes * 60;
        (TimerState::Working, remaining, total)
    } else {
        // 在休息阶段
        let remaining = (session.break_end_time - now_ts) as u32;
        let total = session.break_minutes * 60;
        (TimerState::Breaking, remaining, total)
    };

    println!(
        "[restore_focus] 恢复会话: state={:?}, remaining={}s",
        timer_state, remaining_seconds
    );

    // 设置 TimerStatus
    {
        let mut status = state.timer_status.lock().unwrap();
        status.state = timer_state;
        status.remaining_seconds = remaining_seconds;
        status.total_seconds = total_seconds;
        status.emergency_remaining = session.emergency_remaining;
        status.previous_state = None;
        status.work_minutes = session.work_minutes;
        status.break_minutes = session.break_minutes;
    }

    state.timer_running.store(true, Ordering::SeqCst);
    state
        .emergency_remaining
        .store(session.emergency_remaining, Ordering::SeqCst);

    // 重新屏蔽网站（异步执行，不阻塞 setup）
    if !SiteBlocker::is_blocking_active() {
        println!("[restore_focus] hosts 中无屏蔽记录，异步重新屏蔽...");
        let blocked_sites = {
            let sb = state.site_blocker.lock().unwrap();
            sb.get_blocked_sites().clone()
        };
        thread::spawn(move || {
            let blocker = SiteBlocker::new(blocked_sites);
            if let Err(e) = blocker.block_sites() {
                eprintln!("[restore_focus] 重新屏蔽网站失败: {}", e);
            }
        });
    } else {
        println!("[restore_focus] hosts 中已有屏蔽记录，跳过重新屏蔽");
    }

    // 启动计时线程
    let timer_status_clone = Arc::clone(&state.timer_status);
    let timer_thread = state.timer_thread.lock().unwrap();
    let stop_signal = Arc::clone(&timer_thread.stop_signal);
    let pause_signal = Arc::clone(&timer_thread.pause_signal);
    drop(timer_thread);

    start_timer_thread(
        app_handle.clone(),
        timer_status_clone,
        stop_signal,
        pause_signal,
        Arc::clone(&state.timer_running),
    );

    // 启动 App 拦截
    state.start_app_blocker(app_handle.clone());
}

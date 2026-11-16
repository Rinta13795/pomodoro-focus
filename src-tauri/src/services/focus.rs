//! 专注计时引擎：开始 / 暂停 / 结束，以及把每个工作阶段写入专注记录。
//!
//! 时间用 SystemTime（墙钟）计算，电脑睡眠后醒来会自动补偿。
//! 每次状态变化都写 session.json，应用重启后由 [`restore`] 恢复。

use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, Manager};

use crate::models::history::{self, MIN_RECORD_SECONDS};
use crate::models::{FocusRecord, FocusSession, Planner, TimerState, TimerStatus};
use crate::services::site_blocker;
use crate::state::AppState;

const TICK: Duration = Duration::from_millis(500);

pub fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn clean_opt(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn emit_status(app: &AppHandle, status: &TimerStatus) {
    let _ = app.emit("timer-update", status.clone());
}

/// 开始一次专注。会先屏蔽网站（可能弹出管理员授权），授权完成后才开始计时。
pub fn start(
    app: &AppHandle,
    minutes: Option<u32>,
    seconds: Option<u32>,
    label: Option<String>,
    task_id: Option<String>,
) -> Result<TimerStatus, String> {
    let state = app.state::<AppState>();
    // 同一时间只允许一个 start（等待管理员授权期间状态仍是 Idle，需要单独占位）
    if state
        .starting
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("正在启动专注，请稍候".to_string());
    }
    let result = start_inner(app, minutes, seconds, label, task_id);
    state.starting.store(false, Ordering::SeqCst);
    result
}

fn start_inner(
    app: &AppHandle,
    minutes: Option<u32>,
    seconds: Option<u32>,
    label: Option<String>,
    task_id: Option<String>,
) -> Result<TimerStatus, String> {
    let state = app.state::<AppState>();
    if state.timer_status.lock().unwrap().state != TimerState::Idle {
        return Err("已经在专注中".to_string());
    }
    state.stop_timer_thread();

    let (work_minutes, break_minutes, emergency_remaining, sites) = {
        let mut config = state.config.lock().unwrap();
        let work = minutes.unwrap_or(config.pomodoro.work_minutes);
        config.pomodoro.last_focus_duration = work;
        let remaining = config.pomodoro.monthly_emergency_remaining();
        if let Err(e) = config.save() {
            log::warn!("保存配置失败: {}", e);
        }
        (work, config.pomodoro.break_minutes, remaining, config.blocked_sites.clone())
    };
    let total = work_minutes
        .saturating_mul(60)
        .saturating_add(seconds.unwrap_or(0));
    if total == 0 {
        return Err("专注时长不能为 0".to_string());
    }

    // 必须在计时开始之前完成，输入密码的时间不计入专注
    site_blocker::block_sites(&sites).map_err(|e| format!("屏蔽网站失败: {}", e))?;

    let label = clean_opt(label);
    let task_id = clean_opt(task_id);
    let now = now_ts();
    let session = FocusSession {
        state: "working".to_string(),
        work_start_time: now,
        work_end_time: now + total as u64,
        break_end_time: now + total as u64 + u64::from(break_minutes) * 60,
        work_minutes,
        break_minutes,
        emergency_remaining,
        planned_seconds: total,
        label: label.clone(),
        task_id: task_id.clone(),
        paused_remaining: None,
    };
    if let Err(e) = session.save() {
        log::warn!("保存会话失败: {}", e);
    }

    let status = {
        let mut st = state.timer_status.lock().unwrap();
        *st = TimerStatus {
            state: TimerState::Working,
            remaining_seconds: total,
            total_seconds: total,
            emergency_remaining,
            previous_state: None,
            work_minutes,
            break_minutes,
            label,
            task_id,
            started_at: Some(now),
        };
        st.clone()
    };

    state.timer_running.store(true, Ordering::SeqCst);
    spawn_ticker(app);
    state.start_app_blocker(app.clone());
    emit_status(app, &status);
    Ok(status)
}

pub fn pause(app: &AppHandle) -> Result<TimerStatus, String> {
    let state = app.state::<AppState>();
    let status = {
        let mut st = state.timer_status.lock().unwrap();
        match st.state {
            TimerState::Idle => return Err("计时器未运行".into()),
            TimerState::Paused => return Err("计时器已暂停".into()),
            _ => {}
        }
        st.previous_state = Some(st.state);
        st.state = TimerState::Paused;
        st.clone()
    };
    state.timer_thread.lock().unwrap().pause_signal.store(true, Ordering::SeqCst);
    if let Some(mut s) = FocusSession::load() {
        s.paused_remaining = Some(status.remaining_seconds);
        let _ = s.save();
    }
    emit_status(app, &status);
    Ok(status)
}

pub fn resume(app: &AppHandle) -> Result<TimerStatus, String> {
    let state = app.state::<AppState>();
    let status = {
        let mut st = state.timer_status.lock().unwrap();
        if st.state != TimerState::Paused {
            return Err("计时器未暂停".into());
        }
        st.state = st.previous_state.take().unwrap_or(TimerState::Working);
        st.clone()
    };
    state.timer_thread.lock().unwrap().pause_signal.store(false, Ordering::SeqCst);

    // 按剩余时间重新计算结束时间
    if let Some(mut s) = FocusSession::load() {
        let now = now_ts();
        let remaining = status.remaining_seconds as u64;
        if status.state == TimerState::Working {
            s.work_end_time = now + remaining;
            s.break_end_time = s.work_end_time + s.break_minutes as u64 * 60;
        } else {
            s.break_end_time = now + remaining;
        }
        s.paused_remaining = None;
        let _ = s.save();
    }
    emit_status(app, &status);
    Ok(status)
}

/// 结束专注（跳过休息、紧急取消共用）。工作阶段中已专注超过 1 分钟会留下一条未完成记录。
pub fn stop(app: &AppHandle) -> TimerStatus {
    let state = app.state::<AppState>();
    state.stop_timer_thread();

    let partial = {
        let st = state.timer_status.lock().unwrap();
        if st.in_work_phase() && st.focused_seconds() >= MIN_RECORD_SECONDS {
            Some(make_record(&st, now_ts(), false))
        } else {
            None
        }
    };
    if let Some(record) = partial {
        persist_record(app, &record);
    }
    finish_session(app)
}

/// 紧急取消：每月次数有限。
pub fn emergency_cancel(app: &AppHandle) -> Result<TimerStatus, String> {
    let state = app.state::<AppState>();
    {
        let mut st = state.timer_status.lock().unwrap();
        if st.state == TimerState::Idle {
            return Err("计时器未运行".into());
        }
        if st.emergency_remaining == 0 {
            return Err("本月紧急取消次数已用完".into());
        }
        st.emergency_remaining -= 1;
    }
    {
        let mut config = state.config.lock().unwrap();
        config.pomodoro.record_emergency_use();
        if let Err(e) = config.save() {
            log::warn!("保存紧急取消次数失败: {}", e);
        }
    }
    Ok(stop(app))
}

fn make_record(st: &TimerStatus, ended_at: u64, completed: bool) -> FocusRecord {
    let focused = if completed { st.total_seconds } else { st.focused_seconds() };
    let started_at = st
        .started_at
        .unwrap_or_else(|| ended_at.saturating_sub(st.total_seconds as u64));
    FocusRecord {
        id: history::record_id(started_at),
        started_at,
        ended_at,
        planned_seconds: st.total_seconds,
        focused_seconds: focused,
        completed,
        label: st.label.clone(),
        task_id: st.task_id.clone(),
        note: None,
    }
}

/// 写入记录；完成的番茄给关联任务 +1。
fn persist_record(app: &AppHandle, record: &FocusRecord) {
    match history::append(record.clone()) {
        Ok(true) => {}
        Ok(false) => return, // 已记录过（例如重启恢复），不要重复给任务 +1
        Err(e) => {
            log::error!("写入专注记录失败: {}", e);
            return;
        }
    }
    let _ = app.emit("history-updated", ());
    if record.completed {
        if let Some(planner) = record.task_id.as_deref().and_then(Planner::increment) {
            let _ = app.emit("planner-updated", planner);
        }
    }
}

/// 工作阶段自然结束：写记录并进入休息。返回休息秒数；状态已不在工作阶段时返回 None。
fn complete_work_phase(app: &AppHandle) -> Option<u32> {
    let state = app.state::<AppState>();
    let (record, status) = {
        let mut st = state.timer_status.lock().unwrap();
        if !st.in_work_phase() {
            return None;
        }
        let record = make_record(&st, now_ts(), true);
        let break_secs = st.break_minutes.saturating_mul(60);
        // 恰好在最后一秒按了暂停：进入“暂停中的休息”
        if st.state == TimerState::Paused {
            st.previous_state = Some(TimerState::Breaking);
        } else {
            st.state = TimerState::Breaking;
        }
        st.remaining_seconds = break_secs;
        st.total_seconds = break_secs;
        (record, st.clone())
    };
    persist_record(app, &record);
    if let Some(mut s) = FocusSession::load() {
        s.state = "breaking".into();
        s.break_end_time = now_ts() + status.total_seconds as u64;
        let _ = s.save();
    }
    let _ = app.emit("timer-work-complete", record);
    emit_status(app, &status);
    Some(status.total_seconds)
}

/// 回到空闲：停止拦截、关闭覆盖窗口、解除网站屏蔽。不会 join 计时线程，可在计时线程中调用。
fn finish_session(app: &AppHandle) -> TimerStatus {
    let state = app.state::<AppState>();
    FocusSession::delete();
    let status = {
        let mut st = state.timer_status.lock().unwrap();
        st.reset_to_idle();
        st.clone()
    };
    state.timer_running.store(false, Ordering::SeqCst);
    state.stop_app_blocker();
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.destroy();
    }
    site_blocker::unblock_sites_async();
    emit_status(app, &status);
    status
}

fn spawn_ticker(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (stop_signal, pause_signal) = {
        let t = state.timer_thread.lock().unwrap();
        (t.stop_signal.clone(), t.pause_signal.clone())
    };
    let status = state.timer_status.clone();
    let initial = status.lock().unwrap().remaining_seconds as u64;
    let app = app.clone();

    let handle = thread::spawn(move || {
        let mut end = SystemTime::now() + Duration::from_secs(initial);
        let mut paused_at: Option<SystemTime> = None;
        loop {
            thread::sleep(TICK);
            if stop_signal.load(Ordering::SeqCst) {
                break;
            }
            if pause_signal.load(Ordering::SeqCst) {
                paused_at.get_or_insert_with(SystemTime::now);
                continue;
            }
            if let Some(p) = paused_at.take() {
                end += SystemTime::now().duration_since(p).unwrap_or_default();
            }

            let mut st = status.lock().unwrap();
            match st.state {
                TimerState::Idle => break,
                TimerState::Paused => continue,
                _ => {}
            }
            let remaining = end
                .duration_since(SystemTime::now())
                .unwrap_or_default()
                .as_secs() as u32;
            st.remaining_seconds = remaining;
            let phase = st.state;
            let snapshot = st.clone();
            drop(st);
            emit_status(&app, &snapshot);

            if remaining == 0 {
                if phase == TimerState::Working {
                    match complete_work_phase(&app) {
                        Some(0) => {
                            // 休息时长为 0：直接结束
                            finish_session(&app);
                            break;
                        }
                        Some(break_secs) => {
                            end = SystemTime::now() + Duration::from_secs(u64::from(break_secs));
                        }
                        None => {}
                    }
                } else {
                    let _ = app.emit("timer-break-complete", ());
                    finish_session(&app);
                    break;
                }
            }
        }
    });
    state.timer_thread.lock().unwrap().handle = Some(handle);
}

/// 应用启动时恢复未结束的会话；没有会话时清理可能残留的 hosts 屏蔽。
pub fn restore(app: &AppHandle) {
    let Some(mut session) = FocusSession::load() else {
        site_blocker::unblock_sites_async();
        return;
    };
    let state = app.state::<AppState>();
    let now = now_ts();

    let mut status = TimerStatus {
        emergency_remaining: session.emergency_remaining,
        work_minutes: session.work_minutes,
        break_minutes: session.break_minutes,
        label: session.label.clone(),
        task_id: session.task_id.clone(),
        started_at: Some(session.work_start_time).filter(|t| *t > 0),
        ..Default::default()
    };
    let planned = if session.planned_seconds > 0 {
        session.planned_seconds
    } else {
        session.work_minutes * 60
    };
    let break_total = session.break_minutes.saturating_mul(60);
    let in_work = session.state == "working";

    if let Some(rem) = session.paused_remaining {
        let phase = if in_work { TimerState::Working } else { TimerState::Breaking };
        status.state = TimerState::Paused;
        status.previous_state = Some(phase);
        status.remaining_seconds = rem;
        status.total_seconds = if in_work { planned } else { break_total };
    } else if in_work && now < session.work_end_time {
        status.state = TimerState::Working;
        status.remaining_seconds = (session.work_end_time - now) as u32;
        status.total_seconds = planned;
    } else {
        // 工作阶段在应用关闭期间已经结束：补写一条完成记录
        if in_work {
            status.total_seconds = planned;
            persist_record(app, &make_record(&status, session.work_end_time, true));
            session.state = "breaking".into();
            let _ = session.save();
        }
        if now >= session.break_end_time {
            FocusSession::delete();
            site_blocker::unblock_sites_async();
            return;
        }
        status.state = TimerState::Breaking;
        status.remaining_seconds = (session.break_end_time - now) as u32;
        status.total_seconds = break_total;
    }

    log::info!("恢复专注会话: {:?}, 剩余 {}s", status.state, status.remaining_seconds);
    let paused = status.state == TimerState::Paused;
    *state.timer_status.lock().unwrap() = status;
    state.timer_running.store(true, Ordering::SeqCst);

    if !site_blocker::is_blocking_active() {
        let sites = state.config.lock().unwrap().blocked_sites.clone();
        let handle = app.clone();
        thread::spawn(move || {
            if let Err(e) = site_blocker::block_sites(&sites) {
                log::warn!("恢复网站屏蔽失败: {}", e);
            }
            // 授权期间会话可能已经结束，此时撤销刚写入的屏蔽
            let idle = handle.state::<AppState>().timer_status.lock().unwrap().state
                == TimerState::Idle;
            if idle {
                let _ = site_blocker::unblock_sites();
            }
        });
    }
    state
        .timer_thread
        .lock()
        .unwrap()
        .pause_signal
        .store(paused, Ordering::SeqCst);
    spawn_ticker(app);
    state.start_app_blocker(app.clone());
}

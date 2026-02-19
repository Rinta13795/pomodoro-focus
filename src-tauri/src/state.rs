use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use tauri::AppHandle;

use crate::models::{Config, TimerState, TimerStatus};
use crate::services::{AppBlocker, Scheduler, SiteBlocker};

pub struct TimerThread {
    pub handle: Option<JoinHandle<()>>,
    pub stop_signal: Arc<AtomicBool>,
    pub pause_signal: Arc<AtomicBool>,
}

impl Default for TimerThread {
    fn default() -> Self {
        TimerThread {
            handle: None,
            stop_signal: Arc::new(AtomicBool::new(false)),
            pause_signal: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub struct AppBlockerThread {
    pub handle: Option<JoinHandle<()>>,
    pub running_flag: Arc<AtomicBool>,
}

impl Default for AppBlockerThread {
    fn default() -> Self {
        AppBlockerThread {
            handle: None,
            running_flag: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub struct SchedulerThread {
    pub handle: Option<JoinHandle<()>>,
    pub running_flag: Arc<AtomicBool>,
}

impl Default for SchedulerThread {
    fn default() -> Self {
        SchedulerThread {
            handle: None,
            running_flag: Arc::new(AtomicBool::new(false)),
        }
    }
}

pub struct AppState {
    pub config: Arc<Mutex<Config>>,
    pub timer_status: Arc<Mutex<TimerStatus>>,
    pub timer_running: Arc<AtomicBool>,
    pub blocker_running: AtomicBool,
    pub scheduler_running: AtomicBool,
    pub scheduled_focus_active: AtomicBool,
    pub emergency_remaining: AtomicU32,
    pub overlay_suppressed: Arc<AtomicBool>,
    pub suppress_generation: Arc<AtomicU32>,
    pub timer_thread: Mutex<TimerThread>,
    pub app_blocker_thread: Mutex<AppBlockerThread>,
    pub scheduler_thread: Mutex<SchedulerThread>,
    pub app_blocker: Mutex<AppBlocker>,
    pub site_blocker: Mutex<SiteBlocker>,
    pub scheduler: Mutex<Scheduler>,
}

impl AppState {
    pub fn new(config: Config) -> Self {
        let emergency_limit = config.pomodoro.emergency_cancel_limit;
        let work_minutes = config.pomodoro.work_minutes;
        let break_minutes = config.pomodoro.break_minutes;
        let blocked_apps = config.blocked_apps.clone();
        let blocked_sites = config.blocked_sites.clone();
        let schedules = config.schedules.clone();

        let timer_status = TimerStatus::new_with_config(work_minutes, break_minutes, emergency_limit);

        AppState {
            config: Arc::new(Mutex::new(config)),
            timer_status: Arc::new(Mutex::new(timer_status)),
            timer_running: Arc::new(AtomicBool::new(false)),
            blocker_running: AtomicBool::new(false),
            scheduler_running: AtomicBool::new(false),
            scheduled_focus_active: AtomicBool::new(false),
            emergency_remaining: AtomicU32::new(emergency_limit),
            overlay_suppressed: Arc::new(AtomicBool::new(false)),
            suppress_generation: Arc::new(AtomicU32::new(0)),
            timer_thread: Mutex::new(TimerThread::default()),
            app_blocker_thread: Mutex::new(AppBlockerThread::default()),
            scheduler_thread: Mutex::new(SchedulerThread::default()),
            app_blocker: Mutex::new(AppBlocker::new(blocked_apps)),
            site_blocker: Mutex::new(SiteBlocker::new(blocked_sites)),
            scheduler: Mutex::new(Scheduler::new(schedules)),
        }
    }

    pub fn stop_timer_thread(&self) {
        let mut timer_thread = self.timer_thread.lock().unwrap();
        timer_thread.stop_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = timer_thread.handle.take() {
            let _ = handle.join();
        }
        timer_thread.stop_signal.store(false, Ordering::SeqCst);
        timer_thread.pause_signal.store(false, Ordering::SeqCst);
    }

    pub fn start_app_blocker(&self, app_handle: AppHandle) {
        let config = self.config.lock().unwrap();
        let blocked_apps = config.blocked_apps.clone();
        drop(config);

        let mut blocker_thread = self.app_blocker_thread.lock().unwrap();

        // 如果已经在运行，先停止
        if blocker_thread.running_flag.load(Ordering::SeqCst) {
            blocker_thread.running_flag.store(false, Ordering::SeqCst);
            if let Some(handle) = blocker_thread.handle.take() {
                let _ = handle.join();
            }
        }

        // 启动新的轮询线程
        blocker_thread.running_flag.store(true, Ordering::SeqCst);
        let running_flag = Arc::clone(&blocker_thread.running_flag);
        let suppressed = Arc::clone(&self.overlay_suppressed);
        let handle = AppBlocker::start_polling(blocked_apps, running_flag, app_handle, suppressed);
        blocker_thread.handle = Some(handle);

        self.blocker_running.store(true, Ordering::SeqCst);
    }

    pub fn stop_app_blocker(&self) {
        let mut blocker_thread = self.app_blocker_thread.lock().unwrap();
        blocker_thread.running_flag.store(false, Ordering::SeqCst);
        if let Some(handle) = blocker_thread.handle.take() {
            let _ = handle.join();
        }
        self.blocker_running.store(false, Ordering::SeqCst);
    }

    pub fn stop_scheduler(&self) {
        let mut scheduler_thread = self.scheduler_thread.lock().unwrap();
        scheduler_thread.running_flag.store(false, Ordering::SeqCst);
        if let Some(handle) = scheduler_thread.handle.take() {
            let _ = handle.join();
        }
        self.scheduler_running.store(false, Ordering::SeqCst);
    }

    pub fn is_scheduled_mode(&self) -> bool {
        let config = self.config.lock().unwrap();
        config.mode == "scheduled"
    }

    pub fn set_mode(&self, mode: &str) {
        let mut config = self.config.lock().unwrap();
        config.mode = mode.to_string();
        let _ = config.save();
    }

    pub fn cleanup_on_exit(&self) {
        let timer_state = {
            let status = self.timer_status.lock().unwrap();
            status.state
        };

        // 停止所有后台线程
        self.stop_timer_thread();
        self.stop_app_blocker();
        self.stop_scheduler();

        // Working/Paused/Breaking 时保留 hosts 屏蔽，重启后可直接恢复
        if timer_state != TimerState::Idle {
            println!("[cleanup_on_exit] 专注进行中（{:?}），保留 hosts 屏蔽记录", timer_state);
        } else {
            println!("[cleanup_on_exit] Idle 状态，清理 hosts 屏蔽记录");
            let site_blocker = self.site_blocker.lock().unwrap();
            let _ = site_blocker.unblock_sites();
        }
    }
}

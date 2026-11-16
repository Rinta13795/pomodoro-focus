use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use tauri::AppHandle;

use crate::models::{Config, TimerStatus};
use crate::services::app_blocker;

/// 一个可停止的后台线程。
#[derive(Default)]
pub struct Worker {
    pub handle: Option<JoinHandle<()>>,
    pub stop_signal: Arc<AtomicBool>,
    pub pause_signal: Arc<AtomicBool>,
}

impl Worker {
    /// 通知线程停止并等待退出（如果是在该线程内部调用则不等待）。
    pub fn stop(&mut self) {
        self.stop_signal.store(true, Ordering::SeqCst);
        if let Some(handle) = self.handle.take() {
            if handle.thread().id() != std::thread::current().id() {
                let _ = handle.join();
            }
        }
        self.stop_signal.store(false, Ordering::SeqCst);
        self.pause_signal.store(false, Ordering::SeqCst);
    }
}

/// 线程句柄的锁即使被 panic 污染也继续使用，保证总能停掉线程、解除屏蔽。
fn lock_worker(m: &Mutex<Worker>) -> std::sync::MutexGuard<'_, Worker> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

pub struct AppState {
    pub config: Arc<Mutex<Config>>,
    pub timer_status: Arc<Mutex<TimerStatus>>,
    /// 供浏览器扩展 HTTP 接口读取（专注 + 休息期间为 true）
    pub timer_running: Arc<AtomicBool>,
    /// start_focus 进行中（可能在等管理员授权）
    pub starting: AtomicBool,
    pub overlay_suppressed: Arc<AtomicBool>,
    pub suppress_generation: Arc<AtomicU32>,
    pub timer_thread: Mutex<Worker>,
    pub app_blocker_thread: Mutex<Worker>,
}

impl AppState {
    pub fn new(mut config: Config) -> Self {
        let remaining = config.pomodoro.monthly_emergency_remaining();
        let status = TimerStatus::idle(
            config.pomodoro.work_minutes,
            config.pomodoro.break_minutes,
            remaining,
        );
        AppState {
            config: Arc::new(Mutex::new(config)),
            timer_status: Arc::new(Mutex::new(status)),
            timer_running: Arc::new(AtomicBool::new(false)),
            starting: AtomicBool::new(false),
            overlay_suppressed: Arc::new(AtomicBool::new(false)),
            suppress_generation: Arc::new(AtomicU32::new(0)),
            timer_thread: Mutex::new(Worker::default()),
            app_blocker_thread: Mutex::new(Worker::default()),
        }
    }

    pub fn stop_timer_thread(&self) {
        lock_worker(&self.timer_thread).stop();
    }

    pub fn start_app_blocker(&self, app: AppHandle) {
        let blocked_apps = self.config.lock().unwrap().blocked_apps.clone();
        let mut worker = lock_worker(&self.app_blocker_thread);
        worker.stop();
        worker.handle = Some(app_blocker::start_polling(
            blocked_apps,
            worker.stop_signal.clone(),
            app,
            self.overlay_suppressed.clone(),
        ));
    }

    pub fn stop_app_blocker(&self) {
        lock_worker(&self.app_blocker_thread).stop();
    }

    /// 真正退出应用前调用。专注进行中时保留 hosts 屏蔽，下次启动继续。
    pub fn cleanup_on_exit(&self) {
        let idle = self.timer_status.lock().unwrap().state == crate::models::TimerState::Idle;
        self.stop_timer_thread();
        self.stop_app_blocker();
        if idle {
            if let Err(e) = crate::services::site_blocker::unblock_sites() {
                log::warn!("退出时解除屏蔽失败: {}", e);
            }
        }
    }
}

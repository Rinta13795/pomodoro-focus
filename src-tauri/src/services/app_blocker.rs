//! App 拦截：专注期间每 3 秒扫描一次进程，结束黑名单应用并弹出全屏提醒。

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::platform;

const POLL_INTERVAL: Duration = Duration::from_secs(3);
const MAX_KILL_ATTEMPTS: u32 = 3;

/// 子进程后缀（浏览器内核的 helper 等），不单独拦截。
const SUBPROCESS_SUFFIXES: &[&str] = &["helper", "renderer", "gpu", "utility", "plugin", "crashpad_handler"];

fn is_protected(process: &str) -> bool {
    platform::PROTECTED_PROCESS_PREFIXES
        .iter()
        .any(|p| process.starts_with(p))
}

/// process 为已统一（小写、无 .exe）的进程名。
pub fn matches(process: &str, candidates: &[String]) -> bool {
    if SUBPROCESS_SUFFIXES
        .iter()
        .any(|s| process.ends_with(&format!(" {s}")) || process.ends_with(&format!("_{s}")) || process.ends_with(&format!("-{s}")))
    {
        return false;
    }
    candidates
        .iter()
        .any(|c| process == c || (c.chars().count() >= 3 && process.contains(c.as_str())))
}

pub fn start_polling(
    blocked_apps: Vec<String>,
    stop_signal: Arc<AtomicBool>,
    app: AppHandle,
    overlay_suppressed: Arc<AtomicBool>,
) -> thread::JoinHandle<()> {
    let entries: Vec<(String, Vec<String>)> = blocked_apps
        .iter()
        .map(|a| (a.clone(), platform::process_name_candidates(a)))
        .collect();

    thread::spawn(move || {
        let mut system = System::new();
        let mut failed: HashMap<Pid, u32> = HashMap::new();
        while !stop_signal.load(Ordering::SeqCst) {
            system.refresh_processes(ProcessesToUpdate::All, true);
            for (pid, process) in system.processes() {
                let name = platform::normalize_process_name(&process.name().to_string_lossy());
                if is_protected(&name) {
                    continue;
                }
                let Some((display, _)) = entries.iter().find(|(_, c)| matches(&name, c)) else {
                    continue;
                };
                let attempts = failed.get(pid).copied().unwrap_or(0);
                if attempts >= MAX_KILL_ATTEMPTS {
                    continue;
                }
                if attempts == 0 && !overlay_suppressed.load(Ordering::SeqCst) {
                    show_overlay(&app, display);
                }
                if process.kill() {
                    log::info!("已关闭黑名单应用 {} (PID {})", name, pid);
                    failed.remove(pid);
                } else {
                    failed.insert(*pid, attempts + 1);
                }
            }
            // 分段睡眠，停止时能更快响应
            for _ in 0..6 {
                if stop_signal.load(Ordering::SeqCst) {
                    break;
                }
                thread::sleep(POLL_INTERVAL / 6);
            }
        }
    })
}

fn show_overlay(app: &AppHandle, blocked_app: &str) {
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.show();
        let _ = overlay.unminimize();
        let _ = overlay.set_always_on_top(true);
        let _ = overlay.set_fullscreen(true);
        let _ = overlay.set_focus();
        let _ = app.emit("blocked-app-detected", blocked_app.to_string());
        return;
    }
    let built = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::App("overlay.html".into()))
        .title("专注模式")
        .fullscreen(true)
        .always_on_top(true)
        .decorations(false)
        .resizable(false)
        .closable(false)
        .skip_taskbar(true)
        .build();
    match built {
        Ok(_) => {
            let handle = app.clone();
            let name = blocked_app.to_string();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(500));
                let _ = handle.emit("blocked-app-detected", name);
            });
        }
        Err(e) => log::error!("创建覆盖窗口失败: {}", e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matching_rules() {
        let c = vec!["wechat".to_string(), "qq".to_string()];
        assert!(matches("wechat", &c));
        assert!(matches("wechatappex", &c));
        assert!(!matches("wechat helper", &c));
        // 短名字只做精确匹配，避免 "qq" 误伤 "qqmusic"
        assert!(matches("qq", &c));
        assert!(!matches("qqmusic", &c));
    }

    #[test]
    fn protects_system_processes() {
        assert!(is_protected("pomodoro-focus"));
        assert!(!is_protected("bilibili"));
    }
}

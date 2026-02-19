use crate::commands::apps::resolve_executable_name;
use crate::errors::AppError;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

const POLL_INTERVAL_SECS: u64 = 3;
const MAX_KILL_ATTEMPTS: u32 = 3;

// 系统保护列表：绝对不拦截的进程前缀
const SYSTEM_PROTECTED_PREFIXES: &[&str] = &[
    "com.apple.",           // 所有 Apple 系统进程
    "kernel",               // 内核
    "launchd",              // 系统启动守护进程
    "systemd",              // 系统服务
    "pomodoro-focus",       // 本应用自身
    "pomodoro_focus",       // 本应用自身（下划线形式）
    "finder",               // Finder
    "windowserver",         // 窗口服务器
    "activitymonitor",      // 活动监视器
];

pub struct AppBlocker {
    blocked_apps: Vec<String>,
}

impl AppBlocker {
    pub fn new(blocked_apps: Vec<String>) -> Self {
        AppBlocker { blocked_apps }
    }

    pub fn update_blocked_apps(&mut self, apps: Vec<String>) {
        self.blocked_apps = apps;
    }

    pub fn get_blocked_apps(&self) -> &Vec<String> {
        &self.blocked_apps
    }

    /// 启动后台轮询线程
    pub fn start_polling(
        blocked_apps: Vec<String>,
        running_flag: Arc<AtomicBool>,
        app_handle: AppHandle,
        overlay_suppressed: Arc<AtomicBool>,
    ) -> thread::JoinHandle<()> {
        // 为每个 blocked app 解析真实可执行文件名，构建候选名列表
        let match_entries: Vec<(String, Vec<String>)> = blocked_apps
            .iter()
            .map(|app| {
                let mut names = vec![app.to_lowercase()];
                if let Some(exec) = resolve_executable_name(app) {
                    let exec_lower = exec.to_lowercase();
                    if !names.contains(&exec_lower) {
                        println!("[AppBlocker] {} -> 可执行文件: {}", app, exec);
                        names.push(exec_lower);
                    }
                }
                (app.clone(), names)
            })
            .collect();

        thread::spawn(move || {
            println!("App 拦截轮询线程已启动");
            let mut system = System::new();
            system.refresh_processes(ProcessesToUpdate::All, true);
            let mut failed_pids: HashMap<Pid, u32> = HashMap::new();

            while running_flag.load(Ordering::SeqCst) {
                system.refresh_processes(ProcessesToUpdate::All, true);

                let killed = Self::check_and_kill_processes(
                    &mut system,
                    &match_entries,
                    &mut failed_pids,
                    &app_handle,
                    &overlay_suppressed,
                );
                if !killed.is_empty() {
                    println!("已关闭黑名单应用: {:?}", killed);
                }

                thread::sleep(Duration::from_secs(POLL_INTERVAL_SECS));
            }

            println!("App 拦截轮询线程已停止");
        })
    }

    /// 检查并关闭黑名单进程
    fn check_and_kill_processes(
        system: &mut System,
        match_entries: &[(String, Vec<String>)],
        failed_pids: &mut HashMap<Pid, u32>,
        app_handle: &AppHandle,
        overlay_suppressed: &AtomicBool,
    ) -> Vec<String> {
        let mut killed = Vec::new();

        for (pid, process) in system.processes() {
            let process_name = process.name().to_string_lossy().to_lowercase();

            // 检查是否为系统保护进程
            if Self::is_system_protected(&process_name) {
                continue;
            }

            // 检查是否匹配任一黑名单 app 的候选进程名
            for (display_name, candidate_names) in match_entries {
                if !Self::is_blocked_process(&process_name, candidate_names) {
                    continue;
                }

                // 检查是否已达到最大重试次数
                let attempts = failed_pids.get(pid).copied().unwrap_or(0);
                if attempts >= MAX_KILL_ATTEMPTS {
                    continue;
                }

                // 首次检测时打印日志并显示覆盖窗口
                if attempts == 0 {
                    println!("检测到黑名单应用: {} (PID: {}, 进程名: {})", display_name, pid, process_name);
                    if !overlay_suppressed.load(Ordering::SeqCst) {
                        Self::show_overlay_window(app_handle, display_name);
                    }
                }

                if process.kill() {
                    killed.push(format!("{} (PID: {})", process_name, pid));
                    failed_pids.remove(pid);
                } else {
                    let new_attempts = attempts + 1;
                    failed_pids.insert(*pid, new_attempts);
                    if new_attempts >= MAX_KILL_ATTEMPTS {
                        eprintln!(
                            "关闭进程失败，已达最大重试次数: {} (PID: {})",
                            process_name, pid
                        );
                    }
                }
            }
        }

        killed
    }

    /// 检查是否为系统保护进程
    fn is_system_protected(process_name: &str) -> bool {
        let name_lower = process_name.to_lowercase();

        for prefix in SYSTEM_PROTECTED_PREFIXES {
            if name_lower.starts_with(&prefix.to_lowercase()) {
                return true;
            }
        }

        false
    }

    /// 检查进程名是否匹配黑名单（支持多候选名，忽略子进程）
    fn is_blocked_process(process_name: &str, candidate_names: &[String]) -> bool {
        // 忽略常见的子进程后缀
        let subprocess_suffixes = [
            " helper", " renderer", " gpu", " utility", " plugin",
            "_helper", "_renderer", "_gpu", "_utility", "_plugin",
            "-helper", "-renderer", "-gpu", "-utility", "-plugin",
        ];

        for suffix in subprocess_suffixes {
            if process_name.ends_with(suffix) {
                return false;
            }
        }

        // 精确匹配任一候选名
        for name in candidate_names {
            if process_name == name {
                return true;
            }
        }

        // contains 匹配（候选名长度 >= 3 时，进程名包含候选名）
        for name in candidate_names {
            if name.len() >= 3 && process_name.contains(name.as_str()) {
                return true;
            }
        }

        false
    }

    /// 手动检查并关闭一次（不启动线程，不发送事件）
    pub fn check_and_kill_blocked(&self) -> Result<Vec<String>, AppError> {
        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);

        // 构建候选名映射
        let match_entries: Vec<Vec<String>> = self.blocked_apps
            .iter()
            .map(|app| {
                let mut names = vec![app.to_lowercase()];
                if let Some(exec) = resolve_executable_name(app) {
                    let exec_lower = exec.to_lowercase();
                    if !names.contains(&exec_lower) {
                        names.push(exec_lower);
                    }
                }
                names
            })
            .collect();

        let mut killed = Vec::new();

        for (pid, process) in system.processes() {
            let process_name = process.name().to_string_lossy().to_lowercase();

            if Self::is_system_protected(&process_name) {
                continue;
            }

            for candidate_names in &match_entries {
                if Self::is_blocked_process(&process_name, candidate_names) {
                    if process.kill() {
                        killed.push(format!("{} (PID: {})", process_name, pid));
                    }
                }
            }
        }

        Ok(killed)
    }

    /// 检查指定应用是否正在运行
    pub fn is_app_running(&self, app_name: &str) -> bool {
        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);

        let mut names = vec![app_name.to_lowercase()];
        if let Some(exec) = resolve_executable_name(app_name) {
            let exec_lower = exec.to_lowercase();
            if !names.contains(&exec_lower) {
                names.push(exec_lower);
            }
        }

        for (_pid, process) in system.processes() {
            let process_name = process.name().to_string_lossy().to_lowercase();
            for name in &names {
                if process_name.contains(name.as_str()) {
                    return true;
                }
            }
        }

        false
    }

    /// 显示或创建覆盖窗口
    fn show_overlay_window(app_handle: &AppHandle, blocked_app: &str) {
        // 如果覆盖窗口已存在，恢复并发送事件
        if let Some(overlay) = app_handle.get_webview_window("overlay") {
            let _ = overlay.show();
            let _ = overlay.unminimize();
            let _ = overlay.set_always_on_top(true);
            let _ = overlay.set_fullscreen(true);
            let _ = overlay.set_focus();
            let _ = app_handle.emit("blocked-app-detected", blocked_app.to_string());
            return;
        }

        // 创建新的覆盖窗口
        match WebviewWindowBuilder::new(
            app_handle,
            "overlay",
            WebviewUrl::App("overlay.html".into()),
        )
        .title("专注模式")
        .fullscreen(true)
        .always_on_top(true)
        .decorations(false)
        .resizable(false)
        .closable(false)
        .build()
        {
            Ok(_) => {
                println!("覆盖窗口已创建");
                // 窗口创建后发送被拦截 App 名称
                let app_name = blocked_app.to_string();
                let handle = app_handle.clone();
                // 延迟发送事件，等待窗口加载
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(500));
                    let _ = handle.emit("blocked-app-detected", app_name);
                });
            }
            Err(e) => {
                eprintln!("创建覆盖窗口失败: {}", e);
            }
        }
    }
}

impl Default for AppBlocker {
    fn default() -> Self {
        Self::new(Vec::new())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_system_protected() {
        assert!(AppBlocker::is_system_protected("com.apple.Safari"));
        assert!(AppBlocker::is_system_protected("Finder"));
        assert!(AppBlocker::is_system_protected("pomodoro-focus"));
        assert!(!AppBlocker::is_system_protected("bilibili"));
        assert!(!AppBlocker::is_system_protected("QQ"));
    }
}

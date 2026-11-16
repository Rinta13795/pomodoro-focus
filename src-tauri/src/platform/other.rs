//! 其它平台（Linux 等）：只保证能编译运行计时与统计功能，系统级屏蔽不可用。

use std::net::Ipv4Addr;

use crate::errors::AppError;

pub const NAME: &str = "linux";
pub const HOSTS_PATH: &str = "/etc/hosts";
pub const LINE_ENDING: &str = "\n";
pub const PROTECTED_PROCESS_PREFIXES: &[&str] = &["systemd", "init", "kthreadd", "pomodoro"];

pub fn write_hosts_elevated(_content: &str, _ips: &[Ipv4Addr]) -> Result<(), AppError> {
    Err(AppError::BlockerError("当前系统暂不支持系统级网站屏蔽，请使用浏览器扩展".into()))
}
pub fn restore_hosts(content: &str) -> Result<(), AppError> {
    std::fs::write(HOSTS_PATH, content).map_err(|e| AppError::IoError(e.to_string()))
}
pub fn clear_firewall() {}
pub fn flush_dns() {}
pub fn installed_apps() -> Vec<String> {
    Vec::new()
}
pub fn resolve_executable_name(_app: &str) -> Option<String> {
    None
}
pub fn app_icon_base64(_app: &str) -> Result<String, String> {
    Err("当前系统不支持读取应用图标".into())
}

pub fn read_hosts() -> std::io::Result<String> {
    std::fs::read_to_string(HOSTS_PATH)
}

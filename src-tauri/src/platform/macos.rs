//! macOS 实现：hosts 写入通过 osascript 请求管理员权限。

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use crate::errors::AppError;

pub const NAME: &str = "macos";
pub const HOSTS_PATH: &str = "/etc/hosts";
pub const LINE_ENDING: &str = "\n";

/// 绝对不拦截的进程（小写前缀）。
pub const PROTECTED_PROCESS_PREFIXES: &[&str] = &[
    "com.apple.",
    "kernel",
    "launchd",
    "finder",
    "windowserver",
    "activitymonitor",
    "loginwindow",
    "dock",
    "systemuiserver",
    "pomodoro-focus",
    "pomodoro_focus",
    "番茄专注",
];

fn temp_file(name: &str) -> PathBuf {
    std::env::temp_dir().join(name)
}

/// 用管理员权限写入 hosts。会弹出一次系统密码框。
///
/// 写入后把 hosts 改为 root:admin 664，这样结束专注时（当前用户属于 admin 组）
/// 可以不再弹密码直接恢复。旧版本使用 646（所有用户可写），存在被其它程序劫持 DNS 的风险。
pub fn write_hosts_elevated(content: &str) -> Result<(), AppError> {
    let hosts_tmp = temp_file("pomodoro_hosts_new");
    fs::write(&hosts_tmp, content)
        .map_err(|e| AppError::IoError(format!("写入临时 hosts 失败: {}", e)))?;

    let cmd = format!(
        "cp '{tmp}' {hosts} && chown root:admin {hosts} && chmod 664 {hosts}",
        tmp = hosts_tmp.display(),
        hosts = HOSTS_PATH
    ) + " || exit 1; dscacheutil -flushcache; killall -HUP mDNSResponder; exit 0";

    let result = run_as_admin(&cmd);
    let _ = fs::remove_file(&hosts_tmp);
    result
}

/// 恢复 hosts（结束专注时调用）：先尝试直接写，失败再请求管理员权限。
pub fn restore_hosts(content: &str) -> Result<(), AppError> {
    if fs::write(HOSTS_PATH, content).is_ok() {
        flush_dns();
        return Ok(());
    }
    let tmp = temp_file("pomodoro_hosts_restore");
    fs::write(&tmp, content)?;
    let cmd = format!(
        "cp '{}' {} || exit 1; dscacheutil -flushcache; killall -HUP mDNSResponder; exit 0",
        tmp.display(),
        HOSTS_PATH
    );
    let result = run_as_admin(&cmd);
    let _ = fs::remove_file(&tmp);
    result
}

pub fn flush_dns() {
    let _ = Command::new("dscacheutil").arg("-flushcache").output();
    let _ = Command::new("killall").args(["-HUP", "mDNSResponder"]).output();
}

fn run_as_admin(shell_cmd: &str) -> Result<(), AppError> {
    let escaped = shell_cmd.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!(
        "do shell script \"{}\" with administrator privileges",
        escaped
    );
    let output = Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| AppError::PermissionDenied(format!("请求管理员权限失败: {}", e)))?;

    if output.status.success() {
        return Ok(());
    }
    let err = String::from_utf8_lossy(&output.stderr);
    if err.contains("User cancel") || err.contains("(-128)") {
        return Err(AppError::PermissionDenied("用户取消了管理员权限授权".to_string()));
    }
    Err(AppError::BlockerError(format!("执行屏蔽命令失败: {}", err.trim())))
}

// ---------- 应用列表 / 图标 ----------

const APP_DIRS: &[&str] = &["/Applications", "/System/Applications"];

fn user_app_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join("Applications"))
}

fn app_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = APP_DIRS.iter().map(PathBuf::from).collect();
    if let Some(d) = user_app_dir() {
        dirs.push(d);
    }
    dirs
}

pub fn installed_apps() -> Vec<String> {
    let mut apps = Vec::new();
    for dir in app_dirs() {
        let Ok(entries) = fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(app) = name.strip_suffix(".app") {
                apps.push(app.to_string());
            }
        }
    }
    apps.sort_by_key(|a| a.to_lowercase());
    apps.dedup();
    apps
}

fn find_bundle(app_name: &str) -> Option<PathBuf> {
    app_dirs()
        .into_iter()
        .map(|d| d.join(format!("{}.app", app_name)))
        .find(|p| p.exists())
}

fn info_plist_string(bundle: &Path, key: &str) -> Option<String> {
    let value: plist::Value = plist::from_file(bundle.join("Contents/Info.plist")).ok()?;
    value.as_dictionary()?.get(key)?.as_string().map(str::to_string)
}

/// 从 Info.plist 读取 CFBundleExecutable（真实进程名）。
pub fn resolve_executable_name(app_name: &str) -> Option<String> {
    info_plist_string(&find_bundle(app_name)?, "CFBundleExecutable")
}

fn find_icns(bundle: &Path) -> Option<PathBuf> {
    let resources = bundle.join("Contents/Resources");
    if let Some(mut name) = info_plist_string(bundle, "CFBundleIconFile") {
        if !name.ends_with(".icns") {
            name.push_str(".icns");
        }
        let p = resources.join(name);
        if p.exists() {
            return Some(p);
        }
    }
    for name in ["AppIcon.icns", "app.icns"] {
        let p = resources.join(name);
        if p.exists() {
            return Some(p);
        }
    }
    fs::read_dir(&resources)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().is_some_and(|e| e == "icns"))
}

/// 返回 base64 编码的 64x64 PNG 图标（用系统自带的 sips 转换）。
pub fn app_icon_base64(app_name: &str) -> Result<String, String> {
    let bundle = find_bundle(app_name).ok_or_else(|| format!("未找到应用: {}", app_name))?;
    let icns = find_icns(&bundle).ok_or_else(|| "未找到图标文件".to_string())?;
    let out = temp_file(&format!(
        "pomodoro_icon_{}.png",
        app_name.replace(|c: char| !c.is_alphanumeric(), "_")
    ));
    let status = Command::new("sips")
        .args(["-s", "format", "png", "-z", "64", "64"])
        .arg(&icns)
        .arg("--out")
        .arg(&out)
        .output()
        .map_err(|e| format!("sips 执行失败: {}", e))?;
    if !status.status.success() {
        return Err("图标转换失败".to_string());
    }
    let data = fs::read(&out).map_err(|e| e.to_string())?;
    let _ = fs::remove_file(&out);
    Ok(BASE64.encode(data))
}

pub fn read_hosts() -> std::io::Result<String> {
    std::fs::read_to_string(HOSTS_PATH)
}

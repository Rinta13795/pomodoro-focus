//! Windows 实现：hosts 位于 %SystemRoot%\System32\drivers\etc\hosts，
//! 写入时通过 PowerShell `Start-Process -Verb RunAs` 触发一次 UAC 授权。
//! Windows 没有 pf，按 IP 的拦截交给浏览器扩展（Chrome / Edge）。

use std::fs;
use std::net::Ipv4Addr;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

use crate::errors::AppError;

pub const NAME: &str = "windows";
pub const HOSTS_PATH: &str = r"C:\Windows\System32\drivers\etc\hosts";
pub const LINE_ENDING: &str = "\r\n";

/// 不弹出黑色控制台窗口。
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 绝对不拦截的进程（小写前缀，已去掉 .exe）。
pub const PROTECTED_PROCESS_PREFIXES: &[&str] = &[
    "system",
    "smss",
    "csrss",
    "wininit",
    "winlogon",
    "services",
    "lsass",
    "svchost",
    "explorer",
    "dwm",
    "taskmgr",
    "searchhost",
    "startmenuexperiencehost",
    "msedgewebview2",
    "pomodoro-focus",
    "pomodoro_focus",
    "番茄专注",
];

fn hosts_path() -> PathBuf {
    std::env::var_os("SystemRoot")
        .map(|root| PathBuf::from(root).join(r"System32\drivers\etc\hosts"))
        .unwrap_or_else(|| PathBuf::from(HOSTS_PATH))
}

fn hidden(program: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// PowerShell 单引号字符串转义。
fn ps_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "''"))
}

/// 以管理员身份运行一段 PowerShell 脚本（弹出 UAC）。
fn run_elevated_script(script: &str) -> Result<(), AppError> {
    let script_path = std::env::temp_dir().join("pomodoro_focus_elevated.ps1");
    // 带 BOM 的 UTF-8，Windows PowerShell 5.1 才能正确读取中文路径
    let mut bytes = vec![0xEF, 0xBB, 0xBF];
    bytes.extend_from_slice(script.as_bytes());
    fs::write(&script_path, bytes)
        .map_err(|e| AppError::IoError(format!("写入临时脚本失败: {}", e)))?;

    // UAC 被取消时 Start-Process 抛出 Win32Exception(1223 = ERROR_CANCELLED)，
    // 用退出码区分，避免依赖本地化的错误文本。
    let launcher = format!(
        "try {{ $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -WindowStyle Hidden \
         -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('\"' + {} + '\"')); exit $p.ExitCode }} \
         catch {{ $e = $_.Exception; while ($e) {{ if ($e.NativeErrorCode -eq 1223) {{ exit 1223 }}; $e = $e.InnerException }}; exit 2 }}",
        ps_quote(&script_path.to_string_lossy())
    );

    let output = hidden("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &launcher])
        .output()
        .map_err(|e| AppError::PermissionDenied(format!("请求管理员权限失败: {}", e)));
    let _ = fs::remove_file(&script_path);
    let output = output?;

    if output.status.success() {
        return Ok(());
    }
    let err = String::from_utf8_lossy(&output.stderr);
    if output.status.code() == Some(1223) {
        return Err(AppError::PermissionDenied("用户取消了管理员权限授权".to_string()));
    }
    Err(AppError::BlockerError(format!("执行屏蔽命令失败: {}", err.trim())))
}

/// 用管理员权限写入 hosts，并给当前用户授予 hosts 的修改权限，
/// 这样结束专注时可以不再弹 UAC 直接恢复。
pub fn write_hosts_elevated(content: &str, _block_ips: &[Ipv4Addr]) -> Result<(), AppError> {
    let tmp = std::env::temp_dir().join("pomodoro_hosts_new");
    fs::write(&tmp, content)
        .map_err(|e| AppError::IoError(format!("写入临时 hosts 失败: {}", e)))?;

    let user = match (std::env::var("USERDOMAIN"), std::env::var("USERNAME")) {
        (Ok(d), Ok(u)) => format!("{}\\{}", d, u),
        (_, Ok(u)) => u,
        _ => String::new(),
    };
    let hosts = hosts_path();
    let mut script = format!(
        "$ErrorActionPreference = 'Stop'\r\nCopy-Item -LiteralPath {} -Destination {} -Force\r\n",
        ps_quote(&tmp.to_string_lossy()),
        ps_quote(&hosts.to_string_lossy())
    );
    if !user.is_empty() {
        script.push_str(&format!(
            "icacls {} /grant {} | Out-Null\r\n",
            ps_quote(&hosts.to_string_lossy()),
            ps_quote(&format!("{}:(M)", user))
        ));
    }
    script.push_str("ipconfig /flushdns | Out-Null\r\n");

    let result = run_elevated_script(&script);
    let _ = fs::remove_file(&tmp);
    result
}

/// 恢复 hosts：先直接写（block 时已授予当前用户修改权限），失败再弹 UAC。
pub fn restore_hosts(content: &str) -> Result<(), AppError> {
    let hosts = hosts_path();
    if fs::write(&hosts, content).is_ok() {
        flush_dns();
        return Ok(());
    }
    let tmp = std::env::temp_dir().join("pomodoro_hosts_restore");
    fs::write(&tmp, content)?;
    let script = format!(
        "$ErrorActionPreference = 'Stop'\r\nCopy-Item -LiteralPath {} -Destination {} -Force\r\nipconfig /flushdns | Out-Null\r\n",
        ps_quote(&tmp.to_string_lossy()),
        ps_quote(&hosts.to_string_lossy())
    );
    let result = run_elevated_script(&script);
    let _ = fs::remove_file(&tmp);
    result
}

pub fn clear_firewall() {}

pub fn flush_dns() {
    let _ = hidden("ipconfig").arg("/flushdns").output();
}

/// 读取 hosts 文件内容（Windows 上 hosts 路径可能不是 C 盘）。
pub fn read_hosts() -> std::io::Result<String> {
    fs::read_to_string(hosts_path())
}

// ---------- 应用列表 ----------

fn start_menu_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(pd) = std::env::var_os("ProgramData") {
        dirs.push(PathBuf::from(pd).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Some(ad) = std::env::var_os("APPDATA") {
        dirs.push(PathBuf::from(ad).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    dirs
}

fn collect_shortcuts(dir: &PathBuf, depth: u32, out: &mut Vec<PathBuf>) {
    if depth > 3 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_shortcuts(&path, depth + 1, out);
        } else if path.extension().is_some_and(|e| e.eq_ignore_ascii_case("lnk")) {
            out.push(path);
        }
    }
}

fn is_noise_shortcut(name: &str) -> bool {
    let lower = name.to_lowercase();
    ["uninstall", "卸载", "readme", "help", "帮助", "website", "官网"]
        .iter()
        .any(|w| lower.contains(w))
}

/// 扫描开始菜单快捷方式作为“已安装应用”。
pub fn installed_apps() -> Vec<String> {
    let mut links = Vec::new();
    for dir in start_menu_dirs() {
        collect_shortcuts(&dir, 0, &mut links);
    }
    let mut apps: Vec<String> = links
        .iter()
        .filter_map(|p| p.file_stem().map(|s| s.to_string_lossy().to_string()))
        .filter(|n| !is_noise_shortcut(n))
        .collect();
    apps.sort_by_key(|a| a.to_lowercase());
    apps.dedup();
    apps
}

fn find_shortcut(app_name: &str) -> Option<PathBuf> {
    let mut links = Vec::new();
    for dir in start_menu_dirs() {
        collect_shortcuts(&dir, 0, &mut links);
    }
    links.into_iter().find(|p| {
        p.file_stem()
            .is_some_and(|s| s.to_string_lossy().eq_ignore_ascii_case(app_name))
    })
}

/// 从 .lnk 快捷方式里找出目标 exe 的文件名（不完整解析 .lnk 格式，
/// 只在 ANSI 与 UTF-16 两种编码里查找最后一个以 .exe 结尾的路径）。
pub fn resolve_executable_name(app_name: &str) -> Option<String> {
    let data = fs::read(find_shortcut(app_name)?).ok()?;
    exe_name_from_lnk_bytes(&data)
}

fn exe_name_from_lnk_bytes(data: &[u8]) -> Option<String> {
    // UTF-16LE
    let utf16: Vec<u16> = data
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    let wide = String::from_utf16_lossy(&utf16);
    let ansi = String::from_utf8_lossy(data).to_string();
    for text in [wide, ansi] {
        let lower = text.to_lowercase();
        if let Some(end) = lower.rfind(".exe") {
            let head = &text[..end];
            let start = head
                .rfind(|c: char| c == '\\' || c == '/' || c == '\0' || c.is_control())
                .map(|i| i + 1)
                .unwrap_or(0);
            let name = head[start..].trim();
            if !name.is_empty() && name.len() < 128 {
                return Some(name.to_string());
            }
        }
    }
    None
}

pub fn app_icon_base64(_app_name: &str) -> Result<String, String> {
    Err("Windows 暂不支持读取应用图标".to_string())
}

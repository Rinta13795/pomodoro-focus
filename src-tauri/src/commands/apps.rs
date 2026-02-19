use std::fs;
use std::path::PathBuf;
use std::process::Command;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;

/// 获取已安装的 App 列表（扫描 /Applications 和 /System/Applications）
#[tauri::command]
pub fn get_installed_apps() -> Result<Vec<String>, String> {
    let mut apps: Vec<String> = Vec::new();

    let dirs = ["/Applications", "/System/Applications"];

    for dir in &dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.ends_with(".app") {
                    let app_name = name.trim_end_matches(".app").to_string();
                    if !apps.contains(&app_name) {
                        apps.push(app_name);
                    }
                }
            }
        }
    }

    apps.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    Ok(apps)
}

/// 从 App bundle 的 Info.plist 读取 CFBundleExecutable（真实进程名）
pub fn resolve_executable_name(app_name: &str) -> Option<String> {
    let bundle = find_app_bundle(app_name)?;
    let plist_path = bundle.join("Contents/Info.plist");
    let plist_val: plist::Value = plist::from_file(&plist_path).ok()?;
    let dict = plist_val.as_dictionary()?;
    dict.get("CFBundleExecutable")?.as_string().map(|s| s.to_string())
}

/// 查找 App 的 .app bundle 路径
fn find_app_bundle(app_name: &str) -> Option<PathBuf> {
    let dirs = ["/Applications", "/System/Applications"];
    for dir in &dirs {
        let path = PathBuf::from(dir).join(format!("{}.app", app_name));
        if path.exists() {
            return Some(path);
        }
    }
    None
}

/// 从 Info.plist 读取图标文件名
fn get_icon_filename(bundle_path: &PathBuf) -> Option<String> {
    let plist_path = bundle_path.join("Contents/Info.plist");
    if !plist_path.exists() {
        return None;
    }
    let plist: plist::Value = plist::from_file(&plist_path).ok()?;
    let dict = plist.as_dictionary()?;
    let icon_file = dict.get("CFBundleIconFile")?;
    let name = icon_file.as_string()?;
    Some(name.to_string())
}

/// 查找 .icns 图标文件路径
fn find_icns_path(bundle_path: &PathBuf) -> Option<PathBuf> {
    let resources = bundle_path.join("Contents/Resources");

    // 优先从 Info.plist 读取
    if let Some(mut icon_name) = get_icon_filename(bundle_path) {
        if !icon_name.ends_with(".icns") {
            icon_name.push_str(".icns");
        }
        let path = resources.join(&icon_name);
        if path.exists() {
            return Some(path);
        }
    }

    // 回退：尝试常见名称
    for name in &["AppIcon.icns", "app.icns"] {
        let path = resources.join(name);
        if path.exists() {
            return Some(path);
        }
    }

    // 最后回退：找 Resources 下第一个 .icns 文件
    if let Ok(entries) = fs::read_dir(&resources) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".icns") {
                return Some(entry.path());
            }
        }
    }

    None
}

/// 获取 App 图标（返回 base64 编码的 PNG）
/// 使用 macOS 内置 sips 工具将 .icns 转换为 PNG
#[tauri::command]
pub fn get_app_icon(app_name: String) -> Result<String, String> {
    let bundle_path = find_app_bundle(&app_name)
        .ok_or_else(|| format!("未找到应用: {}", app_name))?;

    let icns_path = find_icns_path(&bundle_path)
        .ok_or_else(|| "未找到图标文件".to_string())?;

    // 创建临时 PNG 文件
    let tmp_png = std::env::temp_dir()
        .join(format!("pomodoro_icon_{}.png", app_name.replace(' ', "_")));

    // 使用 sips 转换 icns → PNG，缩放到 64x64
    let output = Command::new("sips")
        .args([
            "-s", "format", "png",
            "-z", "64", "64",
            icns_path.to_str().unwrap_or_default(),
            "--out",
            tmp_png.to_str().unwrap_or_default(),
        ])
        .output()
        .map_err(|e| format!("sips 执行失败: {}", e))?;

    if !output.status.success() {
        return Err("sips 转换失败".to_string());
    }

    // 读取 PNG 并转为 base64
    let png_data = fs::read(&tmp_png)
        .map_err(|e| format!("读取 PNG 失败: {}", e))?;

    // 清理临时文件
    let _ = fs::remove_file(&tmp_png);

    Ok(BASE64.encode(&png_data))
}

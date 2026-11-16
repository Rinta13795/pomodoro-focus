//! 本地 JSON 存储：所有数据都放在用户数据目录下的 pomodoro-focus/ 中。
//! macOS: ~/Library/Application Support/pomodoro-focus
//! Windows: %APPDATA%\pomodoro-focus

use std::fs;
use std::path::PathBuf;

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::errors::AppError;

const APP_DIR_NAME: &str = "pomodoro-focus";

pub fn data_dir() -> Result<PathBuf, AppError> {
    let base = dirs::data_dir()
        .ok_or_else(|| AppError::ConfigError("无法获取用户数据目录".to_string()))?;
    Ok(base.join(APP_DIR_NAME))
}

pub fn data_file(name: &str) -> Result<PathBuf, AppError> {
    Ok(data_dir()?.join(name))
}

/// 读取 JSON 文件；文件不存在时返回 None。
pub fn read_json<T: DeserializeOwned>(name: &str) -> Result<Option<T>, AppError> {
    let path = data_file(name)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)?;
    Ok(Some(serde_json::from_str(&content)?))
}

/// 原子写入 JSON：先写临时文件再重命名，避免崩溃时留下半个文件。
pub fn write_json<T: Serialize>(name: &str, value: &T) -> Result<(), AppError> {
    let dir = data_dir()?;
    fs::create_dir_all(&dir)?;
    let path = dir.join(name);
    let tmp = dir.join(format!("{}.tmp", name));
    fs::write(&tmp, serde_json::to_string_pretty(value)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn remove(name: &str) {
    if let Ok(path) = data_file(name) {
        let _ = fs::remove_file(path);
    }
}

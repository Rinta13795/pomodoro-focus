use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AppError {
    ConfigError(String),
    IoError(String),
    PermissionDenied(String),
    TimerError(String),
    BlockerError(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::ConfigError(msg) => write!(f, "配置错误: {}", msg),
            AppError::IoError(msg) => write!(f, "IO错误: {}", msg),
            AppError::PermissionDenied(msg) => write!(f, "权限不足: {}", msg),
            AppError::TimerError(msg) => write!(f, "计时器错误: {}", msg),
            AppError::BlockerError(msg) => write!(f, "拦截器错误: {}", msg),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::IoError(e.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::ConfigError(e.to_string())
    }
}

impl From<AppError> for String {
    fn from(e: AppError) -> String {
        e.to_string()
    }
}

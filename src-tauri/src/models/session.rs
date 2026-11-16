//! 进行中的专注会话，持久化到 session.json，用于应用重启/崩溃后恢复计时。

use serde::{Deserialize, Serialize};

use crate::errors::AppError;
use crate::storage;

const SESSION_FILE: &str = "session.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusSession {
    /// "working" 或 "breaking"
    pub state: String,
    #[serde(default)]
    pub work_start_time: u64,
    pub work_end_time: u64,
    pub break_end_time: u64,
    pub work_minutes: u32,
    pub break_minutes: u32,
    pub emergency_remaining: u32,
    #[serde(default)]
    pub planned_seconds: u32,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub task_id: Option<String>,
    /// 暂停中时记录剩余秒数；None 表示正在走时
    #[serde(default)]
    pub paused_remaining: Option<u32>,
}

impl FocusSession {
    pub fn save(&self) -> Result<(), AppError> {
        storage::write_json(SESSION_FILE, self)
    }

    pub fn load() -> Option<Self> {
        storage::read_json(SESSION_FILE).ok().flatten()
    }

    pub fn delete() {
        storage::remove(SESSION_FILE);
    }
}

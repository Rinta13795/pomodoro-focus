//! 专注记录（history.json）。每个完成或中途结束的工作阶段一条。

use serde::{Deserialize, Serialize};

use crate::errors::AppError;
use crate::storage;

const HISTORY_FILE: &str = "history.json";

/// 少于这个秒数的中途停止不记录，避免误点产生噪音。
pub const MIN_RECORD_SECONDS: u32 = 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FocusRecord {
    pub id: String,
    pub started_at: u64,
    pub ended_at: u64,
    pub planned_seconds: u32,
    pub focused_seconds: u32,
    pub completed: bool,
    pub label: Option<String>,
    pub task_id: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
struct HistoryFile {
    version: u32,
    records: Vec<FocusRecord>,
}

pub fn load() -> Vec<FocusRecord> {
    match storage::read_json::<HistoryFile>(HISTORY_FILE) {
        Ok(Some(f)) => f.records,
        Ok(None) => Vec::new(),
        Err(e) => {
            // 文件损坏时保留一份备份，避免下次写入把历史覆盖掉
            log::error!("读取专注记录失败: {}", e);
            if let Ok(path) = storage::data_file(HISTORY_FILE) {
                let _ = std::fs::copy(&path, path.with_extension("json.corrupt"));
            }
            Vec::new()
        }
    }
}

fn save(records: Vec<FocusRecord>) -> Result<(), AppError> {
    storage::write_json(HISTORY_FILE, &HistoryFile { version: 1, records })
}

pub fn append(record: FocusRecord) -> Result<(), AppError> {
    let mut records = load();
    if records.iter().any(|r| r.id == record.id) {
        return Ok(());
    }
    records.push(record);
    records.sort_by_key(|r| r.started_at);
    save(records)
}

pub fn set_note(id: &str, note: Option<String>) -> Result<(), AppError> {
    let mut records = load();
    let record = records
        .iter_mut()
        .find(|r| r.id == id)
        .ok_or_else(|| AppError::ConfigError(format!("找不到记录 {}", id)))?;
    record.note = note.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    save(records)
}

/// 记录 id 用开始时间生成，同一阶段重复写入（例如重启恢复）会被去重。
pub fn record_id(started_at: u64) -> String {
    format!("r{}", started_at)
}

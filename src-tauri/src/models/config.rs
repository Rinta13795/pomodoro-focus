use chrono::Local;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::errors::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub pomodoro: PomodoroConfig,
    pub blocked_apps: Vec<String>,
    pub blocked_sites: Vec<String>,
    pub schedules: Vec<Schedule>,
    pub mode: String,
    #[serde(default = "default_play_completion_sound")]
    pub play_completion_sound: bool,
    #[serde(default)]
    pub custom_bg_path: Option<String>,
}

fn default_play_completion_sound() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PomodoroConfig {
    pub work_minutes: u32,
    pub break_minutes: u32,
    pub emergency_cancel_limit: u32,
    #[serde(default = "default_last_focus_duration")]
    pub last_focus_duration: u32,
    #[serde(default)]
    pub emergency_used_count: u32,
    #[serde(default)]
    pub emergency_reset_month: String,
}

fn default_last_focus_duration() -> u32 {
    25
}

impl PomodoroConfig {
    /// 获取当月剩余紧急取消次数
    pub fn get_monthly_emergency_remaining(&mut self) -> u32 {
        let current_month = Local::now().format("%Y-%m").to_string();

        // 月份不同，重置计数
        if self.emergency_reset_month != current_month {
            self.emergency_used_count = 0;
            self.emergency_reset_month = current_month;
        }

        self.emergency_cancel_limit
            .saturating_sub(self.emergency_used_count)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub enabled: bool,
    pub start: String,
    pub end: String,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            pomodoro: PomodoroConfig {
                work_minutes: 25,
                break_minutes: 5,
                emergency_cancel_limit: 2,
                last_focus_duration: 25,
                emergency_used_count: 0,
                emergency_reset_month: String::new(),
            },
            blocked_apps: vec![
                "bilibili".to_string(),
                "QQ".to_string(),
            ],
            blocked_sites: vec![
                "bilibili.com".to_string(),
                "www.bilibili.com".to_string(),
                "m.bilibili.com".to_string(),
                "douyin.com".to_string(),
                "www.douyin.com".to_string(),
                "pornhub.com".to_string(),
                "www.pornhub.com".to_string(),
                "xvideos.com".to_string(),
                "www.xvideos.com".to_string(),
                "xhamster.com".to_string(),
                "www.xhamster.com".to_string(),
                "xnxx.com".to_string(),
                "www.xnxx.com".to_string(),
                "91porn.com".to_string(),
                "www.91porn.com".to_string(),
                "javdb.com".to_string(),
                "www.javdb.com".to_string(),
                "missav.com".to_string(),
                "www.missav.com".to_string(),
            ],
            schedules: vec![
                Schedule {
                    enabled: true,
                    start: "09:00".to_string(),
                    end: "12:00".to_string(),
                },
                Schedule {
                    enabled: true,
                    start: "14:00".to_string(),
                    end: "17:00".to_string(),
                },
                Schedule {
                    enabled: false,
                    start: "19:00".to_string(),
                    end: "22:00".to_string(),
                },
            ],
            mode: "manual".to_string(),
            play_completion_sound: true,
            custom_bg_path: None,
        }
    }
}

impl Config {
    pub fn config_dir() -> Result<PathBuf, AppError> {
        let home = dirs::home_dir()
            .ok_or_else(|| AppError::ConfigError("无法获取用户目录".to_string()))?;
        let config_dir = home
            .join("Library")
            .join("Application Support")
            .join("pomodoro-focus");
        Ok(config_dir)
    }

    pub fn config_path() -> Result<PathBuf, AppError> {
        Ok(Self::config_dir()?.join("config.json"))
    }

    pub fn load() -> Result<Self, AppError> {
        let config_path = Self::config_path()?;

        if !config_path.exists() {
            let config = Config::default();
            config.save()?;
            return Ok(config);
        }

        let content = fs::read_to_string(&config_path)?;
        let config: Config = serde_json::from_str(&content)?;
        Ok(config)
    }

    pub fn save(&self) -> Result<(), AppError> {
        let config_dir = Self::config_dir()?;
        if !config_dir.exists() {
            fs::create_dir_all(&config_dir)?;
        }

        let config_path = Self::config_path()?;
        let content = serde_json::to_string_pretty(self)?;
        fs::write(&config_path, content)?;
        Ok(())
    }
}

/// 专注会话持久化，用于应用重启后恢复计时
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FocusSession {
    pub state: String,              // "working" 或 "breaking"
    pub work_end_time: u64,         // 工作阶段结束的 Unix 时间戳（秒）
    pub break_end_time: u64,        // 休息阶段结束的 Unix 时间戳（秒）
    pub work_minutes: u32,
    pub break_minutes: u32,
    pub emergency_remaining: u32,
}

impl FocusSession {
    pub fn session_path() -> Result<PathBuf, AppError> {
        Ok(Config::config_dir()?.join("session.json"))
    }

    pub fn save(&self) -> Result<(), AppError> {
        let path = Self::session_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(self)?;
        fs::write(&path, content)?;
        Ok(())
    }

    pub fn load() -> Result<Option<Self>, AppError> {
        let path = Self::session_path()?;
        if !path.exists() {
            return Ok(None);
        }
        let content = fs::read_to_string(&path)?;
        let session: FocusSession = serde_json::from_str(&content)?;
        Ok(Some(session))
    }

    pub fn delete() {
        if let Ok(path) = Self::session_path() {
            let _ = fs::remove_file(path);
        }
    }
}

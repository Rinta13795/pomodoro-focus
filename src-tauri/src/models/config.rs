use chrono::Local;
use serde::{Deserialize, Serialize};

use crate::errors::AppError;
use crate::storage;

const CONFIG_FILE: &str = "config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub pomodoro: PomodoroConfig,
    pub blocked_apps: Vec<String>,
    pub blocked_sites: Vec<String>,
    #[serde(default = "default_true")]
    pub play_completion_sound: bool,
    #[serde(default)]
    pub custom_bg_path: Option<String>,
    /// 每日专注目标（分钟）
    #[serde(default = "default_daily_goal")]
    pub daily_goal_minutes: u32,
    /// 科目 / 标签
    #[serde(default = "default_labels")]
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PomodoroConfig {
    pub work_minutes: u32,
    pub break_minutes: u32,
    /// 每月允许的紧急取消次数
    pub emergency_cancel_limit: u32,
    #[serde(default = "default_work_minutes")]
    pub last_focus_duration: u32,
    #[serde(default)]
    pub emergency_used_count: u32,
    #[serde(default)]
    pub emergency_reset_month: String,
}

fn default_true() -> bool {
    true
}
fn default_work_minutes() -> u32 {
    25
}
fn default_daily_goal() -> u32 {
    120
}
fn default_labels() -> Vec<String> {
    ["数学", "英语", "专业课", "编程", "阅读"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

impl PomodoroConfig {
    /// 当月剩余紧急取消次数（跨月自动重置）。
    pub fn monthly_emergency_remaining(&mut self) -> u32 {
        let month = Local::now().format("%Y-%m").to_string();
        if self.emergency_reset_month != month {
            self.emergency_used_count = 0;
            self.emergency_reset_month = month;
        }
        self.emergency_cancel_limit
            .saturating_sub(self.emergency_used_count)
    }

    pub fn record_emergency_use(&mut self) {
        self.monthly_emergency_remaining();
        self.emergency_used_count += 1;
    }
}

const DEFAULT_SITES: &[&str] = &[
    "bilibili.com",
    "douyin.com",
    "pornhub.com",
    "xvideos.com",
    "xhamster.com",
    "xnxx.com",
    "91porn.com",
    "javdb.com",
    "missav.com",
];

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
            blocked_apps: vec!["bilibili".to_string(), "QQ".to_string()],
            // 屏蔽时会自动补全 www. 变体
            blocked_sites: DEFAULT_SITES.iter().map(|s| s.to_string()).collect(),
            play_completion_sound: true,
            custom_bg_path: None,
            daily_goal_minutes: default_daily_goal(),
            labels: default_labels(),
        }
    }
}

impl Config {
    pub fn path() -> Result<std::path::PathBuf, AppError> {
        storage::data_file(CONFIG_FILE)
    }

    pub fn load() -> Result<Self, AppError> {
        match storage::read_json::<Config>(CONFIG_FILE)? {
            Some(c) => Ok(c),
            None => {
                let c = Config::default();
                c.save()?;
                Ok(c)
            }
        }
    }

    pub fn save(&self) -> Result<(), AppError> {
        storage::write_json(CONFIG_FILE, self)
    }
}

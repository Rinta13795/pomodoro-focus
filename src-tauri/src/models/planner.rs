//! 今日计划（planner.json）。前端负责增删改，后端只在番茄完成时给关联任务 +1。

use serde::{Deserialize, Serialize};

use crate::errors::AppError;
use crate::storage;

const PLANNER_FILE: &str = "planner.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub estimate: u32,
    #[serde(default)]
    pub done_pomodoros: u32,
    #[serde(default)]
    pub done: bool,
    pub created_at: u64,
    pub date: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Planner {
    pub tasks: Vec<Task>,
}

impl Planner {
    pub fn load() -> Planner {
        storage::read_json(PLANNER_FILE).ok().flatten().unwrap_or_default()
    }

    pub fn save(&self) -> Result<(), AppError> {
        storage::write_json(PLANNER_FILE, self)
    }

    /// 给任务记一个完成的番茄，返回是否找到了该任务。
    pub fn add_pomodoro(&mut self, task_id: &str) -> bool {
        match self.tasks.iter_mut().find(|t| t.id == task_id) {
            Some(t) => {
                t.done_pomodoros += 1;
                true
            }
            None => false,
        }
    }
}

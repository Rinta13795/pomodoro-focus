use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TimerState {
    #[default]
    Idle,
    Working,
    Breaking,
    Paused,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TimerStatus {
    pub state: TimerState,
    pub remaining_seconds: u32,
    pub total_seconds: u32,
    pub emergency_remaining: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_state: Option<TimerState>,
    pub work_minutes: u32,
    pub break_minutes: u32,
    /// 本次专注的科目
    pub label: Option<String>,
    /// 关联的今日计划任务
    pub task_id: Option<String>,
    /// 工作阶段开始时间（Unix 秒）
    pub started_at: Option<u64>,
}

impl TimerStatus {
    pub fn idle(work_minutes: u32, break_minutes: u32, emergency_remaining: u32) -> Self {
        TimerStatus {
            work_minutes,
            break_minutes,
            emergency_remaining,
            ..Default::default()
        }
    }

    /// 是否处于工作阶段（含工作阶段中的暂停）。
    pub fn in_work_phase(&self) -> bool {
        self.state == TimerState::Working
            || (self.state == TimerState::Paused
                && self.previous_state == Some(TimerState::Working))
    }

    /// 已专注秒数。
    pub fn focused_seconds(&self) -> u32 {
        self.total_seconds.saturating_sub(self.remaining_seconds)
    }

    pub fn reset_to_idle(&mut self) {
        *self = TimerStatus::idle(self.work_minutes, self.break_minutes, self.emergency_remaining);
    }
}

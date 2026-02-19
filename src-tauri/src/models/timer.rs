use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimerState {
    Idle,
    Working,
    Breaking,
    Paused,
}

impl Default for TimerState {
    fn default() -> Self {
        TimerState::Idle
    }
}

impl TimerState {
    pub fn as_str(&self) -> &'static str {
        match self {
            TimerState::Idle => "idle",
            TimerState::Working => "working",
            TimerState::Breaking => "break",
            TimerState::Paused => "paused",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimerStatus {
    pub state: TimerState,
    pub remaining_seconds: u32,
    pub total_seconds: u32,
    pub emergency_remaining: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_state: Option<TimerState>,
    pub work_minutes: u32,
    pub break_minutes: u32,
}

impl Default for TimerStatus {
    fn default() -> Self {
        TimerStatus {
            state: TimerState::Idle,
            remaining_seconds: 0,
            total_seconds: 0,
            emergency_remaining: 2,
            previous_state: None,
            work_minutes: 25,
            break_minutes: 5,
        }
    }
}

impl TimerStatus {
    pub fn new_with_config(work_minutes: u32, break_minutes: u32, emergency_limit: u32) -> Self {
        TimerStatus {
            state: TimerState::Idle,
            remaining_seconds: 0,
            total_seconds: 0,
            emergency_remaining: emergency_limit,
            previous_state: None,
            work_minutes,
            break_minutes,
        }
    }
}

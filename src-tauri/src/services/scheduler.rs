use crate::errors::AppError;
use crate::models::Schedule;
use chrono::{Local, NaiveTime, Timelike};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

const CHECK_INTERVAL_SECS: u64 = 30;

pub struct Scheduler {
    schedules: Vec<Schedule>,
}

impl Scheduler {
    pub fn new(schedules: Vec<Schedule>) -> Self {
        Scheduler { schedules }
    }

    pub fn update_schedules(&mut self, schedules: Vec<Schedule>) {
        self.schedules = schedules;
    }

    pub fn get_schedules(&self) -> &Vec<Schedule> {
        &self.schedules
    }

    /// 启动调度轮询线程
    pub fn start_polling<F>(
        schedules: Vec<Schedule>,
        running_flag: Arc<AtomicBool>,
        on_schedule_change: F,
    ) -> JoinHandle<()>
    where
        F: Fn(bool) + Send + 'static,
    {
        thread::spawn(move || {
            println!("调度轮询线程已启动");
            let mut was_in_schedule = false;

            while running_flag.load(Ordering::SeqCst) {
                let is_in_schedule = Self::is_in_schedule_static(&schedules);

                // 检测状态变化
                if is_in_schedule != was_in_schedule {
                    println!(
                        "调度状态变化: {} -> {}",
                        if was_in_schedule { "在时间段内" } else { "不在时间段内" },
                        if is_in_schedule { "在时间段内" } else { "不在时间段内" }
                    );
                    on_schedule_change(is_in_schedule);
                    was_in_schedule = is_in_schedule;
                }

                thread::sleep(Duration::from_secs(CHECK_INTERVAL_SECS));
            }

            println!("调度轮询线程已停止");
        })
    }

    /// 检查当前时间是否在任一启用的时间段内（静态方法）
    pub fn is_in_schedule_static(schedules: &[Schedule]) -> bool {
        let now = Local::now();
        let current_time = match NaiveTime::from_hms_opt(now.hour(), now.minute(), 0) {
            Some(t) => t,
            None => return false,
        };

        for schedule in schedules {
            if !schedule.enabled {
                continue;
            }

            if let (Ok(start), Ok(end)) = (
                Self::parse_time_static(&schedule.start),
                Self::parse_time_static(&schedule.end),
            ) {
                if current_time >= start && current_time < end {
                    return true;
                }
            }
        }

        false
    }

    /// 检查当前时间是否在时间段内（实例方法）
    pub fn is_in_scheduled_time(&self) -> bool {
        Self::is_in_schedule_static(&self.schedules)
    }

    /// 获取下一个计划开始时间
    pub fn get_next_scheduled_start(&self) -> Option<String> {
        let now = Local::now();
        let current_time = match NaiveTime::from_hms_opt(now.hour(), now.minute(), 0) {
            Some(t) => t,
            None => return None,
        };

        let mut next_start: Option<NaiveTime> = None;

        for schedule in &self.schedules {
            if !schedule.enabled {
                continue;
            }

            if let Ok(start) = Self::parse_time_static(&schedule.start) {
                if start > current_time {
                    match next_start {
                        None => next_start = Some(start),
                        Some(current_next) if start < current_next => {
                            next_start = Some(start);
                        }
                        _ => {}
                    }
                }
            }
        }

        next_start.map(|t| format!("{:02}:{:02}", t.hour(), t.minute()))
    }

    /// 获取当前时间段的结束时间
    pub fn get_current_schedule_end(&self) -> Option<String> {
        let now = Local::now();
        let current_time = match NaiveTime::from_hms_opt(now.hour(), now.minute(), 0) {
            Some(t) => t,
            None => return None,
        };

        for schedule in &self.schedules {
            if !schedule.enabled {
                continue;
            }

            if let (Ok(start), Ok(end)) = (
                Self::parse_time_static(&schedule.start),
                Self::parse_time_static(&schedule.end),
            ) {
                if current_time >= start && current_time < end {
                    return Some(schedule.end.clone());
                }
            }
        }

        None
    }

    fn parse_time_static(time_str: &str) -> Result<NaiveTime, AppError> {
        let parts: Vec<&str> = time_str.split(':').collect();
        if parts.len() != 2 {
            return Err(AppError::ConfigError(format!(
                "无效的时间格式: {}",
                time_str
            )));
        }

        let hour: u32 = parts[0]
            .parse()
            .map_err(|_| AppError::ConfigError(format!("无效的小时: {}", parts[0])))?;
        let minute: u32 = parts[1]
            .parse()
            .map_err(|_| AppError::ConfigError(format!("无效的分钟: {}", parts[1])))?;

        NaiveTime::from_hms_opt(hour, minute, 0)
            .ok_or_else(|| AppError::ConfigError(format!("无效的时间: {}", time_str)))
    }
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new(Vec::new())
    }
}

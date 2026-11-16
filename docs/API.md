# 前后端接口约定（v2）

前端通过 `window.__TAURI__.core.invoke(name, args)` 调用。参数名在 JS 侧用 camelCase（Tauri 自动转换）。

## 数据结构

```ts
type TimerState = 'idle' | 'working' | 'breaking' | 'paused'

interface TimerStatus {
  state: TimerState
  remaining_seconds: number
  total_seconds: number
  emergency_remaining: number
  previous_state?: TimerState
  work_minutes: number
  break_minutes: number
  label: string | null        // 本次专注的科目/标签
  task_id: string | null      // 关联的今日计划任务
  started_at: number | null   // 本次工作阶段开始的 Unix 秒
}

// 一次专注（工作阶段）的记录，history.json
interface FocusRecord {
  id: string
  started_at: number          // Unix 秒
  ended_at: number            // Unix 秒
  planned_seconds: number
  focused_seconds: number     // 实际专注秒数（不含暂停）
  completed: boolean          // true = 自然完成；false = 中途停止/紧急取消
  label: string | null
  task_id: string | null
  note: string | null         // 结束后的一句话复盘
}

// 今日计划，planner.json
interface Task {
  id: string
  title: string
  estimate: number            // 预计番茄数
  done_pomodoros: number      // 已完成番茄数（后端在工作阶段完成时 +1）
  done: boolean
  created_at: number          // Unix 秒
  date: string                // 计划所属日期 YYYY-MM-DD（本地时间）
}
interface Planner { tasks: Task[] }

// config.json 新增字段（旧字段保持不变）
interface Config {
  // ...旧字段
  daily_goal_minutes: number  // 每日目标，默认 120
  labels: string[]            // 科目标签，默认 ["数学","英语","专业课","编程","阅读"]
}
```

## 命令

| 命令 | 参数 | 返回 |
|---|---|---|
| `get_config` | – | `Config` |
| `save_config` | `config` | – |
| `get_config_path` | – | `string` |
| `get_platform` | – | `'macos' \| 'windows' \| 'linux'` |
| `start_focus` | `minutes?, seconds?, label?, taskId?` | `TimerStatus` |
| `pause_focus` / `resume_focus` | – | `TimerStatus` |
| `stop_focus` | – | `TimerStatus`。只用于**跳过休息**；工作阶段调用会返回错误“专注中只能使用紧急取消” |
| `emergency_cancel` | – | `TimerStatus`（每月次数有限；工作阶段已专注 ≥ 60 秒会写入一条 `completed=false` 记录） |
| `get_timer_status` | – | `TimerStatus` |
| `get_history` | – | `FocusRecord[]`（按 `started_at` 升序） |
| `set_record_note` | `id, note` | – |
| `get_planner` | – | `Planner` |
| `save_planner` | `planner` | – |
| `get_installed_apps` | – | `string[]` |
| `get_app_icon` | `appName` | base64 PNG；Windows 上会报错，前端需回退为首字母头像 |
| `set_background` / `clear_background` / `get_background` | 同旧版 | 同旧版 |
| `hide_overlay_window` / `close_overlay_window` | 同旧版 | 同旧版 |

## 事件

| 事件 | payload |
|---|---|
| `timer-update` | `TimerStatus` |
| `timer-work-complete` | `FocusRecord`（刚写入的那条记录） |
| `timer-break-complete` | – |
| `history-updated` | – （任何记录写入/修改后） |
| `planner-updated` | `Planner`（后端修改了计划，如完成番茄 +1） |
| `blocked-app-detected` | `string`（被拦截的 App 名） |

## 浏览器扩展 HTTP 接口

`GET http://127.0.0.1:27190/status` → `{ "focusing": boolean, "blocked_sites": string[] }`

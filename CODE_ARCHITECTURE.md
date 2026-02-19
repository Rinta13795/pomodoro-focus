# Pomodoro Focus — 代码架构文档

> 本文档用于支持后续迭代与重构，面向即将修改代码的开发者。
> 总代码量：约 5,542 行（Rust 后端 2,261 + 前端 2,969 + Chrome 扩展 312）

---

## 1. 高层架构

### 1.1 系统组成

```
┌─────────────────────────────────────────────────┐
│                  Tauri 桌面应用                    │
│  ┌───────────────┐    ┌──────────────────────┐   │
│  │  前端 (HTML/   │◄──►│  Rust 后端            │   │
│  │  CSS/JS)       │IPC │  - 计时器线程          │   │
│  │  index.html    │    │  - App 拦截轮询线程    │   │
│  │  overlay.html  │    │  - 定时调度线程        │   │
│  └───────────────┘    │  - HTTP 本地服务器      │   │
│                       └──────────┬───────────┘   │
│                                  │ :27190        │
└──────────────────────────────────┼───────────────┘
                                   │ HTTP
                    ┌──────────────▼───────────────┐
                    │  Chrome 扩展                   │
                    │  - 轮询 /status               │
                    │  - declarativeNetRequest 拦截  │
                    │  - tabs.onUpdated 实时拦截     │
                    └──────────────────────────────┘
```

### 1.2 核心数据流

1. **用户点击"开始专注"** → 前端 `timer.js` 调用 `api.startFocus()` → Tauri IPC → `commands/timer.rs::start_focus()`
2. `start_focus()` 依次执行：屏蔽网站（需 sudo）→ 设置 TimerStatus → 启动计时线程 → 启动 App 拦截线程
3. **计时线程** 每秒递减 `remaining_seconds`，通过 `app_handle.emit("timer-update", ...)` 广播到所有窗口
4. **前端** 监听 `timer-update` 事件，更新 UI 并设置 `document.body.className = 'state-' + state`
5. **HTTP 本地服务器** 在 `:27190/status` 暴露当前状态，Chrome 扩展每 2 秒轮询
6. **Chrome 扩展** 根据 `focusing` 状态动态添加/移除 `declarativeNetRequest` 规则

### 1.3 关键控制路径

| 路径 | 入口 | 关键文件 |
|------|------|----------|
| 开始专注 | `start_focus` | timer.rs → site_blocker.rs → app_blocker.rs |
| 紧急取消 | `emergency_cancel` | timer.rs → config.rs（持久化月度计数） |
| 正常结束 | 计时线程自动转换 | timer.rs 线程 → Breaking → Idle |
| App 拦截 | 轮询线程检测 | app_blocker.rs → overlay 窗口 |
| 网站拦截 | hosts + pf + Chrome 扩展 | site_blocker.rs + background.js |
| 配置保存 | settings.js → save_config | config.rs → state.rs（更新各 blocker） |

---

## 2. 模块逐一说明

### 2.1 Rust 后端

#### `main.rs`（6 行）
- **职责**：程序入口，仅调用 `app_lib::run()`
- **不应承担**：任何业务逻辑
- **依赖关系**：被操作系统调用，调用 `lib.rs`

#### `lib.rs`（266 行）
- **职责**：Tauri 应用初始化、系统托盘菜单、窗口事件处理、HTTP 服务器启动、调度器启动
- **不应承担**：具体的计时逻辑或拦截逻辑（这些委托给 commands 和 services）
- **依赖关系**：依赖 `state.rs`（AppState）、`commands/*`（注册 IPC 命令）、`services/local_server.rs`（HTTP 服务）
- **关键行为**：
  - `on_window_event`：拦截 overlay 窗口的关闭请求，调用 `prevent_close()` + `minimize()` 阻止用户直接关闭
  - 托盘菜单：提供"开始专注/停止专注/手动模式/定时模式/退出"选项
  - 应用退出时调用 `state.cleanup()` 清理 hosts 文件和线程

#### `errors.rs`（43 行）
- **职责**：定义全局错误类型 `AppError`
- **变体**：`ConfigError`、`IoError`、`PermissionDenied`、`TimerError`、`BlockerError`
- **不应承担**：错误恢复逻辑
- **依赖关系**：被所有 services 和部分 commands 使用；实现了 `From<std::io::Error>` 和 `From<serde_json::Error>` 自动转换

#### `state.rs`（174 行）
- **职责**：全局应用状态容器，线程生命周期管理
- **核心结构**：`AppState` 持有所有 `Mutex<T>` 和 `AtomicBool/AtomicU32` 状态
- **不应承担**：业务逻辑（如计时、拦截判断）
- **关键字段**：
  - `config: Arc<Mutex<Config>>` — 运行时配置，多处读写
  - `timer_status: Arc<Mutex<TimerStatus>>` — 计时器状态，计时线程和前端共享
  - `emergency_remaining: AtomicU32` — 紧急取消剩余次数的快速读取副本
  - `overlay_suppressed: Arc<AtomicBool>` — 抑制 overlay 重复弹出的标志
- **关键方法**：
  - `start_app_blocker()` — 停止旧线程 → 启动新轮询线程
  - `stop_app_blocker()` — 设置 running_flag=false → join 线程
  - `cleanup()` — 退出时停止所有线程 + 清理 hosts

#### `models/config.rs`（162 行）
- **职责**：配置数据结构定义、JSON 持久化、月度紧急取消计数逻辑
- **不应承担**：配置的 UI 展示或验证
- **核心结构**：
  - `Config` — 顶层配置，包含 `PomodoroConfig`、`blocked_apps`、`blocked_sites`、`schedules`、`mode`
  - `PomodoroConfig` — 工作/休息时长、紧急取消限额、月度使用计数
  - `Schedule` — 定时模式的时间段（enabled/start/end）
- **关键方法**：
  - `get_monthly_emergency_remaining(&mut self) -> u32` — 检查当前月份，跨月自动重置 `emergency_used_count`
  - `Config::load()` / `Config::save()` — 读写 `~/Library/Application Support/pomodoro-focus/config.json`
- **隐含假设**：月份格式为 `"%Y-%m"`（chrono），跨月判断依赖系统时钟

#### `models/timer.rs`（67 行）
- **职责**：计时器状态枚举和数据结构
- **核心结构**：
  - `TimerState` — 枚举：`Idle`、`Working`、`Breaking`、`Paused`，使用 `#[serde(rename_all = "lowercase")]` 序列化为小写
  - `TimerStatus` — 包含 `state`、`remaining_seconds`、`total_seconds`、`emergency_remaining`、`previous_state`、`work_minutes`、`break_minutes`
- **不应承担**：计时逻辑本身（由 `commands/timer.rs` 的线程负责）
- **隐含假设**：`previous_state` 仅在 Paused 时有值，用于恢复到 Working 或 Breaking

#### `commands/timer.rs`（286 行）
- **职责**：所有计时器相关的 Tauri IPC 命令
- **不应承担**：UI 渲染、配置持久化的细节
- **依赖关系**：依赖 `AppState`、`TimerState`、`TimerStatus`、`SiteBlocker`
- **关键函数**：见第 3 节详述

#### `commands/blocker.rs`（67 行）
- **职责**：App 拦截和 overlay 窗口管理的 IPC 命令
- **不应承担**：进程检测逻辑（委托给 `services/app_blocker.rs`）
- **关键函数**：
  - `hide_overlay_window` — 设置 suppressed 标志 → 退出全屏 → 延迟 500ms 隐藏 → 显示主窗口 → 5 秒后重置标志
  - `close_overlay_window` — 使用 `destroy()` 绕过 `on_window_event` 的 `prevent_close`

#### `commands/config.rs`（36 行）
- **职责**：配置读写的 IPC 命令
- **关键行为**：`save_config` 保存后会同步更新 `app_blocker`、`site_blocker`、`scheduler` 的内存状态

#### `commands/apps.rs`（132 行）
- **职责**：扫描已安装应用列表、提取应用图标
- **不应承担**：进程管理或拦截
- **平台依赖**：扫描 `/Applications` 和 `/System/Applications`，使用 `sips` 转换 icns→PNG，`plist` 解析 Info.plist

#### `commands/sites.rs`（21 行）
- **职责**：网站屏蔽/解除的 IPC 命令薄封装
- **不应承担**：实际的 hosts/pf 操作（委托给 `services/site_blocker.rs`）

#### `services/site_blocker.rs`（387 行 — 最大文件）
- **职责**：macOS 网站屏蔽的完整实现
- **机制**：hosts 文件 + pf 防火墙双保险
- **不应承担**：Chrome 扩展层面的拦截（由 background.js 独立处理）
- **关键流程**：
  - `block_sites()` → `clean_domain()` 清洗域名 → `resolve_domain_ips()` 用 dig 解析 IP → 准备临时文件 → 一次 osascript 授权执行所有 sudo 操作
  - `unblock_sites()` → 先尝试 `sudo -n`（非交互）→ 失败则回退到 osascript 弹密码框
- **隐含假设**：macOS 环境，dig/pfctl/dscacheutil/osascript 均可用

#### `services/app_blocker.rs`（279 行）
- **职责**：检测并终止黑名单应用进程，管理 overlay 窗口
- **不应承担**：网站拦截、计时逻辑
- **关键行为**：
  - `start_polling()` — 每 1 秒刷新进程列表，匹配黑名单
  - `is_main_process()` — 精确匹配进程名，过滤 helper/renderer/gpu 等子进程
  - `is_system_protected()` — 保护 com.apple.*、kernel、Finder 等系统进程
  - `show_overlay_window()` — 已存在则 show+set_always_on_top，否则 WebviewWindowBuilder 创建新窗口
- **隐含假设**：`process.kill()` 可能失败，最多重试 3 次后放弃

#### `services/scheduler.rs`（175 行）
- **职责**：定时模式的时间段检测
- **不应承担**：实际的专注启动/停止（通过回调通知 lib.rs）
- **关键行为**：
  - `start_polling()` — 每 30 秒检查当前时间是否在启用的 schedule 内
  - `is_in_schedule()` — 遍历所有 enabled 的 schedule，比较 HH:MM 格式时间
  - 状态变化时调用外部传入的回调函数

#### `services/local_server.rs`（135 行）
- **职责**：HTTP 本地服务器，供 Chrome 扩展轮询
- **不应承担**：任何状态修改（只读）
- **端口**：`127.0.0.1:27190`
- **端点**：`GET /status` → 返回 `{ focusing, blocked_sites }` JSON
- **关键行为**：自动为域名生成 www 变体；CORS 头允许扩展跨域访问

### 2.2 前端（src/）

#### `index.html`（187 行）
- **职责**：主窗口 SPA 容器，包含 Timer 页和 Settings 页
- **结构**：两个 `.page` div（`#timer-page`、`#settings-page`）+ 底部导航栏 + 确认对话框
- **不应承担**：业务逻辑（全部在 JS 文件中）

#### `overlay.html`（342 行）
- **职责**：全屏覆盖窗口，显示专注倒计时和被拦截 App 名称
- **内联 JS**：直接包含 Tauri invoke 调用、计时器轮询、紧急取消逻辑
- **关键行为**：
  - 监听 `blocked-app-detected` 事件显示被拦截应用名
  - 每 1 秒轮询 `get_timer_status` 更新显示
  - 紧急取消后显示过渡画面（完成 5 秒 / 取消 2 秒）
  - "返回"按钮调用 `invoke('hide_overlay_window')`

#### `js/app.js`（140 行）
- **职责**：页面导航、初始化入口
- **关键行为**：
  - `switchPage(pageName)` — 切换 Timer/Settings 页面，专注期间阻止切换到非 timer 页
  - 通过 `document.body.className` 判断当前状态（由 timer.js 的 `render()` 设置）
  - DOMContentLoaded 时初始化 timer 和 settings 模块

#### `js/timer.js`（569 行 — 前端最大文件）
- **职责**：计时器页面的全部交互逻辑
- **关键行为**：
  - 可编辑时间数字：支持键盘 0-9 输入、方向键、滚轮调整
  - `render(status)` — 根据 TimerStatus 更新 UI，设置 `document.body.className = 'state-' + state`
  - 监听 Tauri 事件 `timer-update`、`timer-work-complete`、`timer-break-complete`
  - 完成提示音：Web Audio API 生成 880Hz 正弦波，3 次短鸣
  - 紧急取消：弹出确认对话框 → 调用 `api.emergencyCancel()`
- **隐含假设**：`body.className` 是全局状态通信机制，CSS 和 app.js 都依赖它

#### `js/settings.js`（585 行）
- **职责**：设置页面的全部交互逻辑
- **关键行为**：
  - 滑块控制工作/休息时长、紧急取消限额
  - App 黑名单：自动补全搜索 + 图标显示（base64）
  - 网站黑名单：输入框添加/删除
  - 定时时间段：添加/删除/启用切换
  - 手动/定时模式切换
  - 所有修改自动调用 `saveCurrentConfig()` 持久化

#### `js/api.js`（72 行）
- **职责**：Tauri IPC 调用的统一封装层
- **不应承担**：任何 UI 逻辑
- **模式**：每个方法 try/catch 包裹 `window.__TAURI__.core.invoke()`，失败时 console.error 并返回 null

#### `js/utils.js`（80 行）
- **职责**：通用工具函数
- **函数**：`formatTime()`、`parseTimeString()`、`debounce()`、`showNotification()`、`requestNotificationPermission()`

#### CSS 文件
- `styles/main.css`（234 行）— 全局样式、暗色主题、底部导航栏、按钮、专注状态下导航栏滑出动画
- `styles/timer.css`（261 行）— 计时器大字体显示、可编辑数字、闪烁分隔符、紧急取消按钮、确认对话框、响应式布局
- `styles/settings.css`（499 行）— 卡片布局、滑块、列表、自动补全、时间段输入、模式切换开关

### 2.3 Chrome 扩展（chrome-extension/）

#### `manifest.json`（25 行）
- Manifest V3，权限：`declarativeNetRequest`、`storage`、`alarms`、`tabs`
- `host_permissions`：`127.0.0.1:27190`（本地服务器）+ `<all_urls>`（拦截任意网站）

#### `background.js`（189 行）
- **职责**：Service Worker，轮询桌面应用状态并动态管理拦截规则
- **关键行为**：
  - 每 ~2 秒通过 `chrome.alarms` 触发 `pollStatus()`
  - `handleStatusUpdate()` — 比较新旧状态，仅在变化时更新规则
  - `updateBlockRules()` — 用 `declarativeNetRequest.updateDynamicRules` 添加重定向规则
  - `redirectExistingTabs()` — 专注开始时扫描已打开的标签页，仅执行一次
  - `tabs.onUpdated` 监听器 — 实时拦截专注期间新导航到黑名单的标签页
- **隐含假设**：桌面应用未运行时 fetch 失败，静默清除规则

#### `blocked.html` / `blocked.css` / `blocked.js`（98 行合计）
- **职责**：被拦截时显示的提示页面
- **行为**：点击按钮尝试 `history.back()` 或 `window.close()`，失败则显示手动关闭提示

---

## 3. 关键函数详述

### 3.1 `start_focus()` — commands/timer.rs:67

**目的**：启动一次专注会话，协调所有子系统

**输入**：
- `minutes: Option<u32>` — 自定义工作时长，None 则用配置默认值
- `seconds: Option<u32>` — 额外秒数（用于精确调整）

**输出**：`Result<TimerStatus, String>`

**执行顺序**（顺序敏感）：
1. 停止旧计时线程
2. 从 config 读取月度剩余紧急取消次数（可能触发跨月重置）
3. 保存用户选择的专注时长到 config
4. **屏蔽网站**（此步可能弹出 macOS 密码框，必须在计时前完成）
5. 设置 TimerStatus 为 Working
6. 启动计时线程
7. 启动 App 拦截轮询线程

**副作用**：修改 config.json、修改 /etc/hosts、启用 pf 防火墙、启动 2 个后台线程

**隐含假设**：网站屏蔽在计时前完成，避免密码输入时间被计入专注时长

### 3.2 `emergency_cancel()` — commands/timer.rs:203

**目的**：紧急取消当前专注会话（有限次数）

**输入**：无用户参数（从 state 读取）

**输出**：`Result<TimerStatus, String>`

**执行顺序**：
1. 检查 `emergency_remaining == 0` → 拒绝
2. 递减 `timer_status.emergency_remaining`
3. **持久化** `emergency_used_count` 和 `emergency_reset_month` 到 config.json
4. 停止计时线程
5. 重置 TimerStatus 为 Idle
6. 停止 App 拦截、关闭 overlay、解除网站屏蔽

**副作用**：写 config.json、清理 /etc/hosts、关闭 pf 规则、销毁 overlay 窗口

**共享状态**：同时修改 `timer_status`（Mutex）和 `emergency_remaining`（AtomicU32）两处

### 3.3 `start_timer_thread()` — commands/timer.rs:11

**目的**：启动后台计时线程，每秒递减并广播状态

**输入**：`AppHandle`、`Arc<Mutex<TimerStatus>>`、stop/pause 信号

**行为**：
- 每秒检查 stop_signal 和 pause_signal
- Working 倒计时结束 → 自动切换到 Breaking
- Breaking 倒计时结束 → 设为 Idle 并退出线程
- 每次变化通过 `app_handle.emit("timer-update", ...)` 广播

### 3.4 `block_sites()` / `unblock_sites()` — services/site_blocker.rs

**block_sites() 流程**：
1. `clean_domain()` 去除协议前缀、路径、末尾斜杠
2. `resolve_domain_ips()` 调用 `dig +short` 获取 IPv4 地址
3. `prepare_block_files()` 生成临时 hosts 和 pf 规则文件
4. `execute_block_commands()` 通过 osascript 一次性执行所有 sudo 操作

**unblock_sites() 流程**：
1. 读取 hosts 文件，检查是否包含 BLOCK_MARKER
2. 生成清理后的临时 hosts 文件
3. 先尝试 `sudo -n`（非交互，利用缓存凭据）
4. 失败则回退到 osascript 弹密码框
5. 刷新 DNS 缓存，清理临时文件

### 3.5 `hide_overlay_window()` — commands/blocker.rs:26

**目的**：隐藏 overlay 窗口并防止轮询线程立即重新弹出

**执行顺序**：
1. 设置 `overlay_suppressed = true`
2. 退出全屏 → 延迟 500ms（macOS 全屏退出动画）→ 隐藏窗口
3. 显示主窗口并聚焦
4. 5 秒后自动重置 suppressed 标志

**设计原因**：macOS 全屏退出是异步动画，直接 hide 无效

### 3.6 `render(status)` — js/timer.js

**目的**：根据后端 TimerStatus 更新整个计时器页面 UI

**输入**：TimerStatus 对象（来自 Tauri 事件或 API 调用）

**行为**：
- 更新时间显示（HH:MM:SS）
- 更新状态文字和颜色
- 切换按钮可见性（开始/暂停/继续/停止）
- 更新紧急取消按钮状态和剩余次数
- **设置 `document.body.className = 'state-' + state`**

**全局影响**：body.className 被 CSS（导航栏隐藏、布局调整）和 app.js（页面切换守卫）依赖

---

## 4. 设计决策分析

### 4.1 为什么用线程而非 async

计时器、App 拦截、调度器都使用 `std::thread::spawn` 而非 Tokio async。原因：
- Tauri 2.x 的命令系统本身是同步的（`#[tauri::command]` 默认同步）
- 计时器需要精确的 1 秒间隔，`thread::sleep` 比 async timer 更简单可靠
- `sysinfo` 的 `System::refresh_all()` 是阻塞调用，放在 async 中会阻塞 executor
- **权衡**：线程数量固定（最多 3 个后台线程），不会无限增长，开销可接受

### 4.2 为什么网站拦截用三层机制

| 层 | 机制 | 覆盖范围 | 局限 |
|----|------|----------|------|
| 1 | /etc/hosts | 所有应用 | 需 sudo，DNS 缓存延迟 |
| 2 | pf 防火墙 | IP 级别拦截 | CDN IP 可能变化 |
| 3 | Chrome 扩展 | 浏览器标签页 | 仅 Chrome/Chromium |

三层互补：hosts 处理 DNS 层，pf 处理已缓存的 IP 连接，Chrome 扩展处理浏览器内实时导航。

### 4.3 为什么 overlay 用 hide 而非 destroy

overlay 窗口被拦截 App 触发时创建，用户点"返回"时仅 hide 而非 destroy。原因：
- `destroy()` 后再次检测到黑名单 App 需要重新创建窗口（WebviewWindowBuilder），有延迟
- `hide()` 后可以快速 `show()` 恢复，响应更快
- `on_window_event` 中 `prevent_close()` 阻止用户直接关闭，保证 overlay 始终可用
- **例外**：`stop_focus` 和 `emergency_cancel` 使用 `destroy()` 彻底销毁，因为专注已结束

### 4.4 为什么 body.className 作为状态通信机制

`timer.js` 的 `render()` 设置 `document.body.className = 'state-' + state`，被三处消费：
- **CSS**：导航栏滑出动画、页面布局调整、计时器字体放大
- **app.js**：`switchPage()` 守卫，阻止专注期间切换页面
- **timer.js 自身**：按钮可见性控制

这避免了跨模块导入 `currentStatus` 变量，利用 DOM 作为"发布-订阅"中介。
**权衡**：简单但脆弱——如果 className 格式变化，所有消费方都会受影响。

### 4.5 为什么 emergency_remaining 存在两份

`emergency_remaining` 同时存在于：
- `TimerStatus.emergency_remaining`（Mutex 保护，序列化后发送给前端）
- `AppState.emergency_remaining`（AtomicU32，供快速无锁读取）

原因：计时线程持有 `timer_status` 的 Mutex 锁时，其他线程无法读取。AtomicU32 提供无锁的快速读取路径。
**风险**：两份数据必须手动同步，遗漏会导致不一致。

### 4.6 有意灵活 vs 有意刚性的部分

**灵活设计**：
- `Config` 使用 `#[serde(default)]` 允许旧配置文件缺少新字段，向后兼容
- Chrome 扩展与桌面应用完全解耦，通过 HTTP 轮询通信，可独立部署
- `blocked_sites` 和 `blocked_apps` 是用户可配置的列表，无硬编码限制

**刚性设计**：
- 仅支持 macOS（osascript、sips、pfctl、dig 等系统命令硬编码）
- HTTP 服务器端口 27190 硬编码，无配置项
- overlay 窗口 ID 硬编码为 `"overlay"`，仅支持单实例

---

## 5. 迭代指南

### 5.1 安全修改区域

| 区域 | 原因 |
|------|------|
| CSS 样式文件 | 纯展示层，不影响逻辑 |
| `blocked.html/css/js` | Chrome 扩展的静态展示页，完全独立 |
| `commands/apps.rs` | 应用扫描和图标提取，不影响核心流程 |
| `js/utils.js` | 纯工具函数，无副作用 |
| `js/settings.js` | 设置页 UI，只要保持 `saveCurrentConfig()` 的调用契约即可 |
| `overlay.html` 的 UI 部分 | 样式和文案修改安全，但不要改 invoke 调用 |

### 5.2 高风险修改区域

| 区域 | 风险 |
|------|------|
| `start_focus()` 的执行顺序 | 网站屏蔽必须在计时前完成，顺序变动会导致密码输入时间被计入专注 |
| `TimerStatus` 结构体字段 | 前端 JS、overlay.html、local_server.rs 都依赖其 JSON 序列化格式 |
| `body.className` 格式 | main.css、timer.css、app.js 三处硬编码依赖 `state-xxx` 格式 |
| `site_blocker.rs` 的 sudo 逻辑 | 涉及系统文件修改，错误可能导致 hosts 文件损坏或 pf 规则残留 |
| `overlay_suppressed` 时序 | 5 秒超时是经验值，改动可能导致 overlay 闪烁或无法重新弹出 |
| `emergency_remaining` 双份同步 | TimerStatus 和 AtomicU32 必须同步更新，遗漏导致前端显示与实际不一致 |

### 5.3 新功能添加指南

**添加新的 Tauri IPC 命令**：
1. 在 `commands/` 下对应文件添加 `#[tauri::command]` 函数
2. 在 `commands/mod.rs` 中 pub use 导出
3. 在 `lib.rs` 的 `invoke_handler` 中注册
4. 在 `capabilities/default.json` 中添加权限（注意 window label 限制）
5. 在 `js/api.js` 中添加前端封装

**添加新的配置字段**：
1. 在 `models/config.rs` 的对应结构体中添加字段，使用 `#[serde(default)]` 保证向后兼容
2. 更新 `Default` impl 中的默认值
3. 前端 `settings.js` 添加 UI 控件和 `saveCurrentConfig()` 调用

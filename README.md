# 🍅 番茄专注 (Pomodoro Focus)

一款 macOS 桌面番茄钟应用，专注期间**强制屏蔽**娱乐网站和应用，帮助你保持专注。

> ⚠️ 仅支持 macOS，使用 Tauri 2.0 + Rust + HTML/CSS/JS 构建。


## ✨ 核心功能

- **番茄计时器** — 自定义专注时长（精确到秒），支持暂停/继续
- **App 强制拦截** — 专注期间自动终止黑名单应用（如 QQ、微信），被拦截时弹出全屏覆盖层
- **网站三层屏蔽** — hosts 文件 + pf 防火墙 + 浏览器扩展，三重机制确保无法绕过
- **Chrome & Safari 扩展** — 实时拦截黑名单网站，已打开的标签页也会被强制跳转
- **学霸模式** — 紧急取消每月仅 3 次，专注期间无法轻易退出
- **专注记忆** — 记住上次使用的专注时长，关闭重开自动恢复专注状态
- **完成提醒** — 专注结束时播放提示音（可在设置中关闭）
- **定时模式** — 设定每日自动专注的时间段

## 🏗️ 技术架构

```
┌─────────────────────────────────────────┐
│            Tauri 桌面应用                 │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │ 前端 HTML/   │◄►│ Rust 后端         │ │
│  │ CSS/JS       │  │ - 计时器线程      │ │
│  │              │  │ - App 拦截线程    │ │
│  └──────────────┘  │ - HTTP 服务器     │ │
│                    └────────┬─────────┘ │
└─────────────────────────────┼───────────┘
                              │ :27190
               ┌──────────────▼──────────────┐
               │  Chrome / Safari 浏览器扩展   │
               │  轮询状态 → 动态拦截网站      │
               └─────────────────────────────┘
```

### 网站屏蔽三层机制

| 层级 | 机制 | 覆盖范围 |
|------|------|----------|
| 系统层 | /etc/hosts 重定向 | 所有应用 |
| 网络层 | pf 防火墙规则 | IP 级别拦截 |
| 浏览器层 | Chrome/Safari 扩展 | 实时标签页拦截 |

## 📦 安装

### 前置要求

- macOS 12+
- [Rust](https://rustup.rs/) (最新稳定版)
- [Node.js](https://nodejs.org/) 18+
- Xcode Command Line Tools (`xcode-select --install`)

### 构建运行

```bash
# 克隆仓库
git clone https://github.com/Rinta13795/pomodoro-focus.git
cd pomodoro-focus

# 安装依赖
npm install

# 开发模式运行
cargo tauri dev

# 打包发布
cargo tauri build
```

### 安装 Chrome 扩展

1. 打开 Chrome，访问 `chrome://extensions/`
2. 开启右上角"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择项目中的 `chrome-extension/` 文件夹

### 安装 Safari 扩展

1. 用 Xcode 打开 `safari-extension/番茄专注/番茄专注.xcodeproj`
2. ⌘R 编译运行
3. Safari → 设置 → 扩展 → 启用"番茄专注"

## 📁 项目结构

```
pomodoro-focus/
├── src/                        # 前端
│   ├── index.html              # 主窗口
│   ├── overlay.html            # 全屏覆盖层（拦截 App 时显示）
│   ├── js/
│   │   ├── app.js              # 页面导航
│   │   ├── timer.js            # 计时器逻辑
│   │   ├── settings.js         # 设置页逻辑
│   │   ├── api.js              # Tauri IPC 封装
│   │   └── utils.js            # 工具函数
│   └── styles/
│       ├── main.css            # 全局样式
│       ├── timer.css           # 计时器样式
│       └── settings.css        # 设置页样式
├── src-tauri/                  # Rust 后端
│   └── src/
│       ├── lib.rs              # 应用初始化
│       ├── state.rs            # 全局状态管理
│       ├── commands/
│       │   ├── timer.rs        # 计时器命令
│       │   ├── blocker.rs      # 拦截命令
│       │   ├── config.rs       # 配置命令
│       │   └── apps.rs         # 应用扫描
│       ├── services/
│       │   ├── site_blocker.rs # 网站屏蔽
│       │   ├── app_blocker.rs  # App 拦截
│       │   ├── scheduler.rs    # 定时调度
│       │   └── local_server.rs # HTTP 服务器
│       └── models/
│           ├── config.rs       # 配置数据结构
│           └── timer.rs        # 计时器数据结构
├── chrome-extension/           # Chrome 扩展
│   ├── manifest.json
│   ├── background.js
│   └── blocked.html
└── safari-extension/           # Safari 扩展 Xcode 项目
```

## ⚙️ 配置

配置文件位于 `~/Library/Application Support/pomodoro-focus/config.json`

可配置项：
- 工作/休息时长
- App 黑名单（自动扫描已安装应用）
- 网站黑名单
- 紧急取消月度限额
- 定时模式时间段
- 完成提醒音开关

## 🚧 已知限制

- **仅支持 macOS** — 依赖 osascript、pfctl、/etc/hosts 等系统特性
- **需要管理员权限** — 网站屏蔽需要修改 hosts 文件和 pf 防火墙
- **Safari 开发版扩展** — 每次重启 Mac 可能需要重新在 Safari 设置中启用
- **HTTP 端口固定** — 本地服务器端口 27190 硬编码

## 📋 开发计划

- [ ] UI 美化（自定义背景图、主题切换）
- [ ] 自定义提醒铃声
- [ ] 性能优化（App 拦截轮询频率）
- [ ] 专注数据统计
- [ ] Firefox 扩展
- [ ] 关闭 App 后保持屏蔽至专注结束

## 📄 License

MIT License

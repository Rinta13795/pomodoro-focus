# 🍅 番茄专注 (Pomodoro Focus)

面向学习的番茄钟桌面应用，支持 **macOS** 和 **Windows**。

专注期间，它会屏蔽娱乐网站、关闭黑名单里的 App。它还会记录你每一次专注，让你看见自己的进步：
- 今日目标
- 连续天数
- 一年的专注热力图
- 按科目统计

> Tauri 2 + Rust + 原生 HTML/CSS/JS，不依赖前端框架，数据只存在本机。

## ✨ 功能

**学习闭环：计划 → 专注 → 复盘 → 看见进步**

- **今日计划**：写下今天要做的事，并预估每件事需要几个番茄。开始专注时选一项，完成一个番茄后会自动记 +1。没做完的任务第二天可以一键移到今天。
- **科目标签**：每个番茄可以标记科目，例如数学、英语、专业课。统计页会显示本周各科目花了多少时间。
- **今日目标环**：显示今天的专注进度。离目标越近，提示越具体，比如"再专注 35 分钟就达成今日目标"。
- **一句话复盘**：每个番茄结束后，可以写一句"这个番茄完成了什么"。写过的复盘会出现在记录列表里，之后也能修改。
- **专注热力图**：像 GitHub 贡献图一样展示最近一年每天的专注时长，鼠标悬停可以看到具体分钟数。
- **宽容的连续天数**：每 7 天里允许一个休息日，漏一天不会清零。断了也只会提示"欢迎回来"，不会说"你失去了 N 天"。
- **学霸模式**：专注中只能用"紧急取消"退出，每月次数有限，托盘里的"退出"也不能绕过。

**防分心**

- **网站屏蔽**：修改系统 hosts 文件，对所有浏览器和应用都生效。另有浏览器扩展（Chrome / Edge / Safari），会实时拦截已经打开的标签页。
- **App 拦截**：专注期间检测到黑名单里的 App 就自动关闭，并弹出全屏提醒。
- **断点恢复**：专注中途重启电脑或应用，会自动接着计时。电脑睡眠的时间也会正确补算。

为什么这样设计（附研究来源），见 [docs/DESIGN.md](docs/DESIGN.md)。

## 📦 安装

### 直接下载

[GitHub Actions](https://github.com/Rinta13795/pomodoro-focus/actions) 每次构建都会产出两个安装包：
- macOS：`.dmg`
- Windows：`.exe`（NSIS 安装包）

在对应构建的 Artifacts 里下载即可。

### 从源码构建

需要：
- [Rust](https://rustup.rs/)（stable）
- [Node.js](https://nodejs.org/) 18+
- macOS 还需要 Xcode Command Line Tools：`xcode-select --install`
- Windows 还需要 [Microsoft C++ 生成工具](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 和 WebView2（Windows 10/11 自带）

```bash
git clone https://github.com/Rinta13795/pomodoro-focus.git
cd pomodoro-focus
npm install
npm run dev      # 开发模式
npm run build    # 打包安装程序
npm test         # 前端与扩展测试
npm run test:rust
```

### 浏览器扩展（推荐）

见 [extension/README.md](extension/README.md)，支持 Chrome、Edge、Safari。

## 🖥️ macOS 与 Windows 的区别

| | macOS | Windows |
|---|---|---|
| 网站屏蔽授权 | 每次开始专注，输入一次管理员密码 | 每次开始专注，确认一次 UAC |
| App 黑名单 | 从"应用程序"文件夹里选择 | 从开始菜单里选择，也可以直接输入 exe 名（如 `WeChat`） |
| 浏览器扩展 | Chrome / Safari | Chrome / Edge |
| 数据目录 | `~/Library/Application Support/pomodoro-focus/` | `%APPDATA%\pomodoro-focus\` |

> **Windows 用户注意：**
> - 部分杀毒软件会把"修改 hosts"当成可疑行为，需要允许本应用。
> - 如果不想让应用修改 hosts，可以把网站黑名单留空，只用浏览器扩展。

## 🏗️ 项目结构

```
src/                 前端（原生 ES Modules）
  js/views/          专注页、统计页、设置页、今日计划
  js/stats.js        统计纯函数：按天汇总、连续天数、热力图分级（有单元测试）
src-tauri/src/
  services/focus.rs  计时引擎：开始/暂停/结束、断点恢复、写专注记录
  platform/          所有系统相关代码（macos.rs / windows.rs）
  models/            配置、专注记录、今日计划、会话
extension/           浏览器扩展（Chrome / Edge / Safari 共用）
safari-extension/    Safari 扩展的 Xcode 工程（资源由 scripts/sync-extension.mjs 同步）
docs/                接口约定 API.md、设计说明 DESIGN.md
tests/               Node 单元测试
```

## License

MIT

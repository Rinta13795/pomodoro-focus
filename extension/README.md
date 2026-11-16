# 番茄专注 · 浏览器扩展

配合「番茄专注」桌面 App 使用：**专注期间**，自动把黑名单网站（以及它的所有子域名，例如屏蔽 `bilibili.com` 也会屏蔽 `www.bilibili.com`、`t.bilibili.com`）跳转到一个安静的提示页，提醒你回到学习。专注开始前就已经打开的标签页也会被拦截。

- 黑名单在 App 的设置里管理，扩展会自动同步，无需在扩展里单独配置。
- App 没有打开时，扩展什么都不做，不会影响正常上网。
- Chrome、Edge、Safari 共用这一份代码（Manifest V3）。

## 工作原理

扩展每隔几秒请求一次本机接口：

```
GET http://127.0.0.1:27190/status  →  { "focusing": true, "blocked_sites": ["bilibili.com", ...] }
```

- `focusing` 为 `true` 时，命中黑名单的标签页会跳转到 `blocked.html`；
- 打开新网页时会立刻检查（使用缓存的状态，过旧时先问一次 App）；
- 请求失败（App 没运行）时，最多沿用 15 秒上次的状态，之后自动放行。

## 安装到 Chrome

1. 地址栏打开 `chrome://extensions/`
2. 打开右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择项目里的 `extension/` 文件夹

## 安装到 Microsoft Edge（Windows 推荐）

1. 地址栏打开 `edge://extensions/`
2. 打开左侧（或页面底部）的 **开发人员模式**
3. 点击 **加载解压缩的扩展**
4. 选择项目里的 `extension/` 文件夹
5. 建议在扩展详情里打开 **在 InPrivate 中允许**，避免在无痕窗口中绕过

> 修改了 `extension/` 里的代码后，在扩展管理页点一下该扩展的 **重新加载** 按钮即可生效。

## 安装到 Safari（macOS）

Safari 扩展需要通过 Xcode 项目打包，资源来自同一份 `extension/` 代码：

1. 在项目根目录运行同步脚本，把 `extension/` 复制到 Xcode 项目中：

   ```bash
   node scripts/sync-extension.mjs
   ```

2. 用 Xcode 打开 `safari-extension/番茄专注/番茄专注.xcodeproj`
3. 选择 **番茄专注 (macOS)** scheme，按 ⌘R 编译运行
4. 打开 Safari → **设置** → **扩展**，勾选「番茄专注」
5. 在同一页面把「番茄专注」的网站权限设为 **在所有网站上允许**（否则无法读取标签页地址，拦截不会生效）
6. 如果扩展没有出现：Safari → 设置 → 高级 → 勾选「在菜单栏中显示 Web 开发者功能」，然后在 **开发** 菜单（较新版本在 设置 → 开发者）中勾选「允许未签名的扩展」（每次重启 Safari 后可能需要重新勾选）

> 每次修改 `extension/` 后都要重新运行同步脚本再编译。可以用 `node scripts/sync-extension.mjs --check` 检查 Xcode 项目里的资源是否已过期。

## 开发与测试

```bash
# 语法检查
node --check extension/background.js
node --check extension/blocked.js

# 域名匹配与拦截逻辑的单元测试（含 Safari 资源同步检查）
node --test tests/extension-match.test.mjs
```

文件说明：

| 文件 | 作用 |
|---|---|
| `manifest.json` | 扩展清单（MV3） |
| `background.js` | 后台 Service Worker：轮询 App 状态、匹配域名、跳转标签页 |
| `blocked.html` / `blocked.css` / `blocked.js` | 拦截提示页，专注结束后可一键返回原网页 |
| `icons/` | 扩展图标 |

`background.js` 刻意保持为不依赖 `import` 的单文件脚本，以保证在 Safari 中同样可用；测试通过 `node:vm` 直接加载这份文件。

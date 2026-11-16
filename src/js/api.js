/**
 * 后端命令封装，与 docs/API.md 一一对应。
 * 参数名用 camelCase，Tauri 会自动转换成 Rust 侧的 snake_case。
 */

let ready = null;

/**
 * 只有在本机浏览器里直接打开 src/ 调试时才加载假后端。
 * Tauri v2 在 Windows 上的页面地址是 http://tauri.localhost，所以不能只看协议；
 * 同时要求没有 Tauri 注入的 __TAURI_INTERNALS__（它先于页面脚本注入，不受 withGlobalTauri 影响）。
 */
export function shouldUseBrowserMock() {
  return (
    (location.protocol === 'http:' || location.protocol === 'https:') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) &&
    !('__TAURI_INTERNALS__' in window) &&
    !window.__TAURI__
  );
}

/** 等待 withGlobalTauri 注入的 window.__TAURI__（最多 5 秒） */
export function tauriReady(timeoutMs = 5000) {
  if (!ready) {
    ready = new Promise((resolve, reject) => {
      const startedAt = Date.now();
      (function poll() {
        const t = window.__TAURI__;
        if (t && t.core && t.event) return resolve(t);
        if (Date.now() - startedAt > timeoutMs) {
          ready = null;
          return reject(new Error('Tauri API 加载超时'));
        }
        setTimeout(poll, 50);
      })();
    });
  }
  return ready;
}

async function call(command, args) {
  const t = await tauriReady();
  return t.core.invoke(command, args);
}

export const api = {
  // 配置
  getConfig: () => call('get_config'),
  saveConfig: (config) => call('save_config', { config }),
  getConfigPath: () => call('get_config_path'),
  getPlatform: () => call('get_platform'),

  // 计时
  startFocus: ({ minutes, seconds = 0, label = null, taskId = null }) =>
    call('start_focus', { minutes, seconds, label, taskId }),
  pauseFocus: () => call('pause_focus'),
  resumeFocus: () => call('resume_focus'),
  stopFocus: () => call('stop_focus'),
  emergencyCancel: () => call('emergency_cancel'),
  getTimerStatus: () => call('get_timer_status'),

  // 记录与计划
  getHistory: () => call('get_history'),
  setRecordNote: (id, note) => call('set_record_note', { id, note }),
  getPlanner: () => call('get_planner'),
  savePlanner: (planner) => call('save_planner', { planner }),

  // App 列表
  getInstalledApps: () => call('get_installed_apps'),
  getAppIcon: (appName) => call('get_app_icon', { appName }),

  // 背景图
  setBackground: (sourcePath) => call('set_background', { sourcePath }),
  clearBackground: () => call('clear_background'),
  getBackground: () => call('get_background'),

  // 覆盖层窗口
  hideOverlayWindow: () => call('hide_overlay_window'),
  closeOverlayWindow: () => call('close_overlay_window'),
};

/** 打开系统文件选择框（tauri-plugin-dialog） */
export async function pickImageFile() {
  const t = await tauriReady();
  if (!t.dialog || !t.dialog.open) throw new Error('当前环境不支持选择文件');
  return t.dialog.open({
    multiple: false,
    filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
  });
}

export default api;

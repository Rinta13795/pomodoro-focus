/**
 * API 模块 - 简化版，更稳定
 */

// 等待 Tauri API 加载
async function waitForTauri() {
  let attempts = 0;
  while (attempts < 50) {
    if (window.__TAURI__) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  throw new Error('Tauri API 加载超时');
}

// 获取 invoke 函数
async function getInvoke() {
  await waitForTauri();
  const invoke = window.__TAURI__.core?.invoke || window.__TAURI__.invoke;
  if (!invoke) {
    throw new Error('无法找到 Tauri invoke 函数');
  }
  return invoke;
}

// 缓存 invoke 函数
let invokeCache = null;

async function safeInvoke(command, args = {}) {
  try {
    if (!invokeCache) {
      invokeCache = await getInvoke();
    }
    return await invokeCache(command, args);
  } catch (error) {
    console.error(`调用 ${command} 失败:`, error);
    throw error;
  }
}

export const API = {
  // 配置管理
  getConfig: () => safeInvoke('get_config'),
  saveConfig: (config) => safeInvoke('save_config', { config }),
  getConfigPath: () => safeInvoke('get_config_path'),

  // 计时器控制
  startFocus: (minutes, seconds) => safeInvoke('start_focus', { minutes, seconds }),
  pauseFocus: () => safeInvoke('pause_focus'),
  resumeFocus: () => safeInvoke('resume_focus'),
  stopFocus: () => safeInvoke('stop_focus'),
  getTimerStatus: () => safeInvoke('get_timer_status'),
  emergencyCancel: () => safeInvoke('emergency_cancel'),

  // 应用拦截
  checkAndKillBlockedApps: () => safeInvoke('check_and_kill_blocked_apps'),
  isAppRunning: (appName) => safeInvoke('is_app_running', { appName }),
  getBlockedApps: () => safeInvoke('get_blocked_apps'),

  // 应用列表
  getInstalledApps: () => safeInvoke('get_installed_apps'),
  getAppIcon: (appName) => safeInvoke('get_app_icon', { appName }),

  // 网站屏蔽
  blockSites: () => safeInvoke('block_sites'),
  unblockSites: () => safeInvoke('unblock_sites'),
  getBlockedSites: () => safeInvoke('get_blocked_sites'),

  // 背景图片
  setBackground: (sourcePath) => safeInvoke('set_background', { sourcePath }),
  clearBackground: () => safeInvoke('clear_background'),
  getBackground: () => safeInvoke('get_background'),
};

export default API;

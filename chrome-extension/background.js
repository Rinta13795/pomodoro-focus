/**
 * 番茄专注 Chrome 扩展 - 后台服务
 * 轮询本地 HTTP 服务，动态更新屏蔽规则
 */

const API_URL = 'http://127.0.0.1:27190/status';
const POLL_INTERVAL = 2000; // 2秒轮询

let currentBlockedSites = [];
let isFocusing = false;
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_CLEAR = 30; // ~1分钟（30次 × 2秒轮询）

// 启动时开始轮询
chrome.runtime.onInstalled.addListener(() => {
  console.log('[PomodoroFocus] 扩展已安装');
  startPolling();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[PomodoroFocus] 浏览器启动');
  startPolling();
});

// 使用 alarms API 进行轮询
function startPolling() {
  chrome.alarms.create('pollStatus', { periodInMinutes: 0.033 }); // ~2秒
  pollStatus(); // 立即执行一次
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pollStatus') {
    pollStatus();
  }
});

// 实时拦截专注期间新导航到黑名单的标签页
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!isFocusing || !changeInfo.url) return;
  if (changeInfo.url.startsWith('chrome-extension://')) return;
  try {
    const url = new URL(changeInfo.url);
    const hostname = url.hostname;
    const isBlocked = currentBlockedSites.some(site =>
      hostname === site || hostname.endsWith('.' + site)
    );
    if (isBlocked) {
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL('blocked.html')
      });
    }
  } catch (e) {
    // 忽略无效 URL
  }
});

/**
 * 轮询状态
 */
async function pollStatus() {
  try {
    const response = await fetch(API_URL, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    consecutiveFailures = 0;
    handleStatusUpdate(data);
  } catch (error) {
    consecutiveFailures++;
    // App 短暂关闭重启时不立刻清除规则，等连续失败 ~1分钟后才清除
    if (isFocusing && consecutiveFailures >= MAX_FAILURES_BEFORE_CLEAR) {
      console.log('[PomodoroFocus] 连续失败', consecutiveFailures, '次，清除屏蔽规则');
      isFocusing = false;
      currentBlockedSites = [];
      await clearBlockRules();
    }
  }
}

/**
 * 处理状态更新
 */
function handleStatusUpdate(data) {
  const { focusing, blocked_sites } = data;

  // 统一提取纯域名，兼容任何格式输入
  const normalizedSites = (blocked_sites || []).map(site => {
    try {
      if (site.startsWith('http://') || site.startsWith('https://')) {
        return new URL(site).hostname;
      }
      return site.replace(/\/+$/, '');
    } catch (e) {
      return site.replace(/\/+$/, '');
    }
  });

  const sitesChanged = !arraysEqual(normalizedSites, currentBlockedSites);
  const focusChanged = focusing !== isFocusing;

  isFocusing = focusing;
  currentBlockedSites = normalizedSites;

  if (focusing && currentBlockedSites.length > 0) {
    if (sitesChanged || focusChanged) {
      updateBlockRules(currentBlockedSites);
    }
    // 只在专注刚开始时扫描一次已打开的标签页
    if (focusChanged) {
      redirectExistingTabs(currentBlockedSites);
    }
  } else if (!focusing && (sitesChanged || focusChanged)) {
    clearBlockRules();
  }
}

/**
 * 更新屏蔽规则
 */
async function updateBlockRules(sites) {
  const rules = sites.map((site, index) => ({
    id: index + 1,
    priority: 1,
    action: {
      type: 'redirect',
      redirect: { extensionPath: '/blocked.html' }
    },
    condition: {
      requestDomains: [site],
      resourceTypes: ['main_frame']
    }
  }));

  await clearBlockRules();

  if (rules.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rules
    });
    console.log('[PomodoroFocus] 已添加屏蔽规则:', sites);
  }
}

/**
 * 清除所有屏蔽规则
 */
async function clearBlockRules() {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const ruleIds = existingRules.map(rule => rule.id);

  if (ruleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIds
    });
    console.log('[PomodoroFocus] 已清除屏蔽规则');
  }
}

/**
 * 重定向已打开的黑名单标签页到 blocked.html
 */
async function redirectExistingTabs(sites) {
  console.log('[PomodoroFocus] 扫描已打开标签页, 屏蔽列表:', sites);
  const tabs = await chrome.tabs.query({});
  const blockedUrl = chrome.runtime.getURL('blocked.html');

  for (const tab of tabs) {
    // pendingUrl 覆盖正在加载中的标签页
    const tabUrl = tab.pendingUrl || tab.url;
    if (!tabUrl) continue;
    if (tabUrl.startsWith('chrome-extension://') || tabUrl.startsWith('chrome://')) continue;
    try {
      const hostname = new URL(tabUrl).hostname;
      const isBlocked = sites.some(site =>
        hostname === site || hostname.endsWith('.' + site)
      );
      if (isBlocked) {
        console.log('[PomodoroFocus] 重定向标签页:', tabUrl);
        chrome.tabs.update(tab.id, { url: blockedUrl });
      }
    } catch (e) {
      // 忽略无效 URL
    }
  }
}

/**
 * 数组比较
 */
function arraysEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

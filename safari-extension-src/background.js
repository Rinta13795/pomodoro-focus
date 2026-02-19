const API_URL = 'http://127.0.0.1:27190/status';
let currentBlockedSites = [];
let isFocusing = false;
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_CLEAR = 30;

browser.alarms.create('pollStatus', { periodInMinutes: 0.033 });
pollStatus();

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pollStatus') pollStatus();
});

async function pollStatus() {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    consecutiveFailures = 0;

    const wasFocusing = isFocusing;
    isFocusing = data.focusing;
    currentBlockedSites = (data.blocked_sites || []).map(site => {
      try {
        if (site.startsWith('http')) return new URL(site).hostname;
        return site.replace(/\/+$/, '');
      } catch { return site; }
    });

    // 专注刚开始时扫描已打开的标签页
    if (isFocusing && !wasFocusing && currentBlockedSites.length > 0) {
      redirectExistingTabs(currentBlockedSites);
    }
  } catch (error) {
    consecutiveFailures++;
    if (isFocusing && consecutiveFailures >= MAX_FAILURES_BEFORE_CLEAR) {
      console.log('[Safari] 连续失败', consecutiveFailures, '次，清除状态');
      isFocusing = false;
      currentBlockedSites = [];
    }
  }
}

function isBlocked(url) {
  if (!isFocusing || !url) return false;
  try {
    const hostname = new URL(url).hostname;
    return currentBlockedSites.some(site =>
      hostname === site || hostname.endsWith('.' + site)
    );
  } catch { return false; }
}

async function redirectExistingTabs(sites) {
  console.log('[Safari] 扫描已打开标签页, 屏蔽列表:', sites);
  const tabs = await browser.tabs.query({});
  const blockedUrl = browser.runtime.getURL('blocked.html');

  for (const tab of tabs) {
    const tabUrl = tab.url;
    if (!tabUrl) continue;
    if (tabUrl.startsWith('safari-web-extension://')) continue;
    try {
      const hostname = new URL(tabUrl).hostname;
      const blocked = sites.some(site =>
        hostname === site || hostname.endsWith('.' + site)
      );
      if (blocked) {
        console.log('[Safari] 重定向标签页:', tabUrl);
        browser.tabs.update(tab.id, { url: blockedUrl });
      }
    } catch (e) {}
  }
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && isBlocked(changeInfo.url)) {
    console.log('[Safari] 拦截:', changeInfo.url);
    browser.tabs.update(tabId, { url: browser.runtime.getURL('blocked.html') });
  }
});

browser.tabs.onCreated.addListener((tab) => {
  if (tab.url && isBlocked(tab.url)) {
    browser.tabs.update(tab.id, { url: browser.runtime.getURL('blocked.html') });
  }
});

console.log('[PomodoroFocus Safari] 扩展已启动');

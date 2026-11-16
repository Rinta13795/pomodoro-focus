/**
 * 番茄专注 浏览器扩展 - 后台 Service Worker
 * Chrome / Edge / Safari 共用同一份代码（Manifest V3）。
 *
 * 工作方式：
 * - 轮询本地 App：GET http://127.0.0.1:27190/status → { focusing, blocked_sites }
 *   · Service Worker 活着时每 2 秒拉一次；
 *   · chrome.alarms 每 30 秒唤醒一次（Chrome 允许的最小间隔），防止 Worker 休眠后失联。
 * - 专注中：把命中黑名单的标签页（域名本身或其任意子域名）跳转到 blocked.html，
 *   包括专注开始前就已经打开的标签页。
 * - 新的导航由 webNavigation / tabs.onUpdated 立即检查（使用缓存状态，缓存过旧时先刷新）。
 * - App 没有运行（请求失败）时安静地放行，不打扰正常上网。
 *
 * 为什么是单文件经典脚本：Safari 对 ES module 形式的 service worker 支持情况不确定，
 * 为保证三个浏览器行为一致，这里不使用 import / importScripts。
 * 下面的纯函数由 tests/extension-match.test.mjs 通过 node:vm 直接加载本文件进行测试。
 */

const STATUS_URL = 'http://127.0.0.1:27190/status';
const BLOCKED_PAGE = 'blocked.html';
const ALARM_NAME = 'pomodoro-poll';
const ALARM_PERIOD_MINUTES = 0.5; // Chrome 中 alarms 最小 30 秒
const FAST_POLL_MS = 2000;        // Worker 存活期间的轮询间隔
const FETCH_TIMEOUT_MS = 1500;
const FRESH_MS = 5000;            // 导航检查时，缓存在这个时间内视为新鲜
const GRACE_MS = 15000;           // 请求失败后，上次成功的状态最多再沿用这么久（App 短暂重启不闪断）
const REDIRECT_DEDUPE_MS = 1500;
const STORAGE_KEY = 'pomodoroStatus';

// ---------------------------------------------------------------------------
// 纯函数：域名规范化与匹配（无副作用，便于测试）
// ---------------------------------------------------------------------------

/**
 * 把用户/后端给的一条黑名单规范化为纯域名。
 * 支持 "bilibili.com"、"https://www.bilibili.com/video"、"*.bilibili.com"、"Bilibili.com:443" 等写法。
 * 去掉开头的 "www."，这样 www.xx.com 和 xx.com 以及所有子域名都会被拦截。
 * 无法解析时返回 null。
 */
function normalizeSite(entry) {
  if (typeof entry !== 'string') return null;
  let s = entry.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^\*\./, '');
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = 'http://' + s;
  let host;
  try {
    host = new URL(s).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^\*\./, '').replace(/\.+$/, '').replace(/^www\./, '');
  return host || null;
}

/** 规范化并去重整个黑名单。 */
function normalizeSites(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    const site = normalizeSite(entry);
    if (site && !out.includes(site)) out.push(site);
  }
  return out;
}

/**
 * 主机名是否命中黑名单：与某条完全相同，或是它的子域名。
 * sites 需已规范化。命中时返回匹配到的那条，否则返回 null。
 */
function matchBlockedSite(hostname, sites) {
  if (typeof hostname !== 'string' || !Array.isArray(sites)) return null;
  const host = hostname.toLowerCase().replace(/\.+$/, '');
  if (!host) return null;
  for (const site of sites) {
    if (host === site || host.endsWith('.' + site)) return site;
  }
  return null;
}

/** 一个 URL 是否应被拦截。只处理 http/https，其余（扩展页、about:、chrome:// 等）一律放行。 */
function findBlockedSite(url, sites) {
  if (typeof url !== 'string' || !url) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return matchBlockedSite(parsed.hostname, sites);
}

function sameSites(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ---------------------------------------------------------------------------
// 运行时
// ---------------------------------------------------------------------------

const api = globalThis.browser ?? globalThis.chrome;
const OFF = Object.freeze({ focusing: false, sites: [], at: 0 });

let status = OFF;          // 上一次成功获取到的状态，at = 获取时间（毫秒）
let persistedAt = 0;
let inflight = null;
let fastTimer = null;
let ready = Promise.resolve();
const recentRedirects = new Map(); // tabId -> 上次跳转时间

/** 当前生效的状态：最近一次成功结果仍在宽限期内才算数，否则视为未专注（放行）。 */
function effectiveStatus(now = Date.now()) {
  if (status.at && now - status.at <= GRACE_MS) return status;
  return OFF;
}

function sessionStore() {
  return api.storage?.session ?? api.storage?.local ?? null;
}

async function restoreStatus() {
  try {
    const store = sessionStore();
    if (!store) return;
    const saved = (await store.get(STORAGE_KEY))?.[STORAGE_KEY];
    if (saved && typeof saved.at === 'number' && saved.at > status.at) {
      status = {
        focusing: saved.focusing === true,
        sites: normalizeSites(saved.sites),
        at: saved.at,
      };
    }
  } catch {
    // 存储不可用时只用内存状态
  }
}

function persistStatus(prev) {
  const changed = prev.focusing !== status.focusing || !sameSites(prev.sites, status.sites);
  if (!changed && status.at - persistedAt < 10000) return;
  persistedAt = status.at;
  try {
    sessionStore()?.set({ [STORAGE_KEY]: status })?.catch?.(() => {});
  } catch {
    // 忽略
  }
}

/** 请求 App 状态；App 未运行或返回异常时返回 null。 */
async function fetchStatus() {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
  try {
    const res = await fetch(STATUS_URL, { cache: 'no-store', signal: controller?.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      focusing: data?.focusing === true,
      sites: normalizeSites(data?.blocked_sites),
      at: Date.now(),
    };
  } catch {
    return null; // App 没开：安静放行
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 刷新状态；专注刚开始或黑名单变化时，顺带扫描已打开的标签页。并发调用共用同一次请求。 */
function refresh() {
  if (!inflight) {
    inflight = (async () => {
      const before = effectiveStatus();
      const next = await fetchStatus();
      if (next) {
        const prev = status;
        status = next;
        persistStatus(prev);
      }
      const now = effectiveStatus();
      if (now.focusing && now.sites.length && (!before.focusing || !sameSites(before.sites, now.sites))) {
        await redirectOpenTabs(now.sites);
      }
      return now;
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** 拿一个足够新的状态：缓存新鲜就直接用，否则先问一次 App。 */
async function currentStatus() {
  await ready;
  if (status.at && Date.now() - status.at <= FRESH_MS) return effectiveStatus();
  return refresh();
}

function blockedPageUrl(originalUrl, site) {
  let host = site;
  try {
    host = new URL(originalUrl).hostname || site;
  } catch {
    // 用匹配到的规则名
  }
  const params = new URLSearchParams({ site: host, from: originalUrl });
  return api.runtime.getURL(BLOCKED_PAGE) + '?' + params.toString();
}

function redirectTab(tabId, originalUrl, site) {
  if (typeof tabId !== 'number' || tabId < 0) return;
  const now = Date.now();
  const last = recentRedirects.get(tabId);
  if (last && now - last < REDIRECT_DEDUPE_MS) return;
  recentRedirects.set(tabId, now);
  try {
    const p = api.tabs.update(tabId, { url: blockedPageUrl(originalUrl, site) });
    p?.catch?.(() => {});
  } catch {
    // 标签页可能已关闭
  }
}

/** 扫描所有已打开的标签页，命中黑名单的跳转到拦截页。 */
async function redirectOpenTabs(sites) {
  let tabs = [];
  try {
    tabs = await api.tabs.query({});
  } catch {
    return;
  }
  for (const tab of tabs || []) {
    const url = tab.pendingUrl || tab.url;
    const site = findBlockedSite(url, sites);
    if (site) redirectTab(tab.id, url, site);
  }
}

/** 检查一次导航，必要时立即拦截。 */
async function checkNavigation(tabId, url) {
  if (typeof url !== 'string' || !/^https?:/i.test(url)) return;
  const st = await currentStatus();
  if (!st.focusing) return;
  const site = findBlockedSite(url, st.sites);
  if (site) redirectTab(tabId, url, site);
}

function scheduleFastPoll() {
  clearTimeout(fastTimer);
  fastTimer = setTimeout(async () => {
    await refresh();
    scheduleFastPoll();
  }, FAST_POLL_MS);
}

async function ensureAlarm() {
  try {
    const existing = await api.alarms.get(ALARM_NAME);
    if (!existing) api.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
  } catch {
    // 忽略
  }
}

function start() {
  // MV3 要求事件监听在脚本首次执行时同步注册
  api.alarms?.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;
    await ready;
    const st = await refresh();
    // 兜底：专注期间每次闹钟都扫一遍已打开的标签页
    if (st.focusing && st.sites.length) await redirectOpenTabs(st.sites);
    scheduleFastPoll();
  });

  api.webNavigation?.onBeforeNavigate?.addListener((details) => {
    if (details.frameId !== 0) return;
    checkNavigation(details.tabId, details.url);
  });

  api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const url = changeInfo.url || (changeInfo.status === 'loading' ? tab?.url : null);
    if (url) checkNavigation(tabId, url);
  });

  api.tabs.onRemoved?.addListener((tabId) => recentRedirects.delete(tabId));

  // 拦截页询问当前状态（用于显示"专注已结束，可以返回"）
  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'pomodoro:getStatus') return undefined;
    currentStatus().then(
      (st) => sendResponse({ focusing: st.focusing }),
      () => sendResponse({ focusing: false }),
    );
    return true;
  });

  api.runtime.onInstalled?.addListener(() => ensureAlarm());
  api.runtime.onStartup?.addListener(() => ensureAlarm());

  ensureAlarm();
  ready = restoreStatus();
  ready.then(refresh).finally(scheduleFastPoll);
}

if (api?.runtime?.id) start();

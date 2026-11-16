// 浏览器扩展测试：node --test tests/extension-match.test.mjs
//
// extension/background.js 是单文件经典脚本（为兼容 Safari 不用 ES module），
// 这里用 node:vm 直接加载这份真实代码，取出其中的函数来测，不复制任何逻辑。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKGROUND = fs.readFileSync(path.join(ROOT, 'extension', 'background.js'), 'utf8');

/** 加载 background.js。不传 chrome 时只定义函数、不启动运行时。 */
function loadBackground(extra = {}) {
  const context = vm.createContext({
    URL,
    URLSearchParams,
    AbortController,
    console,
    setTimeout: () => 0, // 测试中不跑定时轮询
    clearTimeout: () => {},
    ...extra,
  });
  vm.runInContext(BACKGROUND, context, { filename: 'background.js' });
  return context;
}

const { normalizeSite, normalizeSites, matchBlockedSite, findBlockedSite } = loadBackground();

test('normalizeSite 处理各种写法', () => {
  assert.equal(normalizeSite('bilibili.com'), 'bilibili.com');
  assert.equal(normalizeSite('  BiliBili.COM  '), 'bilibili.com');
  assert.equal(normalizeSite('www.bilibili.com'), 'bilibili.com');
  assert.equal(normalizeSite('https://www.bilibili.com/video/BV1xx?p=1'), 'bilibili.com');
  assert.equal(normalizeSite('http://weibo.com:8080/'), 'weibo.com');
  assert.equal(normalizeSite('*.zhihu.com'), 'zhihu.com');
  assert.equal(normalizeSite('douyin.com/'), 'douyin.com');
  assert.equal(normalizeSite('m.weibo.cn'), 'm.weibo.cn');
  assert.equal(normalizeSite(''), null);
  assert.equal(normalizeSite('   '), null);
  assert.equal(normalizeSite(null), null);
  assert.equal(normalizeSite(42), null);
});

test('normalizeSites 去重并丢弃无效项（后端会同时下发 www 和非 www 版本）', () => {
  const sites = normalizeSites(['bilibili.com', 'www.bilibili.com', '', null, 'https://zhihu.com/']);
  assert.deepEqual([...sites], ['bilibili.com', 'zhihu.com']);
  assert.deepEqual([...normalizeSites(undefined)], []);
});

test('matchBlockedSite：完全相同或任意子域名命中', () => {
  const sites = ['bilibili.com', 'zhihu.com'];
  assert.equal(matchBlockedSite('bilibili.com', sites), 'bilibili.com');
  assert.equal(matchBlockedSite('www.bilibili.com', sites), 'bilibili.com');
  assert.equal(matchBlockedSite('live.m.bilibili.com', sites), 'bilibili.com');
  assert.equal(matchBlockedSite('WWW.ZHIHU.COM', sites), 'zhihu.com');
  assert.equal(matchBlockedSite('zhihu.com.', sites), 'zhihu.com');
});

test('matchBlockedSite：只是后缀相似的不同域名不命中', () => {
  const sites = ['bilibili.com'];
  assert.equal(matchBlockedSite('notbilibili.com', sites), null);
  assert.equal(matchBlockedSite('bilibili.com.evil.net', sites), null);
  assert.equal(matchBlockedSite('bilibili.co', sites), null);
  assert.equal(matchBlockedSite('', sites), null);
  assert.equal(matchBlockedSite('bilibili.com', []), null);
});

test('findBlockedSite：只拦截 http/https 页面', () => {
  const sites = ['bilibili.com'];
  assert.equal(findBlockedSite('https://www.bilibili.com/video/1', sites), 'bilibili.com');
  assert.equal(findBlockedSite('http://bilibili.com', sites), 'bilibili.com');
  assert.equal(findBlockedSite('chrome-extension://abc/blocked.html?site=bilibili.com', sites), null);
  assert.equal(findBlockedSite('safari-web-extension://abc/blocked.html', sites), null);
  assert.equal(findBlockedSite('chrome://extensions', sites), null);
  assert.equal(findBlockedSite('about:blank', sites), null);
  assert.equal(findBlockedSite('not a url', sites), null);
  assert.equal(findBlockedSite(undefined, sites), null);
  assert.equal(findBlockedSite('https://www.google.com/search?q=bilibili.com', sites), null);
});

// ---------------------------------------------------------------------------
// 运行时行为：用假的 chrome API 和 fetch 驱动真实的 background.js
// ---------------------------------------------------------------------------

function makeEvent() {
  const listeners = [];
  return { listeners, addListener: (fn) => listeners.push(fn) };
}

function fakeBrowser({ tabs, respond }) {
  const updates = [];
  const chrome = {
    runtime: {
      id: 'test-extension',
      getURL: (p) => `chrome-extension://test-extension/${p}`,
      onMessage: makeEvent(),
      onInstalled: makeEvent(),
      onStartup: makeEvent(),
    },
    alarms: {
      get: async () => undefined,
      create: () => {},
      onAlarm: makeEvent(),
    },
    storage: { session: { get: async () => ({}), set: async () => {} } },
    tabs: {
      query: async () => tabs,
      update: async (id, props) => {
        updates.push({ id, url: props.url });
      },
      onUpdated: makeEvent(),
      onRemoved: makeEvent(),
    },
    webNavigation: { onBeforeNavigate: makeEvent() },
  };
  const fetch = async () => respond();
  return { chrome, fetch, updates };
}

const ok = (body) => ({ ok: true, json: async () => body });

test('专注中：已打开的黑名单标签页被跳转，其他标签页不动', async () => {
  const tabs = [
    { id: 1, url: 'https://www.bilibili.com/video/1' },
    { id: 2, url: 'https://www.wikipedia.org/' },
    { id: 3, url: 'https://t.bilibili.com/' },
    { id: 4, url: 'chrome://newtab/' },
  ];
  const fake = fakeBrowser({ tabs, respond: () => ok({ focusing: true, blocked_sites: ['bilibili.com', 'www.bilibili.com'] }) });
  const ctx = loadBackground({ chrome: fake.chrome, fetch: fake.fetch });
  await ctx.refresh();

  assert.deepEqual(fake.updates.map((u) => u.id).sort(), [1, 3]);
  const target = new URL(fake.updates.find((u) => u.id === 1).url);
  assert.equal(target.protocol, 'chrome-extension:');
  assert.equal(target.pathname, '/blocked.html');
  assert.equal(target.searchParams.get('site'), 'www.bilibili.com');
  assert.equal(target.searchParams.get('from'), 'https://www.bilibili.com/video/1');
});

test('专注中：新导航立即被拦截', async () => {
  const fake = fakeBrowser({ tabs: [], respond: () => ok({ focusing: true, blocked_sites: ['zhihu.com'] }) });
  const ctx = loadBackground({ chrome: fake.chrome, fetch: fake.fetch });
  await ctx.refresh();

  const [onBeforeNavigate] = fake.chrome.webNavigation.onBeforeNavigate.listeners;
  onBeforeNavigate({ tabId: 7, frameId: 0, url: 'https://www.zhihu.com/question/1' });
  onBeforeNavigate({ tabId: 8, frameId: 3, url: 'https://www.zhihu.com/embed' }); // 子 frame 不处理
  onBeforeNavigate({ tabId: 9, frameId: 0, url: 'https://example.com/' });
  await ctx.currentStatus();
  await new Promise((r) => setImmediate(r));

  assert.deepEqual(fake.updates.map((u) => u.id), [7]);
});

test('未专注：什么都不做', async () => {
  const tabs = [{ id: 1, url: 'https://www.bilibili.com/' }];
  const fake = fakeBrowser({ tabs, respond: () => ok({ focusing: false, blocked_sites: ['bilibili.com'] }) });
  const ctx = loadBackground({ chrome: fake.chrome, fetch: fake.fetch });
  await ctx.refresh();
  fake.chrome.webNavigation.onBeforeNavigate.listeners[0]({ tabId: 1, frameId: 0, url: 'https://bilibili.com/' });
  await ctx.currentStatus();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(fake.updates, []);
});

test('App 未运行：安静放行（fail open）', async () => {
  const tabs = [{ id: 1, url: 'https://www.bilibili.com/' }];
  const fake = fakeBrowser({
    tabs,
    respond: () => {
      throw new TypeError('Failed to fetch');
    },
  });
  const errors = [];
  const ctx = loadBackground({
    chrome: fake.chrome,
    fetch: fake.fetch,
    console: { ...console, error: (...a) => errors.push(a) },
  });
  const st = await ctx.refresh();
  assert.equal(st.focusing, false);
  fake.chrome.webNavigation.onBeforeNavigate.listeners[0]({ tabId: 1, frameId: 0, url: 'https://bilibili.com/' });
  await ctx.currentStatus();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(fake.updates, []);
  assert.deepEqual(errors, []);
});

test('Safari Xcode 项目里的资源与 extension/ 保持同步', () => {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'sync-extension.mjs'), '--check'], {
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('拦截页询问状态时返回 focusing', async () => {
  const fake = fakeBrowser({ tabs: [], respond: () => ok({ focusing: true, blocked_sites: [] }) });
  loadBackground({ chrome: fake.chrome, fetch: fake.fetch });
  const [onMessage] = fake.chrome.runtime.onMessage.listeners;
  const reply = await new Promise((resolve) => {
    const keepOpen = onMessage({ type: 'pomodoro:getStatus' }, {}, resolve);
    assert.equal(keepOpen, true);
  });
  assert.equal(reply.focusing, true);
  assert.equal(onMessage({ type: 'something-else' }, {}, () => {}), undefined);
});

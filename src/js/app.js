/**
 * 入口：加载数据、连接后端事件、三页导航（专注中锁定在专注页）。
 */
import { api } from './api.js';
import { on, EVENTS } from './events.js';
import * as store from './store.js';
import * as focus from './views/focus.js';
import * as statsView from './views/stats.js';
import * as settings from './views/settings.js';
import { playChime, notify } from './feedback.js';
import { $$, toast, errorText } from './dom.js';
import { dateKey } from './stats.js';

let view = 'focus';
let lastState = 'idle';

function showView(name) {
  const status = store.get('status');
  if (name !== 'focus' && status && status.state !== 'idle') return;
  view = name;
  document.body.dataset.view = name;
  $$('.tab').forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.view === name)));
  $$('.view').forEach((el) => {
    el.hidden = el.id !== `view-${name}`;
  });
  statsView.setVisible(name === 'stats');
  if (name === 'settings') settings.onShow();
  window.scrollTo(0, 0);
}

function applyStatus(status) {
  const state = (status && status.state) || 'idle';
  document.body.classList.remove('state-idle', 'state-working', 'state-breaking', 'state-paused');
  document.body.classList.add(`state-${state}`);
  const locked = state !== 'idle';
  $$('.tab').forEach((tab) => {
    tab.disabled = locked && tab.dataset.view !== 'focus';
    tab.title = tab.disabled ? '专注结束后可查看' : '';
  });
  if (locked && view !== 'focus') showView('focus');
  // 一轮结束（含紧急取消）后后端会改配置里的已用次数、上次时长，重新读取
  if (state === 'idle' && lastState !== 'idle') store.loadConfig().catch(() => {});
  lastState = state;
}

async function connectEvents() {
  const soundOn = () => (store.get('config') || {}).play_completion_sound !== false;
  await Promise.all([
    on(EVENTS.timerUpdate, (status) => store.set('status', status)),
    on(EVENTS.workComplete, (record) => {
      if (soundOn()) playChime();
      notify('番茄专注', '这一个番茄完成了，休息一下吧');
      if (record && record.id) {
        store.upsertRecord(record);
        focus.showReflection(record);
      }
    }),
    on(EVENTS.breakComplete, () => {
      if (soundOn()) playChime();
      notify('番茄专注', '休息结束，准备好下一个番茄了吗？');
    }),
    on(EVENTS.historyUpdated, () => store.loadHistory()),
    on(EVENTS.plannerUpdated, (planner) => {
      if (planner && Array.isArray(planner.tasks)) store.set('planner', planner);
      else store.loadPlanner();
    }),
  ]);
}

/** 跨过 0 点时让「今天」相关的视图重算 */
function watchMidnight() {
  let day = dateKey(new Date());
  setInterval(() => {
    const now = dateKey(new Date());
    if (now !== day) {
      day = now;
      store.touch('history');
      store.touch('planner');
    }
  }, 60 * 1000);
}

async function init() {
  // 浏览器里直接打开 src/ 调试时，用假数据模拟后端（Tauri 内永远不会加载）
  if (location.protocol.startsWith('http') && !window.__TAURI__) {
    await import('../dev/mock-tauri.js');
  }
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => showView(tab.dataset.view)));
  store.subscribe('status', applyStatus);

  focus.init();
  statsView.init();
  settings.init();

  try {
    await store.loadConfig();
  } catch (err) {
    toast(`读取配置失败：${errorText(err)}`);
  }
  await Promise.all([
    store.loadPlatform(),
    store.loadStatus(),
    store.loadHistory(),
    store.loadPlanner(),
    api.getBackground().then((b64) => store.set('background', b64 || null), () => {}),
  ]);

  try {
    await connectEvents();
  } catch (err) {
    toast(`无法连接后端：${errorText(err)}`);
  }
  watchMidnight();

  try {
    if ('Notification' in window && Notification.permission === 'default') {
      const pending = Notification.requestPermission();
      if (pending && pending.catch) pending.catch(() => {});
    }
  } catch {
    /* WebView 不支持网页通知时忽略 */
  }
}

init();

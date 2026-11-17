/**
 * 设置页：计时参数、每日目标、科目标签、背景图、App/网站黑名单。
 * 所有修改即时保存。
 */
import { api, pickImageFile } from '../api.js';
import * as store from '../store.js';
import { formatMinutes } from '../stats.js';
import { $, $$, h, toast, errorText, letterAvatar } from '../dom.js';

let installedApps = [];
let activeSuggestion = -1;
const iconCache = new Map();

const config = () => store.get('config');

async function save(patch) {
  try {
    await store.saveConfig({ ...config(), ...patch });
  } catch (err) {
    toast(`保存失败：${errorText(err)}`);
  }
}

const savePomodoro = (patch) => save({ pomodoro: { ...config().pomodoro, ...patch } });

/* ---------------- App 图标（失败一律回退首字母头像） ---------------- */

function appIcon(name) {
  const avatar = letterAvatar(name);
  if (!iconCache.has(name)) {
    iconCache.set(name, api.getAppIcon(name).then((b64) => b64 || null, () => null));
  }
  iconCache.get(name).then((b64) => {
    if (!b64 || !avatar.isConnected) return;
    const img = h('img', { class: 'app-icon', alt: '', src: `data:image/png;base64,${b64}` });
    img.addEventListener('error', () => img.replaceWith(letterAvatar(name)));
    avatar.replaceWith(img);
  });
  return avatar;
}

/* ---------------- 计时 ---------------- */

const RANGES = [
  { id: 'work-minutes', get: (c) => c.pomodoro.work_minutes, fmt: (v) => `${v} 分钟`, save: (v) => savePomodoro({ work_minutes: v }) },
  { id: 'break-minutes', get: (c) => c.pomodoro.break_minutes, fmt: (v) => `${v} 分钟`, save: (v) => savePomodoro({ break_minutes: v }) },
  { id: 'daily-goal', get: (c) => c.daily_goal_minutes, fmt: (v) => formatMinutes(v * 60), save: (v) => save({ daily_goal_minutes: v }) },
  { id: 'emergency-limit', get: (c) => c.pomodoro.emergency_cancel_limit, fmt: (v) => `${v} 次`, save: (v) => savePomodoro({ emergency_cancel_limit: v }) },
];

function renderRanges(c) {
  RANGES.forEach((r) => {
    const input = $(`#${r.id}`);
    if (document.activeElement !== input) input.value = r.get(c);
    $(`#${r.id}-value`).textContent = r.fmt(Number(input.value));
  });
  $('#sound-toggle').checked = c.play_completion_sound !== false;
}

/* ---------------- 列表 ---------------- */

function removeButton(label, onclick) {
  return h('button', { class: 'link', type: 'button', 'aria-label': label, onclick }, '移除');
}

function renderLabels(c) {
  const box = $('#label-list');
  if (!c.labels.length) {
    box.replaceChildren(h('span', { class: 'empty' }, '还没有科目标签。'));
    return;
  }
  box.replaceChildren(...c.labels.map((label) => h('span', { class: 'tag' }, label,
    h('button', {
      class: 'tag-remove',
      type: 'button',
      'aria-label': `删除科目 ${label}`,
      onclick: () => save({ labels: config().labels.filter((x) => x !== label) }),
    }, '×'))));
}

function renderApps(c) {
  const list = $('#app-list');
  if (!c.blocked_apps.length) {
    list.replaceChildren(h('li', { class: 'empty' }, '暂无屏蔽的 App。'));
    return;
  }
  list.replaceChildren(...c.blocked_apps.map((name) => h('li', { class: 'row' },
    appIcon(name),
    h('span', { class: 'row-name', title: name }, name),
    removeButton(`移除 ${name}`, () => save({ blocked_apps: config().blocked_apps.filter((x) => x !== name) })),
  )));
}

function renderSites(c) {
  const list = $('#site-list');
  if (!c.blocked_sites.length) {
    list.replaceChildren(h('li', { class: 'empty' }, '暂无屏蔽的网站。'));
    return;
  }
  list.replaceChildren(...c.blocked_sites.map((site) => h('li', { class: 'row' },
    h('span', { class: 'row-name', title: site }, site),
    removeButton(`移除 ${site}`, () => save({ blocked_sites: config().blocked_sites.filter((x) => x !== site) })),
  )));
}

function render() {
  const c = config();
  if (!c) return;
  renderRanges(c);
  renderLabels(c);
  renderApps(c);
  renderSites(c);
}

/* ---------------- App 搜索补全 ---------------- */

function hideSuggestions() {
  const box = $('#app-suggestions');
  box.hidden = true;
  box.replaceChildren();
  $('#app-input').setAttribute('aria-expanded', 'false');
  activeSuggestion = -1;
}

async function addApp(name) {
  const value = name.trim();
  if (!value) return;
  const match = installedApps.find((a) => a.toLowerCase() === value.toLowerCase());
  const strict = store.get('platform') === 'macos' && installedApps.length > 0;
  if (!match && strict) {
    toast('未找到该应用，请从下拉列表中选择');
    return;
  }
  const app = match || value;
  if (config().blocked_apps.includes(app)) {
    toast('该 App 已在黑名单中');
    return;
  }
  $('#app-input').value = '';
  hideSuggestions();
  await save({ blocked_apps: [...config().blocked_apps, app] });
}

function showSuggestions() {
  const query = $('#app-input').value.trim().toLowerCase();
  activeSuggestion = -1;
  if (!query) return hideSuggestions();
  const blocked = new Set(config().blocked_apps);
  const matches = installedApps.filter((a) => !blocked.has(a) && a.toLowerCase().includes(query)).slice(0, 8);
  if (!matches.length) return hideSuggestions();
  const box = $('#app-suggestions');
  box.replaceChildren(...matches.map((app) => h('li', {
    class: 'suggestion',
    role: 'option',
    dataset: { app },
    onmousedown: (e) => e.preventDefault(),
    onclick: () => addApp(app),
  }, appIcon(app), h('span', { class: 'row-name' }, app))));
  box.hidden = false;
  $('#app-input').setAttribute('aria-expanded', 'true');
}

function onAppKeydown(e) {
  const items = $$('.suggestion', $('#app-suggestions'));
  const open = !$('#app-suggestions').hidden && items.length > 0;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!open) return;
    e.preventDefault();
    const delta = e.key === 'ArrowDown' ? 1 : -1;
    activeSuggestion = Math.max(0, Math.min(items.length - 1, activeSuggestion + delta));
    items.forEach((el, i) => el.classList.toggle('active', i === activeSuggestion));
    items[activeSuggestion].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    addApp(open && activeSuggestion >= 0 ? items[activeSuggestion].dataset.app : e.target.value);
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
}

/* ---------------- 网站 ---------------- */

function normalizeSite(raw) {
  const value = raw.trim().toLowerCase();
  if (!value) return '';
  try {
    const host = new URL(value.includes('://') ? value : `http://${value}`).hostname;
    return host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/* ---------------- 背景图 ---------------- */

function showBackground(base64) {
  const img = $('#bg-preview');
  img.hidden = !base64;
  if (base64) img.src = `data:image/jpeg;base64,${base64}`;
  else img.removeAttribute('src');
  $('#btn-clear-bg').hidden = !base64;
}

async function chooseBackground() {
  try {
    const path = await pickImageFile();
    if (!path) return;
    store.set('background', await api.setBackground(path));
  } catch (err) {
    toast(`设置背景失败：${errorText(err)}`);
  }
}

async function clearBackground() {
  try {
    await api.clearBackground();
    store.set('background', null);
  } catch (err) {
    toast(`恢复默认失败：${errorText(err)}`);
  }
}

/* ---------------- 平台差异 ---------------- */

function applyPlatform(platform) {
  $$('[data-platform]').forEach((el) => {
    el.hidden = el.dataset.platform !== platform;
  });
}

/* ---------------- 入口 ---------------- */

export function init() {
  RANGES.forEach((r) => {
    const input = $(`#${r.id}`);
    input.addEventListener('input', () => {
      $(`#${r.id}-value`).textContent = r.fmt(Number(input.value));
    });
    input.addEventListener('change', () => r.save(Number(input.value)));
  });
  $('#sound-toggle').addEventListener('change', (e) => save({ play_completion_sound: e.target.checked }));

  $('#label-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#label-input');
    const name = input.value.trim();
    if (!name) return;
    if (config().labels.includes(name)) {
      toast('该科目已存在');
      return;
    }
    input.value = '';
    save({ labels: [...config().labels, name] });
  });

  $('#app-input').addEventListener('input', showSuggestions);
  $('#app-input').addEventListener('keydown', onAppKeydown);
  $('#app-input').addEventListener('blur', () => setTimeout(hideSuggestions, 120));
  $('#btn-add-app').addEventListener('click', () => addApp($('#app-input').value));

  $('#site-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#site-input');
    const site = normalizeSite(input.value);
    if (!site || !site.includes('.')) {
      toast('请输入有效的域名，如 bilibili.com');
      return;
    }
    if (config().blocked_sites.includes(site)) {
      toast('该网站已在黑名单中');
      return;
    }
    input.value = '';
    save({ blocked_sites: [...config().blocked_sites, site] });
  });

  $('#btn-choose-bg').addEventListener('click', chooseBackground);
  $('#btn-clear-bg').addEventListener('click', clearBackground);

  store.subscribe('config', render);
  store.subscribe('background', showBackground);
  store.subscribe('platform', applyPlatform);
  applyPlatform(store.get('platform'));
  render();
}

/** 首次打开设置页时再加载较慢的数据 */
let loaded = false;
export async function onShow() {
  if (loaded) return;
  loaded = true;
  api.getConfigPath().then((p) => {
    $('#config-path').textContent = p || '';
  }, () => {});
  try {
    installedApps = (await api.getInstalledApps()) || [];
  } catch {
    installedApps = [];
  }
}

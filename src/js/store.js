/**
 * 全局状态：配置、计时状态、历史记录、今日计划、平台。
 * 视图通过 subscribe() 订阅；后端未就绪（命令报错）时退回空数据，不让界面崩溃。
 */
import { api } from './api.js';

export const DEFAULT_LABELS = ['数学', '英语', '专业课', '编程', '阅读'];
export const DEFAULT_GOAL_MINUTES = 120;

const state = {
  config: null,
  status: null,
  history: [],
  historyError: false,
  planner: { tasks: [] },
  plannerError: false,
  platform: guessPlatform(),
};
const listeners = new Map();

export function get(key) {
  return state[key];
}

export function set(key, value) {
  state[key] = value;
  (listeners.get(key) || []).forEach((fn) => fn(value));
}

/** 重新通知订阅者（如跨过 0 点时让视图重算「今天」） */
export function touch(key) {
  set(key, state[key]);
}

export function subscribe(key, fn) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(fn);
  return () => listeners.get(key).delete(fn);
}

function guessPlatform() {
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos';
  return 'linux';
}

/** 旧配置缺新字段时补默认值 */
export function withDefaults(config) {
  const c = config ? { ...config } : {};
  c.pomodoro = {
    work_minutes: 25,
    break_minutes: 5,
    emergency_cancel_limit: 2,
    last_focus_duration: 25,
    emergency_used_count: 0,
    emergency_reset_month: '',
    ...(c.pomodoro || {}),
  };
  c.blocked_apps = Array.isArray(c.blocked_apps) ? c.blocked_apps : [];
  c.blocked_sites = Array.isArray(c.blocked_sites) ? c.blocked_sites : [];
  c.schedules = Array.isArray(c.schedules) ? c.schedules : [];
  c.mode = c.mode || 'manual';
  if (c.play_completion_sound === undefined) c.play_completion_sound = true;
  const goal = Number(c.daily_goal_minutes);
  c.daily_goal_minutes = Number.isFinite(goal) && goal > 0 ? goal : DEFAULT_GOAL_MINUTES;
  c.labels = Array.isArray(c.labels) ? c.labels : [...DEFAULT_LABELS];
  return c;
}

export async function loadConfig() {
  try {
    set('config', withDefaults(await api.getConfig()));
  } catch (err) {
    set('config', withDefaults(null));
    throw err;
  }
}

/** 先更新本地再保存；失败时抛出，由调用方提示 */
export async function saveConfig(next) {
  const config = withDefaults(next);
  set('config', config);
  await api.saveConfig(config);
}

export async function loadPlatform() {
  try {
    const p = await api.getPlatform();
    if (p) set('platform', p);
  } catch {
    /* 后端旧版本无此命令：沿用 UA 推断 */
  }
}

export async function loadStatus() {
  try {
    set('status', await api.getTimerStatus());
  } catch {
    set('status', { state: 'idle', remaining_seconds: 0, total_seconds: 0, emergency_remaining: 0 });
  }
}

export async function loadHistory() {
  try {
    const list = await api.getHistory();
    state.historyError = false;
    set('history', Array.isArray(list) ? list : []);
  } catch {
    state.historyError = true;
    set('history', []);
  }
}

/** 收到 timer-work-complete 时先把记录放进本地，避免等待 history-updated */
export function upsertRecord(record) {
  if (!record || !record.id) return;
  const list = state.history.filter((r) => r.id !== record.id);
  list.push(record);
  list.sort((a, b) => a.started_at - b.started_at);
  set('history', list);
}

export async function setRecordNote(id, note) {
  await api.setRecordNote(id, note);
  set('history', state.history.map((r) => (r.id === id ? { ...r, note } : r)));
}

export async function loadPlanner() {
  try {
    const p = await api.getPlanner();
    state.plannerError = false;
    set('planner', { tasks: Array.isArray(p?.tasks) ? p.tasks : [] });
  } catch {
    state.plannerError = true;
    set('planner', { tasks: [] });
  }
}

/** 先更新本地再保存；失败时抛出，由调用方提示 */
export async function savePlanner(planner) {
  set('planner', planner);
  await api.savePlanner(planner);
}

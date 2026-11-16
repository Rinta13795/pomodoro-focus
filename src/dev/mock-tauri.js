/**
 * 开发用：在普通浏览器里模拟 window.__TAURI__，生成约 300 天假历史、计划和配置。
 * 只会在本机地址（localhost / 127.0.0.1）打开、且没有 Tauri 注入时被 app.js / overlay.js 动态加载（见 api.js 的 shouldUseBrowserMock）。
 *
 * URL 参数：
 *   ?platform=windows   模拟 Windows（get_platform）
 *   ?fail=history,planner  让对应命令报错，检查空状态
 *   ?fast               计时 60 倍速
 *   ?state=working      打开时已在专注中（用于预览 overlay.html）
 */
const params = new URLSearchParams(location.search);
const PLATFORM = params.get('platform') || 'macos';
const FAIL = new Set((params.get('fail') || '').split(',').filter(Boolean));
const SPEED = params.has('fast') ? 60 : 1;

/* ---------------- 假数据 ---------------- */

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261117);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nowSec = () => Math.floor(Date.now() / 1000);

const LABELS = ['数学', '英语', '专业课', '编程', '阅读'];
const NOTES = ['做完 3.2 节课后题', '背了 60 个单词', '看完第 5 章', '调通了链表反转', null, null, null];

const config = {
  pomodoro: {
    work_minutes: 25,
    break_minutes: 5,
    emergency_cancel_limit: 2,
    last_focus_duration: 25,
    emergency_used_count: 1,
    emergency_reset_month: keyOf(new Date()).slice(0, 7),
  },
  blocked_apps: ['bilibili', 'QQ', 'WeChat', 'Steam'],
  blocked_sites: ['bilibili.com', 'www.bilibili.com', 'douyin.com', 'weibo.com'],
  play_completion_sound: true,
  custom_bg_path: null,
  daily_goal_minutes: 120,
  labels: [...LABELS],
};

let seq = 0;
function makeRecord(start, minutes, extra = {}) {
  const focused = minutes * 60;
  return {
    id: `r${++seq}`,
    started_at: start,
    ended_at: start + focused,
    planned_seconds: focused,
    focused_seconds: focused,
    completed: true,
    label: pick(LABELS),
    task_id: null,
    note: pick(NOTES),
    ...extra,
  };
}

const history = [];
(function generateHistory() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let back = 300; back >= 1; back--) {
    const day = new Date(today);
    day.setDate(day.getDate() - back);
    // 近 14 天：连续学习，第 4 天前留一个休息日
    const recent = back <= 14;
    if (recent && back === 4) continue;
    if (!recent && rand() < 0.3) continue;
    const count = recent ? 2 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 6);
    let t = day.getTime() / 1000 + (8 + Math.floor(rand() * 3)) * 3600;
    for (let i = 0; i < count; i++) {
      const minutes = rand() < 0.7 ? 25 : 45;
      const completed = rand() > 0.1;
      const focused = completed ? minutes : 5 + Math.floor(rand() * 15);
      history.push(makeRecord(t, focused, { completed, planned_seconds: minutes * 60 }));
      t += (focused + 10 + Math.floor(rand() * 90)) * 60;
    }
  }
  // 一条跨午夜记录（前天 23:50 → 昨天 00:15）
  const late = new Date(today);
  late.setDate(late.getDate() - 2);
  late.setHours(23, 50, 0, 0);
  history.push(makeRecord(late.getTime() / 1000, 25, { label: '编程', note: '熬夜调 bug' }));
  // 今天两条
  const morning = today.getTime() / 1000 + 9 * 3600;
  history.push(makeRecord(morning, 25, { label: '数学', note: '高数 3.1 例题' }));
  history.push(makeRecord(morning + 35 * 60, 25, { label: '英语', note: null }));
  history.sort((a, b) => a.started_at - b.started_at);
})();

const todayKey = () => keyOf(new Date());
const daysAgoKey = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return keyOf(d);
};

let planner = {
  tasks: [
    { id: 't1', title: '高数 3.2 节课后题', estimate: 3, done_pomodoros: 1, done: false, created_at: nowSec() - 7200, date: todayKey() },
    { id: 't2', title: '英语阅读真题 2 篇', estimate: 2, done_pomodoros: 1, done: false, created_at: nowSec() - 7000, date: todayKey() },
    { id: 't3', title: '整理数据结构笔记', estimate: 1, done_pomodoros: 1, done: true, created_at: nowSec() - 6000, date: todayKey() },
    { id: 't4', title: '操作系统实验二', estimate: 4, done_pomodoros: 2, done: false, created_at: nowSec() - 90000, date: daysAgoKey(1) },
    { id: 't5', title: '背单词 List 7', estimate: 1, done_pomodoros: 0, done: false, created_at: nowSec() - 200000, date: daysAgoKey(3) },
  ],
};

/* ---------------- 事件 ---------------- */

const listeners = new Map();
function emit(name, payload) {
  (listeners.get(name) || []).forEach((fn) => fn({ event: name, payload }));
}

/* ---------------- 计时 ---------------- */

let status = {
  state: 'idle',
  remaining_seconds: 0,
  total_seconds: 0,
  emergency_remaining: 2,
  work_minutes: 25,
  break_minutes: 5,
  label: null,
  task_id: null,
  started_at: null,
};
let ticker = null;

function setState(patch) {
  status = { ...status, ...patch };
  emit('timer-update', { ...status });
}

function finishWork(completed) {
  const focused = status.total_seconds - status.remaining_seconds;
  const record = {
    id: `r${++seq}`,
    started_at: status.started_at,
    ended_at: nowSec(),
    planned_seconds: status.total_seconds,
    focused_seconds: focused,
    completed,
    label: status.label,
    task_id: status.task_id,
    note: null,
  };
  if (completed || focused >= 60) {
    history.push(record);
    emit('history-updated');
  }
  if (completed && status.task_id) {
    planner = {
      tasks: planner.tasks.map((t) => (t.id === status.task_id ? { ...t, done_pomodoros: t.done_pomodoros + 1 } : t)),
    };
    emit('planner-updated', planner);
  }
  return record;
}

function tick() {
  if (status.state !== 'working' && status.state !== 'breaking') return;
  const left = status.remaining_seconds - SPEED;
  if (left > 0) return setState({ remaining_seconds: left });
  if (status.state === 'working') {
    setState({ remaining_seconds: 0 });
    const record = finishWork(true);
    emit('timer-work-complete', record);
    setState({ state: 'breaking', remaining_seconds: status.break_minutes * 60, total_seconds: status.break_minutes * 60 });
  } else {
    stop();
    emit('timer-break-complete');
  }
}

function stop() {
  clearInterval(ticker);
  ticker = null;
  setState({ state: 'idle', remaining_seconds: 0, total_seconds: 0, label: null, task_id: null, started_at: null });
}

/* ---------------- 命令 ---------------- */

const tinyImage = (seed) => {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = `hsl(${(seed * 47) % 360} 30% 55%)`;
  g.fillRect(0, 0, 32, 32);
  return c.toDataURL('image/png').split(',')[1];
};

const commands = {
  get_config: () => structuredClone(config),
  save_config: ({ config: next }) => {
    Object.assign(config, structuredClone(next));
  },
  get_config_path: () => (PLATFORM === 'windows'
    ? 'C:\\Users\\student\\AppData\\Roaming\\pomodoro-focus\\config.json'
    : '~/Library/Application Support/pomodoro-focus/config.json'),
  get_platform: () => PLATFORM,

  start_focus: ({ minutes, seconds = 0, label = null, taskId = null }) => {
    const total = minutes * 60 + seconds;
    config.pomodoro.last_focus_duration = minutes;
    setState({
      state: 'working',
      remaining_seconds: total,
      total_seconds: total,
      label,
      task_id: taskId,
      started_at: nowSec(),
      emergency_remaining: config.pomodoro.emergency_cancel_limit - config.pomodoro.emergency_used_count,
    });
    clearInterval(ticker);
    ticker = setInterval(tick, 1000);
    return { ...status };
  },
  pause_focus: () => {
    setState({ previous_state: status.state, state: 'paused' });
    return { ...status };
  },
  resume_focus: () => {
    setState({ state: status.previous_state || 'working' });
    return { ...status };
  },
  stop_focus: () => {
    if (status.state === 'working') finishWork(false);
    stop();
    return { ...status };
  },
  emergency_cancel: () => {
    if (status.emergency_remaining <= 0) throw '本月紧急取消次数已用完';
    config.pomodoro.emergency_used_count += 1;
    finishWork(false);
    status.emergency_remaining -= 1;
    stop();
    return { ...status };
  },
  get_timer_status: () => ({ ...status }),

  get_history: () => structuredClone(history),
  set_record_note: ({ id, note }) => {
    const r = history.find((x) => x.id === id);
    if (!r) throw '记录不存在';
    r.note = note;
    emit('history-updated');
  },
  get_planner: () => structuredClone(planner),
  save_planner: ({ planner: next }) => {
    planner = structuredClone(next);
  },

  get_installed_apps: () => ['Anki', 'bilibili', 'Chrome', 'Discord', 'Microsoft Edge', 'Notion', 'QQ', 'QQ音乐', 'Steam', 'WeChat', 'Xcode', '网易云音乐'],
  // 模拟部分图标读取失败（Windows 上常见）
  get_app_icon: ({ appName }) => {
    if (PLATFORM === 'windows' || /^[A-M]/i.test(appName)) throw '无法读取图标';
    return tinyImage(appName.length);
  },

  set_background: () => tinyImage(7),
  clear_background: () => null,
  get_background: () => null,
  hide_overlay_window: () => null,
  close_overlay_window: () => null,
};

window.__TAURI__ = {
  core: {
    async invoke(cmd, args = {}) {
      await new Promise((r) => setTimeout(r, 30));
      if (FAIL.has(cmd.replace(/^get_/, '')) || FAIL.has(cmd)) throw `mock: ${cmd} 未实现`;
      const fn = commands[cmd];
      if (!fn) throw `mock: 未知命令 ${cmd}`;
      return fn(args);
    },
  },
  event: {
    async listen(name, handler) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
      return () => listeners.get(name).delete(handler);
    },
  },
  dialog: {
    async open() {
      return '/mock/background.jpg';
    },
  },
};

if (params.get('state') === 'working') commands.start_focus({ minutes: 25, label: '数学' });

// 方便在控制台手动触发：__mock.emit('blocked-app-detected', 'WeChat')
window.__mock = { emit, history, get planner() { return planner; }, get status() { return status; } };

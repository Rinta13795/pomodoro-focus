/**
 * 专注页：今日进度环 + 连续天数、计时器（预设 / 数字选择器 / 科目 / 目标任务）、
 * 完成后的一句话复盘、今日计划。
 */
import { api } from '../api.js';
import * as store from '../store.js';
import * as planner from './planner.js';
import { createDigitPicker } from './digit-picker.js';
import { summarize, goalMessage, formatMinutes, dateKey } from '../stats.js';
import { $, h, toast, confirmDialog, errorText, prefs } from '../dom.js';

const PRESETS = [25, 45, 60, 90];
const LABEL_KEY = 'focus.label';
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

let picker;
let selectedLabel = prefs.get(LABEL_KEY, null);
let durationSet = false;
let starting = false;

const isFocusing = (s) => s && (s.state === 'working' || (s.state === 'paused' && s.previous_state !== 'breaking'));

/* ---------------- 今日进度 ---------------- */

/** 今日已专注秒数：历史 + 正在进行的这一段 */
function todaySeconds(summary) {
  let seconds = summary.todayTotal.seconds;
  const s = store.get('status');
  if (isFocusing(s)) {
    const startedToday = !s.started_at || dateKey(s.started_at) === summary.today;
    if (startedToday) seconds += Math.max(0, (s.total_seconds || 0) - (s.remaining_seconds || 0));
  }
  return seconds;
}

/** 每秒的 timer-update 都会重绘，这里按「历史数组 + 日期」缓存汇总 */
let cache = { history: null, day: '', summary: null };
function currentSummary(now) {
  const history = store.get('history');
  const day = dateKey(now);
  if (cache.history !== history || cache.day !== day) {
    cache = { history, day, summary: summarize(history, now) };
  }
  return cache.summary;
}

function renderToday() {
  const config = store.get('config');
  if (!config) return;
  const now = new Date();
  const summary = currentSummary(now);
  const seconds = todaySeconds(summary);
  const goal = config.daily_goal_minutes;
  const pct = Math.min(1, seconds / (goal * 60));

  $('#today-date').textContent = `${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${WEEKDAYS[now.getDay()]}`;
  $('#today-minutes').textContent = formatMinutes(seconds);
  $('#today-goal').textContent = formatMinutes(goal * 60);
  $('#ring-bar').setAttribute('stroke-dasharray', `${(pct * 100).toFixed(2)} 100`);
  const angle = pct * 2 * Math.PI - Math.PI / 2;
  $('#ring-tip').setAttribute('cx', (40 + 34 * Math.cos(angle)).toFixed(2));
  $('#ring-tip').setAttribute('cy', (40 + 34 * Math.sin(angle)).toFixed(2));
  $('#ring-text').textContent = `${Math.round((seconds / (goal * 60)) * 100)}%`;

  const { current, todayCounts } = summary.streak;
  const streakTag = $('#streak-tag');
  // 中断后不提「失去了 N 天」，只说欢迎回来（见 docs/DESIGN.md）
  const hasHistory = (store.get('history') || []).length > 0;
  streakTag.textContent = current > 0 ? `连续 ${current} 天` : hasHistory ? '欢迎回来' : '开始第一天';
  $('#today-pomos').textContent = `${summary.todayTotal.pomodoros} 个番茄`;

  let msg = goalMessage(seconds, goal);
  if (current > 0 && !todayCounts) msg += '；今天专注满 25 分钟，连续就能延续';
  $('#goal-msg').textContent = msg;
}

/* ---------------- 计时 ---------------- */

function emergencyRemaining(status, config) {
  if (status && status.state !== 'idle') return status.emergency_remaining || 0;
  // 空闲时后端给的是配置总数，这里按当月已用次数算
  const p = config.pomodoro;
  const month = dateKey(new Date()).slice(0, 7);
  const used = p.emergency_reset_month === month ? p.emergency_used_count || 0 : 0;
  return Math.max(0, (p.emergency_cancel_limit ?? 2) - used);
}

function renderStatus() {
  const status = store.get('status') || { state: 'idle' };
  const config = store.get('config');
  const state = status.state || 'idle';
  const idle = state === 'idle';

  picker.setEditable(idle);
  if (!idle) picker.showRemaining(status.remaining_seconds || 0);

  const target = status.task_id
    ? (store.get('planner').tasks || []).find((t) => t.id === status.task_id)
    : null;
  const parts = {
    idle: ['准备开始'],
    working: ['专注中', status.label, target && target.title],
    paused: ['已暂停'],
    breaking: ['休息中', '起来走走，喝口水'],
  }[state] || ['准备开始'];
  $('#timer-status').textContent = parts.filter(Boolean).join(' · ');

  const btnStart = $('#btn-start');
  btnStart.hidden = !idle;
  if (!starting) {
    btnStart.disabled = false;
    btnStart.textContent = '开始专注';
  }
  $('#btn-skip-break').hidden = state !== 'breaking';

  const remaining = config ? emergencyRemaining(status, config) : 0;
  const emergency = $('#btn-emergency');
  emergency.disabled = !(state === 'working' || state === 'paused') || remaining <= 0;
  emergency.textContent = remaining > 0 ? `紧急取消 · 本月剩余 ${remaining} 次` : '本月紧急取消次数已用完';

  renderToday();
}

function renderPresets() {
  const { minutes, seconds } = picker.getDuration();
  const box = $('#preset-chips');
  box.replaceChildren(...PRESETS.map((m) => h('button', {
    class: 'chip',
    type: 'button',
    'aria-pressed': String(minutes === m && seconds === 0),
    onclick: () => {
      picker.setDuration(m, 0);
      renderPresets();
    },
  }, `${m} 分钟`)));
}

function renderLabels() {
  const config = store.get('config');
  if (!config) return;
  const labels = config.labels;
  if (selectedLabel && !labels.includes(selectedLabel)) selectedLabel = null;

  const chips = labels.map((label) => h('button', {
    class: 'chip',
    type: 'button',
    'aria-pressed': String(label === selectedLabel),
    onclick: () => {
      selectedLabel = selectedLabel === label ? null : label;
      prefs.set(LABEL_KEY, selectedLabel);
      renderLabels();
    },
  }, label));

  const add = h('button', { class: 'chip', type: 'button', title: '添加科目', onclick: () => {
    const input = h('input', { class: 'chip-input', maxlength: '12', placeholder: '新科目', 'aria-label': '新科目' });
    let done = false;
    const finish = async (save) => {
      if (done) return;
      done = true;
      const name = input.value.trim();
      if (save && name) {
        const cfg = store.get('config');
        if (!cfg.labels.includes(name)) {
          try {
            await store.saveConfig({ ...cfg, labels: [...cfg.labels, name] });
          } catch (err) {
            toast(`保存科目失败：${errorText(err)}`);
          }
        }
        selectedLabel = name;
        prefs.set(LABEL_KEY, name);
      }
      renderLabels();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    add.replaceWith(input);
    input.focus();
  } }, '+ 科目');

  $('#label-chips').replaceChildren(...chips, add);
}

function renderTarget(task) {
  const line = $('#target-line');
  line.classList.toggle('none', !task);
  line.textContent = task ? task.title : '未选择，可在下方今日计划中点选一项';
}

async function handleStart() {
  if (starting) return;
  const { minutes, seconds } = picker.getDuration();
  const task = planner.getTarget();
  const btn = $('#btn-start');
  starting = true;
  btn.disabled = true;
  btn.textContent = '启动中…';
  try {
    const status = await api.startFocus({ minutes, seconds, label: selectedLabel, taskId: task ? task.id : null });
    starting = false;
    store.set('status', status);
  } catch (err) {
    starting = false;
    await store.loadStatus();
    const msg = errorText(err);
    if (!msg.includes('用户取消')) toast(`开始专注失败：${msg}`);
  }
}

async function handleSkipBreak() {
  try {
    store.set('status', await api.stopFocus());
  } catch (err) {
    toast(`跳过休息失败：${errorText(err)}`);
  }
}

async function handleEmergency() {
  const config = store.get('config');
  const remaining = emergencyRemaining(store.get('status'), config);
  const ok = await confirmDialog({
    title: '紧急取消',
    message: `确定要取消本次专注吗？\n本月剩余取消次数：${remaining} / ${config.pomodoro.emergency_cancel_limit}`,
    okText: '确定取消',
    cancelText: '继续专注',
  });
  if (!ok) return;
  try {
    store.set('status', await api.emergencyCancel());
  } catch (err) {
    toast(`紧急取消失败：${errorText(err)}`);
  }
}

/* ---------------- 完成后的一句话复盘 ---------------- */

const hhmm = (sec) => {
  const d = new Date(sec * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function showReflection(record) {
  const slot = $('#reflection-slot');
  if (!record || !record.id) return;
  const config = store.get('config');
  const summary = summarize(store.get('history'));
  let cheer = goalMessage(summary.todayTotal.seconds, config.daily_goal_minutes);
  if (summary.streak.todayCounts && summary.streak.current > 1) cheer += ` · 已连续 ${summary.streak.current} 天`;

  const close = () => slot.replaceChildren();
  const input = h('input', {
    class: 'field',
    maxlength: '120',
    placeholder: '一句话就好，如：做完 3.2 节 6 道题',
    'aria-label': '这一个番茄完成了什么',
    value: record.note || '',
  });
  const form = h('form', { class: 'form-row', autocomplete: 'off' }, input, h('button', { class: 'btn', type: 'submit' }, '记下'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const note = input.value.trim();
    if (!note) return close();
    try {
      await store.setRecordNote(record.id, note);
      form.replaceWith(h('p', { class: 'reflection-cheer' }, `已记下：${note}`));
      setTimeout(close, 2500);
    } catch (err) {
      toast(`保存失败：${errorText(err)}`);
    }
  });

  const meta = [record.label, formatMinutes(record.focused_seconds), `${hhmm(record.started_at)}—${hhmm(record.ended_at)}`]
    .filter(Boolean)
    .join(' · ');
  // 后端先发 planner-updated 再发 timer-work-complete，这里读到的已是 +1 之后的进度
  const task = record.task_id ? (store.get('planner').tasks || []).find((t) => t.id === record.task_id) : null;
  const progress = task ? `${task.title} 已完成 ${task.done_pomodoros || 0}/${task.estimate}` : null;

  slot.replaceChildren(h('div', { class: 'card reflection' },
    h('button', { class: 'link card-close', type: 'button', onclick: close }, '关闭'),
    h('p', { class: 'reflection-title' }, '这一个番茄完成了什么？'),
    h('p', { class: 'meta' }, meta),
    progress ? h('p', { class: 'meta' }, progress) : null,
    form,
    h('p', { class: 'reflection-cheer' }, cheer),
  ));
}

/* ---------------- 初始化 ---------------- */

export function init() {
  picker = createDigitPicker($('#digits'), { onChange: renderPresets });
  $('#btn-start').addEventListener('click', handleStart);
  $('#btn-skip-break').addEventListener('click', handleSkipBreak);
  $('#btn-emergency').addEventListener('click', handleEmergency);

  planner.init({ onTarget: renderTarget });
  renderTarget(planner.getTarget());

  store.subscribe('config', (config) => {
    if (!durationSet && config) {
      durationSet = true;
      picker.setDuration(config.pomodoro.last_focus_duration || config.pomodoro.work_minutes || 25, 0);
    }
    renderPresets();
    renderLabels();
    renderStatus();
  });
  store.subscribe('status', renderStatus);
  store.subscribe('history', renderToday);
  store.subscribe('planner', renderStatus);
  store.subscribe('background', (base64) => {
    const layer = $('#bg-layer');
    layer.hidden = !base64;
    layer.style.backgroundImage = base64 ? `url(data:image/jpeg;base64,${base64})` : '';
    document.body.classList.toggle('has-bg', !!base64);
  });

  renderPresets();
}

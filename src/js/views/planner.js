/**
 * 今日计划：添加任务（标题 + 预计番茄数）、勾选完成、删除、选为本次专注目标。
 * 过去日期未完成的任务收在「未完成」里，可一键移到今天。
 */
import * as store from '../store.js';
import { dateKey, parseKey } from '../stats.js';
import { $, h, toast, prefs } from '../dom.js';

const TARGET_KEY = 'focus.targetTask';
const MAX_ESTIMATE = 8;

let targetId = prefs.get(TARGET_KEY, null);
let onTargetChange = () => {};

const newId = () =>
  (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

const today = () => dateKey(new Date());

function tasks() {
  return store.get('planner').tasks || [];
}

async function commit(nextTasks) {
  try {
    await store.savePlanner({ ...store.get('planner'), tasks: nextTasks });
  } catch {
    toast('计划未能保存，稍后会重试');
  }
}

function update(id, patch) {
  return commit(tasks().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

/** 当前选中的目标任务（只认今天、未完成的） */
export function getTarget() {
  const t = tasks().find((x) => x.id === targetId);
  return t && t.date === today() && !t.done ? t : null;
}

function setTarget(id) {
  targetId = id;
  prefs.set(TARGET_KEY, id);
  render();
  onTargetChange(getTarget());
}

function pips(task) {
  const done = task.done_pomodoros || 0;
  const n = Math.max(task.estimate || 1, Math.min(done, MAX_ESTIMATE));
  const el = h('span', { class: 'pips', 'aria-label': `已完成 ${done} / 预计 ${task.estimate} 个番茄` });
  for (let i = 0; i < n; i++) el.append(h('i', { class: i < done ? 'pip on' : 'pip' }));
  return el;
}

function taskRow(task, { overdue = false } = {}) {
  const isTarget = !overdue && task.id === targetId && !task.done;
  const done = task.done_pomodoros || 0;
  const extra = done > task.estimate ? ` +${done - task.estimate}` : '';
  const d = parseKey(task.date);

  const sub = h('span', { class: 'task-sub' },
    pips(task),
    h('span', { class: 'meta' }, `${done}/${task.estimate}${extra}`),
    overdue ? h('span', { class: 'meta' }, `${d.getMonth() + 1}/${d.getDate()}`) : null,
    isTarget ? h('span', { class: 'tag' }, '本次目标') : null,
  );

  const main = overdue
    ? h('div', { class: 'task-main' }, h('span', { class: 'task-title' }, task.title), sub)
    : h('button', {
      class: 'task-main',
      type: 'button',
      title: task.done ? '已完成' : isTarget ? '再次点击取消' : '设为本次专注目标',
      disabled: task.done,
      onclick: () => setTarget(isTarget ? null : task.id),
    }, h('span', { class: 'task-title' }, task.title), sub);

  const actions = h('span', { class: 'task-actions' },
    overdue
      ? h('button', { class: 'link', type: 'button', onclick: () => update(task.id, { date: today() }) }, '移到今天')
      : null,
    h('button', {
      class: 'link',
      type: 'button',
      onclick: () => {
        if (task.id === targetId) setTarget(null);
        commit(tasks().filter((t) => t.id !== task.id));
      },
    }, '删除'),
  );

  const check = h('input', {
    class: 'check',
    type: 'checkbox',
    checked: !!task.done,
    'aria-label': task.done ? '标记为未完成' : '标记为完成',
    onchange: (e) => {
      if (e.target.checked && task.id === targetId) setTarget(null);
      update(task.id, { done: e.target.checked });
    },
  });

  return h('li', { class: `task${task.done ? ' is-done' : ''}${isTarget ? ' is-target' : ''}` }, check, main, actions);
}

export function render() {
  const t = today();
  const all = tasks();
  const todays = all.filter((x) => x.date === t);
  // 未完成的排前面，各自按创建时间
  todays.sort((a, b) => Number(a.done) - Number(b.done) || a.created_at - b.created_at);
  const overdue = all.filter((x) => x.date < t && !x.done).sort((a, b) => (a.date < b.date ? 1 : -1));

  const list = $('#task-list');
  list.replaceChildren(...todays.map((x) => taskRow(x)));
  if (!todays.length) {
    list.append(h('li', { class: 'empty' },
      store.get('plannerError') ? '计划暂时无法读取，新加的任务会在本次运行中保留。' : '写下今天第一件要做的事，越具体越容易开始。'));
  }

  const planned = todays.reduce((s, x) => s + (x.estimate || 0), 0);
  const finished = todays.reduce((s, x) => s + Math.min(x.done_pomodoros || 0, x.estimate || 0), 0);
  $('#plan-aside').textContent = todays.length ? `${finished} / ${planned} 个番茄` : '';

  const box = $('#overdue');
  box.hidden = overdue.length === 0;
  $('#overdue-count').textContent = overdue.length ? `${overdue.length} 项` : '';
  $('#overdue-list').replaceChildren(...overdue.map((x) => taskRow(x, { overdue: true })));
}

export function init({ onTarget } = {}) {
  onTargetChange = onTarget || onTargetChange;

  const select = $('#plan-estimate');
  for (let i = 1; i <= MAX_ESTIMATE; i++) {
    select.append(h('option', { value: String(i) }, `${i} 个番茄`));
  }

  $('#plan-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#plan-title');
    const title = input.value.trim();
    if (!title) {
      input.focus();
      return;
    }
    const task = {
      id: newId(),
      title,
      estimate: Number(select.value) || 1,
      done_pomodoros: 0,
      done: false,
      created_at: Math.floor(Date.now() / 1000),
      date: today(),
    };
    input.value = '';
    select.value = '1';
    const first = !getTarget();
    commit([...tasks(), task]);
    if (first) setTarget(task.id);
  });

  store.subscribe('planner', () => {
    render();
    onTargetChange(getTarget());
  });
  render();
}

/**
 * 统计页：概览卡片、专注地图（近 53 周热力图）、最近 7 天柱状图、本周科目、最近记录（可改复盘）。
 * 数据计算全部在 ../stats.js，这里只负责绘制。
 */
import * as store from '../store.js';
import {
  summarize, buildHeatmap, lastNDays, byLabel, weekStart, parseKey, dayCounts, formatMinutes,
} from '../stats.js';
import { $, h, toast, errorText } from '../dom.js';

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
const PAGE = 10;
const CELL = 10;
const STEP = 12;
const LEFT = 18;
const TOP = 14;

let visible = false;
let shown = PAGE;
let cellIndex = new Map();

const dayLabel = (key) => {
  const d = parseKey(key);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 周${WEEKDAYS[(d.getDay() + 6) % 7]}`;
};

const shortDuration = (seconds) => {
  const total = Math.round(seconds / 60);
  const hrs = Math.floor(total / 60);
  if (hrs >= 100) return `${hrs} 小时`;
  return hrs ? `${hrs} 小时 ${total % 60} 分` : `${total} 分钟`;
};

const hhmm = (sec) => {
  const d = new Date(sec * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ---------------- 概览 ---------------- */

function renderSummary(s) {
  const { streak } = s;
  let streakSub = '';
  if (streak.current > 0 && !streak.todayCounts) streakSub = '今天专注即可延续';
  else if (streak.todayCounts) streakSub = '今天已计入';
  const cards = [
    ['今日', shortDuration(s.todayTotal.seconds), `${s.todayTotal.pomodoros} 个番茄`],
    ['本周', shortDuration(s.week.seconds), `${s.week.pomodoros} 个番茄`],
    ['当前连续', `${streak.current} 天`, streakSub],
    ['最长连续', `${streak.longest} 天`, ''],
    ['累计时长', shortDuration(s.total.seconds), ''],
    ['累计番茄', `${s.total.pomodoros} 个`, ''],
  ];
  $('#summary').replaceChildren(...cards.map(([k, v, sub]) => h('div', { class: 'stat' },
    h('span', { class: 'field-label' }, k),
    h('p', { class: 'stat-value' }, v),
    h('span', { class: 'meta' }, sub || ' '),
  )));
}

/* ---------------- 专注地图 ---------------- */

function renderHeatmap(s) {
  const { columns, months } = buildHeatmap(s.buckets, s.today, { weeks: 53, graceDays: s.streak.graceDays });
  const width = LEFT + columns.length * STEP;
  const height = TOP + 7 * STEP;
  cellIndex = new Map();
  let hitDays = 0;

  const parts = [];
  months.forEach((m) => parts.push(`<text x="${LEFT + m.col * STEP}" y="9">${m.label}</text>`));
  [0, 2, 4].forEach((r) => parts.push(`<text x="0" y="${TOP + r * STEP + 9}">${WEEKDAYS[r]}</text>`));
  columns.forEach((col, c) => {
    col.forEach((cell, r) => {
      if (cell.future) return;
      cellIndex.set(cell.key, cell);
      if (dayCounts(cell)) hitDays += 1;
      const x = LEFT + c * STEP;
      const y = TOP + r * STEP;
      const cls = `cell lv-${cell.level}${cell.key === s.today ? ' today' : ''}`;
      parts.push(`<rect class="${cls}" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" data-key="${cell.key}"></rect>`);
      if (cell.grace) parts.push(`<circle class="grace-dot" cx="${x + 5}" cy="${y + 5}" r="1.6"></circle>`);
    });
  });

  const box = $('#heatmap');
  box.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="近一年每日专注时长热力图">${parts.join('')}</svg>`;
  $('#heat-aside').textContent = `近一年 ${hitDays} 天达标`;
  requestAnimationFrame(() => {
    box.scrollLeft = box.scrollWidth;
  });
}

function bindTooltip() {
  const tip = $('#heat-tip');
  const box = $('#heatmap');
  const hide = () => {
    tip.hidden = true;
  };
  box.addEventListener('mousemove', (e) => {
    const key = e.target && e.target.getAttribute && e.target.getAttribute('data-key');
    const cell = key && cellIndex.get(key);
    if (!cell) return hide();
    const parts = [dayLabel(cell.key), cell.seconds > 0 ? formatMinutes(cell.seconds) : '没有专注'];
    if (cell.pomodoros) parts.push(`${cell.pomodoros} 个番茄`);
    if (cell.grace) parts.push('休息日');
    tip.textContent = parts.join(' · ');
    tip.hidden = false;
    const { width, height } = tip.getBoundingClientRect();
    const x = Math.min(window.innerWidth - width - 8, Math.max(8, e.clientX - width / 2));
    const y = e.clientY - height - 12 < 8 ? e.clientY + 16 : e.clientY - height - 12;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });
  box.addEventListener('mouseleave', hide);
  box.addEventListener('scroll', hide);
}

/* ---------------- 最近 7 天 ---------------- */

function renderBars(s) {
  const days = lastNDays(s.buckets, s.today, 7);
  const max = Math.max(60 * 60, ...days.map((d) => d.seconds));
  const total = days.reduce((sum, d) => sum + d.seconds, 0);
  $('#bars-aside').textContent = `合计 ${shortDuration(total)}`;
  $('#bars').replaceChildren(...days.map((d) => {
    const minutes = Math.round(d.seconds / 60);
    const isToday = d.key === s.today;
    return h('div', {
      class: `bar-col${isToday ? ' is-today' : ''}${minutes === 0 ? ' is-zero' : ''}`,
      title: `${dayLabel(d.key)} · ${formatMinutes(d.seconds)}`,
    },
    h('span', { class: 'bar-val' }, minutes ? String(minutes) : ''),
    h('div', { class: 'bar', style: `height:${Math.max(1, (d.seconds / max) * 100)}px` }),
    h('span', { class: 'bar-day' }, isToday ? '今天' : WEEKDAYS[d.weekday]));
  }));
}

/* ---------------- 本周科目 ---------------- */

function renderByLabel(s) {
  const rows = byLabel(store.get('history'), weekStart(s.today), s.today).filter((r) => r.seconds > 0);
  const box = $('#by-label');
  if (!rows.length) {
    box.replaceChildren(h('p', { class: 'empty' }, '本周还没有专注记录。'));
    return;
  }
  const max = rows[0].seconds;
  box.replaceChildren(...rows.map((r) => h('div', { class: 'label-row' },
    h('span', { class: 'label-name', title: r.label }, r.label),
    h('div', { class: 'label-track' }, h('div', { class: 'label-fill', style: `width:${(r.seconds / max) * 100}%` })),
    h('span', { class: 'meta' }, formatMinutes(r.seconds)),
  )));
}

/* ---------------- 最近记录 ---------------- */

function noteEditor(record, li) {
  const input = h('input', { class: 'field', maxlength: '120', value: record.note || '', placeholder: '这一个番茄完成了什么？' });
  let finished = false;
  const finish = async (save) => {
    if (finished) return;
    finished = true;
    const note = input.value.trim();
    if (save && note !== (record.note || '')) {
      try {
        await store.setRecordNote(record.id, note);
        return; // history 更新会重绘
      } catch (err) {
        toast(`保存失败：${errorText(err)}`);
      }
    }
    input.replaceWith(noteButton(record, li));
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
  return input;
}

function noteButton(record, li) {
  const btn = h('button', {
    class: `record-note${record.note ? '' : ' placeholder'}`,
    type: 'button',
    title: '编辑复盘',
  }, record.note || '+ 写一句复盘');
  btn.addEventListener('click', () => {
    const input = noteEditor(record, li);
    btn.replaceWith(input);
    input.focus();
  });
  return btn;
}

function renderRecords() {
  const history = store.get('history');
  const list = $('#records');
  const recent = history.slice(-shown).reverse();
  if (!recent.length) {
    list.replaceChildren(h('li', { class: 'empty' }, '完成第一个番茄后，记录会出现在这里。'));
    $('#records-more').hidden = true;
    return;
  }
  list.replaceChildren(...recent.map((r) => {
    const d = new Date(r.started_at * 1000);
    const li = h('li', { class: 'record' });
    li.append(
      h('div', { class: 'record-head' },
        h('span', { class: 'meta' }, `${d.getMonth() + 1}/${d.getDate()} 周${WEEKDAYS[(d.getDay() + 6) % 7]} ${hhmm(r.started_at)}—${hhmm(r.ended_at)}`),
        r.label ? h('span', { class: 'tag' }, r.label) : null,
        r.completed ? null : h('span', { class: 'tag' }, '提前结束'),
        h('span', { class: 'meta dur' }, formatMinutes(r.focused_seconds)),
      ),
      noteButton(r, li),
    );
    return li;
  }));
  $('#records-more').hidden = history.length <= shown;
}

/* ---------------- 入口 ---------------- */

export function render() {
  if (!visible) return;
  const history = store.get('history');
  $('#stats-error').hidden = !store.get('historyError');
  const s = summarize(history);
  renderSummary(s);
  renderHeatmap(s);
  renderBars(s);
  renderByLabel(s);
  renderRecords();
}

export function setVisible(value) {
  visible = value;
  if (value) render();
  else $('#heat-tip').hidden = true;
}

export function init() {
  bindTooltip();
  $('#records-more').addEventListener('click', () => {
    shown += PAGE;
    renderRecords();
  });
  store.subscribe('history', render);
}

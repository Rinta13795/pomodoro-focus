// 运行：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dateKey, addDays, diffDays, weekStart, weekdayIndex,
  bucketByDay, computeStreak, heatLevel, buildHeatmap,
  sumRange, lastNDays, byLabel, summarize, goalMessage, formatMinutes,
} from '../src/js/stats.js';

/** 本地时间 → Unix 秒 */
const ts = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime() / 1000;

const rec = (start, minutes, extra = {}) => ({
  id: String(start),
  started_at: start,
  ended_at: start + minutes * 60,
  planned_seconds: minutes * 60,
  focused_seconds: minutes * 60,
  completed: true,
  label: null,
  task_id: null,
  note: null,
  ...extra,
});

/** 由「H/M/.」模式生成按天的桶：H = 达标（1 个番茄），M/. = 空 */
function bucketsFromPattern(pattern, lastKey) {
  const map = new Map();
  [...pattern].forEach((ch, i) => {
    if (ch === 'H') {
      map.set(addDays(lastKey, i - pattern.length + 1), { seconds: 25 * 60, pomodoros: 1, records: 1 });
    }
  });
  return map;
}

test('dateKey 使用本地时间', () => {
  assert.equal(dateKey(new Date(2026, 0, 5, 0, 0, 1)), '2026-01-05');
  assert.equal(dateKey(ts(2026, 1, 5, 23, 59)), '2026-01-05');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(diffDays('2025-12-30', '2026-01-02'), 3);
});

test('跨越本地 0 点的记录按时间比例拆到两天，番茄计入结束日', () => {
  const r = rec(ts(2026, 11, 16, 23, 50), 30); // 23:50 → 00:20
  const b = bucketByDay([r]);
  assert.equal(b.get('2026-11-16').seconds, 10 * 60);
  assert.equal(b.get('2026-11-17').seconds, 20 * 60);
  assert.equal(b.get('2026-11-16').pomodoros, 0);
  assert.equal(b.get('2026-11-17').pomodoros, 1);
  assert.equal(b.get('2026-11-16').records, 1);
});

test('跨 0 点且含暂停：按墙钟时间比例分配实际专注秒数', () => {
  // 23:00 → 01:00 共 120 分钟墙钟，实际专注 60 分钟
  const r = { ...rec(ts(2026, 3, 1, 23, 0), 120), focused_seconds: 3600, completed: false };
  const b = bucketByDay([r]);
  assert.equal(b.get('2026-03-01').seconds, 1800);
  assert.equal(b.get('2026-03-02').seconds, 1800);
  assert.equal(b.get('2026-03-02').pomodoros, 0);
});

test('同一天内的记录不拆分，未完成的不计番茄', () => {
  const b = bucketByDay([
    rec(ts(2026, 11, 16, 0, 0), 25),
    rec(ts(2026, 11, 16, 23, 30), 25, { ended_at: ts(2026, 11, 16, 23, 55) }),
    rec(ts(2026, 11, 16, 9, 0), 10, { completed: false }),
  ]);
  assert.equal(b.size, 1);
  assert.equal(b.get('2026-11-16').seconds, 60 * 60);
  assert.equal(b.get('2026-11-16').pomodoros, 2);
});

test('连续：今天还没专注时从昨天往回数，不算断', () => {
  const today = '2026-11-17';
  const s = computeStreak(bucketsFromPattern('HHH.', today), today);
  assert.equal(s.current, 3);
  assert.equal(s.todayCounts, false);
  const s2 = computeStreak(bucketsFromPattern('HHHH', today), today);
  assert.equal(s2.current, 4);
  assert.equal(s2.todayCounts, true);
});

test('连续：漏掉前天和昨天（且今天还没有）则为 0，最长连续保留', () => {
  const today = '2026-11-17';
  const s = computeStreak(bucketsFromPattern('HHHHH...', today), today);
  assert.equal(s.current, 0);
  assert.equal(s.longest, 5);
  assert.equal(s.atRisk, false);
});

test('单日达标规则：25 分钟或 1 个完成番茄', () => {
  const today = '2026-11-17';
  const b = new Map([
    ['2026-11-15', { seconds: 25 * 60, pomodoros: 0, records: 2 }],
    ['2026-11-16', { seconds: 5 * 60, pomodoros: 1, records: 1 }],
    ['2026-11-17', { seconds: 24 * 60, pomodoros: 0, records: 1 }],
  ]);
  const s = computeStreak(b, today);
  assert.equal(s.todayCounts, false);
  assert.equal(s.current, 2);
});

test('休息日：中间单独漏一天且前后都达标，不断连续；休息日不计天数', () => {
  const today = '2026-11-17';
  const s = computeStreak(bucketsFromPattern('HH.HH', today), today);
  assert.equal(s.current, 4);
  assert.equal(s.longest, 4);
  assert.deepEqual(s.graceDays, ['2026-11-15']);
  assert.equal(s.atRisk, false);
});

test('休息日：连续漏两天会断', () => {
  const today = '2026-11-17';
  const s = computeStreak(bucketsFromPattern('HH..H', today), today);
  assert.equal(s.current, 1);
  assert.deepEqual(s.graceDays, []);
});

test('休息日：7 天内最多 1 次', () => {
  const today = '2026-11-17';
  // 第 2 天休息日；第 5 天又漏（间隔 3 天 < 7）→ 断
  const s = computeStreak(bucketsFromPattern('HH.HH.H', today), today);
  assert.deepEqual(s.graceDays, ['2026-11-13']);
  assert.equal(s.current, 1);
  assert.equal(s.longest, 4);
  // 间隔正好 7 天 → 允许第二次
  const s2 = computeStreak(bucketsFromPattern('H.HHHHHH.H', today), today);
  assert.equal(s2.graceDays.length, 2);
  assert.equal(s2.current, 8);
});

test('休息日：昨天漏、今天尚未达标时暂记休息日（atRisk），今天达标即续上', () => {
  const today = '2026-11-17';
  const s = computeStreak(bucketsFromPattern('HHH..', today), today);
  assert.equal(s.current, 3);
  assert.equal(s.atRisk, true);
  assert.deepEqual(s.graceDays, ['2026-11-16']);
  const s2 = computeStreak(bucketsFromPattern('HHH.H', today), today);
  assert.equal(s2.current, 4);
  assert.equal(s2.atRisk, false);
});

test('休息日不能出现在连续开头', () => {
  const today = '2026-11-17';
  const s = computeStreak(bucketsFromPattern('.HH', today), today);
  assert.deepEqual(s.graceDays, []);
  assert.equal(s.current, 2);
});

test('周统计：周一开始', () => {
  assert.equal(weekdayIndex('2026-11-16'), 0); // 周一
  assert.equal(weekdayIndex('2026-11-22'), 6); // 周日
  assert.equal(weekStart('2026-11-22'), '2026-11-16');
  assert.equal(weekStart('2026-11-16'), '2026-11-16');
  assert.equal(weekStart('2026-11-15'), '2026-11-09');
  const records = [
    rec(ts(2026, 11, 15, 10), 25, { label: '数学' }), // 上周日
    rec(ts(2026, 11, 16, 10), 25, { label: '数学' }), // 本周一
    rec(ts(2026, 11, 17, 10), 50, { label: '英语' }),
    rec(ts(2026, 11, 17, 14), 10, { completed: false }),
  ];
  const b = bucketByDay(records);
  const week = sumRange(b, weekStart('2026-11-17'), '2026-11-17');
  assert.equal(week.seconds, 85 * 60);
  assert.equal(week.pomodoros, 2);
  assert.deepEqual(byLabel(records, '2026-11-16', '2026-11-17'), [
    { label: '英语', seconds: 3000 },
    { label: '数学', seconds: 1500 },
    { label: '未分类', seconds: 600 },
  ]);
});

test('summarize：本周不含上周日；周一漏掉成为休息日', () => {
  const now = new Date(2026, 10, 17, 12, 0);
  const s = summarize([rec(ts(2026, 11, 15, 10), 25), rec(ts(2026, 11, 17, 9), 25)], now);
  assert.equal(s.today, '2026-11-17');
  assert.equal(s.week.seconds, 25 * 60);
  assert.equal(s.todayTotal.pomodoros, 1);
  assert.equal(s.total.pomodoros, 2);
  assert.equal(s.streak.current, 2);
  assert.deepEqual(s.streak.graceDays, ['2026-11-16']);
});

test('热力图强度阈值', () => {
  assert.equal(heatLevel(0), 0);
  assert.equal(heatLevel(1), 1);
  assert.equal(heatLevel(24 * 60 + 59), 1);
  assert.equal(heatLevel(25 * 60), 2);
  assert.equal(heatLevel(59 * 60), 2);
  assert.equal(heatLevel(60 * 60), 3);
  assert.equal(heatLevel(119 * 60), 3);
  assert.equal(heatLevel(120 * 60), 4);
  assert.equal(heatLevel(600 * 60), 4);
});

test('热力图：53 列、周一开头、最后一列含今天、未来格标记', () => {
  const today = '2026-11-18'; // 周三
  const b = bucketByDay([rec(ts(2026, 11, 18, 9), 90)]);
  const { columns, months } = buildHeatmap(b, today, { graceDays: ['2026-11-10'] });
  assert.equal(columns.length, 53);
  columns.forEach((c) => assert.equal(weekdayIndex(c[0].key), 0));
  const last = columns[52];
  assert.equal(last[0].key, '2026-11-16');
  assert.equal(last[2].key, today);
  assert.equal(last[2].level, 3);
  assert.equal(last[2].future, false);
  assert.equal(last[3].future, true);
  assert.equal(columns[51][1].grace, true);
  assert.ok(months.length >= 12);
  assert.equal(months.at(-1).label, '11月');
});

test('最近 7 天：旧到新，含今天', () => {
  const days = lastNDays(new Map(), '2026-11-17', 7);
  assert.equal(days.length, 7);
  assert.equal(days[0].key, '2026-11-11');
  assert.equal(days[6].key, '2026-11-17');
});

test('文案：时长与目标鼓励', () => {
  assert.equal(formatMinutes(0), '0 分钟');
  assert.equal(formatMinutes(35 * 60), '35 分钟');
  assert.equal(formatMinutes(120 * 60), '2 小时');
  assert.equal(formatMinutes(125 * 60), '2 小时 5 分钟');
  assert.equal(goalMessage(85 * 60, 120), '再专注 35 分钟就达成今日目标');
  assert.match(goalMessage(100 * 60, 120), /只差 20 分钟/);
  assert.match(goalMessage(130 * 60, 120), /已达成/);
});

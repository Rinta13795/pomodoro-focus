/**
 * 统计纯函数：按天聚合、连续天数（含休息日宽限）、热力图、周统计。
 * 不依赖 DOM / Tauri；所有日期一律按「本地时区」计算，日期键为 YYYY-MM-DD。
 */

/** 一天计入连续：专注 ≥ 25 分钟，或至少完成 1 个番茄 */
export const STREAK_MIN_SECONDS = 25 * 60;
/** 休息日宽限：每 7 天最多 1 次 */
export const GRACE_INTERVAL_DAYS = 7;
/** 热力图分级（分钟）：0 / (0,25) / [25,60) / [60,120) / ≥120 */
export const HEAT_THRESHOLDS_MIN = [25, 60, 120];

const pad = (n) => String(n).padStart(2, '0');

/** Date 或 Unix 秒 → 本地日期键 YYYY-MM-DD */
export function dateKey(input) {
  const d = input instanceof Date ? input : new Date(Number(input) * 1000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 日期键 → 本地 0 点的 Date */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 日期键加减天数（按日历日，跨夏令时安全） */
export function addDays(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

/** b - a 相差的日历天数 */
export function diffDays(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

/** 0 = 周一 … 6 = 周日 */
export function weekdayIndex(key) {
  return (parseKey(key).getDay() + 6) % 7;
}

/** 所在周的周一 */
export function weekStart(key) {
  return addDays(key, -weekdayIndex(key));
}

/** Unix 秒之后的下一个本地 0 点（Unix 秒） */
function nextMidnight(sec) {
  const d = new Date(sec * 1000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() / 1000;
}

/**
 * 按本地日聚合记录。
 * - 跨越 0 点的记录：专注秒数按各自占用的时间比例拆到两天；
 * - 完成的番茄计入结束那一天。
 * @returns {Map<string, {seconds:number, pomodoros:number, records:number}>}
 */
export function bucketByDay(records) {
  const days = new Map();
  const get = (k) => {
    let b = days.get(k);
    if (!b) {
      b = { seconds: 0, pomodoros: 0, records: 0 };
      days.set(k, b);
    }
    return b;
  };
  for (const r of records || []) {
    const start = Number(r.started_at);
    if (!Number.isFinite(start)) continue;
    const endRaw = Number(r.ended_at);
    const end = Number.isFinite(endRaw) && endRaw > start ? endRaw : start;
    const focused = Math.max(0, Number(r.focused_seconds) || 0);
    get(dateKey(start)).records += 1;

    if (end === start || dateKey(start) === dateKey(end)) {
      get(dateKey(start)).seconds += focused;
    } else {
      const span = end - start;
      let segStart = start;
      while (segStart < end) {
        const segEnd = Math.min(end, nextMidnight(segStart));
        get(dateKey(segStart)).seconds += (focused * (segEnd - segStart)) / span;
        segStart = segEnd;
      }
    }
    if (r.completed) get(dateKey(end)).pomodoros += 1;
  }
  return days;
}

export function dayCounts(bucket) {
  return !!bucket && (bucket.seconds >= STREAK_MIN_SECONDS || bucket.pomodoros >= 1);
}

/**
 * 连续天数。
 * - 当前连续从今天往回数；今天还没达标时从昨天往回数（今天结束前不算断）。
 * - 休息日：连续中间单独漏掉的一天，若前一天与后一天都达标则不算断，
 *   且两次休息日至少间隔 7 天。休息日本身不计入天数。
 * - 若昨天漏掉、前天达标而今天尚未达标，昨天暂记为休息日（tentative），
 *   今天达标即可保住连续。
 * @returns {{current:number, longest:number, graceDays:string[], todayCounts:boolean, atRisk:boolean}}
 */
export function computeStreak(buckets, todayKey) {
  const keys = [...buckets.keys()].filter((k) => k <= todayKey).sort();
  const empty = { current: 0, longest: 0, graceDays: [], todayCounts: false, atRisk: false };
  if (!keys.length) return empty;

  const first = keys[0];
  const n = diffDays(first, todayKey) + 1;
  const dayKeys = Array.from({ length: n }, (_, i) => addDays(first, i));
  const hit = dayKeys.map((k) => dayCounts(buckets.get(k)));
  const todayIdx = n - 1;
  const todayHit = hit[todayIdx];

  const grace = new Array(n).fill(false);
  let lastGrace = -Infinity;
  let atRisk = false;
  for (let i = 1; i < todayIdx; i++) {
    if (hit[i] || !hit[i - 1]) continue;
    const pendingToday = i + 1 === todayIdx && !todayHit;
    if (!hit[i + 1] && !pendingToday) continue;
    if (i - lastGrace < GRACE_INTERVAL_DAYS) continue;
    grace[i] = true;
    lastGrace = i;
    if (pendingToday) atRisk = true;
  }

  let longest = 0;
  let run = 0;
  for (let i = 0; i < n; i++) {
    if (hit[i]) run += 1;
    else if (!grace[i]) run = 0;
    longest = Math.max(longest, run);
  }

  let current = 0;
  for (let i = todayHit ? todayIdx : todayIdx - 1; i >= 0; i--) {
    if (hit[i]) current += 1;
    else if (!grace[i]) break;
  }

  return {
    current,
    longest,
    graceDays: dayKeys.filter((_, i) => grace[i]),
    todayCounts: todayHit,
    atRisk: atRisk && current > 0,
  };
}

/** 热力图强度 0–4（按专注分钟） */
export function heatLevel(seconds) {
  const m = (Number(seconds) || 0) / 60;
  if (m <= 0) return 0;
  const [a, b, c] = HEAT_THRESHOLDS_MIN;
  if (m < a) return 1;
  if (m < b) return 2;
  if (m < c) return 3;
  return 4;
}

/**
 * 热力图数据：列 = 周（周一开头），行 = 周一…周日，最后一列包含今天。
 * @returns {{columns: Array<Array<object>>, months: Array<{col:number, month:number, label:string}>}}
 */
export function buildHeatmap(buckets, todayKey, { weeks = 53, graceDays = [] } = {}) {
  const graceSet = new Set(graceDays);
  const start = addDays(weekStart(todayKey), -(weeks - 1) * 7);
  const columns = [];
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const key = addDays(start, w * 7 + d);
      const b = buckets.get(key);
      const seconds = b ? b.seconds : 0;
      col.push({
        key,
        seconds,
        pomodoros: b ? b.pomodoros : 0,
        level: heatLevel(seconds),
        future: key > todayKey,
        grace: graceSet.has(key),
      });
    }
    columns.push(col);
  }

  const months = [];
  let prev = -1;
  columns.forEach((col, i) => {
    const month = parseKey(col[0].key).getMonth() + 1;
    if (month !== prev) {
      months.push({ col: i, month, label: `${month}月` });
      prev = month;
    }
  });
  // 首列若离下一个月份标签太近会重叠，去掉
  if (months.length > 1 && months[1].col - months[0].col < 3) months.shift();
  return { columns, months };
}

/** 区间 [fromKey, toKey] 的合计 */
export function sumRange(buckets, fromKey, toKey) {
  let seconds = 0;
  let pomodoros = 0;
  for (const [k, b] of buckets) {
    if (k >= fromKey && k <= toKey) {
      seconds += b.seconds;
      pomodoros += b.pomodoros;
    }
  }
  return { seconds, pomodoros };
}

/** 最近 n 天（旧 → 新） */
export function lastNDays(buckets, todayKey, n = 7) {
  return Array.from({ length: n }, (_, i) => {
    const key = addDays(todayKey, i - n + 1);
    const b = buckets.get(key);
    return {
      key,
      seconds: b ? b.seconds : 0,
      pomodoros: b ? b.pomodoros : 0,
      weekday: weekdayIndex(key),
    };
  });
}

/** 区间内按科目汇总（按记录开始日归属），降序 */
export function byLabel(records, fromKey, toKey) {
  const map = new Map();
  for (const r of records || []) {
    const k = dateKey(Number(r.started_at));
    if (k < fromKey || k > toKey) continue;
    const label = r.label || '未分类';
    map.set(label, (map.get(label) || 0) + Math.max(0, Number(r.focused_seconds) || 0));
  }
  return [...map.entries()]
    .map(([label, seconds]) => ({ label, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

/** 一次性汇总所有卡片需要的数据 */
export function summarize(records, now = new Date()) {
  const today = dateKey(now);
  const buckets = bucketByDay(records);
  const streak = computeStreak(buckets, today);
  let totalSeconds = 0;
  let totalPomodoros = 0;
  for (const r of records || []) {
    totalSeconds += Math.max(0, Number(r.focused_seconds) || 0);
    if (r.completed) totalPomodoros += 1;
  }
  return {
    today,
    buckets,
    streak,
    todayTotal: sumRange(buckets, today, today),
    week: sumRange(buckets, weekStart(today), today),
    total: { seconds: totalSeconds, pomodoros: totalPomodoros },
  };
}

/** 秒 → 「2 小时 5 分钟」/「35 分钟」 */
export function formatMinutes(seconds) {
  const total = Math.round(Math.max(0, Number(seconds) || 0) / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} 分钟`;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`;
}

/** 朝今日目标的鼓励语（目标梯度：越接近越具体），从不责备 */
export function goalMessage(todaySeconds, goalMinutes) {
  const goal = Math.max(1, Number(goalMinutes) || 120) * 60;
  const left = goal - (Number(todaySeconds) || 0);
  if (left <= 0) return '今日目标已达成，之后的每一分钟都是额外收获';
  const leftText = formatMinutes(Math.max(60, Math.ceil(left / 60) * 60));
  if (!todaySeconds) return `今天的目标是 ${formatMinutes(goal)}，从第一个番茄开始`;
  if (left <= 25 * 60) return `只差 ${leftText}，再来一个番茄就达成今日目标`;
  return `再专注 ${leftText}就达成今日目标`;
}

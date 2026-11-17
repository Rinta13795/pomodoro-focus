/**
 * 时:分:秒 六位数字选择器。
 * 空闲时：点击选中一位，数字键直接输入，↑↓/滚轮调整，←→ 移位，Tab 跳组，Enter/Esc 确认。
 * 计时中：只显示剩余时间。最长 05:00:00，最短 1 分钟。
 */

const MAX = [0, 5, 5, 9, 5, 9];

export function createDigitPicker(root, { onChange } = {}) {
  const spans = [...root.querySelectorAll('.digit')];
  let digits = [0, 0, 2, 5, 0, 0];
  let selected = -1;
  let editable = true;

  const paint = (values) => {
    spans.forEach((s, i) => {
      s.textContent = values[i];
      s.classList.toggle('selected', i === selected);
    });
  };

  const fromDuration = (minutes, seconds = 0) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10, Math.floor(seconds / 10), seconds % 10];
  };

  const clamp = () => {
    digits[0] = 0;
    if (digits[1] > 5) digits[1] = 5;
    if (digits[1] === 5) digits.fill(0, 2);
    if (digits[2] > 5) digits[2] = 5;
    if (digits[4] > 5) digits[4] = 5;
  };

  const duration = () => ({
    minutes: (digits[0] * 10 + digits[1]) * 60 + digits[2] * 10 + digits[3],
    seconds: digits[4] * 10 + digits[5],
  });

  const select = (i) => {
    selected = i;
    paint(digits);
  };

  const commit = () => {
    const had = selected >= 0;
    selected = -1;
    const d = duration();
    if (d.minutes * 60 + d.seconds < 60) digits = fromDuration(1, 0);
    paint(digits);
    if (had && onChange) onChange(duration());
  };

  const adjust = (delta) => {
    if (selected < 0) return;
    let v = digits[selected] + delta;
    if (v < 0) v = MAX[selected];
    if (v > MAX[selected]) v = 0;
    digits[selected] = v;
    clamp();
    paint(digits);
  };

  const input = (v) => {
    digits[selected] = Math.min(v, MAX[selected]);
    clamp();
    if (selected < 5) select(selected + 1);
    else commit();
  };

  spans.forEach((span, i) => {
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      if (editable) select(i);
    });
    span.addEventListener(
      'wheel',
      (e) => {
        if (!editable) return;
        e.preventDefault();
        if (selected !== i) select(i);
        adjust(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
  });

  document.addEventListener('keydown', (e) => {
    if (!editable || selected < 0) return;
    const k = e.key;
    if (k >= '0' && k <= '9') input(Number(k));
    else if (k === 'ArrowUp') adjust(1);
    else if (k === 'ArrowDown') adjust(-1);
    else if (k === 'ArrowLeft') selected > 0 && select(selected - 1);
    else if (k === 'ArrowRight') selected < 5 && select(selected + 1);
    else if (k === 'Tab') {
      const group = Math.floor(selected / 2);
      select([0, 2, 4][(group + (e.shiftKey ? 2 : 1)) % 3]);
    } else if (k === 'Enter' || k === 'Escape') commit();
    else return;
    e.preventDefault();
  });

  document.addEventListener('click', (e) => {
    if (selected >= 0 && !root.contains(e.target)) commit();
  });

  return {
    /** 当前设定时长（会先确认正在编辑的数字） */
    getDuration() {
      if (selected >= 0) commit();
      return duration();
    },
    setDuration(minutes, seconds = 0) {
      selected = -1;
      digits = fromDuration(Math.min(300, Math.max(1, minutes)), seconds);
      clamp();
      paint(digits);
    },
    /** 计时中显示剩余秒数 */
    showRemaining(total) {
      const t = Math.max(0, Math.floor(total));
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const s = t % 60;
      paint([Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10, Math.floor(s / 10), s % 10]);
    },
    setEditable(value) {
      editable = value;
      if (!value) selected = -1;
      if (value) paint(digits);
    },
  };
}

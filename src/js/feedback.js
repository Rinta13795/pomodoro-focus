/**
 * 阶段结束时的提示：提示音（Web Audio，880Hz 三声）与系统通知。
 */

export function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const beep = 0.5;
    const gap = 0.3;
    for (let i = 0; i < 3; i++) {
      const t = ctx.currentTime + i * (beep + gap);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.01, t + beep);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + beep);
    }
    setTimeout(() => ctx.close(), 3 * (beep + gap) * 1000 + 200);
  } catch {
    /* 无音频设备时静默 */
  }
}

export function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {
    /* WebView 不支持时静默 */
  }
}

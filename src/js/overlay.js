/**
 * 覆盖层窗口：检测到黑名单 App 时由后端弹出。
 * 显示剩余时间；「回到专注」隐藏窗口；紧急取消需二次确认；计时结束后自动关闭。
 */
import { api } from './api.js';
import { on, EVENTS } from './events.js';
import { $, confirmDialog, toast, errorText } from './dom.js';

if (location.protocol.startsWith('http') && !window.__TAURI__) {
  await import('../dev/mock-tauri.js');
}

let closing = false;
let pollId = null;
let remaining = 0;

function finish(completed) {
  if (closing) return;
  closing = true;
  clearInterval(pollId);
  $('#overlay-title').textContent = completed ? '本次专注已完成' : '已取消专注';
  $('#overlay-message').textContent = completed ? '辛苦了，即将返回桌面。' : '下次再继续，即将返回桌面。';
  $('#overlay-actions').hidden = true;
  setTimeout(() => api.closeOverlayWindow().catch(() => {}), completed ? 5000 : 2000);
}

function render(status) {
  if (!status || closing) return;
  const total = Math.max(0, status.remaining_seconds || 0);
  $('#overlay-minutes').textContent = String(Math.floor(total / 60)).padStart(2, '0');
  $('#overlay-seconds').textContent = String(total % 60).padStart(2, '0');
  $('#overlay-status').textContent = ['专注中', status.label].filter(Boolean).join(' · ');

  remaining = status.emergency_remaining || 0;
  const btn = $('#btn-emergency');
  btn.disabled = remaining <= 0;
  btn.textContent = remaining > 0 ? `紧急取消 · 本月剩余 ${remaining} 次` : '本月紧急取消次数已用完';

  if (status.state === 'idle') finish(true);
}

async function refresh() {
  try {
    render(await api.getTimerStatus());
  } catch {
    /* 轮询失败时等下一次 */
  }
}

async function init() {
  $('#btn-back').addEventListener('click', () => api.hideOverlayWindow().catch((err) => toast(errorText(err))));
  $('#btn-emergency').addEventListener('click', async () => {
    if (remaining <= 0) return;
    const ok = await confirmDialog({
      title: '紧急取消',
      message: `确定要取消本次专注吗？\n本月剩余取消次数：${remaining}`,
      okText: '确定取消',
      cancelText: '继续专注',
    });
    if (!ok) return;
    try {
      await api.emergencyCancel();
      finish(false);
    } catch (err) {
      toast(`紧急取消失败：${errorText(err)}`);
    }
  });

  await refresh();
  await on(EVENTS.timerUpdate, render);
  await on(EVENTS.blockedApp, (name) => {
    $('#overlay-message').textContent = `「${name}」已被暂时拦截。先回到手头的任务，休息时再来看它。`;
  });
  // 兜底：事件可能丢失，每秒再拉一次
  pollId = setInterval(refresh, 1000);
}

init().catch((err) => toast(errorText(err)));

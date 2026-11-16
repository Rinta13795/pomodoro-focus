/**
 * 后端事件监听（见 docs/API.md「事件」）。
 * on() 直接把 payload 交给回调，返回取消监听的函数。
 */
import { tauriReady } from './api.js';

export const EVENTS = {
  timerUpdate: 'timer-update',
  workComplete: 'timer-work-complete',
  breakComplete: 'timer-break-complete',
  historyUpdated: 'history-updated',
  plannerUpdated: 'planner-updated',
  blockedApp: 'blocked-app-detected',
};

export async function on(name, handler) {
  const t = await tauriReady();
  return t.event.listen(name, (event) => handler(event.payload));
}

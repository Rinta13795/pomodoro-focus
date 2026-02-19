/**
 * 工具函数模块
 */

/**
 * 格式化秒数为 MM:SS 格式
 * @param {number} seconds
 * @returns {object} { minutes: string, seconds: string }
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return {
    minutes: String(mins).padStart(2, '0'),
    seconds: String(secs).padStart(2, '0'),
  };
}

/**
 * 格式化秒数为完整时间字符串
 * @param {number} seconds
 * @returns {string} "MM:SS"
 */
export function formatTimeString(seconds) {
  const { minutes, seconds: secs } = formatTime(seconds);
  return `${minutes}:${secs}`;
}

/**
 * 解析时间字符串为分钟和秒
 * @param {string} timeStr "HH:MM"
 * @returns {object} { hours: number, minutes: number }
 */
export function parseTimeString(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

/**
 * 防抖函数
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * 显示通知（如果支持）
 * @param {string} title
 * @param {string} body
 */
export function showNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

/**
 * 请求通知权限
 */
export async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

export default {
  formatTime,
  formatTimeString,
  parseTimeString,
  debounce,
  showNotification,
  requestNotificationPermission,
};

/**
 * 计时器页面模块 - 简化版，更稳定
 */

import API from './api.js';
import { showNotification } from './utils.js';

// 等待 Tauri 事件 API
async function getListenFunction() {
  let attempts = 0;
  while (attempts < 50) {
    if (window.__TAURI__?.event?.listen || window.__TAURI__?.listen) {
      return window.__TAURI__.event?.listen || window.__TAURI__.listen;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  throw new Error('无法加载 Tauri 事件监听 API');
}

// 页面状态
let currentStatus = null;
let config = null;
let unlistenFuncs = [];
let selectedDurationMinutes = 25; // 总分钟数
let selectedDurationSeconds = 0; // 额外秒数
let isInitialized = false;

// 数字选择器状态
let selectedDigitIndex = -1; // -1 表示无选中，0-5 对应 h0,h1,m0,m1,s0,s1
let digits = [0, 0, 2, 5, 0, 0]; // [h0, h1, m0, m1, s0, s1] 默认 00:25:00

// DOM 元素
const elements = {
  timerDisplay: null,
  digitSpans: [], // [digit-h0, digit-h1, digit-m0, digit-m1, digit-s0, digit-s1]
  timeLabels: null,
  statusDisplay: null,
  btnStart: null,
  btnSkipBreak: null,
  btnEmergency: null,
  emergencyCount: null,
  // 确认弹窗元素
  confirmOverlay: null,
  confirmMessage: null,
  confirmYes: null,
  confirmNo: null,
};

/**
 * 初始化计时器页面 - 简化版
 */
export async function init() {
  if (isInitialized) {
    console.log('计时器页面已初始化');
    return;
  }

  console.log('初始化计时器页面...');

  try {
    // 获取 DOM 元素
    elements.timerDisplay = document.getElementById('timer-display');
    elements.digitSpans = [
      document.getElementById('digit-h0'),
      document.getElementById('digit-h1'),
      document.getElementById('digit-m0'),
      document.getElementById('digit-m1'),
      document.getElementById('digit-s0'),
      document.getElementById('digit-s1'),
    ];
    elements.timeLabels = document.getElementById('time-labels');
    elements.statusDisplay = document.getElementById('timer-status');
    elements.btnStart = document.getElementById('btn-start');
    elements.btnSkipBreak = document.getElementById('btn-skip-break');
    elements.btnEmergency = document.getElementById('btn-emergency');
    elements.emergencyCount = document.getElementById('emergency-count');
    // 确认弹窗元素
    elements.confirmOverlay = document.getElementById('confirm-overlay');
    elements.confirmMessage = document.getElementById('confirm-message');
    elements.confirmYes = document.getElementById('confirm-yes');
    elements.confirmNo = document.getElementById('confirm-no');

    // 绑定按钮事件
    if (elements.btnStart) elements.btnStart.onclick = handleStart;
    if (elements.btnSkipBreak) elements.btnSkipBreak.onclick = handleSkipBreak;
    if (elements.btnEmergency) elements.btnEmergency.onclick = handleEmergencyCancel;

    // 数字选择器事件
    setupDigitPicker();

    // 监听后端事件
    await setupEventListeners();

    // 加载配置和状态
    config = await API.getConfig();
    selectedDurationMinutes = config?.pomodoro?.last_focus_duration || config?.pomodoro?.work_minutes || 25;
    selectedDurationSeconds = 0;
    durationToDigits(selectedDurationMinutes, selectedDurationSeconds);
    updateDigitDisplay();

    currentStatus = await API.getTimerStatus();
    // 修正 idle 状态下紧急取消次数显示（后端返回的是配置总次数，需要用月度剩余）
    if (currentStatus.state === 'idle') {
      const limit = config?.pomodoro?.emergency_cancel_limit || 2;
      const usedCount = config?.pomodoro?.emergency_used_count || 0;
      const resetMonth = config?.pomodoro?.emergency_reset_month || '';
      const currentMonth = new Date().toISOString().slice(0, 7);
      const monthlyUsed = (resetMonth === currentMonth) ? usedCount : 0;
      currentStatus.emergency_remaining = Math.max(0, limit - monthlyUsed);
    }
    render();

    // 加载背景图片
    loadTimerBackground();

    isInitialized = true;
    console.log('计时器页面初始化完成');
  } catch (error) {
    console.error('初始化计时器失败:', error);
    alert('初始化计时器失败: ' + error.message);
  }
}

/**
 * 设置事件监听器 - 简化版
 */
async function setupEventListeners() {
  try {
    const listen = await getListenFunction();

    // 监听计时器更新事件
    const unlisten1 = await listen('timer-update', (event) => {
      currentStatus = event.payload;
      render();
    });

    // 监听工作完成事件
    const unlisten2 = await listen('timer-work-complete', () => {
      console.log('工作时段完成！');
      showNotification('番茄专注', '工作时段完成！现在开始休息。');
      playSound();
    });

    // 监听休息完成事件
    const unlisten3 = await listen('timer-break-complete', () => {
      console.log('休息时段完成！');
      showNotification('番茄专注', '休息时段完成！');
      playSound();
    });

    unlistenFuncs = [unlisten1, unlisten2, unlisten3];
    console.log('事件监听器设置完成');
  } catch (error) {
    console.error('设置事件监听器失败:', error);
  }
}

/**
 * 渲染计时器状态
 */
export function render() {
  if (!currentStatus) return;

  const state = currentStatus.state;

  if (state === 'idle') {
    // idle 状态显示用户设定的时长
    updateDigitDisplay();
  } else {
    // 运行状态显示倒计时
    deselectDigit();
    const totalSec = currentStatus.remaining_seconds;
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    setDigitSpans(Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10, Math.floor(s / 10), s % 10);
  }

  // 更新状态文本和样式
  const statusMap = {
    'idle': '未开始',
    'working': '专注中...',
    'breaking': '休息中...',
    'paused': '已暂停',
  };

  elements.statusDisplay.textContent = statusMap[state] || '未开始';
  elements.statusDisplay.className = 'timer-status ' + state;

  // 更新 body 的状态 class
  document.body.className = 'state-' + state;

  // 更新按钮显示
  updateButtons();

  // 更新应急次数
  elements.emergencyCount.textContent = currentStatus.emergency_remaining;
}

/**
 * 更新按钮显示和状态
 */
function updateButtons() {
  const state = currentStatus.state;
  const emergencyRemaining = currentStatus.emergency_remaining;

  console.log('[updateButtons] state:', state, 'emergency_remaining:', emergencyRemaining);

  // 根据状态显示/隐藏按钮
  if (state === 'idle') {
    elements.btnStart.style.display = 'inline-block';
    elements.btnSkipBreak.style.display = 'none';
    elements.btnStart.textContent = '开始专注';
    elements.btnStart.disabled = false;
    elements.btnEmergency.disabled = true;
    elements.btnEmergency.textContent = `🆘 紧急取消 (${emergencyRemaining})`;
  } else if (state === 'breaking') {
    elements.btnStart.style.display = 'none';
    elements.btnSkipBreak.style.display = 'inline-block';
    elements.btnEmergency.disabled = true;
    elements.btnEmergency.textContent = `🆘 紧急取消 (${emergencyRemaining})`;
  } else {
    // working / paused
    elements.btnStart.style.display = 'none';
    elements.btnSkipBreak.style.display = 'none';
    elements.btnEmergency.disabled = emergencyRemaining <= 0;
    elements.btnEmergency.textContent = emergencyRemaining > 0
      ? `🆘 紧急取消 (${emergencyRemaining})`
      : '🆘 已无取消次数';
  }

  console.log('[updateButtons] btnEmergency.disabled:', elements.btnEmergency.disabled);
}

/**
 * 销毁页面（清理事件监听器）
 */
export function destroy() {
  // 清理事件监听
  unlistenFuncs.forEach(unlisten => unlisten());
  unlistenFuncs = [];
}

/**
 * 开始专注
 */
async function handleStart() {
  // 确保数字选择器的值已同步到 selectedDurationMinutes/Seconds
  commitDigits();

  console.log('=== 开始专注 ===');
  console.log('选择的时长:', selectedDurationMinutes, '分', selectedDurationSeconds, '秒');

  // 显示启动中状态，禁用按钮防止重复点击
  elements.btnStart.textContent = '启动中...';
  elements.btnStart.disabled = true;

  try {
    currentStatus = await API.startFocus(selectedDurationMinutes, selectedDurationSeconds);
    console.log('开始专注成功，状态:', currentStatus);
    render();
  } catch (error) {
    console.error('开始专注失败:', error);
    // 从后端刷新状态，确保 UI 完全恢复
    try {
      currentStatus = await API.getTimerStatus();
    } catch (_) {
      // 如果获取状态也失败，手动设为 idle
      currentStatus = { state: 'idle', remaining_seconds: 0, emergency_remaining: 0 };
    }
    render();
    // 确保按钮可用（render 可能已处理，但双重保险）
    elements.btnStart.textContent = '开始专注';
    elements.btnStart.disabled = false;
    // 用户取消密码授权时不弹 alert
    const msg = error.message || String(error);
    if (!msg.includes('用户取消')) {
      alert('开始专注失败: ' + msg);
    }
  }
}

/**
 * 跳过休息
 */
async function handleSkipBreak() {
  try {
    currentStatus = await API.stopFocus();
    render();
  } catch (error) {
    console.error('跳过休息失败:', error);
  }
}

/**
 * 紧急取消
 */
async function handleEmergencyCancel() {
  console.log('[handleEmergencyCancel] 点击紧急取消按钮');

  const remaining = currentStatus?.emergency_remaining || 0;
  const limit = config?.pomodoro?.emergency_cancel_limit || 2;

  const confirmMsg = `确定要取消本次专注吗？\n（剩余取消次数：${remaining}/${limit}）`;

  // 使用自定义弹窗替代 confirm()
  showConfirmDialog(confirmMsg, async () => {
    console.log('[handleEmergencyCancel] 用户确认，执行取消');
    try {
      currentStatus = await API.emergencyCancel();
      console.log('[handleEmergencyCancel] 取消成功:', currentStatus);
      render();
    } catch (error) {
      console.error('紧急取消失败:', error);
      alert('紧急取消失败: ' + error);
    }
  });
}

/**
 * 将分钟数和秒数转换为 digits 数组
 */
function durationToDigits(totalMinutes, extraSeconds = 0) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const s = extraSeconds;
  digits = [Math.floor(h / 10), h % 10, Math.floor(m / 10), m % 10, Math.floor(s / 10), s % 10];
}

/**
 * 从 digits 数组计算分钟数和秒数
 * @returns {{ minutes: number, seconds: number }}
 */
function digitsToDuration() {
  const hours = digits[0] * 10 + digits[1];
  const minutes = digits[2] * 10 + digits[3];
  const seconds = digits[4] * 10 + digits[5];
  return { minutes: hours * 60 + minutes, seconds };
}

/**
 * 设置六个数字 span 的文本内容
 */
function setDigitSpans(d0, d1, d2, d3, d4, d5) {
  if (elements.digitSpans[0]) elements.digitSpans[0].textContent = d0;
  if (elements.digitSpans[1]) elements.digitSpans[1].textContent = d1;
  if (elements.digitSpans[2]) elements.digitSpans[2].textContent = d2;
  if (elements.digitSpans[3]) elements.digitSpans[3].textContent = d3;
  if (elements.digitSpans[4]) elements.digitSpans[4].textContent = d4;
  if (elements.digitSpans[5]) elements.digitSpans[5].textContent = d5;
}

/**
 * 更新数字显示（idle 模式下从 digits 数组）
 */
function updateDigitDisplay() {
  setDigitSpans(digits[0], digits[1], digits[2], digits[3], digits[4], digits[5]);
  // 更新高亮状态
  elements.digitSpans.forEach((span, i) => {
    if (span) span.classList.toggle('selected', i === selectedDigitIndex);
  });
}

/**
 * 设置数字选择器事件
 */
function setupDigitPicker() {
  // 点击数字位选中
  elements.digitSpans.forEach((span, i) => {
    if (!span) return;
    span.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!isIdle()) return;
      selectDigit(i);
    });
    // 滚轮调整
    span.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!isIdle()) return;
      if (selectedDigitIndex !== i) selectDigit(i);
      const delta = e.deltaY < 0 ? 1 : -1;
      adjustDigit(delta);
    }, { passive: false });
  });

  // 键盘事件
  document.addEventListener('keydown', handleDigitKeydown);

  // 点击外部取消选中
  document.addEventListener('click', (e) => {
    if (selectedDigitIndex < 0) return;
    const inDisplay = elements.timerDisplay && elements.timerDisplay.contains(e.target);
    if (!inDisplay) {
      commitDigits();
    }
  });
}

/**
 * 判断当前是否 idle 状态
 */
function isIdle() {
  return !currentStatus || currentStatus.state === 'idle';
}

/**
 * 选中某个数字位
 */
function selectDigit(index) {
  selectedDigitIndex = index;
  updateDigitDisplay();
}

/**
 * 取消选中
 */
function deselectDigit() {
  selectedDigitIndex = -1;
  elements.digitSpans.forEach(span => {
    if (span) span.classList.remove('selected');
  });
}

/**
 * 调整当前选中数字位的值（+1 或 -1）
 */
function adjustDigit(delta) {
  if (selectedDigitIndex < 0) return;
  const i = selectedDigitIndex;
  const maxValues = [0, 5, 5, 9, 5, 9]; // h0:0, h1:0-5, m0:0-5, m1:0-9, s0:0-5, s1:0-9
  let val = digits[i] + delta;
  if (val < 0) val = maxValues[i];
  if (val > maxValues[i]) val = 0;
  digits[i] = val;
  validateAndClamp();
  updateDigitDisplay();
}

/**
 * 键盘事件处理
 */
function handleDigitKeydown(e) {
  if (!isIdle() || selectedDigitIndex < 0) return;

  if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    inputDigitValue(parseInt(e.key));
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    adjustDigit(1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    adjustDigit(-1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (selectedDigitIndex > 0) selectDigit(selectedDigitIndex - 1);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (selectedDigitIndex < 5) selectDigit(selectedDigitIndex + 1);
  } else if (e.key === 'Tab') {
    e.preventDefault();
    // Tab 在组之间跳转：小时(0-1) → 分钟(2-3) → 秒(4-5)
    const groupStart = [0, 2, 4];
    const currentGroup = Math.floor(selectedDigitIndex / 2);
    const nextGroup = e.shiftKey
      ? (currentGroup - 1 + 3) % 3
      : (currentGroup + 1) % 3;
    selectDigit(groupStart[nextGroup]);
  } else if (e.key === 'Escape' || e.key === 'Enter') {
    e.preventDefault();
    commitDigits();
  }
}

/**
 * 直接输入数字值到当前选中位
 */
function inputDigitValue(val) {
  const i = selectedDigitIndex;
  const maxValues = [0, 5, 5, 9, 5, 9];
  digits[i] = Math.min(val, maxValues[i]);
  validateAndClamp();
  updateDigitDisplay();
  // 自动跳到下一位
  if (i < 5) {
    selectDigit(i + 1);
  } else {
    commitDigits();
  }
}

/**
 * 验证并修正数值约束
 */
function validateAndClamp() {
  // 小时十位只能是 0
  if (digits[0] > 0) digits[0] = 0;
  // 小时个位上限 5（最大 05 小时）
  if (digits[1] > 5) digits[1] = 5;
  // 如果小时是 5，分钟和秒归零
  if (digits[1] === 5) {
    digits[2] = 0;
    digits[3] = 0;
    digits[4] = 0;
    digits[5] = 0;
  }
  // 分钟十位上限 5
  if (digits[2] > 5) digits[2] = 5;
  // 秒十位上限 5
  if (digits[4] > 5) digits[4] = 5;
}

/**
 * 确认当前数字并保存时长
 */
function commitDigits() {
  deselectDigit();
  let { minutes, seconds } = digitsToDuration();
  const totalSec = minutes * 60 + seconds;
  // 最小 1 分钟
  if (totalSec < 60) {
    minutes = 1;
    seconds = 0;
    durationToDigits(minutes, seconds);
    updateDigitDisplay();
  }
  selectedDurationMinutes = minutes;
  selectedDurationSeconds = seconds;
}

/**
 * 显示自定义确认弹窗
 */
function showConfirmDialog(message, onConfirm) {
  if (!elements.confirmOverlay) return;

  // 设置消息
  if (elements.confirmMessage) {
    elements.confirmMessage.textContent = message;
  }

  // 显示弹窗
  elements.confirmOverlay.style.display = 'flex';

  // 绑定确认按钮
  elements.confirmYes.onclick = () => {
    elements.confirmOverlay.style.display = 'none';
    if (onConfirm) onConfirm();
  };

  // 绑定取消按钮
  elements.confirmNo.onclick = () => {
    elements.confirmOverlay.style.display = 'none';
  };
}

/**
 * 播放完成提示音（Web Audio API，880Hz 正弦波，3 次）
 */
function playSound() {
  if (config && config.play_completion_sound === false) {
    return;
  }

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beepCount = 3;
    const beepDuration = 0.5;
    const beepGap = 0.3;

    for (let i = 0; i < beepCount; i++) {
      const startTime = ctx.currentTime + i * (beepDuration + beepGap);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + beepDuration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + beepDuration);
    }

    // 播放完毕后关闭 AudioContext
    const totalDuration = beepCount * (beepDuration + beepGap);
    setTimeout(() => ctx.close(), totalDuration * 1000 + 200);
  } catch (err) {
    console.log('播放提示音失败:', err);
  }
}

/**
 * 加载计时器背景图片
 */
async function loadTimerBackground() {
  try {
    const base64 = await API.getBackground();
    if (!base64) return;
    const bg = document.getElementById('timer-bg');
    const overlay = document.getElementById('timer-bg-overlay');
    if (!bg || !overlay) return;
    bg.style.backgroundImage = `url(data:image/jpeg;base64,${base64})`;
    bg.style.display = 'block';
    overlay.style.display = 'block';
  } catch (e) {
    // 无背景图
  }
}

/**
 * 更新配置（从外部调用）
 */
export function updateConfig(newConfig) {
  config = newConfig;
}

export default {
  init,
  render,
  destroy,
  updateConfig,
};

/**
 * 应用入口模块 - 简化版，更稳定
 */

import API from './api.js';
import Timer from './timer.js';
import Settings from './settings.js';
import { requestNotificationPermission } from './utils.js';

// 当前页面
let currentPage = 'timer';
let isInitialized = false;

// 页面模块映射
const pages = {
  timer: Timer,
  settings: Settings,
};

/**
 * 应用初始化
 */
async function init() {
  if (isInitialized) {
    console.log('应用已初始化，跳过');
    return;
  }

  console.log('番茄专注 App 初始化中...');

  try {
    // 初始化导航
    initNavigation();

    // 初始化默认页面
    await initPage('timer');

    // 测试后端连接
    const config = await API.getConfig();
    console.log('配置加载成功:', config);

    isInitialized = true;
    console.log('番茄专注 App 初始化完成');
  } catch (error) {
    console.error('应用初始化失败:', error);
    alert('应用初始化失败: ' + error.message);
  }
}

/**
 * 初始化导航 - 最简单直接的方式
 */
function initNavigation() {
  const timerBtn = document.querySelector('[data-page="timer"]');
  const settingsBtn = document.querySelector('[data-page="settings"]');

  if (timerBtn) {
    timerBtn.onclick = (e) => {
      console.log('[NAV] 计时器按钮被点击');
      e.preventDefault();
      switchPage('timer');
    };
  }

  if (settingsBtn) {
    settingsBtn.onclick = (e) => {
      console.log('[NAV] 设置按钮被点击');
      e.preventDefault();
      switchPage('settings');
    };
  }

  console.log('导航初始化完成');
}

/**
 * 切换页面 - 优化版：UI 切换立即执行，初始化异步进行
 */
function switchPage(pageName) {
  // 专注模式下禁止切换到非计时器页面
  const bodyClass = document.body.className;
  if (bodyClass && bodyClass !== 'state-idle' && pageName !== 'timer') {
    console.log('[NAV] 专注模式中，禁止切换页面');
    return;
  }

  if (pageName === currentPage) {
    console.log('[NAV] 已在当前页面:', pageName);
    return;
  }

  console.log('[NAV] 切换页面:', currentPage, '->', pageName);

  // 立即更新 UI（同步操作）
  // 更新导航按钮状态
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.dataset.page === pageName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // 更新页面显示
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });

  const targetPage = document.getElementById(`${pageName}-page`);
  if (targetPage) {
    targetPage.classList.add('active');
  }

  currentPage = pageName;
  console.log('[NAV] UI 切换完成');

  // 异步初始化页面（不阻塞 UI）
  initPage(pageName).catch(err => {
    console.error('[NAV] 页面初始化失败:', err);
  });
}

/**
 * 初始化指定页面
 */
async function initPage(pageName) {
  const page = pages[pageName];
  if (page && page.init) {
    await page.init();
  }
}

// 等待 DOM 加载完成
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init, switchPage };

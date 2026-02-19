/**
 * 设置页面模块 - 卡片式布局，自动保存
 */

import API from './api.js';

// 页面状态
let config = null;
let installedApps = []; // 缓存已安装 App 列表
let appIconCache = {}; // 图标缓存：{ appName: base64String }
let selectedSuggestionIndex = -1; // 当前键盘选中的下拉项索引

// DOM 元素
const elements = {};

/**
 * 初始化设置页面
 */
export async function init() {
  // 获取 DOM 元素
  elements.workMinutes = document.getElementById('work-minutes');
  elements.workMinutesValue = document.getElementById('work-minutes-value');
  elements.breakMinutes = document.getElementById('break-minutes');
  elements.breakMinutesValue = document.getElementById('break-minutes-value');
  elements.emergencyLimit = document.getElementById('emergency-limit');
  elements.emergencyLimitValue = document.getElementById('emergency-limit-value');

  elements.blockedAppsList = document.getElementById('blocked-apps-list');
  elements.newAppInput = document.getElementById('new-app-input');
  elements.btnAddApp = document.getElementById('btn-add-app');
  elements.appSuggestions = document.getElementById('app-suggestions');

  elements.blockedSitesList = document.getElementById('blocked-sites-list');
  elements.newSiteInput = document.getElementById('new-site-input');
  elements.btnAddSite = document.getElementById('btn-add-site');

  elements.schedulesList = document.getElementById('schedules-list');
  elements.btnAddSchedule = document.getElementById('btn-add-schedule');

  elements.modeToggle = document.getElementById('mode-toggle');
  elements.modeDescription = document.getElementById('mode-description');
  elements.soundToggle = document.getElementById('sound-toggle');

  elements.configPath = document.getElementById('config-path');

  // 背景图片元素
  elements.bgPreviewContainer = document.getElementById('bg-preview-container');
  elements.bgPreview = document.getElementById('bg-preview');
  elements.btnChooseBg = document.getElementById('btn-choose-bg');
  elements.btnClearBg = document.getElementById('btn-clear-bg');

  // 绑定事件 - 计时设置滑块
  elements.workMinutes.addEventListener('input', (e) => {
    elements.workMinutesValue.textContent = e.target.value;
  });
  elements.workMinutes.addEventListener('change', handleTimerSettingChange);

  elements.breakMinutes.addEventListener('input', (e) => {
    elements.breakMinutesValue.textContent = e.target.value;
  });
  elements.breakMinutes.addEventListener('change', handleTimerSettingChange);

  elements.emergencyLimit.addEventListener('input', (e) => {
    elements.emergencyLimitValue.textContent = e.target.value;
  });
  elements.emergencyLimit.addEventListener('change', handleTimerSettingChange);

  // 绑定事件 - App 搜索自动补全
  elements.btnAddApp.addEventListener('click', handleAddApp);
  elements.newAppInput.addEventListener('input', handleAppInputChange);
  elements.newAppInput.addEventListener('keydown', handleAppInputKeydown);

  // 点击外部关闭下拉
  document.addEventListener('click', (e) => {
    if (!elements.newAppInput.contains(e.target) &&
        !elements.appSuggestions.contains(e.target) &&
        !elements.btnAddApp.contains(e.target)) {
      hideSuggestions();
    }
  });

  elements.btnAddSite.addEventListener('click', handleAddSite);
  elements.newSiteInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAddSite();
  });

  // 绑定事件 - 计划添加
  elements.btnAddSchedule.addEventListener('click', handleAddSchedule);

  // 绑定事件 - 模式切换
  elements.modeToggle.addEventListener('change', handleModeToggle);

  // 绑定事件 - 完成提醒音开关
  elements.soundToggle.addEventListener('change', handleSoundToggle);

  // 绑定事件 - 背景图片
  elements.btnChooseBg.addEventListener('click', handleChooseBg);
  elements.btnClearBg.addEventListener('click', handleClearBg);

  // 加载数据
  try {
    config = await API.getConfig();
    const configPath = await API.getConfigPath();
    elements.configPath.textContent = configPath;
    render();
  } catch (error) {
    console.error('加载设置失败:', error);
  }

  // 加载背景预览
  loadBgPreview();

  // 加载已安装 App 列表
  try {
    installedApps = await API.getInstalledApps();
    console.log(`已加载 ${installedApps.length} 个已安装 App`);
  } catch (error) {
    console.error('加载已安装 App 列表失败:', error);
    installedApps = [];
  }
}

/**
 * 渲染设置页面
 */
export function render() {
  if (!config) return;

  // 渲染计时设置
  elements.workMinutes.value = config.pomodoro.work_minutes;
  elements.workMinutesValue.textContent = config.pomodoro.work_minutes;

  elements.breakMinutes.value = config.pomodoro.break_minutes;
  elements.breakMinutesValue.textContent = config.pomodoro.break_minutes;

  elements.emergencyLimit.value = config.pomodoro.emergency_cancel_limit;
  elements.emergencyLimitValue.textContent = config.pomodoro.emergency_cancel_limit;

  // 渲染 App 黑名单
  renderAppsList();

  // 渲染网站黑名单
  renderSitesList();

  // 渲染定时计划
  renderSchedulesList();

  // 渲染模式切换
  elements.modeToggle.checked = config.mode === 'scheduled';
  updateModeDescription();

  // 渲染完成提醒音开关
  elements.soundToggle.checked = config.play_completion_sound !== false;
}

/**
 * 渲染 App 黑名单
 */
function renderAppsList() {
  elements.blockedAppsList.innerHTML = '';

  if (config.blocked_apps.length === 0) {
    elements.blockedAppsList.setAttribute('data-empty-text', '暂无屏蔽 App，点击下方添加');
    return;
  }

  elements.blockedAppsList.removeAttribute('data-empty-text');

  config.blocked_apps.forEach((app, index) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <img class="app-icon" alt="" />
      <span class="app-icon-placeholder">${escapeHtml(app.charAt(0).toUpperCase())}</span>
      <div class="list-item-content">${escapeHtml(app)}</div>
      <button class="btn-remove" data-index="${index}" data-type="app">&times;</button>
    `;
    elements.blockedAppsList.appendChild(item);
    // 异步加载图标
    const img = item.querySelector('.app-icon');
    loadAppIcon(img, app);
  });

  // 绑定删除事件
  elements.blockedAppsList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', handleRemoveApp);
  });
}

/**
 * 渲染网站黑名单
 */
function renderSitesList() {
  elements.blockedSitesList.innerHTML = '';

  if (config.blocked_sites.length === 0) {
    elements.blockedSitesList.setAttribute('data-empty-text', '暂无屏蔽网站，点击下方添加');
    return;
  }

  elements.blockedSitesList.removeAttribute('data-empty-text');

  config.blocked_sites.forEach((site, index) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div class="list-item-content">${escapeHtml(site)}</div>
      <button class="btn-remove" data-index="${index}" data-type="site">&times;</button>
    `;
    elements.blockedSitesList.appendChild(item);
  });

  // 绑定删除事件
  elements.blockedSitesList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', handleRemoveSite);
  });
}

/**
 * 渲染定时计划列表
 */
function renderSchedulesList() {
  elements.schedulesList.innerHTML = '';

  if (config.schedules.length === 0) {
    elements.schedulesList.setAttribute('data-empty-text', '暂无定时计划，点击下方添加');
    return;
  }

  elements.schedulesList.removeAttribute('data-empty-text');

  config.schedules.forEach((schedule, index) => {
    const item = document.createElement('div');
    item.className = 'schedule-item';
    item.innerHTML = `
      <label class="schedule-toggle">
        <input type="checkbox" ${schedule.enabled ? 'checked' : ''} data-index="${index}">
        <span class="schedule-toggle-slider"></span>
      </label>
      <div class="schedule-time-inputs">
        <input type="time" value="${schedule.start}" data-index="${index}" data-field="start">
        <span class="schedule-separator">至</span>
        <input type="time" value="${schedule.end}" data-index="${index}" data-field="end">
      </div>
      <button class="btn-remove" data-index="${index}" data-type="schedule">&times;</button>
    `;
    elements.schedulesList.appendChild(item);
  });

  // 绑定事件
  elements.schedulesList.querySelectorAll('.schedule-toggle input').forEach(checkbox => {
    checkbox.addEventListener('change', handleScheduleToggle);
  });

  elements.schedulesList.querySelectorAll('.schedule-time-inputs input').forEach(input => {
    input.addEventListener('change', handleScheduleTimeChange);
  });

  elements.schedulesList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', handleRemoveSchedule);
  });
}

/**
 * 更新模式描述
 */
function updateModeDescription() {
  if (config.mode === 'scheduled') {
    elements.modeDescription.textContent = '定时模式：根据设置的时间段自动开始/停止专注';
  } else {
    elements.modeDescription.textContent = '手动模式：需要手动点击"开始专注"按钮';
  }
}

/**
 * 处理计时设置变更（自动保存）
 */
async function handleTimerSettingChange() {
  config.pomodoro.work_minutes = parseInt(elements.workMinutes.value);
  config.pomodoro.break_minutes = parseInt(elements.breakMinutes.value);
  config.pomodoro.emergency_cancel_limit = parseInt(elements.emergencyLimit.value);

  await saveConfig();
}

/**
 * 处理添加 App（验证是否为已安装 App）
 */
async function handleAddApp() {
  const appName = elements.newAppInput.value.trim();

  if (!appName) {
    return;
  }

  // 检查是否完全匹配某个已安装 App（不区分大小写）
  const matchedApp = installedApps.find(
    app => app.toLowerCase() === appName.toLowerCase()
  );

  if (!matchedApp) {
    alert('未找到该应用');
    return;
  }

  if (config.blocked_apps.includes(matchedApp)) {
    alert('该 App 已存在');
    return;
  }

  config.blocked_apps.push(matchedApp);
  elements.newAppInput.value = '';
  hideSuggestions();

  renderAppsList();
  await saveConfig();
}

/**
 * 处理 App 输入框内容变化（搜索过滤）
 */
function handleAppInputChange() {
  const query = elements.newAppInput.value.trim();
  selectedSuggestionIndex = -1;

  if (!query) {
    hideSuggestions();
    return;
  }

  const lowerQuery = query.toLowerCase();
  const filtered = installedApps.filter(app => {
    if (config.blocked_apps.includes(app)) return false;
    return app.toLowerCase().includes(lowerQuery);
  }).slice(0, 8);

  if (filtered.length === 0) {
    hideSuggestions();
    return;
  }

  showSuggestions(filtered);
}

/**
 * 处理 App 输入框键盘事件
 */
function handleAppInputKeydown(e) {
  const items = elements.appSuggestions.querySelectorAll('.app-suggestion-item');
  const isVisible = elements.appSuggestions.style.display !== 'none';

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!isVisible || items.length === 0) return;
    selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
    updateSuggestionHighlight(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!isVisible || items.length === 0) return;
    selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, 0);
    updateSuggestionHighlight(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (isVisible && selectedSuggestionIndex >= 0 && selectedSuggestionIndex < items.length) {
      selectSuggestion(items[selectedSuggestionIndex].dataset.app);
    } else {
      handleAddApp();
    }
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
}

/**
 * 显示下拉建议列表
 */
function showSuggestions(apps) {
  elements.appSuggestions.innerHTML = '';
  apps.forEach(app => {
    const item = document.createElement('div');
    item.className = 'app-suggestion-item';
    item.dataset.app = app;
    item.innerHTML = `
      <img class="suggestion-icon" alt="" />
      <span class="suggestion-icon-placeholder">${escapeHtml(app.charAt(0).toUpperCase())}</span>
      <span>${escapeHtml(app)}</span>
    `;
    item.addEventListener('click', () => selectSuggestion(app));
    elements.appSuggestions.appendChild(item);
    const img = item.querySelector('.suggestion-icon');
    loadAppIcon(img, app);
  });
  elements.appSuggestions.style.display = 'block';
}

/**
 * 隐藏下拉建议列表
 */
function hideSuggestions() {
  elements.appSuggestions.style.display = 'none';
  elements.appSuggestions.innerHTML = '';
  selectedSuggestionIndex = -1;
}

/**
 * 更新键盘导航高亮
 */
function updateSuggestionHighlight(items) {
  items.forEach((item, i) => {
    item.classList.toggle('active', i === selectedSuggestionIndex);
  });
  if (selectedSuggestionIndex >= 0 && items[selectedSuggestionIndex]) {
    items[selectedSuggestionIndex].scrollIntoView({ block: 'nearest' });
  }
}

/**
 * 选择一个建议项并添加到黑名单
 */
async function selectSuggestion(appName) {
  if (config.blocked_apps.includes(appName)) {
    return;
  }
  config.blocked_apps.push(appName);
  elements.newAppInput.value = '';
  hideSuggestions();
  renderAppsList();
  await saveConfig();
}

/**
 * 处理删除 App
 */
async function handleRemoveApp(e) {
  const index = parseInt(e.currentTarget.dataset.index);
  config.blocked_apps.splice(index, 1);

  renderAppsList();
  await saveConfig();
}

/**
 * 处理添加网站
 */
async function handleAddSite() {
  let siteName = elements.newSiteInput.value.trim();

  if (!siteName) {
    return;
  }

  // 自动补充协议头（如果没有）
  if (!siteName.includes('://')) {
    siteName = siteName.replace(/^(www\.)?/, '');
  }

  if (config.blocked_sites.includes(siteName)) {
    alert('该网站已存在');
    return;
  }

  config.blocked_sites.push(siteName);
  elements.newSiteInput.value = '';

  renderSitesList();
  await saveConfig();
}

/**
 * 处理删除网站
 */
async function handleRemoveSite(e) {
  const index = parseInt(e.currentTarget.dataset.index);
  config.blocked_sites.splice(index, 1);

  renderSitesList();
  await saveConfig();
}

/**
 * 处理添加计划
 */
async function handleAddSchedule() {
  config.schedules.push({
    enabled: true,
    start: '09:00',
    end: '12:00',
  });

  renderSchedulesList();
  await saveConfig();
}

/**
 * 处理计划开关切换
 */
async function handleScheduleToggle(e) {
  const index = parseInt(e.target.dataset.index);
  config.schedules[index].enabled = e.target.checked;

  await saveConfig();
}

/**
 * 处理计划时间变更
 */
async function handleScheduleTimeChange(e) {
  const index = parseInt(e.target.dataset.index);
  const field = e.target.dataset.field;

  config.schedules[index][field] = e.target.value;

  await saveConfig();
}

/**
 * 处理删除计划
 */
async function handleRemoveSchedule(e) {
  const index = parseInt(e.currentTarget.dataset.index);
  config.schedules.splice(index, 1);

  renderSchedulesList();
  await saveConfig();
}

/**
 * 处理完成提醒音开关
 */
async function handleSoundToggle(e) {
  config.play_completion_sound = e.target.checked;
  await saveConfig();
}

/**
 * 处理模式切换
 */
async function handleModeToggle(e) {
  config.mode = e.target.checked ? 'scheduled' : 'manual';
  updateModeDescription();

  await saveConfig();
}

/**
 * 选择背景图片
 */
async function handleChooseBg() {
  try {
    const selected = await window.__TAURI__.dialog.open({
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
      multiple: false,
    });
    if (!selected) return;
    const base64 = await API.setBackground(selected);
    showBgPreview(base64);
    applyTimerBackground(base64);
  } catch (e) {
    console.error('选择背景失败:', e);
  }
}

/**
 * 清除背景图片
 */
async function handleClearBg() {
  try {
    await API.clearBackground();
    elements.bgPreviewContainer.style.display = 'none';
    elements.btnClearBg.style.display = 'none';
    applyTimerBackground(null);
  } catch (e) {
    console.error('清除背景失败:', e);
  }
}

/**
 * 加载背景预览
 */
async function loadBgPreview() {
  try {
    const base64 = await API.getBackground();
    if (base64) {
      showBgPreview(base64);
      applyTimerBackground(base64);
    }
  } catch (e) {
    // 无背景图
  }
}

function showBgPreview(base64) {
  elements.bgPreview.src = `data:image/jpeg;base64,${base64}`;
  elements.bgPreviewContainer.style.display = 'block';
  elements.btnClearBg.style.display = 'inline-block';
}

function applyTimerBackground(base64) {
  const bg = document.getElementById('timer-bg');
  const overlay = document.getElementById('timer-bg-overlay');
  if (!bg || !overlay) return;
  if (base64) {
    bg.style.backgroundImage = `url(data:image/jpeg;base64,${base64})`;
    bg.style.display = 'block';
    overlay.style.display = 'block';
  } else {
    bg.style.display = 'none';
    overlay.style.display = 'none';
  }
}

/**
 * 保存配置到后端
 */
async function saveConfig() {
  try {
    await API.saveConfig(config);
    console.log('配置已自动保存');
  } catch (error) {
    console.error('保存配置失败:', error);
    alert('保存配置失败: ' + error);
  }
}

/**
 * 异步加载 App 图标并填充到 img 元素
 */
async function loadAppIcon(imgElement, appName) {
  if (appIconCache[appName]) {
    imgElement.src = `data:image/png;base64,${appIconCache[appName]}`;
    return;
  }
  try {
    const base64 = await API.getAppIcon(appName);
    appIconCache[appName] = base64;
    imgElement.src = `data:image/png;base64,${base64}`;
  } catch (e) {
    // 加载失败，显示首字母占位
    imgElement.style.display = 'none';
    const placeholder = imgElement.nextElementSibling;
    if (placeholder) placeholder.style.display = 'flex';
  }
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 获取当前配置
 */
export function getConfig() {
  return config;
}

export default {
  init,
  render,
  getConfig,
};

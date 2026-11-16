/**
 * 小型 DOM 工具：查询、建元素、转义、提示、确认弹窗、首字母头像。
 */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * h('button', { class: 'btn', onclick, dataset: { id } }, '文本', child)
 * 字符串子节点按纯文本插入，天然防注入。
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** 后端错误可能是字符串或 Error */
export function errorText(err) {
  if (!err) return '未知错误';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

let toastTimer = null;
/** 底部轻提示，替代 alert() */
export function toast(message, ms = 2800) {
  let el = $('#toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/**
 * 自定义确认弹窗。
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title = '确认', message = '', okText = '确定', cancelText = '取消' } = {}) {
  return new Promise((resolve) => {
    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
    };
    const cancel = h('button', { class: 'btn btn--primary', type: 'button', onclick: () => close(false) }, cancelText);
    const ok = h('button', { class: 'btn', type: 'button', onclick: () => close(true) }, okText);
    const backdrop = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'dialog' },
        h('p', { class: 'dialog-title' }, title),
        h('p', { class: 'dialog-body' }, message),
        h('div', { class: 'dialog-actions' }, ok, cancel),
      ),
    );
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
    document.addEventListener('keydown', onKey);
    document.body.append(backdrop);
    cancel.focus();
  });
}

/** 首字母头像（图标加载失败或 Windows 上的回退） */
export function letterAvatar(name) {
  const letter = String(name || '?').trim().charAt(0).toUpperCase() || '?';
  return h('span', { class: 'avatar', 'aria-hidden': 'true' }, letter);
}

/** 本地存储便利封装：失败时静默 */
export const prefs = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 隐私模式等情况下忽略 */
    }
  },
};

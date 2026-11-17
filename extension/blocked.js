// 番茄专注 - 拦截页逻辑（Chrome / Edge / Safari 共用）
(function () {
  // 拦截页只应作为顶层页面出现。被别的网站用 iframe 嵌入时什么都不做，
  // 否则"关闭此页"拿到的 tabs.getCurrent() 会是外层网页的标签页。
  if (window.top !== window) {
    document.documentElement.textContent = '';
    return;
  }

  const api = globalThis.browser ?? globalThis.chrome;

  const QUOTES = [
    '每一个番茄钟，都在把你推向更好的自己。',
    '现在多专注 25 分钟，考试周就少熬一个夜。',
    '先把手头这一小步做完，再奖励自己休息。',
    '分心只要一秒，重新进入状态却要很久。',
    '你已经开始了，这本身就很了不起。',
    '把注意力留给真正重要的事。',
  ];

  const params = new URLSearchParams(location.search);
  const site = params.get('site');
  const from = params.get('from');

  const $ = (id) => document.getElementById(id);

  if (site) $('site').textContent = site;
  $('quote').textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)];

  // 只允许返回 http/https 地址
  let backUrl = null;
  try {
    const u = new URL(from || '');
    if (u.protocol === 'http:' || u.protocol === 'https:') backUrl = u.href;
  } catch {
    backUrl = null;
  }

  $('close-btn').addEventListener('click', async () => {
    try {
      const tab = await api.tabs.getCurrent();
      if (tab && typeof tab.id === 'number') {
        await api.tabs.remove(tab.id);
        return;
      }
    } catch {
      // 回退到 window.close
    }
    window.close();
    setTimeout(() => {
      location.href = 'about:blank';
    }, 300);
  });

  $('back-btn').addEventListener('click', (event) => {
    event.preventDefault();
    if (backUrl) location.href = backUrl;
  });

  function showFinished() {
    $('badge').textContent = '专注已结束';
    $('title').textContent = '辛苦了，这一轮专注完成了';
    $('site-line').textContent = '这一轮专注已经结束，可以放心打开了。';
    $('hint').textContent = '准备好了就回来开始下一个番茄钟。';
    $('close-btn').textContent = '关闭此页';
    if (backUrl) {
      $('back-btn').textContent = site ? `返回 ${site}` : '返回原网页';
      $('back-btn').classList.remove('hidden');
    }
  }

  let finished = false;
  async function checkStatus() {
    if (finished || !api?.runtime?.sendMessage) return;
    try {
      const res = await api.runtime.sendMessage({ type: 'pomodoro:getStatus' });
      if (res && res.focusing === false) {
        finished = true;
        showFinished();
      }
    } catch {
      // 后台暂不可用，稍后再试
    }
  }

  checkStatus();
  setInterval(checkStatus, 5000);
})();

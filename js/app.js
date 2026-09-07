/* ============================================================
   app.js · 启动 / 路由 / 实时时钟 / 快捷键 / 离线注册
   ============================================================ */
window.App = (function () {
  'use strict';
  var S = Store, U = UI;

  var viewRoot = null;
  var current = 'calendar';
  var pending = false;
  var newSw = null;

  var VIEWS = {
    calendar: { mod: function () { return Calendar; }, title: '日历' },
    modules: { mod: function () { return Modules; }, title: '模组' },
    stats: { mod: function () { return Stats; }, title: '统计' },
    settings: { mod: function () { return Settings; }, title: '设置' }
  };

  /* ---------- 视图切换 ---------- */
  function go(name) {
    if (!VIEWS[name]) name = 'calendar';
    current = name;
    U.qsa('.nav-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-view') === name);
    });
    viewRoot.innerHTML = '<div class="view"></div>';
    var holder = U.qs('.view', viewRoot);
    VIEWS[name].mod().mount(holder);
    // 记住上次停留的面板（不触发重渲染循环）
    try {
      var st = S.settings();
      if (st.lastView !== name) { st.lastView = name; st.updatedAt = Date.now(); S.persist(); }
    } catch (e) {}
  }

  function renderCurrent() {
    var holder = U.qs('.view', viewRoot);
    if (holder) VIEWS[current].mod().render ? VIEWS[current].mod().render() : VIEWS[current].mod().mount(holder);
  }

  /* ---------- 实时时钟 ---------- */
  function startClock() {
    var el = document.getElementById('liveClockText');
    if (!el) return;
    function tick() {
      var d = new Date();
      el.textContent = S.pad(d.getHours()) + ':' + S.pad(d.getMinutes()) + ':' + S.pad(d.getSeconds());
    }
    tick();
    setInterval(tick, 1000);

    // 每分钟刷新日历里的倒计时与"今天"状态
    var lastDay = S.todayStr();
    setInterval(function () {
      Calendar.tick();
      var t = S.todayStr();
      if (t !== lastDay) { lastDay = t; renderCurrent(); }  // 跨天自动重绘
    }, 30000);
  }

  /* ---------- 快捷键 ---------- */
  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (U.qs('.mask')) return; // 有弹窗时不响应

      if (e.key === 'ArrowLeft' && current === 'calendar') { Calendar.shiftMonth(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight' && current === 'calendar') { Calendar.shiftMonth(1); e.preventDefault(); }
      else if (e.key === 't' || e.key === 'T') { if (current === 'calendar') { Calendar.goToday(); e.preventDefault(); } }
      else if (e.key === 'n' || e.key === 'N') { Schedule.openEditor({}); e.preventDefault(); }
    });
  }

  /* ---------- 离线注册 ---------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              newSw = sw;
              U.toast('有新版本，点此刷新', 'ok');
            }
          });
        });
      }).catch(function () { /* 本地 file:// 打开时会失败，忽略 */ });
    });
    // 点击 toast 刷新
    document.getElementById('toastRoot').addEventListener('click', function () {
      if (newSw) { newSw.postMessage({ type: 'SKIP_WAITING' }); location.reload(); }
    });
  }

  /* ---------- 首次引导 ---------- */
  function onboarding() {
    if (S.modules().length) return;
    var seen = false;
    try { seen = sessionStorage.getItem('mote-onboarded') === '1'; } catch (e) {}
    if (seen) return;
    try { sessionStorage.setItem('mote-onboarded', '1'); } catch (e) {}

    setTimeout(function () {
      U.modal({
        title: '开始使用 MOTE跑团日历',
        icon: 'i-calendar',
        body:
          '<p style="margin:0 0 14px;color:var(--ink-2);line-height:1.8">' +
            '先建一个「模组」（你要跑的团），再为它排期：<br>' +
            '<b>每周固定</b>——每周固定周几、固定时间，自动重复；<br>' +
            '<b>单次指定</b>——临时加的一场，选日期和时间。' +
          '</p>' +
          '<div class="set-note">跑完把场次标记为「已完成」即自动累计时长；因故不开的场标记为「取消」，不计入时长也不删除。</div>',
        buttons: [
          { text: '稍后自己看看', kind: 'ghost', onClick: function (m, c) { c(); } },
          { text: '创建第一个模组', kind: 'primary', icon: 'i-plus', onClick: function (m, c) { c(); Modules.openEditor({}); } }
        ]
      });
    }, 500);
  }

  /* ---------- 启动 ---------- */
  function init() {
    viewRoot = document.getElementById('viewRoot');

    // 导航
    U.qsa('.nav-btn').forEach(function (b) {
      b.addEventListener('click', function () { go(b.getAttribute('data-view')); });
    });
    // 快速新建
    document.getElementById('btnQuickAdd').addEventListener('click', function () {
      if (!S.modules().length) { U.toast('请先创建模组', 'warn'); Modules.openEditor({}); return; }
      Schedule.openEditor({ date: S.todayStr(), weekday: S.weekdayOf(S.todayStr()) });
    });

    // 检查更新
    var btnReload = document.getElementById('btnReload');
    if (btnReload) btnReload.addEventListener('click', function () {
      // 标记本次刷新来自"检查更新"：刷新后跳转模组页 + 自动展开已归档
      try {
        localStorage.setItem('mote-coc-calendar:show-archived-on-load', '1');
        var st = S.settings();
        st.lastView = 'modules'; st.updatedAt = Date.now(); S.persist();
      } catch (e) {}
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          if (!regs.length) { U.toast('未启用离线缓存'); try { localStorage.removeItem('mote-coc-calendar:show-archived-on-load'); } catch (e) {} return; }
          regs.forEach(function (r) { r.update().catch(function () {}); });
          U.toast('正在检查更新…');
          setTimeout(function () { location.reload(); }, 900);
        });
      } else { location.reload(); }
    });

    // 数据变更 -> 合并渲染
    S.onChange(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; renderCurrent(); });
    });

    S.load().then(function (src) {
      var last = S.settings().lastView;
      go(VIEWS[last] ? last : 'calendar');
      startClock();
      bindKeys();
      onboarding();
      if (src === 'idb') U.toast('已从本地存档恢复数据');
      if (src === 'merged') U.toast('已合并本地存档');
    }).catch(function (e) {
      console.error(e);
      go('calendar');
      startClock();
    });

    registerSW();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { go: go, render: renderCurrent, currentView: function () { return current; } };
})();

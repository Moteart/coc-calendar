/* ============================================================
   ui.js · 通用界面工具：图标 / 转义 / 弹窗 / Toast / 确认框
   ============================================================ */
window.UI = (function () {
  'use strict';

  /* ---------- 转义 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ---------- 线性图标 ---------- */
  function icon(name, cls) {
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#' + name + '"/></svg>';
  }

  /* ---------- DOM 助手 ---------- */
  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = String(html).trim();
    return t.content.firstElementChild;
  }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- 日期文案 ---------- */
  function dateCn(s) {
    var d = Store.parse(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + Store.WD_CN[d.getDay()];
  }
  function dateShort(s) {
    var d = Store.parse(s);
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  /* 相对今天的说法 */
  function relativeDay(s) {
    var n = Store.diffDays(Store.todayStr(), s);
    if (n === 0) return '今天';
    if (n === 1) return '明天';
    if (n === 2) return '后天';
    if (n === -1) return '昨天';
    if (n > 0) return n + ' 天后';
    return Math.abs(n) + ' 天前';
  }
  /* 已开场的场次：距开场还有多久（用于"即将到来"） */
  function countdown(s, t) {
    var now = new Date();
    var cur = now.getHours() * 60 + now.getMinutes();
    var n = Store.diffDays(Store.todayStr(), s);
    var target = Store.timeToMin(t);
    var delta = n * 1440 + (target - cur);
    if (delta < 0) return '已开始';
    if (delta < 60) return delta + ' 分钟后';
    if (delta < 1440) return Math.floor(delta / 60) + ' 小时后';
    return Math.floor(delta / 1440) + ' 天后';
  }

  /* ---------- Toast ---------- */
  var toastTimer = [];
  function toast(msg, type) {
    var root = document.getElementById('toastRoot');
    var t = el('<div class="toast ' + (type || '') + '">' +
      icon(type === 'err' ? 'i-alert' : type === 'warn' ? 'i-alert' : 'i-check') +
      '<span>' + esc(msg) + '</span></div>');
    root.appendChild(t);
    var id = setTimeout(function () {
      t.classList.add('is-out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 200);
    }, type === 'err' ? 3600 : 2200);
    toastTimer.push(id);
    while (root.children.length > 4) root.removeChild(root.firstChild);
  }

  /* ---------- 弹窗 ---------- */
  var openModals = [];

  /**
   * opts: { title, icon, wide, body(HTML字符串|Node), buttons:[{text,icon,kind,onClick(el,close)}], onMount(root, close) }
   * 返回 close 函数
   */
  function modal(opts) {
    var root = document.getElementById('modalRoot');
    var buttons = opts.buttons || [];
    var footHtml = buttons.length
      ? '<div class="modal-foot"><span class="spacer"></span>' + buttons.map(function (b, i) {
          return '<button class="btn ' + (b.kind === 'primary' ? 'btn-primary' : b.kind === 'danger' ? 'btn-danger' : b.kind === 'ghost' ? 'btn-ghost' : '') +
            '" data-bi="' + i + '">' + (b.icon ? icon(b.icon) : '') + '<span>' + esc(b.text) + '</span></button>';
        }).join('') + '</div>'
      : (opts.footnote ? '<div class="modal-foot"><span class="set-note" style="margin:0">' + opts.footnote + '</span></div>' : '');

    var mask = el(
      '<div class="mask">' +
        '<div class="modal' + (opts.wide ? ' modal-wide' : '') + (opts.cls ? ' ' + opts.cls : '') + '" role="dialog" aria-modal="true">' +
          '<div class="modal-head">' +
            '<div class="modal-title">' + icon(opts.icon || 'i-edit') + '<span>' + esc(opts.title || '') + '</span></div>' +
            '<button class="btn btn-ghost btn-icon" data-close aria-label="关闭">' + icon('i-x') + '</button>' +
          '</div>' +
          '<div class="modal-body"></div>' +
          footHtml +
        '</div>' +
      '</div>'
    );

    var bodyEl = qs('.modal-body', mask);
    if (typeof opts.body === 'string') bodyEl.innerHTML = opts.body;
    else if (opts.body) bodyEl.appendChild(opts.body);

    function close() {
      if (!mask.parentNode) return;
      mask.parentNode.removeChild(mask);
      var i = openModals.indexOf(close);
      if (i >= 0) openModals.splice(i, 1);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape' && openModals[openModals.length - 1] === close) { e.preventDefault(); close(); }
    }

    mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });
    qsa('[data-close]', mask).forEach(function (b) { b.addEventListener('click', close); });
    qsa('[data-bi]', mask).forEach(function (b) {
      b.addEventListener('click', function () {
        var def = buttons[+b.getAttribute('data-bi')];
        if (def && def.onClick) def.onClick(mask, close);
      });
    });

    root.appendChild(mask);
    openModals.push(close);
    document.addEventListener('keydown', onKey);
    if (opts.onMount) opts.onMount(mask, close);
    var focusable = qs('input,textarea,select,button[data-bi="0"]', bodyEl);
    if (focusable && !opts.noFocus) setTimeout(function () { try { focusable.focus(); } catch (e) {} }, 30);
    return close;
  }

  /* ---------- 确认框 ---------- */
  function confirm(opts) {
    return new Promise(function (resolve) {
      modal({
        title: opts.title || '确认操作',
        icon: opts.icon || 'i-alert',
        body: '<p style="margin:0;line-height:1.75;color:var(--ink-2)">' + esc(opts.text || '') + '</p>' +
              (opts.hint ? '<p class="set-note" style="margin-top:10px">' + esc(opts.hint) + '</p>' : ''),
        buttons: [
          { text: opts.cancelText || '取消', kind: 'ghost', onClick: function (m, c) { c(); resolve(false); } },
          { text: opts.okText || '确认', kind: opts.danger ? 'danger' : 'primary', onClick: function (m, c) { c(); resolve(true); } }
        ]
      });
    });
  }

  /* ---------- 数值输入（时长） ----------
     同一弹窗内可能有多组（如 默认时长 / 补录时长），用 group 区分 */
  function durField(opts) {
    var v = Math.max(0, Math.round(opts.value || 0));
    var g = opts.group || 'd';
    var h = Math.floor(v / 60), m = v % 60;
    return '<div class="field">' +
      (opts.label ? '<label class="field-label">' + esc(opts.label) +
        (opts.hint ? '<span class="hint">' + esc(opts.hint) + '</span>' : '') + '</label>' : '') +
      '<div class="dur-input" data-dur-group="' + esc(g) + '">' +
        '<input class="input" type="number" min="0" max="23" step="1" data-dur-h value="' + h + '" inputmode="numeric">' +
        '<span class="u">小时</span>' +
        '<input class="input" type="number" min="0" max="59" step="5" data-dur-m value="' + m + '" inputmode="numeric">' +
        '<span class="u">分钟</span>' +
      '</div>' +
    '</div>';
  }
  /* 读取：不传 group 时取容器内第一组 */
  function readDurField(root, group) {
    var scope = root;
    if (group) {
      scope = qs('[data-dur-group="' + group + '"]', root);
      if (!scope) return 0;
    }
    var hEl = qs('[data-dur-h]', scope), mEl = qs('[data-dur-m]', scope);
    if (!hEl || !mEl) return 0;
    var h = +hEl.value || 0, m = +mEl.value || 0;
    return Math.max(0, h * 60 + m);
  }
  /* 绑定进位：给容器内所有组都绑上 */
  function bindDurField(root) {
    qsa('[data-dur-group]', root).forEach(function (g) {
      var mEl = qs('[data-dur-m]', g), hEl = qs('[data-dur-h]', g);
      if (!mEl || !hEl) return;
      mEl.addEventListener('change', function () {
        var v = +mEl.value || 0;
        if (v >= 60) { hEl.value = (+hEl.value || 0) + Math.floor(v / 60); mEl.value = v % 60; }
        if (v < 0) mEl.value = 0;
      });
      hEl.addEventListener('change', function () { if ((+hEl.value || 0) < 0) hEl.value = 0; });
    });
  }

  /* ---------- 空状态 ---------- */
  function empty(iconName, text, sub) {
    return '<div class="empty">' + icon(iconName, 'ic-lg') +
      '<div>' + esc(text) + '</div>' +
      (sub ? '<div style="font-size:12px;color:var(--ink-4);margin-top:4px">' + esc(sub) + '</div>' : '') +
      '</div>';
  }

  return {
    esc: esc, icon: icon, el: el, qs: qs, qsa: qsa,
    dateCn: dateCn, dateShort: dateShort, relativeDay: relativeDay, countdown: countdown,
    toast: toast, modal: modal, confirm: confirm,
    durField: durField, readDurField: readDurField, bindDurField: bindDurField, empty: empty
  };
})();

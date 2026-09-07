/* ============================================================
   calendar.js · 实时月历视图 + 侧栏概览
   - satellite 实例 time 为 null，显示为「卫星」文字
   ============================================================ */
window.Calendar = (function () {
  'use strict';
  var S = Store, U = UI, esc = U.esc, icon = U.icon;

  var cursor = null;      // { y, m } 当前浏览的月份（m 为 1-12）
  var rootEl = null;
  var gridStart = null, gridDays = 42;
  var clockTimer = null;

  function curStr() { return cursor.y + '-' + S.pad(cursor.m) + '-01'; }

  /* inst 是否跨午夜（有明确 time 且 duration 使结束 >= 24:00） */
  function isSpanning(it) {
    if (it.satellite || !it.time) return false;
    var endMin = S.timeToMin(it.time) + (it.duration || 0);
    return endMin >= 1440;
  }

  /* 格式化 inst 时间显示为 "HH-HH点" 或 "HH:MM-HH:MM" */
  function fmtInstTime(it) {
    if (it.satellite) return '卫星';
    if (!it.time) return '';
    var startMin = S.timeToMin(it.time);
    var endMin = startMin + (it.duration || 0);
    var startH = Math.floor(startMin / 60), startM = startMin % 60;
    var endH = Math.floor(endMin / 60), endM = endMin % 60;
    var spanning = endMin >= 1440;
    if (spanning) endH = endH % 24;
    if (startM === 0 && endM === 0) {
      return startH + '-' + (spanning ? '次日' : '') + endH + '点';
    }
    return S.pad(startH) + ':' + S.pad(startM) + '-' +
      (spanning ? '次日' : '') + S.pad(endH) + ':' + S.pad(endM);
  }

  function ensureCursor() {
    if (cursor) return;
    var t = S.todayStr().split('-');
    cursor = { y: +t[0], m: +t[1] };
  }

  function shiftMonth(n) {
    ensureCursor();
    var d = new Date(cursor.y, cursor.m - 1 + n, 1);
    cursor = { y: d.getFullYear(), m: d.getMonth() + 1 };
    render();
  }

  function goToday() {
    var t = S.todayStr().split('-');
    cursor = { y: +t[0], m: +t[1] };
    render();
  }

  /* ---------- 主渲染 ---------- */
  function render() {
    ensureCursor();
    if (cursor.m < 1) { cursor.m = 12; cursor.y--; }
    if (cursor.m > 12) { cursor.m = 1; cursor.y++; }
    if (!rootEl) return;

    var first = curStr();
    var last = S.monthEnd(first);
    var ws = +S.settings().weekStart || 1;
    var offset = (S.weekdayOf(first) - ws + 7) % 7;
    gridStart = S.addDays(first, -offset);

    var lastOffset = (6 - ((S.weekdayOf(last) - ws + 7) % 7));
    var need = offset + S.daysInMonth(first) + lastOffset;
    gridDays = need <= 35 ? 35 : 42;

    var today = S.todayStr();
    var insts = S.expand(gridStart, S.addDays(gridStart, gridDays - 1));
    var byDate = {};
    insts.forEach(function (it) { (byDate[it.date] = byDate[it.date] || []).push(it); });

    /* 识别跨午夜 inst：从源 cell 移除，单独收集用于 spanning 渲染 */
    var spanningList = [];   // [{ inst, startIdx, span }]
    var filtered = {};       // 不含 spanning 的 byDate 副本
    Object.keys(byDate).forEach(function (d) {
      filtered[d] = [];
      byDate[d].forEach(function (it) {
        if (isSpanning(it)) {
          var kStart = S.diffDays(gridStart, d);
          var kEnd = kStart + 1;
          if (kEnd >= 0 && kEnd < gridDays) {
            var rowStart = Math.floor(kStart / 7) + 1;
            var colStart = (kStart % 7) + 1;
            if (colStart + 1 <= 7) {
              spanningList.push({ inst: it, startIdx: kStart, span: 2, row: rowStart, col: colStart });
            } else {
              spanningList.push({ inst: it, startIdx: kStart, span: 8 - colStart, row: rowStart, col: colStart, isPart: true });
              spanningList.push({ inst: it, startIdx: kStart, span: 1, row: rowStart + 1, col: 1, isPart: true, isTail: true });
            }
          } else {
            filtered[d].push(it);
          }
        } else {
          filtered[d].push(it);
        }
      });
    });

    var head = '';
    for (var i = 0; i < 7; i++) {
      var w = (ws + i) % 7;
      head += '<span class="' + (w === 0 || w === 6 ? 'is-weekend' : '') + '">周' + S.wdCn(w) + '</span>';
    }

    var cells = '';
    for (var k = 0; k < gridDays; k++) {
      cells += cellHtml(S.addDays(gridStart, k), first, today, filtered);
    }

    /* 生成 spanning HTML：定位到 cal-grid 的正确 grid-column / grid-row */
    /* 按 inst 的起始时间排序，决定在同一行内的垂直排列顺序 */
    spanningList.sort(function (a, b) {
      var ta = S.timeToMin(a.inst.time || '99:99');
      var tb = S.timeToMin(b.inst.time || '99:99');
      return ta - tb;
    });
    var spanningHtml = spanningList.map(function (s) {
      var it = s.inst;
      var timeLabel = fmtInstTime(it);
      var order = S.timeToMin(it.time || '99:99');
      var cls = 'cal-ev is-spanning' +
        (it.status === 'done' ? ' is-done' : it.status === 'cancelled' ? ' is-cancel' : '') +
        (it.satellite ? ' is-satellite' : '') +
        (s.isPart ? ' is-part' : '') + (s.isTail ? ' is-tail' : '');
      return '<div class="' + cls + '" style="--ev-color:' + esc(it.module.color) + ';grid-column:' + s.col + '/span ' + s.span + ';grid-row:' + s.row + ';order:' + order + '" data-ev="' + esc(it.key) + '" title="' +
        esc(it.module.name + ' · ' + timeLabel + ' · ' + S.fmtDur(it.duration) + (it.note ? '\n' + it.note : '')) + '">' +
        '<span class="cal-ev-time">' + esc(timeLabel) + '</span>' +
        '<span class="cal-ev-name">' + esc(it.module.name) + '</span>' +
        '<span class="cal-ev-dur">' + esc(S.fmtDur(it.duration)) + '</span>' +
        '</div>';
    }).join('');

    rootEl.innerHTML =
      '<div class="cal-main">' +
        '<div class="cal-bar">' +
          '<div class="cal-nav">' +
            '<button class="btn btn-icon" data-act="prev" title="上一月">' + icon('i-chev-left') + '</button>' +
            '<button class="btn btn-icon" data-act="next" title="下一月">' + icon('i-chev-right') + '</button>' +
          '</div>' +
          '<div class="cal-month">' + cursor.y + '年' + cursor.m + '月' +
            '<small>' + (cursor.y + '-' + S.pad(cursor.m)) + '</small></div>' +
          '<button class="btn btn-sm" data-act="today">' + icon('i-dot') + '<span>回到今天</span></button>' +
          '<span class="spacer"></span>' +
          '<div class="legend">' +
            '<span class="legend-item"><i class="legend-dot" style="background:var(--accent)"></i>计划中</span>' +
            '<span class="legend-item"><i class="legend-line" style="border-color:var(--ok)"></i>已完成</span>' +
            '<span class="legend-item"><i class="legend-line" style="border-color:var(--danger);border-top-style:dashed"></i>已取消</span>' +
            '<span class="legend-item"><i class="legend-line" style="border-color:var(--ink-3);border-top-style:dotted"></i>卫星</span>' +
          '</div>' +
        '</div>' +
        '<div class="cal-grid-wrap">' +
          '<div class="cal-weekhead">' + head + '</div>' +
          '<div class="cal-grid">' + cells + spanningHtml + '</div>' +
        '</div>' +
      '</div>' +
      '<aside class="cal-side" id="calSide">' + sideHtml(today) + '</aside>';

    bind();
  }

  function cellHtml(date, monthFirst, today, byDate) {
    var d = S.parse(date);
    var w = d.getDay();
    var out = date < monthFirst || date > S.monthEnd(monthFirst);
    var isToday = date === today;
    var list = byDate[date] || [];
    var cls = 'cal-cell' +
      (out ? ' is-out' : '') +
      ((w === 0 || w === 6) ? ' is-weekend' : '') +
      (isToday ? ' is-today' : '');

    /* 显式 grid 定位，防止 spanning 元素的 grid-row 干扰 cell 自动布局 */
    var cellIdx = S.diffDays(gridStart, date);
    var cellRow = Math.floor(cellIdx / 7) + 1;
    var cellCol = (cellIdx % 7) + 1;
    var gridStyle = 'grid-column:' + cellCol + ';grid-row:' + cellRow;

    var num = '<div class="cal-daynum">' + d.getDate() +
      (isToday ? '<span class="badge-today">今天</span><i class="mark-now"></i>' : '') +
      '</div>';

    var evs = '<div class="cal-events">';
    var max = 3;
    list.slice(0, max).forEach(function (it) {
      var timeLabel = fmtInstTime(it);
      evs += '<div class="cal-ev' +
        (it.status === 'done' ? ' is-done' : it.status === 'cancelled' ? ' is-cancel' : '') +
        (it.satellite ? ' is-satellite' : '') +
        '" style="--ev-color:' + esc(it.module.color) + '" data-ev="' + esc(it.key) + '" title="' +
        esc(it.module.name + ' · ' + timeLabel + ' · ' + S.fmtDur(it.duration) + (it.note ? '\n' + it.note : '')) + '">' +
        '<span class="cal-ev-time">' + esc(timeLabel) + '</span>' +
        '<span class="cal-ev-name">' + esc(it.module.name) + '</span>' +
        '<span class="cal-ev-dur">' + esc(S.fmtDur(it.duration)) + '</span>' +
        '</div>';
    });
    if (list.length > max) {
      evs += '<div class="cal-ev-more" data-more="' + esc(date) + '">+' + (list.length - max) + ' 项</div>';
    }
    evs += '</div>';

    return '<div class="' + cls + '" style="' + gridStyle + '" data-date="' + esc(date) + '">' +
      num + evs +
      '<button class="cal-cell-add" data-add="' + esc(date) + '" title="在此新建">' + icon('i-plus') + '</button>' +
      '</div>';
  }

  /* ---------- 侧栏 ---------- */
  function sideHtml(today) {
    var t = today;
    var monthS = S.monthStart(t), monthE = S.monthEnd(t);
    var monthInsts = S.expand(monthS, monthE);
    var todayInsts = monthInsts.filter(function (i) { return i.date === t; });

    var todayPlan = 0, todayDone = 0, todayCancel = 0;
    todayInsts.forEach(function (i) {
      if (i.status === 'cancelled') { todayCancel++; return; }
      todayPlan += i.duration;
      if (i.status === 'done') todayDone += i.duration;
    });

    var mDone = 0, mCount = 0, mCancel = 0;
    monthInsts.forEach(function (i) {
      if (i.status === 'done') { mDone += i.duration; mCount++; }
      else if (i.status === 'cancelled') mCancel++;
    });

    // 未来 21 天内即将到来（含今天未开始的）；卫星待定不进入
    var upcoming = S.expand(t, S.addDays(t, 21)).filter(function (i) {
      if (i.status !== 'planned') return false;
      if (i.satellite) return false;
      if (i.date === t) {
        var now = new Date();
        return S.timeToMin(i.time) >= now.getHours() * 60 + now.getMinutes();
      }
      return true;
    }).slice(0, 7);

    var pending = S.stats('month').pending;

    /* 今日排期卡片 */
    var todayCards = todayInsts.length
      ? '<div class="today-cards">' + todayInsts.map(function (i) {
          var sm = i.time ? S.timeToMin(i.time) : 0;
          var em = sm + i.duration;
          var timeStr = i.time ? S.minToTime(sm) + '-' + S.minToTime(em) : '卫星';
          return '<div class="today-card' +
            (i.status === 'done' ? ' is-done' : i.status === 'cancelled' ? ' is-cancel' : '') +
            '" style="--ev-color:' + esc(i.module.color) + '" data-ev="' + esc(i.key) + '">' +
            '<div class="today-card-head" style="background:' + esc(i.module.color) + '">' +
              '<span class="today-card-time">' + esc(timeStr) + '</span>' +
            '</div>' +
            '<div class="today-card-body">' +
              '<div class="today-card-name">' + esc(i.module.name) + '</div>' +
              '<div class="today-card-meta">' + esc(S.fmtDur(i.duration)) +
              (i.note ? ' · ' + esc(i.note.slice(0, 15)) : '') + '</div>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>'
      : '<div class="set-note" style="text-align:center;padding:8px 0 2px">今天没有排期</div>';

    return '' +
      '<div class="side-block today-block">' +
        '<div class="today-layout">' +
          /* 左栏：日期+实时时钟 */
          '<div class="today-left">' +
            '<div class="today-date-big" data-today-clock>' +
              '<div class="today-date-text">' + esc(U.dateCn(t)) + '</div>' +
              '<div class="today-clock" data-clock>00:00:00</div>' +
            '</div>' +
          '</div>' +
          /* 中栏：今日场次+计划时长（上下排列） */
          '<div class="today-mid">' +
            '<div class="today-stat"><div class="ks">今日场次</div><div class="vs">' + todayInsts.length + '<small>场</small></div></div>' +
            '<div class="today-stat"><div class="ks">计划时长</div><div class="vs">' + esc(S.fmtDur(todayPlan)) + '</div></div>' +
          '</div>' +
          /* 右栏：今日事项（排期卡片，一行最多3个） */
          '<div class="today-right">' +
            '<div class="today-section-head">' + icon('i-list') + '<span class="t">今日事项</span></div>' +
            todayCards +
          '</div>' +
        '</div>' +
      '</div>' +

      (pending.length ? '<div class="side-block">' +
        '<div class="side-head">' + icon('i-alert') + '<span class="t">待确认</span>' +
          '<span class="spacer"></span><span class="chip is-accent">' + pending.length + ' 场</span></div>' +
        '<div class="set-note" style="margin:0 0 9px">这些已过期的场次尚未标记完成或取消，未计入时长。</div>' +
        '<div class="up-list">' + pending.slice(0, 4).map(function (i) {
          return '<div class="up-item" style="--ev-color:' + esc(i.module.color) + '" data-ev="' + esc(i.key) + '">' +
            '<span class="up-bar"></span><div class="up-main">' +
            '<div class="up-name">' + esc(i.module.name) + '</div>' +
            '<div class="up-meta">' + esc(U.dateShort(i.date)) + ' ' + esc(i.time || '卫星') + ' · ' + esc(S.fmtDur(i.duration)) + '</div>' +
            '</div><span class="up-when">' + esc(U.relativeDay(i.date)) + '</span></div>';
        }).join('') + '</div>' +
        '<button class="btn btn-sm btn-block" data-act="confirm-all" style="margin-top:9px">' + icon('i-check') + '<span>全部标记为已完成</span></button>' +
      '</div>' : '') +

      '<div class="side-block">' +
        '<div class="side-head">' + icon('i-chart') + '<span class="t">本月进度</span></div>' +
        '<div class="stat-row" style="margin-bottom:9px">' +
          '<div class="stat-box"><div class="k">已完成</div><div class="v">' + esc(S.fmtDur(mDone)) + '</div></div>' +
          '<div class="stat-box"><div class="k">场次</div><div class="v">' + mCount + '<small>场</small></div></div>' +
          (mCancel ? '<div class="stat-box"><div class="k">取消</div><div class="v">' + mCancel + '<small>场</small></div></div>' : '') +
        '</div>' +
        '<button class="btn btn-sm btn-block" data-act="gostats">' + icon('i-chart') + '<span>查看时长统计</span></button>' +
      '</div>';
  }

  function upItemHtml(i) {
    var timeLabel = i.satellite ? '卫星' : (i.time || '');
    return '<div class="up-item' +
      (i.status === 'done' ? ' is-done' : i.status === 'cancelled' ? ' is-cancel' : '') +
      (i.satellite ? ' is-satellite' : '') +
      '" style="--ev-color:' + esc(i.module.color) + '" data-ev="' + esc(i.key) + '">' +
      '<span class="up-bar"></span>' +
      '<div class="up-main">' +
        '<div class="up-name">' + esc(i.module.name) + '</div>' +
        '<div class="up-meta">' +
          '<span>' + esc(U.dateShort(i.date)) + '</span>' +
          '<span>' + esc(timeLabel) + '</span>' +
          '<span>' + esc(S.fmtDur(i.duration)) + '</span>' +
          (i.note ? '<span style="color:var(--ink-4)">· ' + esc(i.note.slice(0, 12)) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<span class="up-when" data-cd="' + esc(i.date) + '|' + esc(i.time || '') + '">' + (i.satellite ? '卫星' : esc(U.countdown(i.date, i.time))) + '</span>' +
      '</div>';
  }

  /* ---------- 事件绑定 ---------- */
  function bind() {
    var el = rootEl;

    U.qs('[data-act="prev"]', el).addEventListener('click', function () { shiftMonth(-1); });
    U.qs('[data-act="next"]', el).addEventListener('click', function () { shiftMonth(1); });
    U.qs('[data-act="today"]', el).addEventListener('click', goToday);

    /* 实时时钟 */
    var clockEl = U.qs('[data-clock]', el);
    if (clockEl) {
      var tick = function () {
        var n = new Date();
        var h = String(n.getHours()).padStart(2, '0');
        var m = String(n.getMinutes()).padStart(2, '0');
        var s = String(n.getSeconds()).padStart(2, '0');
        clockEl.textContent = h + ':' + m + ':' + s;
      };
      tick();
      if (clockTimer) clearInterval(clockTimer);
      clockTimer = setInterval(tick, 1000);
    }

    var gostats = U.qs('[data-act="gostats"]', el);
    if (gostats) gostats.addEventListener('click', function () { App.go('stats'); });

    var confirmAll = U.qs('[data-act="confirm-all"]', el);
    if (confirmAll) confirmAll.addEventListener('click', function () {
      var pending = S.stats('month').pending.slice();
      if (!pending.length) return;
      U.confirm({
        title: '批量标记为已完成？',
        text: '将把 ' + pending.length + ' 场已过期但未标记的场次记为已完成，并计入时长统计。',
        hint: '若其中有实际取消的场次，请到日历中单独标记为「取消」。',
        okText: '全部标记'
      }).then(function (ok) {
        if (!ok) return;
        pending.forEach(function (i) { S.setInstStatus(i.sessionId, i.date, 'done'); });
        U.toast('已确认 ' + pending.length + ' 场');
      });
    });

    // 点击日期格（空白处）→ 新建
    U.qsa('.cal-cell', el).forEach(function (c) {
      c.addEventListener('click', function (e) {
        if (e.target.closest('[data-ev],[data-add],[data-more]')) return;
        var date = c.getAttribute('data-date');
        Schedule.openEditor({ date: date, weekday: [S.weekdayOf(date)], onDone: render });
      });
    });

    U.qsa('[data-add]', el).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var date = b.getAttribute('data-add');
        Schedule.openEditor({ date: date, weekday: [S.weekdayOf(date)], onDone: render });
      });
    });

    // 点击具体场次 → 详情
    U.qsa('[data-ev]', el).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var key = b.getAttribute('data-ev');
        var p = key.split('@');
        var inst = S.expand(p[1], p[1]).filter(function (i) { return i.sessionId === p[0]; })[0];
        if (inst) Schedule.openInstance(inst, { onDone: render });
      });
    });

    // "还有 N 项" → 展开当天
    U.qsa('[data-more]', el).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        openDayList(b.getAttribute('data-more'));
      });
    });
  }

  /* ---------- 某日全部场次 ---------- */
  function openDayList(date) {
    var list = S.instancesOn(date);
    var body = list.length
      ? '<div class="up-list">' + list.map(function (i) {
          var timeLabel = i.satellite ? '卫星' : (i.time || '');
          return '<div class="up-item' + (i.status === 'done' ? ' is-done' : i.status === 'cancelled' ? ' is-cancel' : '') +
            (i.satellite ? ' is-satellite' : '') +
            '" style="--ev-color:' + esc(i.module.color) + '" data-ev="' + esc(i.key) + '">' +
            '<span class="up-bar"></span><div class="up-main">' +
            '<div class="up-name">' + esc(i.module.name) + '</div>' +
            '<div class="up-meta"><span>' + esc(timeLabel) + '</span><span>' + esc(S.fmtDur(i.duration)) + '</span>' +
            (i.status === 'done' ? '<span class="chip is-ok">已完成</span>' : i.status === 'cancelled' ? '<span class="chip is-danger">已取消</span>' : (i.satellite ? '<span class="chip">卫星</span>' : '')) +
            '</div></div></div>';
        }).join('') + '</div>'
      : U.empty('i-calendar', '这一天没有排期');

    U.modal({
      title: U.dateCn(date),
      icon: 'i-calendar',
      body: body,
      buttons: [
        { text: '新建日程', icon: 'i-plus', onClick: function (m, c) { c(); Schedule.openEditor({ date: date, weekday: [S.weekdayOf(date)], onDone: render }); } },
        { text: '关闭', kind: 'ghost', onClick: function (m, c) { c(); } }
      ],
      onMount: function (m, close) {
        U.qsa('[data-ev]', m).forEach(function (b) {
          b.addEventListener('click', function () {
            close();
            var p = b.getAttribute('data-ev').split('@');
            var inst = S.expand(p[1], p[1]).filter(function (i) { return i.sessionId === p[0]; })[0];
            if (inst) Schedule.openInstance(inst, { onDone: render });
          });
        });
      }
    });
  }

  /* ---------- 轻量刷新：只更新时间相关的文案 ---------- */
  function tick() {
    if (!rootEl) return;
    U.qsa('[data-cd]', rootEl).forEach(function (e) {
      var p = e.getAttribute('data-cd').split('|');
      // 卫星场次不更新倒计时（保持"卫星"文字）
      if (e.textContent === '卫星') return;
      e.textContent = U.countdown(p[0], p[1]);
    });
  }

  function mount(root) { rootEl = root; render(); }

  return {
    mount: mount, render: render, tick: tick,
    shiftMonth: shiftMonth, goToday: goToday, openDayList: openDayList,
    getCursor: function () { ensureCursor(); return cursor; },
    setCursor: function (y, m) { cursor = { y: y, m: m }; }
  };
})();

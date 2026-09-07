/* ============================================================
   stats.js · 游玩时长统计与可视化
   统计口径：已完成(done)计入；取消(cancelled)不计入且不删除；补录时长另计
   ============================================================ */
window.Stats = (function () {
  'use strict';
  var S = Store, U = UI, esc = U.esc, icon = U.icon;

  var rootEl = null;
  var range = 'month';

  var RANGE_LABEL = { month: '本月', year: '本年', all: '累计' };

  function render() {
    if (!rootEl) return;
    range = S.settings().statRange || range;
    var st = S.stats(range);
    var b = st.start === '1970-01-01' ? null : { s: st.start, e: st.end };
    var maxTotal = st.items.reduce(function (a, r) { return Math.max(a, r.total); }, 0);
    var avg = st.totalSessions ? Math.round(st.totalPlayed / st.totalSessions) : 0;

    rootEl.innerHTML =
      '<div class="page"><div class="stats-wrap">' +

        '<div class="page-head">' +
          '<div class="page-title">' + icon('i-chart') + '<span>时长统计</span></div>' +
          '<span class="spacer"></span>' +
          '<div class="seg" data-seg="range">' +
            ['month', 'year', 'all'].map(function (r) {
              return '<button type="button" data-v="' + r + '" class="' + (r === range ? 'is-on' : '') + '">' + RANGE_LABEL[r] + '</button>';
            }).join('') +
          '</div>' +
        '</div>' +

        (b ? '<div class="set-note" style="text-align:center;margin:-6px 0 14px">统计区间 ' +
          esc(b.s) + ' 至 ' + esc(b.e) + '</div>' : '<div class="set-note" style="text-align:center;margin:-6px 0 14px">统计全部记录</div>') +

        /* 概览 */
        '<div class="summary-row">' +
          sumCard('i-clock', '游玩总时长', S.fmtDur(st.total), st.totalBonus ? '含补录 ' + S.fmtDur(st.totalBonus) : '按已完成场次统计') +
          sumCard('i-check', '完成场次', st.totalSessions + ' 场', st.totalSessions ? '平均 ' + S.fmtDur(avg) + ' / 场' : '暂无记录') +
          sumCard('i-calendar', '待进行', st.totalPlanned + ' 场', '计划中，未计入时长') +
          sumCard('i-ban', '取消场次', st.totalCancelled + ' 场', '取消不计入时长') +
        '</div>' +

        (st.pending.length ? '<div class="panel" style="margin-bottom:16px;border-color:var(--accent-line);background:var(--accent-soft)">' +
          '<div class="panel-body" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:13px 16px">' +
            icon('i-alert') +
            '<div style="flex:1;min-width:200px"><b style="font-size:13px">有 ' + st.pending.length + ' 场已过期但未确认</b>' +
            '<div style="font-size:11.5px;color:var(--ink-2)">未确认的过期场次不会计入时长，可批量标记完成。</div></div>' +
            '<button class="btn btn-sm btn-primary" data-act="confirm-all">' + icon('i-check') + '<span>全部标记完成</span></button>' +
          '</div></div>' : '') +

        (st.totalCancelled > 0 ? '<div class="panel" style="margin-bottom:16px;border-color:var(--line-2);background:var(--sunk)">' +
          '<div class="panel-body" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:13px 16px">' +
            icon('i-ban') +
            '<div style="flex:1;min-width:200px"><b style="font-size:13px">有 ' + st.totalCancelled + ' 场已取消</b>' +
            '<div style="font-size:11.5px;color:var(--ink-2)">取消的场次不计入时长，可全部清除。</div></div>' +
            '<button class="btn btn-sm" data-act="clear-cancelled" style="border:1px solid var(--line-3)">' + icon('i-trash') + '<span>全部清除</span></button>' +
          '</div></div>' : '') +

        (st.items.length ? '' +
          /* 图形区 */
          '<div class="viz-grid">' +
            '<div class="panel"><div class="panel-head">' +
              '<div class="panel-title">' + icon('i-chart') + '<span>各模组时长</span></div>' +
              '<span class="spacer"></span><span class="set-note" style="margin:0">点击可编辑模组</span></div>' +
              '<div class="panel-body"><div class="bar-list">' + st.items.map(function (r) { return barHtml(r, maxTotal, st.total); }).join('') + '</div></div>' +
            '</div>' +

            '<div class="panel"><div class="panel-head">' +
              '<div class="panel-title">' + icon('i-pie') + '<span>时长占比</span></div></div>' +
              '<div class="panel-body"><div class="donut-wrap">' + donutHtml(st.items, st.total) + '</div></div>' +
            '</div>' +
          '</div>' +

          /* 明细表 */
          '<div class="panel" style="margin-bottom:16px">' +
            '<div class="panel-head"><div class="panel-title">' + icon('i-list') + '<span>明细</span></div>' +
              '<span class="spacer"></span><span class="set-note" style="margin:0">补录 = 手动补记的未记录时长</span></div>' +
            '<div style="overflow-x:auto"><table class="tbl">' +
              '<thead><tr>' +
                '<th>模组</th><th class="num">已记录</th><th class="num">补录</th>' +
                '<th class="num">合计</th><th class="num">场次</th><th class="num">取消</th><th class="num">占比</th>' +
              '</tr></thead><tbody>' +
              st.items.map(function (r) { return rowHtml(r, st.total); }).join('') +
              '</tbody><tfoot><tr>' +
                '<td>合计</td>' +
                '<td class="num">' + esc(S.fmtDur(st.totalPlayed)) + '</td>' +
                '<td class="num">' + esc(S.fmtDur(st.totalBonus)) + '</td>' +
                '<td class="num">' + esc(S.fmtDur(st.total)) + '</td>' +
                '<td class="num">' + st.totalSessions + '</td>' +
                '<td class="num">' + st.totalCancelled + '</td>' +
                '<td class="num">100%</td>' +
              '</tr></tfoot></table></div>' +
          '</div>' +

          /* 走势 */
          '<div class="panel">' +
            '<div class="panel-head"><div class="panel-title">' + icon('i-chart') + '<span>近 6 个月走势</span></div>' +
              '<span class="spacer"></span><span class="set-note" style="margin:0">按已完成场次统计</span></div>' +
            '<div class="panel-body">' + trendHtml() + '</div>' +
          '</div>'
        : '<div class="panel">' + U.empty('i-chart',
            RANGE_LABEL[range] + '还没有记录',
            '在日历中把跑过的场次标记为「已完成」，这里就会自动累计') + '</div>') +

      '</div></div>';

    bind(st);
  }

  function sumCard(ic, k, v, s) {
    return '<div class="sum-card">' +
      '<div class="k">' + icon(ic) + esc(k) + '</div>' +
      '<div class="v">' + esc(v) + '</div>' +
      '<div class="s">' + esc(s) + '</div>' +
      '</div>';
  }

  function barHtml(r, maxTotal, total) {
    var pct = (r.total > 0 && maxTotal) ? Math.max(2, Math.round(r.total / maxTotal * 100)) : 0;
    var mainPct = (r.minutes > 0 && maxTotal) ? Math.round(r.minutes / maxTotal * 100) : 0;
    var bonusPct = (r.bonus > 0 && maxTotal) ? Math.round(r.bonus / maxTotal * 100) : 0;
    var share = total ? Math.round(r.total / total * 100) : 0;
    return '<div class="bar-item" data-mod="' + esc(r.module.id) + '" style="--ev-color:' + esc(r.module.color) + '">' +
      '<div class="bar-head">' +
        '<span class="bar-dot"></span>' +
        '<span class="bar-name">' + esc(r.module.name) + '</span>' +
        '<span class="bar-time">' + esc(S.fmtDur(r.total)) + '<em>' + share + '%</em></span>' +
      '</div>' +
      '<div class="bar-track">' +
        '<div class="bar-fill" style="width:' + mainPct + '%"></div>' +
        (r.bonus ? '<div class="bar-fill bar-fill-bonus" style="width:' + bonusPct + '%"></div>' : '') +
      '</div>' +
      '<div class="bar-sub">' +
        '<span>' + r.done + ' 场 · ' + esc(S.fmtDur(r.total)) + (r.bonus ? ' (含补录 ' + esc(S.fmtDur(r.bonus)) + ')' : '') + '</span>' +
        '<span class="spacer"></span>' +
        (r.planned ? '<span>待进行 ' + r.planned + ' 场</span>' : '') +
      '</div>' +
      '</div>';
  }

  function rowHtml(r, total) {
    var share = total ? Math.round(r.total / total * 100) : 0;
    return '<tr data-mod="' + esc(r.module.id) + '">' +
      '<td><div class="cell-mod"><span class="bar-dot" style="--ev-color:' + esc(r.module.color) + '"></span>' +
        '<span>' + esc(r.module.name) + '</span></div></td>' +
      '<td class="num">' + esc(S.fmtDur(r.minutes)) + '</td>' +
      '<td class="num">' + (r.bonus ? esc(S.fmtDur(r.bonus)) : '<span style="color:var(--ink-4)">—</span>') + '</td>' +
      '<td class="num"><b>' + esc(S.fmtDur(r.total)) + '</b></td>' +
      '<td class="num">' + r.done + '</td>' +
      '<td class="num">' + (r.cancelled ? '<span style="color:var(--danger)">' + r.cancelled + '</span>' : '0') + '</td>' +
      '<td class="num">' + share + '%</td>' +
      '</tr>';
  }

  /* ---------- 环形图（线性描边，无渐变） ---------- */
  function donutHtml(items, total) {
    var R = 52, CX = 66, CY = 66, SW = 12;
    var C = 2 * Math.PI * R;
    var segs = '', offset = 0;
    var legend = '';

    if (!total) {
      segs = '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="none" stroke="var(--sunk-2)" stroke-width="' + SW + '"/>';
    } else {
      // 只画前 8 项，其余归入"其他"
      var shown = items.slice(0, 8), rest = items.slice(8);
      var restTotal = rest.reduce(function (a, r) { return a + r.total; }, 0);
      var seg = [];
      shown.forEach(function (r) { seg.push({ c: r.module.color, v: r.total }); });
      if (restTotal > 0) seg.push({ c: '#C4BBA6', v: restTotal });

      seg.forEach(function (s) {
        var len = (s.v / total) * C;
        var gap = len > 4 ? 2 : 0;
        segs += '<circle cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="none" stroke="' + esc(s.c) +
          '" stroke-width="' + SW + '" stroke-linecap="butt" stroke-dasharray="' + Math.max(0, len - gap).toFixed(2) + ' ' + (C - len + gap).toFixed(2) +
          '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 ' + CX + ' ' + CY + ')"/>';
        offset += len;
      });
    }

    legend = items.slice(0, 6).map(function (r) {
      return '<div class="dl-item" data-mod="' + esc(r.module.id) + '" style="--ev-color:' + esc(r.module.color) + ';cursor:pointer">' +
        '<span class="dl-dot"></span><span class="dl-name">' + esc(r.module.name) + '</span>' +
        '<span class="dl-val">' + esc(S.fmtDur(r.total)) + '</span></div>';
    }).join('') + (items.length > 6 ? '<div class="dl-item"><span class="dl-name" style="color:var(--ink-4)">其他 ' + (items.length - 6) + ' 个模组</span></div>' : '');

    return '<div class="donut">' +
      '<svg width="132" height="132" viewBox="0 0 132 132">' + segs + '</svg>' +
      '<div class="donut-center"><div class="n">' + esc(S.fmtDur(total)) + '</div>' +
        '<div class="l">' + RANGE_LABEL[range] + '总计</div></div>' +
      '</div>' +
      '<div class="donut-legend">' + legend + '</div>';
  }

  /* ---------- 月度走势 ---------- */
  function trendHtml() {
    var t = S.monthlyTrend(6);
    var max = t.reduce(function (a, x) { return Math.max(a, x.minutes); }, 0) || 1;
    return '<div class="spark">' + t.map(function (x) {
      var h = Math.max(2, Math.round(x.minutes / max * 62));
      return '<div class="spark-col' + (x.current ? ' is-cur' : '') + '" title="' + esc(x.key.replace('-01', '') + ' · ' + S.fmtDur(x.minutes) + ' · ' + x.count + ' 场') + '">' +
        '<div class="spark-bar' + (x.current ? ' is-cur' : '') + '" style="height:' + h + 'px"></div>' +
        '<div class="spark-lb">' + esc(x.label) + '</div>' +
        '</div>';
    }).join('') + '</div>' +
    '<div class="set-note" style="text-align:center;margin-top:8px">' +
      '合计 ' + esc(S.fmtDur(t.reduce(function (a, x) { return a + x.minutes; }, 0))) + '</div>';
  }

  function bind(st) {
    var el = rootEl;

    U.qsa('[data-seg="range"] button', el).forEach(function (b) {
      b.addEventListener('click', function () {
        range = b.getAttribute('data-v');
        S.updateSettings({ statRange: range });
        render();
      });
    });

    var ca = U.qs('[data-act="confirm-all"]', el);
    if (ca) ca.addEventListener('click', function () {
      var pending = st.pending.slice();
      U.confirm({
        title: '批量标记为已完成？',
        text: '将把 ' + pending.length + ' 场已过期但未标记的场次记为已完成，并计入时长统计。',
        hint: '若有实际取消的场次，请到日历中单独标记为「取消」。',
        okText: '全部标记'
      }).then(function (ok) {
        if (!ok) return;
        pending.forEach(function (i) { S.setInstStatus(i.sessionId, i.date, 'done'); });
        U.toast('已确认 ' + pending.length + ' 场');
      });
    });

    var cc = U.qs('[data-act="clear-cancelled"]', el);
    if (cc) cc.addEventListener('click', function () {
      U.confirm({
        title: '清除全部已取消场次？',
        text: '将删除 ' + st.totalCancelled + ' 场已取消的场次记录，此操作不可撤销。',
        okText: '全部清除'
      }).then(function (ok) {
        if (!ok) return;
        S.clearCancelledInsts();
        U.toast('已清除 ' + st.totalCancelled + ' 场');
        render();
      });
    });

    U.qsa('[data-mod]', el).forEach(function (n) {
      n.addEventListener('click', function () {
        var id = n.getAttribute('data-mod');
        Modules.openEditor({ moduleId: id, onDone: render });
      });
    });
  }

  function mount(root) { rootEl = root; render(); }

  return { mount: mount, render: render };
})();

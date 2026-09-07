/* ============================================================
   schedule.js · 日程编辑（每周固定 / 单次指定 / 卫星待定）与场次详情
   - weekly 的 weekday 支持多选
   - satellite：仅选月份 + 可选具体日期，无固定时间
   ============================================================ */
window.Schedule = (function () {
  'use strict';
  var S = Store, U = UI, esc = U.esc, icon = U.icon;

  /* ---------- 时间选择器：整点与半点优先，可精确到分 ---------- */
  function timeOpts(cur) {
    var out = '';
    for (var h = 0; h < 24; h++) {
      for (var m = 0; m < 60; m += 30) {
        var v = S.pad(h) + ':' + S.pad(m);
        out += '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + v + '</option>';
      }
    }
    return out;
  }

  /* 周几 chips：支持多选（selected 为数组） */
  function wdChips(selected) {
    var set = {};
    if (Array.isArray(selected)) selected.forEach(function (w) { set[+w] = 1; });
    else if (selected != null) set[+selected] = 1;
    var order = [1, 2, 3, 4, 5, 6, 0];
    return order.map(function (w) {
      return '<button type="button" class="chip wd-chip' + (set[w] ? ' is-accent' : '') + '" data-wd="' + w + '">周' + S.wdCn(w) + '</button>';
    }).join('');
  }

  function moduleOptions(sel) {
    var list = S.modules().filter(function (m) { return !m.archived || m.id === sel; });
    if (!list.length) return '<option value="">（暂无模组）</option>';
    return list.map(function (m) {
      return '<option value="' + m.id + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>';
    }).join('');
  }

  /* ============================================================
     日程编辑器
     opts: { sessionId, moduleId, date, weekday, time, onDone }
     ============================================================ */
  function openEditor(opts) {
    opts = opts || {};
    var editing = opts.sessionId ? S.sessionById(opts.sessionId) : null;
    var modId = editing ? editing.moduleId : (opts.moduleId || (S.modules()[0] && S.modules()[0].id));
    if (!modId) { U.toast('请先创建一个模组', 'warn'); Modules.openEditor({ onDone: function (m) { openEditor(Object.assign({}, opts, { moduleId: m.id })); } }); return; }

    var type = editing ? editing.type : (opts.type === 'weekly' ? 'weekly' : 'weekly');
    // weekday 兼容数组与单值；新建时若给了 date 则取其星期
    var wdRaw = editing && editing.weekday != null ? editing.weekday
              : (opts.weekday != null ? opts.weekday : (opts.date ? [S.weekdayOf(opts.date)] : [1]));
    var wd = Array.isArray(wdRaw) ? wdRaw.slice() : (wdRaw != null ? [+wdRaw] : [1]);
    if (!wd.length) wd = [1];
    var time = editing ? editing.time : (opts.time || '20:00');
    var date = editing && editing.date ? editing.date : (opts.date || S.todayStr());
    var mod = S.moduleById(modId);
    // 新建排期时：开始日期取模组开团日，结束日期取模组结团日或默认下月底
    var start = editing && editing.startDate ? editing.startDate
             : (mod && mod.startDate ? mod.startDate : (opts.date || S.todayStr()));
    var end = editing && editing.endDate ? editing.endDate
           : (mod && mod.endDate ? mod.endDate : '');
    if (!end) {
      // 默认下月底
      var _d = new Date();
      _d.setMonth(_d.getMonth() + 1);
      _d = new Date(_d.getFullYear(), _d.getMonth() + 1, 0);
      end = S.fmt(_d);
    }
    var month = editing && editing.month ? editing.month : (opts.date ? opts.date.slice(0, 7) : S.todayStr().slice(0, 7));
    var satDate = editing && editing.date ? editing.date : '';
    var durMode = editing && editing.duration != null ? 'custom' : 'follow';
    var durVal = editing && editing.duration != null ? editing.duration : S.resolveDuration(editing, S.moduleById(modId));
    var note = editing ? (editing.note || '') : '';
    // 计算"结束 datetime"用于本次自定义时长反算（开始 datetime + durVal 分钟）
    var startDtSrc = type === 'weekly' ? start : (type === 'once' ? date : S.todayStr());
    var startTmSrc = type === 'satellite' ? '20:00' : time;
    var endDurDate = startDtSrc, endDurTime = startTmSrc;
    if (startDtSrc && startTmSrc && /^\d{4}-\d{2}-\d{2}$/.test(startDtSrc) && /^\d{2}:\d{2}$/.test(startTmSrc)) {
      var _p = startDtSrc.split('-'), _q = startTmSrc.split(':');
      var _sdt = new Date(+_p[0], +_p[1] - 1, +_p[2], +_q[0], +_q[1]);
      var _edt = new Date(_sdt.getTime() + durVal * 60000);
      endDurDate = S.fmt(_edt);
      endDurTime = S.pad(_edt.getHours()) + ':' + S.pad(_edt.getMinutes());
    }

    var body =
      '<div class="field">' +
        '<label class="field-label">所属模组</label>' +
        '<div class="row">' +
          '<select class="select" data-f="moduleId">' + moduleOptions(modId) + '</select>' +
          '<button type="button" class="btn" data-act="newmod" style="flex:0 0 auto">' + icon('i-plus') + '<span>新建</span></button>' +
        '</div>' +
      '</div>' +

      '<div class="field">' +
        '<label class="field-label">日程类型</label>' +
        '<div class="seg" data-seg="type">' +
          '<button type="button" data-v="weekly" class="' + (type === 'weekly' ? 'is-on' : '') + '">' + icon('i-repeat') + ' 每周固定</button>' +
          '<button type="button" data-v="once" class="' + (type === 'once' ? 'is-on' : '') + '">' + icon('i-star') + ' 单次指定</button>' +
        '</div>' +
      '</div>' +

      // 每周固定
      '<div data-pane="weekly" style="display:' + (type === 'weekly' ? 'block' : 'none') + '">' +
        '<div class="field">' +
          '<label class="field-label">每周周几<span class="hint">可多选</span></label>' +
          '<div class="wd-chips" data-f="weekday">' + wdChips(wd) + '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label">开始时间<span class="hint">多为整点或半点</span></label>' +
          '<div class="row">' +
            '<select class="select" data-time-select>' + timeOpts(time) + '</select>' +
            '<input class="input" type="text" data-time-text value="' + esc(time) + '" placeholder="HH:MM" maxlength="5" style="max-width:92px;flex:0 0 auto;text-align:center">' +
          '</div>' +
        '</div>' +
        '<div class="row">' +
          '<div class="field"><label class="field-label">开始日期</label>' +
            '<input class="input" type="date" data-f="startDate" value="' + esc(start) + '"' + (mod && mod.startDate ? ' min="' + esc(mod.startDate) + '"' : '') + '></div>' +
          '<div class="field"><label class="field-label">结束日期<span class="hint">可选</span></label>' +
            '<input class="input" type="date" data-f="endDate" value="' + esc(end) + '"' + (mod && mod.endDate ? ' max="' + esc(mod.endDate) + '"' : '') + '></div>' +
        '</div>' +
      '</div>' +

      // 单次指定
      '<div data-pane="once" style="display:' + (type === 'once' ? 'block' : 'none') + '">' +
        '<div class="field">' +
          '<label class="field-label">日期<span class="hint" data-date-hint></span></label>' +
          '<input class="input" type="date" data-f="date" value="' + esc(date) + '">' +
        '</div>' +
        '<div class="field">' +
          '<label class="field-label">开始时间<span class="hint">多为整点或半点</span></label>' +
          '<div class="row">' +
            '<select class="select" data-time-select>' + timeOpts(time) + '</select>' +
            '<input class="input" type="text" data-time-text value="' + esc(time) + '" placeholder="HH:MM" maxlength="5" style="max-width:92px;flex:0 0 auto;text-align:center">' +
          '</div>' +
        '</div>' +
      '</div>' +

      // 时长
      '<div class="field">' +
        '<label class="field-label">单场时长</label>' +
        '<div class="seg" data-seg="dur" style="margin-bottom:9px">' +
          '<button type="button" data-v="follow" class="' + (durMode === 'follow' ? 'is-on' : '') + '">跟随模组</button>' +
          '<button type="button" data-v="custom" class="' + (durMode === 'custom' ? 'is-on' : '') + '">本次自定义</button>' +
        '</div>' +
        '<div data-dur-custom style="display:' + (durMode === 'custom' ? 'block' : 'none') + '">' +
          U.durField({ label: '本次时长', value: durVal, hint: '或填下方结束时间自动计算' }) +
          '<div class="field" style="margin-top:10px">' +
            '<label class="field-label">结束日期<span class="hint">填写后自动反算时长</span></label>' +
            '<input class="input" type="date" data-dur-end-date value="' + esc(endDurDate) + '">' +
          '</div>' +
          '<div class="field">' +
            '<label class="field-label">结束时间</label>' +
            '<div class="row">' +
              '<select class="select" data-dur-end-select>' + timeOpts(endDurTime) + '</select>' +
              '<input class="input" type="text" data-dur-end-text value="' + esc(endDurTime) + '" placeholder="HH:MM" maxlength="5" style="max-width:92px;flex:0 0 auto;text-align:center">' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="set-note" data-dur-hint style="margin-top:0"></div>' +
      '</div>' +

      '<div class="field" style="margin-bottom:0">' +
        '<label class="field-label">备注<span class="hint">可选</span></label>' +
        '<textarea class="textarea" data-f="note" placeholder="主持人、场次编号、注意事项等">' + esc(note) + '</textarea>' +
      '</div>';

    /* 右栏：管理日程 */
    var mgrBody =
      '<div class="sched-mgr">' +
        '<div class="sched-mgr-toolbar">' +
          '<label class="sched-mgr-selall"><input type="checkbox" data-act="selall"> 全选</label>' +
          '<span class="sched-mgr-count" data-mgr-count></span>' +
        '</div>' +
        '<div class="sched-mgr-list" data-mgr-list></div>' +
        '<div class="sched-mgr-batch">' +
          '<div class="row" style="gap:6px">' +
            '<button class="btn btn-sm" data-act="batch-done">' + icon('i-check') + '<span>完成</span></button>' +
            '<button class="btn btn-sm" data-act="batch-time">' + icon('i-clock') + '<span>改时间</span></button>' +
            '<button class="btn btn-sm btn-danger" data-act="batch-del">' + icon('i-trash') + '<span>删除</span></button>' +
            '<span class="spacer"></span>' +
            '<span class="sched-mgr-sel" data-mgr-sel>未选</span>' +
          '</div>' +
          '<div class="row" style="gap:6px;margin-top:8px;display:none;align-items:center" data-batch-time-row>' +
            '<select class="select" data-batch-time-start>' + timeOpts('20:00') + '</select>' +
            '<span style="color:var(--ink-3)">-</span>' +
            '<select class="select" data-batch-time-end>' + timeOpts('22:00') + '</select>' +
            '<button class="btn btn-sm btn-primary" data-act="batch-time-go">应用</button>' +
            '<button class="btn btn-sm btn-ghost" data-act="batch-time-cancel">取消</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    body = '<div class="sched-left">' + body + '</div><div class="sched-right">' + mgrBody + '</div>';

    var state = { type: type, wd: wd.slice(), durMode: durMode, moduleId: modId };

    U.modal({
      title: editing ? '编辑日程' : '新建日程',
      icon: editing ? 'i-edit' : 'i-plus',
      cls: 'modal-schedule',
      body: body,
      buttons: [
        { text: '取消', kind: 'ghost', onClick: function (m, c) { c(); } },
        {
          text: editing ? '保存' : '创建',
          kind: 'primary',
          icon: 'i-check',
          onClick: function (m, c) { if (submit(m, c)) c(); }
        }
      ],
      onMount: function (m, close) { bind(m, state, close, opts); initMgr(m, state, opts); }
    });

    function submit(m, close) {
      var mid = U.qs('[data-f="moduleId"]', m).value;
      if (!mid) { U.toast('请选择所属模组', 'warn'); return false; }
      var dur = state.durMode === 'custom' ? U.readDurField(U.qs('[data-dur-custom]', m)) : null;
      var noteV = U.qs('[data-f="note"]', m).value.trim();
      var payload;

      if (state.type === 'weekly') {
        var t = readTime(m, 'weekly');
        if (!t) { U.toast('时间格式应为 HH:MM', 'warn'); return false; }
        var sd = U.qs('[data-f="startDate"]', m).value;
        var ed = U.qs('[data-f="endDate"]', m).value || null;
        if (!sd) { U.toast('请选择开始日期', 'warn'); return false; }
        if (ed && ed < sd) { U.toast('结束日期不能早于开始日期', 'warn'); return false; }
        if (mod && mod.startDate && sd < mod.startDate) { U.toast('开始日期不能早于模组开团日期 ' + U.dateCn(mod.startDate), 'warn'); return false; }
        if (mod && mod.endDate && ed && ed > mod.endDate) { U.toast('结束日期不能晚于模组结团日期 ' + U.dateCn(mod.endDate), 'warn'); return false; }
        if (!state.wd.length) { U.toast('请至少选择一个周几', 'warn'); return false; }
        payload = { moduleId: mid, type: 'weekly', weekday: state.wd.slice(), time: t, startDate: sd, endDate: ed, duration: dur, note: noteV };
      } else {
        // once
        var t2 = readTime(m, 'once');
        if (!t2) { U.toast('时间格式应为 HH:MM', 'warn'); return false; }
        var d = U.qs('[data-f="date"]', m).value;
        if (!d) { U.toast('请选择日期', 'warn'); return false; }
        payload = { moduleId: mid, type: 'once', weekday: S.weekdayOf(d), time: t2, date: d, duration: dur, note: noteV };
      }

      if (editing) S.updateSession(editing.id, payload);
      else S.addSession(payload);
      U.toast(editing ? '日程已更新' : '日程已创建');
      if (opts.onDone) opts.onDone();
      return true;
    }
  }

  /* 读取指定 pane 的时间（satellite 不调用本函数） */
  function readTime(m, paneName) {
    var pane = U.qs('[data-pane="' + paneName + '"]', m);
    if (!pane || pane.style.display === 'none') return null;
    var txt = U.qs('[data-time-text]', pane);
    var sel = U.qs('[data-time-select]', pane);
    if (!txt || !sel) return null;
    var v = (txt.value || '').trim() || sel.value;
    return /^([01]?\d|2[0-3]):[0-5]\d$/.test(v) ? (v.length === 4 ? '0' + v : v) : null;
  }

  function bind(m, state, close, opts) {
    function showPane(name) {
      U.qs('[data-pane="weekly"]', m).style.display = name === 'weekly' ? 'block' : 'none';
      U.qs('[data-pane="once"]', m).style.display = name === 'once' ? 'block' : 'none';
    }

    // 类型切换：weekly / once
    U.qsa('[data-seg="type"] button', m).forEach(function (b) {
      b.addEventListener('click', function () {
        state.type = b.getAttribute('data-v');
        U.qsa('[data-seg="type"] button', m).forEach(function (x) { x.classList.toggle('is-on', x === b); });
        showPane(state.type);
      });
    });

    // 周几：多选 toggle
    U.qsa('[data-f="weekday"] .wd-chip', m).forEach(function (b) {
      b.addEventListener('click', function () {
        var w = +b.getAttribute('data-wd');
        var idx = state.wd.indexOf(w);
        if (idx >= 0) { state.wd.splice(idx, 1); b.classList.remove('is-accent'); }
        else { state.wd.push(w); b.classList.add('is-accent'); }
      });
    });

    // 时长模式
    U.qsa('[data-seg="dur"] button', m).forEach(function (b) {
      b.addEventListener('click', function () {
        state.durMode = b.getAttribute('data-v');
        U.qsa('[data-seg="dur"] button', m).forEach(function (x) { x.classList.toggle('is-on', x === b); });
        U.qs('[data-dur-custom]', m).style.display = state.durMode === 'custom' ? 'block' : 'none';
        updateDurHint(m, state);
      });
    });

    // 时间：select 与 text 互相同步（weekly / once 各有一组）
    U.qsa('[data-pane="weekly"], [data-pane="once"]', m).forEach(function (pane) {
      var sel = U.qs('[data-time-select]', pane), txt = U.qs('[data-time-text]', pane);
      if (!sel || !txt) return;
      sel.addEventListener('change', function () { txt.value = sel.value; });
      txt.addEventListener('input', function () {
        var v = txt.value.trim();
        if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) {
          v = v.length === 4 ? '0' + v : v;
          var opt = Array.prototype.find.call(sel.options, function (o) { return o.value === v; });
          if (opt) sel.value = v;
        }
      });
    });

    // 日期 -> 周几提示（once pane）
    var dateEl = U.qs('[data-f="date"]', m);
    if (dateEl) {
      var sync = function () {
        var h = U.qs('[data-date-hint]', m);
        if (h && dateEl.value) h.textContent = '周' + S.wdCn(S.weekdayOf(dateEl.value)) + ' · ' + U.relativeDay(dateEl.value);
      };
      dateEl.addEventListener('change', sync); sync();
    }

    // 新建模组
    U.qs('[data-act="newmod"]', m).addEventListener('click', function () {
      Modules.openEditor({
        onDone: function (nm) {
          var sel = U.qs('[data-f="moduleId"]', m);
          sel.innerHTML = moduleOptions(nm.id);
          sel.value = nm.id;
          state.moduleId = nm.id;
          updateDurHint(m, state);
        }
      });
    });

    U.qs('[data-f="moduleId"]', m).addEventListener('change', function (e) {
      state.moduleId = e.target.value; updateDurHint(m, state);
    });
    U.bindDurField(U.qs('[data-dur-custom]', m));
    bindDurEndLink(m, state);
    updateDurHint(m, state);
  }

  /* 时长 ↔ 结束 datetime 双向联动：改时长自动同步结束时间；改结束时间自动反算时长 */
  function bindDurEndLink(m, state) {
    var durCustom = U.qs('[data-dur-custom]', m);
    if (!durCustom) return;
    var durH = U.qs('[data-dur-h]', durCustom), durM = U.qs('[data-dur-m]', durCustom);
    var endD = U.qs('[data-dur-end-date]', durCustom);
    var endSel = U.qs('[data-dur-end-select]', durCustom);
    var endTxt = U.qs('[data-dur-end-text]', durCustom);
    if (!durH || !durM || !endD || !endSel || !endTxt) return;

    function currentStartDT() {
      var ds, ts;
      if (state.type === 'weekly') {
        ds = U.qs('[data-f="startDate"]', m).value;
        ts = readTime(m, 'weekly') || '20:00';
      } else if (state.type === 'once') {
        ds = U.qs('[data-f="date"]', m).value;
        ts = readTime(m, 'once') || '20:00';
      } else {
        ds = U.qs('[data-f="satDate"]', m).value || S.todayStr();
        ts = '20:00';
      }
      return { ds: ds, ts: ts };
    }
    function parseDT(ds, ts) {
      if (!ds || !ts || !/^\d{4}-\d{2}-\d{2}$/.test(ds) || !/^\d{2}:\d{2}$/.test(ts)) return null;
      var p = ds.split('-'), q = ts.split(':');
      return new Date(+p[0], +p[1] - 1, +p[2], +q[0], +q[1]);
    }
    function syncEndFromDur() {
      var st = currentStartDT();
      var sdt = parseDT(st.ds, st.ts);
      if (!sdt) return;
      var dur = Math.max(0, (+durH.value || 0) * 60 + (+durM.value || 0));
      var edt = new Date(sdt.getTime() + dur * 60000);
      var d = S.fmt(edt), t = S.pad(edt.getHours()) + ':' + S.pad(edt.getMinutes());
      endD.value = d; endSel.value = t; endTxt.value = t;
    }
    function syncDurFromEnd() {
      var st = currentStartDT();
      var sdt = parseDT(st.ds, st.ts);
      if (!sdt) return;
      var ev = (endTxt.value || '').trim() || endSel.value;
      if (!/^\d{2}:\d{2}$/.test(ev)) return;
      var edt = parseDT(endD.value, ev);
      if (!edt) return;
      var diff = Math.round((edt - sdt) / 60000);
      if (diff < 0) diff += 24 * 60;     // 跨天：结束早于开始视为次日
      if (diff <= 0) return;
      durH.value = Math.floor(diff / 60);
      durM.value = diff % 60;
    }
    [durH, durM].forEach(function (el) {
      el.addEventListener('input', syncEndFromDur);
      el.addEventListener('change', syncEndFromDur);
    });
    endD.addEventListener('change', syncDurFromEnd);
    endSel.addEventListener('change', function () { endTxt.value = endSel.value; syncDurFromEnd(); });
    endTxt.addEventListener('input', function () {
      var v = (endTxt.value || '').trim();
      if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) {
        v = v.length === 4 ? '0' + v : v;
        var opt = Array.prototype.find.call(endSel.options, function (o) { return o.value === v; });
        if (opt) endSel.value = v;
      }
      syncDurFromEnd();
    });
  }

  function updateDurHint(m, state) {
    var mod = S.moduleById(state.moduleId);
    var h = U.qs('[data-dur-hint]', m);
    if (!h) return;
    if (state.durMode === 'follow') {
      h.innerHTML = '跟随模组默认时长：' + (mod ? '<b>' + S.fmtDur(mod.duration) + '</b>' : '—') +
        '（模组未锁定时可在设置中统一调整）';
    } else {
      h.textContent = '仅本次生效，不影响模组默认时长。';
    }
  }

  /* ============================================================
     场次详情（点击日历上的某一条）
     ============================================================ */
  function openInstance(inst, opts) {
    opts = opts || {};
    var mod = inst.module;
    var st = inst.status;
    var isPast = inst.date < S.todayStr();

    var statusChip =
      st === 'done' ? '<span class="chip is-ok">' + icon('i-check') + '已完成</span>' :
      st === 'cancelled' ? '<span class="chip is-danger">' + icon('i-ban') + '已取消</span>' :
      '<span class="chip">' + icon('i-clock') + (isPast ? '待确认' : '计划中') + '</span>';

    var timeText = inst.satellite ? '卫星待定' : esc(inst.time);

    var body =
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">' +
        '<span style="width:10px;height:10px;border-radius:3px;background:' + esc(mod.color) + ';border:1px solid rgba(0,0,0,.1)"></span>' +
        '<b style="font-size:15.5px">' + esc(mod.name) + '</b>' +
        '<span class="spacer" style="margin-left:auto"></span>' + statusChip +
      '</div>' +

      '<div class="set-row" style="padding-top:0">' +
        '<div class="lab"><b>' + esc(U.dateCn(inst.date)) + '</b>' +
          '<span>' + esc(U.relativeDay(inst.date)) + (inst.date === S.todayStr() && st === 'planned' && !inst.satellite ? ' · ' + U.countdown(inst.date, inst.time) : '') + '</span></div>' +
        '<div style="text-align:right"><b style="font-size:15px;font-variant-numeric:tabular-nums">' + timeText + '</b>' +
          '<div style="font-size:11px;color:var(--ink-3)">' + (inst.satellite ? '卫星场次' : (inst.recurring ? '每周' + S.wdCn(S.weekdayOf(inst.date)) : '单次')) + '</div></div>' +
      '</div>' +

      '<div class="set-row">' +
        '<div class="lab"><b>时长 ' + esc(S.fmtDur(inst.duration)) + '</b>' +
          '<span>' + (inst.overridden && inst.duration !== S.resolveDuration(S.sessionById(inst.sessionId), mod)
            ? '本次已自定义' : '跟随' + (S.sessionById(inst.sessionId).duration != null ? '日程设定' : '模组默认 ' + S.fmtDur(mod.duration))) + '</span></div>' +
        '<button class="btn btn-sm" data-act="dur">' + icon('i-clock') + '<span>调整</span></button>' +
      '</div>' +

      (inst.note ? '<div class="set-row"><div class="lab"><span style="white-space:pre-wrap">' + esc(inst.note) + '</span></div></div>' : '') +

      (st === 'cancelled' ? '<div class="set-row"><div class="lab"><span style="color:var(--danger)">本次已取消，不计入游玩时长</span></div></div>' : '');

    var buttons = [];

    if (st === 'done') {
      buttons.push({ text: '撤销完成', onClick: function (m, c) { S.setInstStatus(inst.sessionId, inst.date, 'planned'); c(); if (opts.onDone) opts.onDone(); } });
    } else if (st === 'cancelled') {
      buttons.push({ text: '恢复排期', onClick: function (m, c) { S.setInstStatus(inst.sessionId, inst.date, 'planned'); c(); if (opts.onDone) opts.onDone(); } });
    } else {
      buttons.push({ text: '取消这次', kind: 'danger', icon: 'i-ban', onClick: function (m, c) { S.setInstStatus(inst.sessionId, inst.date, 'cancelled'); c(); U.toast('已取消该场，不计入时长'); if (opts.onDone) opts.onDone(); } });
      buttons.push({ text: '标记完成', kind: 'primary', icon: 'i-check', onClick: function (m, c) { S.setInstStatus(inst.sessionId, inst.date, 'done'); c(); U.toast('已计入 ' + S.fmtDur(inst.duration)); if (opts.onDone) opts.onDone(); } });
    }

    U.modal({
      title: '场次详情',
      icon: 'i-calendar',
      body: body,
      buttons: buttons,
      footnote: '',
      onMount: function (m, close) {
        U.qs('[data-act="dur"]', m).addEventListener('click', function () {
          var w = U.modal({
            title: '调整本次时长',
            icon: 'i-clock',
            body: U.durField({ label: '本次时长', value: inst.duration, hint: '仅影响这一场' }),
            buttons: [
              { text: '恢复默认', kind: 'ghost', onClick: function (mm, c) { S.setInstDuration(inst.sessionId, inst.date, null); c(); close(); if (opts.onDone) opts.onDone(); } },
              { text: '保存', kind: 'primary', onClick: function (mm, c) { S.setInstDuration(inst.sessionId, inst.date, U.readDurField(mm)); c(); close(); U.toast('本次时长已更新'); if (opts.onDone) opts.onDone(); } }
            ],
            onMount: function (mm) { U.bindDurField(mm); }
          });
        });

        // 脚注区：规则 / 分割日期 / 删除
        var foot = U.qs('.modal-foot', m);
        if (foot && !U.qs('[data-act="editrule"]', foot)) {
          var left = U.el('<span style="display:flex;gap:6px;align-items:center">' +
            '<button class="btn btn-sm btn-ghost" data-act="editrule">' + icon('i-edit') + '<span>规则</span></button>' +
            (inst.recurring ? '<button class="btn btn-sm btn-ghost" data-act="split">' + icon('i-scissors') + '<span>分割日期</span></button>' : '') +
            '<button class="btn btn-sm btn-ghost" data-act="del">' + icon('i-trash') + '<span>删除</span></button>' +
            '</span>');
          foot.insertBefore(left, foot.firstChild);
          U.qs('[data-act="editrule"]', left).addEventListener('click', function () {
            close(); openEditor({ sessionId: inst.sessionId, onDone: opts.onDone });
          });
          U.qs('[data-act="del"]', left).addEventListener('click', function () { close(); askDelete(inst, opts); });
          var splitBtn = U.qs('[data-act="split"]', left);
          if (splitBtn) splitBtn.addEventListener('click', function () { close(); openSplit(inst, opts); });
        }
      }
    });
  }

  /* ============================================================
     分割日期：从一条 weekly 规则中选出若干日期，拆为新规则
     ============================================================ */
  function openSplit(inst, opts) {
    var sess = S.sessionById(inst.sessionId);
    if (!sess || sess.type !== 'weekly') { U.toast('仅每周固定规则可分割', 'warn'); return; }

    /* 生成该规则 startDate ~ endDate 范围内匹配 weekday 的所有日期 */
    var today = S.todayStr();
    var start = sess.startDate || today;
    var end = sess.endDate || today;
    var wds = Array.isArray(sess.weekday) ? sess.weekday : [+sess.weekday];
    var dates = [];
    var d = new Date(start + 'T00:00:00');
    var e = new Date(end + 'T23:59:59');
    while (d <= e) {
      if (wds.indexOf(d.getDay()) >= 0) dates.push(S.fmt(d));
      d.setDate(d.getDate() + 1);
    }

    if (dates.length < 2) { U.toast('该规则下日期不足 2 个，无法分割', 'warn'); return; }

    var body =
      '<div class="set-note" style="margin:0 0 12px">勾选要从当前规则中拆出的日期，拆出的日期将保存为新规则。原规则不再包含这些日期。</div>' +
      '<div class="split-list">' + dates.map(function (ds, i) {
        var isCurrent = ds === inst.date;
        return '<label class="split-item' + (isCurrent ? ' is-cur' : '') + '">' +
          '<input type="checkbox" class="split-ck" value="' + esc(ds) + '"' + (isCurrent ? ' checked' : '') + '>' +
          '<span class="split-date">' + esc(U.dateCn(ds)) + '</span>' +
          '<span class="split-wd">周' + S.wdCn(S.weekdayOf(ds)) + '</span>' +
          (isCurrent ? '<span class="chip" style="font-size:10px">本次</span>' : '') +
        '</label>';
      }).join('') + '</div>' +
      '<div class="field" style="margin-top:14px">' +
        '<label class="field-label">新规则时间点<span class="hint">默认沿用原时间</span></label>' +
        '<div class="row">' +
          '<select class="select" data-split-time>' + timeOpts(sess.time) + '</select>' +
          '<input class="input" type="text" data-split-time-text value="' + esc(sess.time) + '" placeholder="HH:MM" maxlength="5" style="max-width:92px;flex:0 0 auto;text-align:center">' +
        '</div>' +
      '</div>';

    U.modal({
      title: '分割日期',
      icon: 'i-scissors',
      body: body,
      buttons: [
        { text: '取消', kind: 'ghost', onClick: function (m, c) { c(); } },
        {
          text: '确认分割', kind: 'primary', icon: 'i-check',
          onClick: function (m, c) {
            var picked = U.qsa('.split-ck:checked', m).map(function (ck) { return ck.value; });
            if (!picked.length) { U.toast('请至少勾选一个日期', 'warn'); return; }
            if (picked.length >= dates.length) { U.toast('不能全选，原规则需保留至少一个日期', 'warn'); return; }
            var sel = U.qs('[data-split-time]', m);
            var txt = U.qs('[data-split-time-text]', m);
            var t = (txt.value || '').trim() || sel.value;
            if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(t)) { U.toast('时间格式应为 HH:MM', 'warn'); return; }
            if (t.length === 4) t = '0' + t;

            /* 拆出的日期中取最小作为新规则 startDate，最大作为 endDate */
            picked.sort();
            var nsd = picked[0], ned = picked[picked.length - 1];
            var newWd = [];
            picked.forEach(function (ds) { var w = S.weekdayOf(ds); if (newWd.indexOf(w) < 0) newWd.push(w); });

            /* 从原规则中排除拆出的日期：用 overrides 的 removeInst */
            picked.forEach(function (ds) { S.removeInst(sess.id, ds); });

            /* 创建新规则 */
            S.addSession({
              moduleId: sess.moduleId, type: 'weekly', weekday: newWd,
              time: t, startDate: nsd, endDate: ned,
              duration: sess.duration != null ? sess.duration : null,
              note: sess.note || ''
            });

            U.toast('已拆出 ' + picked.length + ' 场为新规则');
            c();
            if (opts && opts.onDone) opts.onDone();
          }
        }
      ],
      onMount: function (m) {
        var sel = U.qs('[data-split-time]', m);
        var txt = U.qs('[data-split-time-text]', m);
        sel.addEventListener('change', function () { txt.value = sel.value; });
        txt.addEventListener('input', function () {
          var v = txt.value.trim();
          if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) {
            v = v.length === 4 ? '0' + v : v;
            var opt = Array.prototype.find.call(sel.options, function (o) { return o.value === v; });
            if (opt) sel.value = v;
          }
        });
      }
    });
  }

  /* ---------- 删除：区分"取消这一次 / 删除这一次 / 删除整条规则" ---------- */
  function askDelete(inst, opts) {
    var sess = S.sessionById(inst.sessionId);
    var body =
      '<p style="margin:0 0 12px;color:var(--ink-2);line-height:1.7">删除后可从回收站恢复。「取消」只是标记该场不开，仍会显示在日历上，不计入时长。</p>';

    if (inst.recurring) {
      body +=
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        '<button class="btn btn-block" data-act="one" style="justify-content:flex-start">' + icon('i-x') + '<span>仅删除这一次（' + esc(U.dateShort(inst.date)) + '）</span></button>' +
        '<button class="btn btn-block" data-act="rule" style="justify-content:flex-start">' + icon('i-trash') + '<span>删除整条每周规则（含历史记录）</span></button>' +
        '</div>';
    } else {
      body += '<button class="btn btn-block" data-act="rule" style="justify-content:flex-start">' + icon('i-trash') + '<span>删除该日程</span></button>';
    }

    U.modal({
      title: '删除日程',
      icon: 'i-trash',
      body: body,
      buttons: [{ text: '返回', kind: 'ghost', onClick: function (m, c) { c(); } }],
      onMount: function (m, close) {
        var one = U.qs('[data-act="one"]', m), rule = U.qs('[data-act="rule"]', m);
        if (one) one.addEventListener('click', function () { S.removeInst(inst.sessionId, inst.date); close(); U.toast('已删除该场，可在设置中恢复'); if (opts && opts.onDone) opts.onDone(); });
        rule.addEventListener('click', function () {
          close();
          U.confirm({
            title: inst.recurring ? '删除整条规则？' : '删除日程？',
            text: inst.recurring
              ? '将移除「' + (inst.module ? inst.module.name : '') + '」每周 ' + inst.time + ' 的全部排期（含已完成的统计记录）。'
              : '将移除该日程及其统计记录。',
            hint: '可在设置 · 回收站中恢复。',
            okText: '删除', danger: true
          }).then(function (ok) {
            if (!ok) return;
            S.deleteSession(inst.sessionId, true);
            U.toast('已删除');
            if (opts && opts.onDone) opts.onDone();
          });
        });
      }
    });
  }

  /* ============================================================
     管理面板：右栏列表渲染 + 批量操作
     ============================================================ */
  function sessDesc(s) {
    var mod = S.moduleById(s.moduleId);
    if (s.type === 'weekly') {
      var wds = (Array.isArray(s.weekday) ? s.weekday : [s.weekday]).map(function (w) { return '周' + S.wdCn(w); }).join('、');
      return wds + ' ' + (s.time || '') + (s.startDate ? ' · ' + U.dateShort(s.startDate) + (s.endDate ? ' ~ ' + U.dateShort(s.endDate) : ' ~ 至今') : '');
    } else if (s.type === 'once') {
      return (s.date ? U.dateShort(s.date) + ' ' : '') + (s.time || '');
    } else {
      return '卫星 ' + (s.month || '') + (s.date ? ' · ' + U.dateShort(s.date) : '');
    }
  }

  function renderMgrList(m, state) {
    var listEl = U.qs('[data-mgr-list]', m);
    if (!listEl) return;
    var sessions = S.sessions().filter(function (s) { return !S.sessionById(s.id) || !S.sessionById(s.id).deletedAt; });
    if (opts_moduleId(state)) {
      sessions = sessions.filter(function (s) { return s.moduleId === state.moduleId; });
    }
    if (!sessions.length) {
      listEl.innerHTML = '<div class="sched-mgr-empty">暂无排期规则</div>';
    } else {
      listEl.innerHTML = sessions.map(function (s) {
        var mod = S.moduleById(s.moduleId);
        var color = mod ? mod.color : '#999';
        var name = mod ? mod.name : '已删除';
        return '<label class="mgr-item" data-sid="' + esc(s.id) + '">' +
          '<input type="checkbox" class="mgr-ck" data-sid="' + esc(s.id) + '">' +
          '<span class="mgr-dot" style="background:' + esc(color) + '"></span>' +
          '<div class="mgr-info">' +
            '<div class="mgr-name">' + esc(name) + '</div>' +
            '<div class="mgr-desc">' + esc(sessDesc(s)) + '</div>' +
          '</div>' +
          '<button class="btn btn-sm btn-ghost mgr-edit" data-act="edit-sess" data-sid="' + esc(s.id) + '">' + icon('i-edit') + '</button>' +
        '</label>';
      }).join('');
    }
    var countEl = U.qs('[data-mgr-count]', m);
    if (countEl) countEl.textContent = '共 ' + sessions.length + ' 条';
    updateMgrSel(m, state);
  }

  function opts_moduleId(state) { return state.moduleId; }

  function updateMgrSel(m, state) {
    var sels = U.qsa('.mgr-ck:checked', m);
    var selEl = U.qs('[data-mgr-sel]', m);
    if (selEl) selEl.textContent = sels.length ? '已选 ' + sels.length + ' 条' : '未选';
  }

  function initMgr(m, state, opts) {
    state.selected = {};
    renderMgrList(m, state);

    /* checkbox 变化 */
    list_BindEvents(m, state, opts);
  }

  function list_BindEvents(m, state, opts) {
    var listEl = U.qs('[data-mgr-list]', m);
    if (!listEl) return;

    /* 单个 checkbox */
    U.qsa('.mgr-ck', listEl).forEach(function (ck) {
      ck.addEventListener('change', function () {
        updateMgrSel(m, state);
      });
    });

    /* 编辑按钮：关闭当前弹窗后打开编辑器，编辑保存后再打开管理面板 */
    U.qsa('.mgr-edit', listEl).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var sid = btn.getAttribute('data-sid');
        var closeBtn = U.qs('[data-close]', m);
        var modId = state.moduleId;
        if (closeBtn) closeBtn.click();
        setTimeout(function () {
          openEditor({ sessionId: sid, onDone: function () {
            setTimeout(function () { openEditor({ moduleId: modId }); }, 50);
          }});
        }, 50);
      });
    });

    /* 全选 */
    var selAll = U.qs('[data-act="selall"]', m);
    if (selAll) {
      selAll.addEventListener('change', function () {
        U.qsa('.mgr-ck', m).forEach(function (ck) { ck.checked = selAll.checked; });
        updateMgrSel(m, state);
      });
    }

    /* 批量标记完成 */
    var batchDone = U.qs('[data-act="batch-done"]', m);
    if (batchDone) batchDone.addEventListener('click', function () {
      var ids = getSelectedIds(m);
      if (!ids.length) { U.toast('请先勾选排期', 'warn'); return; }
      var today = S.todayStr();
      var count = 0;
      ids.forEach(function (sid) {
        var sess = S.sessionById(sid);
        if (!sess) return;
        /* 标记所有 date <= today 的实例为 done */
        var start = sess.startDate || sess.date || sess.month + '-01';
        var end = sess.endDate || today;
        if (sess.type === 'satellite' && sess.date) {
          if (sess.date <= today) { S.setInstStatus(sid, sess.date, 'done'); count++; }
        } else if (sess.type === 'once') {
          if (sess.date <= today) { S.setInstStatus(sid, sess.date, 'done'); count++; }
        } else if (sess.type === 'weekly') {
          /* 遍历 start ~ min(end,today) 的每周匹配 weekday */
          var s = new Date(start + 'T00:00:00');
          var e = new Date(Math.min(new Date(end + 'T23:59:59').getTime(), new Date(today + 'T23:59:59').getTime()));
          var wds = Array.isArray(sess.weekday) ? sess.weekday : [+sess.weekday];
          var d = new Date(s);
          while (d <= e) {
            if (wds.indexOf(d.getDay()) >= 0) {
              var ds = S.fmt(d);
              S.setInstStatus(sid, ds, 'done');
              count++;
            }
            d.setDate(d.getDate() + 1);
          }
        }
      });
      U.toast(count ? '已标记 ' + count + ' 场为完成' : '无可标记的场次');
      renderMgrList(m, state);
    });

    /* 批量删除 */
    var batchDel = U.qs('[data-act="batch-del"]', m);
    if (batchDel) batchDel.addEventListener('click', function () {
      var ids = getSelectedIds(m);
      if (!ids.length) { U.toast('请先勾选排期', 'warn'); return; }
      U.confirm({
        title: '删除选中的 ' + ids.length + ' 条排期？',
        text: '将连同已完成的统计记录一并移入回收站。',
        okText: '删除', danger: true
      }).then(function (ok) {
        if (!ok) return;
        ids.forEach(function (sid) { S.deleteSession(sid, true); });
        U.toast('已删除 ' + ids.length + ' 条');
        renderMgrList(m, state);
        if (opts.onDone) opts.onDone();
      });
    });

    /* 批量改时间 */
    var batchTime = U.qs('[data-act="batch-time"]', m);
    if (batchTime) batchTime.addEventListener('click', function () {
      var ids = getSelectedIds(m);
      if (!ids.length) { U.toast('请先勾选排期', 'warn'); return; }
      var row = U.qs('[data-batch-time-row]', m);
      if (row) row.style.display = 'flex';
    });
    var batchTimeCancel = U.qs('[data-act="batch-time-cancel"]', m);
    if (batchTimeCancel) batchTimeCancel.addEventListener('click', function () {
      U.qs('[data-batch-time-row]', m).style.display = 'none';
    });
    var batchTimeGo = U.qs('[data-act="batch-time-go"]', m);
    if (batchTimeGo) batchTimeGo.addEventListener('click', function () {
      var ids = getSelectedIds(m);
      if (!ids.length) { U.toast('请先勾选排期', 'warn'); return; }
      var sSel = U.qs('[data-batch-time-start]', m);
      var eSel = U.qs('[data-batch-time-end]', m);
      var ts = sSel.value, te = eSel.value;
      /* 计算时长（分钟），跨午夜时 +24h */
      var sm = S.timeToMin(ts), em = S.timeToMin(te);
      var dur = em - sm; if (dur <= 0) dur += 24 * 60;
      var cnt = 0;
      ids.forEach(function (sid) {
        var sess = S.sessionById(sid);
        if (sess && sess.type !== 'satellite') {
          S.updateSession(sid, { time: ts, duration: dur });
          cnt++;
        }
      });
      U.toast('已更新 ' + cnt + ' 条规则：' + ts + '-' + te);
      U.qs('[data-batch-time-row]', m).style.display = 'none';
      renderMgrList(m, state);
      if (opts.onDone) opts.onDone();
    });
  }

  function getSelectedIds(m) {
    return U.qsa('.mgr-ck:checked', m).map(function (ck) { return ck.getAttribute('data-sid'); });
  }

  return { openEditor: openEditor, openInstance: openInstance, askDelete: askDelete };
})();

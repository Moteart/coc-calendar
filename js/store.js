/* ============================================================
   store.js · 数据层
   - 模组 / 日程（定期·不定期）/ 实例覆盖 / 设置
   - localStorage 同步快照 + IndexedDB 主存 双持久化
   - 软删除回收站、JSON 导出导入
   - 时长三层优先级：单次覆盖 > 模组默认 > 全局默认
   ============================================================ */
window.Store = (function () {
  'use strict';

  var LS_KEY = 'mote-coc-calendar:v1';
  var IDB_KEY = 'state';
  var SCHEMA = 1;
  var TRASH_TTL = 30 * 24 * 3600 * 1000; // 回收站保留 30 天

  /* ================= 日期工具（全部本地时区） ================= */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parse(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayStr() { return fmt(new Date()); }
  function addDays(s, n) { var d = parse(s); d.setDate(d.getDate() + n); return fmt(d); }
  function weekdayOf(s) { return parse(s).getDay(); }               // 0=周日
  function monthStart(s) { var p = s.split('-'); return p[0] + '-' + p[1] + '-01'; }
  function monthEnd(s) { var d = parse(monthStart(s)); d.setMonth(d.getMonth() + 1); d.setDate(0); return fmt(d); }
  function yearStart(s) { return s.split('-')[0] + '-01-01'; }
  function yearEnd(s) { return s.split('-')[0] + '-12-31'; }
  function daysInMonth(s) { return +monthEnd(s).split('-')[2]; }
  function diffDays(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function timeToMin(t) { if (!t) return 0; var p = String(t).split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }
  function minToTime(m) { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }

  /* 分钟 -> "2h" / "2h30m" / "45m" */
  function fmtDur(min) {
    min = Math.round(min || 0);
    if (min <= 0) return '0h';
    var h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return m + 'm';
    if (m === 0) return h + 'h';
    return h + 'h' + m + 'm';
  }
  function fmtDurCn(min) {
    min = Math.round(min || 0);
    if (min <= 0) return '0 分钟';
    var h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return m + ' 分钟';
    if (m === 0) return h + ' 小时';
    return h + ' 小时 ' + m + ' 分钟';
  }
  function parseDur(str) {
    // 接受 "2"、"2.5"、"2h30"、"2:30"、"150"
    if (str == null) return null;
    var s = String(str).trim().toLowerCase();
    if (!s) return null;
    var mh = s.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(?:(\d+(?:\.\d+)?)\s*m?)?$/);
    if (mh) return Math.round((parseFloat(mh[1]) * 60 + (mh[2] ? parseFloat(mh[2]) : 0)));
    if (/^\d+:\d{1,2}$/.test(s)) { var p = s.split(':'); return (+p[0]) * 60 + (+p[1]); }
    if (/^\d+(\.\d+)?$/.test(s)) {
      var v = parseFloat(s);
      return s.indexOf('.') >= 0 ? Math.round(v * 60) : v; // 纯数字按小时（含小数）
    }
    return null;
  }

  var WD_CN = ['日', '一', '二', '三', '四', '五', '六'];
  function wdCn(w) { return WD_CN[w]; }

  /* ================= 状态 ================= */
  var state = {
    settings: null,
    modules: [],
    sessions: [],
    overrides: []
  };

  function defaultSettings() {
    return {
      defaultDuration: 120,   // 全局默认单场时长（分钟）
      weekStart: 1,           // 周一为一周起点
      statRange: 'month',     // 统计默认范围
      lastView: 'calendar',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  var PALETTE = [
    '#B98C5A', '#8C7BA6', '#6E8B84', '#B4746A', '#7C8DB0',
    '#9A9B96', '#A8925F', '#6F8FA8', '#A8728C', '#7E9A6B',
    '#8A8F98', '#C08A6E'
  ];

  function pickColor() {
    var used = {};
    state.modules.forEach(function (m) { used[m.color] = 1; });
    for (var i = 0; i < PALETTE.length; i++) if (!used[PALETTE[i]]) return PALETTE[i];
    return PALETTE[state.modules.length % PALETTE.length];
  }

  function uid(p) {
    return (p || 'x') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ================= 持久化 ================= */
  var _saveTimer = null;
  var listeners = [];
  var _loaded = false;      // 首次 load 完成前禁止任何"空状态覆盖存档"的写入
  var _loadPromise = null;

  function isEmptyState() {
    return state.modules.length === 0 && state.sessions.length === 0 && state.overrides.length === 0;
  }

  function onChange(fn) { if (listeners.indexOf(fn) < 0) listeners.push(fn); }
  function emit() { listeners.forEach(function (f) { try { f(); } catch (e) { console.warn(e); } }); }

  function snapshot() {
    return JSON.stringify({
      schema: SCHEMA,
      savedAt: Date.now(),
      settings: state.settings,
      modules: state.modules,
      sessions: state.sessions,
      overrides: state.overrides
    });
  }

  function persistNow() {
    // 防降级保护：数据尚未从存档加载完成时，若本地已有非空存档而内存是空状态，
    // 说明本次写入极可能来自旧版/异常代码路径，拒绝覆盖真实数据
    if (!_loaded && isEmptyState()) {
      var existing = null;
      try { existing = localStorage.getItem(LS_KEY); } catch (e) { existing = null; }
      if (existing && existing.length > 300) {
        console.warn('[store] 跳过一次可能清空存档的写入');
        return;
      }
    }
    // 1) 同步写 localStorage（保证刷新/更新不丢）
    try { localStorage.setItem(LS_KEY, snapshot()); } catch (e) { console.warn('ls-write-failed', e); }
    // 2) 异步写 IndexedDB（大容量长期存档）
    if (IDB.available()) IDB.set(IDB_KEY, snapshot());
  }

  function persist() {
    // 去抖：30ms 内多次写入合并为一次（避免连续 addModule+addSession 触发多次 IO）
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function () { _saveTimer = null; persistNow(); }, 30);
  }

  // 卸载前强制落盘，防止去抖未触发就丢数据
  if (typeof window !== 'undefined' && !window.__mote_persist_flush) {
    window.__mote_persist_flush = true;
    window.addEventListener('beforeunload', function () {
      if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; persistNow(); }
    });
  }

  function normalize(raw) {
    var s = raw && typeof raw === 'object' ? raw : {};
    var out = {
      settings: Object.assign(defaultSettings(), s.settings || {}),
      modules: Array.isArray(s.modules) ? s.modules : [],
      sessions: Array.isArray(s.sessions) ? s.sessions : [],
      overrides: Array.isArray(s.overrides) ? s.overrides : []
    };
    // 兜底修复
    out.settings.defaultDuration = +out.settings.defaultDuration || 120;
    out.modules.forEach(function (m) {
      if (m.duration == null) m.duration = out.settings.defaultDuration;
      if (!m.color) m.color = '#B98C5A';
      if (m.order == null) m.order = 0;
      if (m.bonus == null) m.bonus = 0;
      if (m.startDate === undefined) m.startDate = null;
      if (m.endDate === undefined) m.endDate = null;
      if (m.preset === undefined) m.preset = '';
      if (m.satellite === undefined) m.satellite = false;
      if (!Array.isArray(m.progressNodes)) m.progressNodes = [];
      if (m.wordCount === undefined) m.wordCount = '';
      if (m.originalColor === undefined) m.originalColor = null;
      if (m.durationVisible === undefined) m.durationVisible = true;
    });
    out.sessions.forEach(function (x) {
      if (x.duration === undefined) x.duration = null;
      // 兼容旧版单值 weekday：weekly 的 weekday 自动转数组，避免 expand 出错
      if (x.type === 'weekly' && x.weekday != null && !Array.isArray(x.weekday)) x.weekday = [+x.weekday];
    });
    return out;
  }

  function mergeList(a, b) {
    var map = {}, out = [];
    (a || []).concat(b || []).forEach(function (it) {
      if (!it || !it.id) return;
      var prev = map[it.id];
      if (!prev) { map[it.id] = it; out.push(it); return; }
      var ta = (prev.deletedAt ? 1e15 : 0) + (+prev.updatedAt || 0);
      var tb = (it.deletedAt ? 1e15 : 0) + (+it.updatedAt || 0);
      if (tb > ta) { out[out.indexOf(prev)] = it; map[it.id] = it; }
    });
    return out;
  }

  function mergeState(other) {
    if (!other) return;
    state.modules = mergeList(state.modules, other.modules);
    state.sessions = mergeList(state.sessions, other.sessions);
    state.overrides = mergeList(state.overrides, other.overrides);
    if (other.settings && (+other.settings.updatedAt || 0) > (+state.settings.updatedAt || 0)) {
      state.settings = Object.assign(state.settings, other.settings);
    }
  }

  function fromLS() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? normalize(JSON.parse(raw)) : null;
    } catch (e) { return null; }
  }

  /* 启动：先同步读快照点亮界面，再异步用 IDB 合并（取较新的一份）。
     幂等：重复调用复用同一个 Promise，避免并发 load 互相覆盖存档。 */
  function load() {
    if (_loadPromise) return _loadPromise;
    var ls = fromLS();
    if (ls) {
      state.settings = ls.settings;
      state.modules = ls.modules;
      state.sessions = ls.sessions;
      state.overrides = ls.overrides;
    } else {
      state.settings = defaultSettings();
    }
    var ready = Promise.resolve(ls ? 'ls' : 'fresh');

    if (IDB.available()) {
      ready = IDB.get(IDB_KEY).then(function (raw) {
        if (!raw) { if (!ls) persist(); return ls ? 'ls' : 'fresh'; }
        var idbState;
        try { idbState = normalize(typeof raw === 'string' ? JSON.parse(raw) : raw); }
        catch (e) { return 'ls'; }
        if (!ls) {
          state.settings = idbState.settings;
          state.modules = idbState.modules;
          state.sessions = idbState.sessions;
          state.overrides = idbState.overrides;
          persist();
          return 'idb';
        }
        mergeState(idbState);
        persist();
        return 'merged';
      }).catch(function () { return ls ? 'ls' : 'fresh'; });
    }
    _loadPromise = ready.then(function (src) {
      _loaded = true;   // 标记完成，此后 persist 的防降级保护不再误伤正常写入
      emit();
      return src;
    });
    return _loadPromise;
  }

  /* ================= 查询 ================= */
  function live(arr) { return (arr || []).filter(function (x) { return !x.deletedAt; }); }
  function modules() { return live(state.modules).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0); }); }
  function allModules() { return state.modules.slice(); }
  function sessions() { return live(state.sessions); }
  function moduleById(id) { for (var i = 0; i < state.modules.length; i++) if (state.modules[i].id === id) return state.modules[i]; return null; }
  function sessionById(id) { for (var i = 0; i < state.sessions.length; i++) if (state.sessions[i].id === id) return state.sessions[i]; return null; }

  var _ovIndex = null;
  function ovIndex() {
    if (_ovIndex) return _ovIndex;
    _ovIndex = {};
    state.overrides.forEach(function (o) { _ovIndex[o.sessionId + '@' + o.date] = o; });
    return _ovIndex;
  }
  function invalidate() { _ovIndex = null; }

  /* 时长解析：单次覆盖 > 模组默认 > 全局默认 */
  function resolveDuration(session, mod) {
    if (session && session.duration != null) return +session.duration;
    if (mod && mod.duration != null) return +mod.duration;
    return +state.settings.defaultDuration || 120;
  }

  /* ================= 实例展开 ================= */
  function makeInst(s, mod, date) {
    var ov = ovIndex()[s.id + '@' + date];
    if (ov && ov.removed) return null;   // 仅移除这一次（规则本身保留）
    // 已归档模组的实例默认标记为完成（无 override 时）
    var status = (ov && ov.status) || (mod.archived ? 'done' : 'planned');
    var dur = (ov && ov.duration != null) ? +ov.duration : resolveDuration(s, mod);
    var note = (ov && ov.note) || s.note || '';
    var isSat = s.type === 'satellite';
    return {
      key: s.id + '@' + date,
      sessionId: s.id,
      moduleId: s.moduleId,
      module: mod,
      date: date,
      time: isSat ? null : s.time,
      duration: dur,
      status: status,
      note: note,
      type: s.type,
      recurring: s.type === 'weekly',
      satellite: isSat,
      overridden: !!ov,
      sortKey: date + ' ' + (isSat ? '99:99' : (s.time || '99:99'))
    };
  }

  /* 展开 [sd, ed] 闭区间内的所有实例 */
  function expand(sd, ed) {
    var out = [];
    var mods = {};
    state.modules.forEach(function (m) { mods[m.id] = m; });
    sessions().forEach(function (s) {
      var mod = mods[s.moduleId];
      if (!mod || mod.deletedAt) return;
      if (s.type === 'once' || s.type === 'satellite') {
        // 单次 / 卫星：仅在选了具体日期时才出现在日历上
        if (s.date && s.date >= sd && s.date <= ed) {
          var one = makeInst(s, mod, s.date);
          if (one) out.push(one);
        }
        return;
      }
      // weekly（支持多 weekday）
      if (!s.startDate) return;
      var end = s.endDate || ed;
      if (end > ed) end = ed;
      var wds = Array.isArray(s.weekday) ? s.weekday : [s.weekday];
      wds.forEach(function (wd) {
        var cur = s.startDate > sd ? s.startDate : sd;
        if (end < cur) return;
        var diff = (wd - weekdayOf(cur) + 7) % 7;
        cur = addDays(cur, diff);
        var guard = 0;
        while (cur <= end && guard++ < 2000) {
          var inst = makeInst(s, mod, cur);
          if (inst) out.push(inst);
          cur = addDays(cur, 7);
        }
      });
    });
    out.sort(function (a, b) { return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0; });
    return out;
  }

  function instancesOn(date) { return expand(date, date); }

  /* ================= 模组 CRUD ================= */
  function addModule(data) {
    var m = {
      id: uid('m'),
      name: (data.name || '').trim() || '未命名模组',
      color: data.color || pickColor(),
      desc: data.desc || '',
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      preset: data.preset || '',
      satellite: !!data.satellite,
      progressNodes: Array.isArray(data.progressNodes) ? data.progressNodes : [],
      duration: data.duration != null ? +data.duration : +state.settings.defaultDuration,
      durationLocked: !!data.durationLocked,
      durationVisible: data.durationVisible !== false,
      bonus: +data.bonus || 0,
      bonusNote: data.bonusNote || '',
      wordCount: data.wordCount || '',
      archived: false,
      order: data.order != null ? +data.order : (state.modules.length ? Math.max.apply(null, state.modules.map(function (x) { return x.order || 0; })) + 1 : 0),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null
    };
    state.modules.push(m);
    persist(); emit();
    // 填写了结团日期的模组自动归档
    if (m.endDate) setModuleArchived(m.id, true);
    return m;
  }

  function updateModule(id, patch) {
    var m = moduleById(id);
    if (!m) return null;
    Object.keys(patch).forEach(function (k) {
      if (k === 'duration') { m.duration = +patch[k]; m.durationLocked = true; } // 单独改时长即锁定
      else if (k === 'bonus') m.bonus = Math.max(0, Math.round(+patch[k] || 0));
      else m[k] = patch[k];
    });
    m.updatedAt = Date.now();
    // 结团日期填写则自动归档；显式清空结团日期则取消归档
    if (m.endDate && !m.archived) {
      setModuleArchived(id, true);
      return moduleById(id);
    }
    if (!m.endDate && m.archived && ('endDate' in patch)) {
      setModuleArchived(id, false);
      return moduleById(id);
    }
    persist(); emit();
    return m;
  }

  function setModuleLocked(id, locked) {
    var m = moduleById(id);
    if (!m) return;
    m.durationLocked = !!locked;
    // 解锁后立刻跟随全局
    if (!m.durationLocked) m.duration = +state.settings.defaultDuration;
    m.updatedAt = Date.now();
    persist(); emit();
  }

  function setModuleArchived(id, archived) {
    var m = moduleById(id);
    if (!m) return;
    archived = !!archived;
    if (archived && !m.archived) {
      // 归档时：保存原色，代表色切换为浅灰
      if (!m.originalColor) m.originalColor = m.color;
      m.color = '#B9B1A0';
    } else if (!archived && m.archived) {
      // 取消归档：恢复原色
      if (m.originalColor) { m.color = m.originalColor; }
    }
    m.archived = archived;
    m.updatedAt = Date.now();
    persist(); emit();
  }

  function reorderModules(orderedIds) {
    orderedIds.forEach(function (id, i) {
      var m = moduleById(id);
      if (m) { m.order = i; m.updatedAt = Date.now(); }
    });
    persist(); emit();
  }

  function deleteModule(id) {
    var m = moduleById(id);
    if (!m) return;
    m.deletedAt = Date.now();
    m.updatedAt = Date.now();
    // 关联日程一并进回收站
    state.sessions.forEach(function (s) {
      if (s.moduleId === id && !s.deletedAt) { s.deletedAt = Date.now(); s.updatedAt = Date.now(); }
    });
    persist(); emit();
  }

  function restoreModule(id) {
    var m = moduleById(id);
    if (!m) return;
    m.deletedAt = null;
    m.updatedAt = Date.now();
    // 关联的、同批次删除的日程一并还原
    state.sessions.forEach(function (s) {
      if (s.moduleId === id && s.deletedAt && Math.abs(s.deletedAt - Date.now()) < 60000 * 60) { s.deletedAt = null; s.updatedAt = Date.now(); }
    });
    persist(); emit();
  }

  /* ================= 日程 CRUD ================= */
  function addSession(data) {
    var t = data.type === 'weekly' ? 'weekly' : (data.type === 'satellite' ? 'satellite' : 'once');
    var wds;
    if (t === 'weekly') {
      // 周几支持多选：传入数组则规范化，单值兼容旧调用
      wds = Array.isArray(data.weekday)
        ? data.weekday.map(function (w) { return +w; }).filter(function (w) { return w >= 0 && w <= 6; })
        : (data.weekday != null ? [+data.weekday] : (data.date ? [weekdayOf(data.date)] : [1]));
      if (!wds.length) wds = [1];
    } else { wds = null; }
    var s = {
      id: uid('s'),
      moduleId: data.moduleId,
      type: t,
      weekday: wds,
      time: t === 'satellite' ? null : (data.time || '20:00'),
      date: t === 'weekly' ? null : (data.date || null),
      month: t === 'satellite' ? (data.month || null) : null,
      startDate: t === 'weekly' ? (data.startDate || todayStr()) : null,
      endDate: t === 'weekly' ? (data.endDate || null) : null,
      duration: data.duration != null ? +data.duration : null,
      note: data.note || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null
    };
    state.sessions.push(s);
    persist(); emit();
    return s;
  }

  function updateSession(id, patch) {
    var s = sessionById(id);
    if (!s) return null;
    Object.keys(patch).forEach(function (k) { s[k] = patch[k]; });
    if (patch.type === 'weekly') { s.date = null; if (!s.startDate) s.startDate = todayStr(); }
    if (patch.type === 'once') { s.startDate = null; s.endDate = null; if (!s.date) s.date = todayStr(); }
    if (patch.type === 'satellite') { s.startDate = null; s.endDate = null; s.time = null; if (!s.month) s.month = todayStr().slice(0, 7); }
    s.updatedAt = Date.now();
    persist(); emit();
    return s;
  }

  function deleteSession(id, cascade) {
    var s = sessionById(id);
    if (!s) return;
    s.deletedAt = Date.now();
    s.updatedAt = Date.now();
    if (cascade) {
      // 删除整个定期规则：清掉其全部覆盖
      state.overrides.forEach(function (o) {
        if (o.sessionId === id && !o.deletedAt) { o.deletedAt = Date.now(); o.updatedAt = Date.now(); }
      });
    }
    persist(); emit();
  }

  function restoreSession(id) {
    var s = sessionById(id);
    if (!s) return;
    s.deletedAt = null; s.updatedAt = Date.now();
    persist(); emit();
  }

  /* ================= 实例覆盖（状态 / 单次时长） ================= */
  function setInstStatus(sessionId, date, status) {
    invalidate();
    var key = sessionId + '@' + date;
    var ov = null;
    for (var i = 0; i < state.overrides.length; i++) {
      if (state.overrides[i].sessionId === sessionId && state.overrides[i].date === date && !state.overrides[i].deletedAt) { ov = state.overrides[i]; break; }
    }
    if (!ov) {
      ov = { id: uid('o'), sessionId: sessionId, date: date, status: status, duration: null, note: '', createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null };
      state.overrides.push(ov);
    } else {
      ov.status = status;
      ov.updatedAt = Date.now();
    }
    _ovIndex = null;
    persist(); emit();
    return ov;
  }

  function setInstDuration(sessionId, date, minutes) {
    _ovIndex = null;
    var ov = null;
    for (var i = 0; i < state.overrides.length; i++) {
      if (state.overrides[i].sessionId === sessionId && state.overrides[i].date === date && !state.overrides[i].deletedAt) { ov = state.overrides[i]; break; }
    }
    if (!ov) {
      ov = { id: uid('o'), sessionId: sessionId, date: date, status: 'planned', duration: minutes, note: '', createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null };
      state.overrides.push(ov);
    } else { ov.duration = minutes; ov.updatedAt = Date.now(); }
    persist(); emit();
    return ov;
  }

  function clearInstOverride(sessionId, date) {
    _ovIndex = null;
    state.overrides.forEach(function (o) {
      if (o.sessionId === sessionId && o.date === date && !o.deletedAt) { o.deletedAt = Date.now(); o.updatedAt = Date.now(); }
    });
    persist(); emit();
  }

  /* 仅移除某一次（保留规则本体，与"取消"不同：取消仍显示且可统计为取消场次） */
  function removeInst(sessionId, date) {
    _ovIndex = null;
    var ov = null;
    for (var i = 0; i < state.overrides.length; i++) {
      var o = state.overrides[i];
      if (o.sessionId === sessionId && o.date === date && !o.deletedAt) { ov = o; break; }
    }
    if (!ov) {
      ov = { id: uid('o'), sessionId: sessionId, date: date, status: 'planned', duration: null, note: '', removed: true, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null };
      state.overrides.push(ov);
    } else { ov.removed = true; ov.updatedAt = Date.now(); }
    persist(); emit();
  }

  function restoreInst(sessionId, date) {
    _ovIndex = null;
    state.overrides.forEach(function (o) {
      if (o.sessionId === sessionId && o.date === date && !o.deletedAt) { o.removed = false; o.updatedAt = Date.now(); }
    });
    persist(); emit();
  }

  function clearCancelledInsts() {
    _ovIndex = null;
    var changed = false;
    state.overrides.forEach(function (o) {
      if (!o.deletedAt && o.status === 'cancelled') { o.deletedAt = Date.now(); changed = true; }
    });
    if (changed) { persist(); emit(); }
  }

  /* ================= 设置 ================= */
  function updateSettings(patch) {
    Object.keys(patch).forEach(function (k) { state.settings[k] = patch[k]; });
    state.settings.updatedAt = Date.now();
    persist(); emit();
  }

  /* 全局默认时长变更：同步所有"未锁定"的模组 */
  function setDefaultDuration(min) {
    min = Math.max(1, Math.round(+min || 120));
    state.settings.defaultDuration = min;
    state.settings.updatedAt = Date.now();
    var affected = 0;
    state.modules.forEach(function (m) {
      if (m.deletedAt) return;
      if (!m.durationLocked) { m.duration = min; m.updatedAt = Date.now(); affected++; }
    });
    persist(); emit();
    return affected;
  }

  /* ================= 统计 ================= */
  function rangeBounds(range) {
    var t = todayStr();
    if (range === 'year') return { start: yearStart(t), end: yearEnd(t) };
    if (range === 'all') return { start: '1970-01-01', end: '2999-12-31' };
    return { start: monthStart(t), end: monthEnd(t) };
  }

  /**
   * 统计各模组时长
   * 规则：status==='done' 计入；'cancelled' 不计入（取消≠删除）；'planned' 不计入
   *       module.bonus 为手动补录的未记录时长，单独累计
   */
  function stats(range) {
    var b = rangeBounds(range);
    var insts = expand(b.start, b.end);
    var t = todayStr();
    var map = {};
    var pending = [];
    var totalDone = 0, totalCancelled = 0, totalPlanned = 0, totalBonus = 0;

    modules().forEach(function (m) {
      map[m.id] = { module: m, minutes: 0, done: 0, planned: 0, cancelled: 0, bonus: Math.round(m.bonus || 0) };
    });

    insts.forEach(function (it) {
      var row = map[it.moduleId];
      if (!row) return; // 已删除模组不计入统计
      if (it.status === 'done') {
        row.minutes += it.duration; row.done++;
      } else if (it.status === 'cancelled') {
        row.cancelled++;
      } else {
        if (it.date < t) pending.push(it); else row.planned++;
      }
    });

    var items = Object.keys(map).map(function (k) {
      var r = map[k];
      r.total = r.minutes + r.bonus;
      return r;
    }).filter(function (r) {
      return r.minutes > 0 || r.bonus > 0 || r.done > 0 || r.planned > 0 || r.cancelled > 0;
    }).sort(function (a, b) { return b.total - a.total; });

    items.forEach(function (r) {
      totalDone += r.minutes; totalCancelled += r.cancelled; totalPlanned += r.planned; totalBonus += r.bonus;
    });

    return {
      range: range, start: b.start, end: b.end,
      items: items,
      pending: pending,
      total: totalDone + totalBonus,
      totalPlayed: totalDone,
      totalBonus: totalBonus,
      totalPlanned: totalPlanned,
      totalCancelled: totalCancelled,
      totalSessions: totalDone ? insts.filter(function (i) { return i.status === 'done'; }).length : 0
    };
  }

  /* 月度走势：返回近 N 个月的已完成时长 */
  function monthlyTrend(n) {
    n = n || 6;
    var t = todayStr();
    var out = [];
    var y = +t.split('-')[0], mo = +t.split('-')[1];
    for (var i = n - 1; i >= 0; i--) {
      var d = new Date(y, mo - 1 - i, 1);
      var key = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-01';
      var s = monthStart(key), e = monthEnd(key);
      var mins = 0, cnt = 0;
      expand(s, e).forEach(function (it) { if (it.status === 'done') { mins += it.duration; cnt++; } });
      out.push({ key: key, label: (d.getMonth() + 1) + '月', minutes: mins, count: cnt, current: i === 0 });
    }
    return out;
  }

  /* ================= 回收站 ================= */
  function trash() {
    var now = Date.now();
    var mods = state.modules.filter(function (m) { return m.deletedAt; })
      .map(function (m) { return { kind: 'module', id: m.id, name: m.name, color: m.color, at: m.deletedAt }; });
    var sess = state.sessions.filter(function (s) { return s.deletedAt; })
      .map(function (s) {
        var m = moduleById(s.moduleId);
        return {
          kind: 'session', id: s.id, name: (m ? m.name : '（模组已删）') + ' · ' +
            (s.type === 'weekly' ? '每周' + wdCn(s.weekday) : s.date) + ' ' + (s.time || ''),
          color: m ? m.color : '#B9B1A0', at: s.deletedAt
        };
      });
    return mods.concat(sess).sort(function (a, b) { return b.at - a.at; })
      .map(function (x) { x.expired = (now - x.at) > TRASH_TTL; return x; });
  }

  function restoreTrash(kind, id) {
    if (kind === 'module') restoreModule(id); else restoreSession(id);
  }

  function purgeTrash() {
    var now = Date.now();
    state.modules = state.modules.filter(function (m) { return !m.deletedAt; });
    state.sessions = state.sessions.filter(function (s) { return !s.deletedAt; });
    state.overrides = state.overrides.filter(function (o) { return !o.deletedAt || (now - o.deletedAt) < 86400000; });
    invalidate();
    persist(); emit();
  }

  /* ================= 导出 / 导入 ================= */
  function exportJSON() {
    return {
      app: 'MOTE跑团日历',
      schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      data: {
        settings: state.settings,
        modules: state.modules,
        sessions: state.sessions,
        overrides: state.overrides
      }
    };
  }

  function validateImport(obj) {
    if (!obj || typeof obj !== 'object') return '文件格式不正确';
    var d = obj.data || obj;
    if (!d || (!Array.isArray(d.modules) && !Array.isArray(d.sessions))) return '缺少 modules / sessions 数据';
    return null;
  }

  function importJSON(obj, mode) {
    var err = validateImport(obj);
    if (err) return { ok: false, error: err };
    var d = normalize(obj.data || obj);
    if (mode === 'replace') {
      state.settings = d.settings;
      state.modules = d.modules;
      state.sessions = d.sessions;
      state.overrides = d.overrides;
    } else {
      mergeState(d);
    }
    invalidate();
    persist(); emit();
    return { ok: true, modules: d.modules.length, sessions: d.sessions.length };
  }

  function wipe() {
    state.settings = defaultSettings();
    state.modules = []; state.sessions = []; state.overrides = [];
    invalidate();
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    if (IDB.available()) IDB.del(IDB_KEY);
    emit();
  }

  function usage() {
    var bytes = 0;
    try { bytes = (localStorage.getItem(LS_KEY) || '').length; } catch (e) {}
    return { bytes: bytes, modules: state.modules.length, sessions: state.sessions.length, overrides: state.overrides.length };
  }

  /* ================= 暴露 ================= */
  return {
    // 日期
    pad: pad, fmt: fmt, parse: parse, todayStr: todayStr, addDays: addDays, weekdayOf: weekdayOf,
    monthStart: monthStart, monthEnd: monthEnd, yearStart: yearStart, yearEnd: yearEnd,
    daysInMonth: daysInMonth, diffDays: diffDays, timeToMin: timeToMin, minToTime: minToTime,
    fmtDur: fmtDur, fmtDurCn: fmtDurCn, parseDur: parseDur, wdCn: wdCn, WD_CN: WD_CN,
    // 生命周期
    load: load, persist: persist, onChange: onChange, emit: emit, uid: uid,
    // 查询
    modules: modules, allModules: allModules, sessions: sessions,
    moduleById: moduleById, sessionById: sessionById,
    expand: expand, instancesOn: instancesOn, resolveDuration: resolveDuration,
    // 模组
    addModule: addModule, updateModule: updateModule, setModuleLocked: setModuleLocked,
    setModuleArchived: setModuleArchived, reorderModules: reorderModules,
    deleteModule: deleteModule, restoreModule: restoreModule, pickColor: pickColor, PALETTE: PALETTE,
    // 日程
    addSession: addSession, updateSession: updateSession, deleteSession: deleteSession, restoreSession: restoreSession,
    // 覆盖
    setInstStatus: setInstStatus, setInstDuration: setInstDuration, clearInstOverride: clearInstOverride,
    removeInst: removeInst, restoreInst: restoreInst, clearCancelledInsts: clearCancelledInsts,
    // 设置
    settings: function () { return state.settings; },
    updateSettings: updateSettings, setDefaultDuration: setDefaultDuration,
    // 统计
    stats: stats, monthlyTrend: monthlyTrend, rangeBounds: rangeBounds,
    // 回收站 / 数据
    trash: trash, restoreTrash: restoreTrash, purgeTrash: purgeTrash,
    exportJSON: exportJSON, importJSON: importJSON, wipe: wipe, usage: usage
  };
})();

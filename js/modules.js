/* ============================================================
   modules.js · 模组管理（名称 / 代表色 / 排序 / 详情 / 时长 / 补录）
   ============================================================ */
window.Modules = (function () {
  'use strict';
  var S = Store, U = UI, esc = U.esc, icon = U.icon;

  var rootEl = null;
  var showArchived = false;
  var dragId = null;
  var progDragRow = null;
  var spoilerMode = false;

  /* ---------- 列表视图 ---------- */
  function render() {
    if (!rootEl) return;
    var list = S.modules().filter(function (m) { return showArchived || !m.archived; });
    var archivedCount = S.modules().filter(function (m) { return m.archived; }).length;
    var allStats = S.stats('all');
    var statMap = {};
    allStats.items.forEach(function (r) { statMap[r.module.id] = r; });

    rootEl.innerHTML =
      '<div class="page">' +
        '<div class="page-head">' +
          '<div class="page-title">' + icon('i-layers') + '<span>模组</span>' +
            '<span class="chip" style="margin-left:4px">' + list.length + ' 个</span></div>' +
          '<span class="spacer"></span>' +
          (archivedCount ? '<button class="btn btn-sm" data-act="toggle-arch">' + icon('i-archive') +
            '<span>' + (showArchived ? '隐藏已归档' : '显示已归档（' + archivedCount + '）') + '</span></button>' : '') +
          '<label class="spoiler-toggle" title="遮蔽章节节点文字，防止剧透">' +
            '<input type="checkbox" data-act="spoiler"' + (spoilerMode ? ' checked' : '') + '>' +
            '<span class="spoiler-track"><span class="spoiler-thumb"></span></span>' +
            '<span class="spoiler-label">防剧透</span>' +
          '</label>' +
          '<button class="btn btn-primary btn-sm" data-act="new">' + icon('i-plus') + '<span>新建模组</span></button>' +
        '</div>' +
        (list.length
          ? '<div class="mod-grid" id="modGrid">' + list.map(function (m) { return cardHtml(m, statMap[m.id]); }).join('') + '</div>'
          : '<div class="panel">' + U.empty('i-layers', '还没有模组', '模组是你要跑的团，先建一个再排日程') + '</div>') +
        '<div class="set-note" style="margin-top:14px;text-align:center">' +
          '拖动卡片右上角的手柄可调整顺序，顺序决定日历与统计中的排列。</div>' +
      '</div>';

    bind();
  }

  /* 渲染进度节点列表：归档模组不做"当前进度"特殊效果 */
  function renderProgressNodes(m) {
    var nodes = m.progressNodes || [];
    if (!nodes.length) return '<div class="mod-desc is-empty">暂无详情</div>';
    var archived = !!m.archived;

    var html = '<div class="prog-list">';
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var isLast = i === nodes.length - 1;
      var isCurrent = !archived && isLast;  /* 归档模组不再标记当前进度 */
      html += '<div class="prog-node' +
        (isCurrent ? ' is-current' : '') + '"' +
        (isCurrent ? ' style="color:' + esc(m.color) + '"' : '') + '>' +
        '<span class="prog-dot' +
        (isCurrent ? ' is-active' : (n.done ? ' is-checked' : '')) + '"></span>' +
        '<span class="prog-text' + (isCurrent ? ' is-bold' : '') + (spoilerMode ? ' is-spoilered' : '') + '">' +
        (spoilerMode ? esc(n.text).replace(/./g, '█') : esc(n.text)) +
        (isCurrent ? '（当前进度）' : '') +
        '</span>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  /* 归一化字数统计输入：支持 "5k" / "1.5w" / "5500" / "300" */
  function normalizeWordCount(raw) {
    if (!raw) return '';
    var s = String(raw).trim().toLowerCase().replace(/\s+/g, '');
    if (!s) return '';
    var m = s.match(/^(\d+(?:\.\d+)?)\s*([kw]?)$/);
    if (!m) return '';                 // 非法输入直接丢弃
    var n = parseFloat(m[1]);
    if (m[2] === 'k') n = n * 1000;
    else if (m[2] === 'w') n = n * 10000;
    n = Math.round(n);
    if (n <= 0) return '';
    if (n >= 10000) {
      var w = n / 10000;
      return (Math.round(w * 10) / 10) + 'w';
    }
    if (n >= 1000) {
      var k = n / 1000;
      return (Math.round(k * 10) / 10) + 'k';
    }
    return String(n);
  }

  /* 格式化模组周期：未结 "25年7月"，已结 "25.7.15 - 26.8.20" */
  function modDateHtml(m) {
    if (!m.startDate) return '';
    var sp = m.startDate.split('-');
    var sy = sp[0].slice(2), sm = +sp[1], sd = +sp[2];
    if (m.endDate) {
      var e = m.endDate.split('-');
      var ey = e[0].slice(2), em = +e[1], ed = +e[2];
      return '<span class="mod-date is-ended mod-date-3line">' +
        '<span>' + sy + '.' + sm + '.' + sd + '</span>' +
        '<span class="mod-date-dash">至</span>' +
        '<span>' + ey + '.' + em + '.' + ed + '</span>' +
      '</span>';
    }
    return '<span class="mod-date" style="color:' + esc(m.color) + '">' + sy + '年' + sm + '月 开</span>';
  }

  function cardHtml(m, st) {
    var total = st ? st.total : 0;
    var sessCount = 0;
    S.sessions().forEach(function (s) { if (s.moduleId === m.id) sessCount++; });

    return '<div class="mod-card' + (m.archived ? ' is-archived' : '') + '" draggable="true" data-id="' + esc(m.id) + '" style="--ev-color:' + esc(m.color) + '">' +
      '<div class="mod-bar"></div>' +
      '<div class="mod-body">' +
        '<div class="mod-top">' +
          (m.archived
            ? '<span class="mod-arch-prefix">结团</span>'
            : '<span class="mod-swatch"></span>') +
          '<div class="mod-name">' + esc(m.name) +
            (m.satellite ? '<span class="sat-badge" style="background:' + esc(m.color) + '">卫星</span>' : '') +
          '</div>' +
          modDateHtml(m) +
          '<span class="mod-drag" title="拖动排序">' + icon('i-grip') + '</span>' +
        '</div>' +
        (m.preset ? '<div class="mod-preset">' + esc(m.preset) + '</div>' : '') +
        '<div class="mod-progress-box" data-pid="' + esc(m.id) + '">' +
          renderProgressNodes(m) +
        '</div>' +
        '<div class="mod-meta">' +
          (m.durationVisible !== false ? '<span class="chip">' + icon('i-clock') + esc(S.fmtDur(m.duration)) + (m.durationLocked ? ' 锁定' : '') + '</span>' : '') +
          '<span class="chip is-ok">' + icon('i-chart') + '累计 ' + esc(S.fmtDur(total)) + '</span>' +
          (m.wordCount ? '<span class="chip">字数 ' + esc(m.wordCount) + '</span>' : '') +
          (!m.archived ? '<span class="chip" data-act="mgr" style="cursor:pointer">' + icon('i-list') + sessCount + ' 条规则</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="mod-foot">' +
        '<button class="btn btn-sm" data-act="edit">' + icon('i-edit') + '<span>编辑</span></button>' +
        '<button class="btn btn-sm" data-act="addsess">' + icon('i-calendar') + '<span>排期</span></button>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn-sm btn-ghost' + (m.archived ? ' is-arch-on' : '') + '" data-act="arch" title="' + (m.archived ? '取消归档' : '归档') + '">' + icon('i-archive') + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-act="del" title="删除">' + icon('i-trash') + '</button>' +
      '</div>' +
      '</div>';
  }

  function bind() {
    var el = rootEl;
    var nw = U.qs('[data-act="new"]', el);
    if (nw) nw.addEventListener('click', function () { openEditor({}); });

    var ta = U.qs('[data-act="toggle-arch"]', el);
    if (ta) ta.addEventListener('click', function () { showArchived = !showArchived; render(); });

    var sp = U.qs('[data-act="spoiler"]', el);
    if (sp) sp.addEventListener('change', function () { spoilerMode = sp.checked; render(); });

    U.qsa('.mod-card', el).forEach(function (card) {
      var id = card.getAttribute('data-id');

      U.qs('[data-act="edit"]', card).addEventListener('click', function () {
        openEditor({ moduleId: id });
      });
      U.qs('[data-act="addsess"]', card).addEventListener('click', function () {
        Schedule.openEditor({ moduleId: id });
      });
      var mgrChip = U.qs('[data-act="mgr"]', card);
      if (mgrChip) mgrChip.addEventListener('click', function () {
        Schedule.openEditor({ moduleId: id });
      });
      U.qs('[data-act="arch"]', card).addEventListener('click', function () {
        var m = S.moduleById(id);
        var willArchive = !m.archived;
        S.setModuleArchived(id, willArchive);
        // 归档后自动显示已归档模组，便于用户立刻看到结果
        if (willArchive) showArchived = true;
        U.toast(willArchive ? '已归档，不再计入统计' : '已取消归档');
      });
      U.qs('[data-act="del"]', card).addEventListener('click', function () { askDelete(id); });

      /* 拖拽排序 */
      card.addEventListener('dragstart', function (e) {
        dragId = id;
        card.classList.add('is-dragging');
        try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); } catch (err) {}
      });
      card.addEventListener('dragend', function () {
        dragId = null;
        U.qsa('.mod-card', el).forEach(function (c) { c.classList.remove('is-dragging', 'is-drop-target'); });
      });
      card.addEventListener('dragover', function (e) {
        if (!dragId || dragId === id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('is-drop-target');
      });
      card.addEventListener('dragleave', function () { card.classList.remove('is-drop-target'); });
      card.addEventListener('drop', function (e) {
        e.preventDefault();
        card.classList.remove('is-drop-target');
        if (!dragId || dragId === id) return;
        var ids = S.modules().map(function (m) { return m.id; });
        var from = ids.indexOf(dragId), to = ids.indexOf(id);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, dragId);
        S.reorderModules(ids);
        U.toast('顺序已更新');
      });
    });

    /* 进度列表滚动到底部，确保当前进度可见 */
    U.qsa('.prog-list', el).forEach(function (pl) { pl.scrollTop = pl.scrollHeight; });
  }

  /* ---------- 删除 ---------- */
  function askDelete(id) {
    var m = S.moduleById(id);
    if (!m) return;
    var n = S.sessions().filter(function (s) { return s.moduleId === id; }).length;
    U.confirm({
      title: '删除模组「' + m.name + '」？',
      text: n ? '该模组下还有 ' + n + ' 条日程规则，将一并移入回收站。' : '该模组将被移入回收站。',
      hint: '已完成的时长记录随模组保留，恢复后可重新显示；也可在设置 · 回收站中彻底清空。',
      okText: '删除', danger: true
    }).then(function (ok) {
      if (!ok) return;
      S.deleteModule(id);
      U.toast('已移入回收站');
    });
  }

  /* ============================================================
     模组编辑器
     ============================================================ */
  function openEditor(opts) {
    opts = opts || {};
    var m = opts.moduleId ? S.moduleById(opts.moduleId) : null;
    var isNew = !m;
    var color = m ? m.color : S.pickColor();
    var dur = m ? m.duration : +S.settings().defaultDuration;
    var locked = m ? !!m.durationLocked : false;
    var bonus = m ? (m.bonus || 0) : 0;
    var durVisible = m ? (m.durationVisible !== false) : true;

    var body =
      '<div class="field">' +
        '<label class="field-label">模组名称</label>' +
        '<input class="input" data-f="name" value="' + esc(m ? m.name : '') + '" placeholder="例如：疯狂山脉 / 无尽之宴" maxlength="40">' +
      '</div>' +

      '<div class="field">' +
        '<label class="field-label">代表色<span class="hint">用于日历与统计</span></label>' +
        '<div class="swatches" data-sw>' +
          S.PALETTE.map(function (c) {
            return '<button type="button" class="swatch' + (c.toLowerCase() === color.toLowerCase() ? ' is-on' : '') +
              '" data-c="' + c + '" style="background:' + c + '"></button>';
          }).join('') +
        '</div>' +
        '<div class="row" style="margin-top:9px;align-items:center">' +
          '<input class="input" type="color" data-f="color" value="' + esc(color) + '" style="max-width:76px;padding:3px;height:34px;flex:0 0 auto">' +
          '<span class="set-note" style="margin:0">也可自定义任意颜色</span>' +
        '</div>' +
      '</div>' +

      '<div class="field">' +
        '<label class="field-label">预设信息<span class="hint">KP / PC / 暂未车卡</span></label>' +
        '<div class="preset-bar">' +
          '<button type="button" class="chip preset-btn" data-preset-v="KP：">KP</button>' +
          '<button type="button" class="chip preset-btn" data-preset-v="PC：">PC</button>' +
          '<button type="button" class="chip preset-btn" data-preset-v="暂未车卡">暂未车卡</button>' +
          '<span class="preset-spacer"></span>' +
          '<button type="button" class="chip ho-btn" data-ho-v="（HO1）">HO1</button>' +
          '<button type="button" class="chip ho-btn" data-ho-v="（HO2）">HO2</button>' +
          '<button type="button" class="chip ho-btn" data-ho-v="（HO3）">HO3</button>' +
          '<button type="button" class="chip ho-btn" data-ho-v="（HO4）">HO4</button>' +
        '</div>' +
        '<input class="input" data-f="preset" value="' + esc(m ? (m.preset || '') : '') + '" placeholder="点上方按钮快速填入，或手动输入" maxlength="40" style="margin-top:9px">' +
      '</div>' +

      '<div class="field">' +
        '<label class="field-label">章节进度<span class="hint">最后一行默认标记"当前进度"</span></label>' +
        '<div class="prog-editor" data-prog>' +
          (function () {
            var nodes = m ? (m.progressNodes || []) : [];
            var html = '';
            nodes.forEach(function (n, i) {
              html += '<div class="prog-edit-row" data-idx="' + i + '">' +
                '<span class="prog-grip" title="拖动排序" draggable="true">' + icon('i-grip') + '</span>' +
                '<button type="button" class="prog-ck-btn' + (n.done ? ' is-checked' : '') + '" data-act="toggle-ck"></button>' +
                '<input class="input prog-edit-text" data-f="progText" value="' + esc(n.text || '') + '" placeholder="章节 / 节点名" maxlength="60">' +
                '<button type="button" class="btn btn-sm btn-ghost prog-del" data-act="del-node">' + icon('i-x') + '</button>' +
              '</div>';
            });
            if (!nodes.length) html = '<div class="set-note" style="margin:0">点击下方按钮添加第一个进度节点</div>';
            return html;
          })() +
        '</div>' +
        '<button class="btn btn-sm" data-act="add-node" style="margin-top:9px">' + icon('i-plus') + '<span>新增节点</span></button>' +
      '</div>' +

      '<label class="switch" style="margin-bottom:14px">' +
        '<input type="checkbox" data-f="satellite"' + (m && m.satellite ? ' checked' : '') + '>' +
        '<span class="switch-track"></span>' +
        '<span class="switch-text"><svg class="ic ic-sm" viewBox="0 0 24 24" style="fill:currentColor;stroke:none"><path d="M12 2l2.93 5.93 6.55.95-4.74 4.62 1.12 6.5L12 17.77 6.14 20l1.12-6.5L2.52 8.88l6.55-.95L12 2z"/></svg>卫星模组（日期可选，仅选年月或具体日期均可）</span>' +
      '</label>' +

      '<div class="row">' +
        '<div class="field"><label class="field-label">开团日期<span class="hint">卫星可不填</span></label>' +
          '<input class="input" type="date" data-f="startDate" value="' + esc(m ? (m.startDate || '') : '') + '"></div>' +
        '<div class="field"><label class="field-label">结团日期<span class="hint">未结团不填</span></label>' +
          '<input class="input" type="date" data-f="endDate" value="' + esc(m ? (m.endDate || '') : '') + '"></div>' +
      '</div>' +

      '<div class="field">' +
        '<label class="field-label">默认单场时长<span class="hint">当前全局默认 ' + esc(S.fmtDur(S.settings().defaultDuration)) + '</span></label>' +
        U.durField({ value: dur, group: 'dur' }) +
        '<div class="row" style="margin-top:8px;align-items:center;gap:18px;flex-wrap:wrap">' +
          '<label class="switch" style="margin:0">' +
            '<input type="checkbox" data-f="locked"' + (locked ? ' checked' : '') + '>' +
            '<span class="switch-track"></span>' +
            '<span class="switch-text">锁定</span>' +
          '</label>' +
          '<label class="switch" style="margin:0">' +
            '<input type="checkbox" data-f="durVisible"' + (durVisible ? ' checked' : '') + '>' +
            '<span class="switch-track"></span>' +
            '<span class="switch-text">卡片显示单场时长</span>' +
          '</label>' +
        '</div>' +
      '</div>' +

      '<div class="field" style="margin-bottom:0">' +
        '<label class="field-label">补录时长<span class="hint">未记录的旧场次</span></label>' +
        U.durField({ value: bonus, group: 'bonus' }) +
      '</div>' +

      '<div class="field" style="margin-bottom:0">' +
        '<label class="field-label">字数统计<span class="hint">单位 k（千）/ w（万）</span></label>' +
        '<input class="input" data-f="wordCount" value="' + esc(m ? (m.wordCount || '') : '') + '" placeholder="例如 5k / 1.5w / 3000" maxlength="20">' +
      '</div>';

    U.modal({
      title: isNew ? '新建模组' : '编辑模组',
      icon: isNew ? 'i-plus' : 'i-edit',
      body: body,
      buttons: [
        { text: '取消', kind: 'ghost', onClick: function (mm, c) { c(); } },
        {
          text: isNew ? '创建' : '保存', kind: 'primary', icon: 'i-check',
          onClick: function (mm, c) {
            var name = U.qs('[data-f="name"]', mm).value.trim();
            if (!name) { U.toast('请填写模组名称', 'warn'); return; }
            var durMin = U.readDurField(mm, 'dur');
            if (durMin <= 0) { U.toast('时长需大于 0', 'warn'); return; }
            var bonusMin = U.readDurField(mm, 'bonus');
            /* 收集进度节点 */
            var progNodes = [];
            U.qsa('.prog-edit-row', mm).forEach(function (row) {
              var txt = U.qs('[data-f="progText"]', row);
              if (!txt) return;
              var t = txt.value.trim();
              if (!t) return;
              var ck = U.qs('.prog-ck-btn', row);
              progNodes.push({ text: t, done: ck ? ck.classList.contains('is-checked') : false });
            });
            var payload = {
              name: name,
              color: U.qs('[data-f="color"]', mm).value,
              preset: U.qs('[data-f="preset"]', mm).value.trim(),
              progressNodes: progNodes,
              satellite: U.qs('[data-f="satellite"]', mm).checked,
              startDate: U.qs('[data-f="startDate"]', mm).value || null,
              endDate: U.qs('[data-f="endDate"]', mm).value || null,
              duration: durMin,
              bonus: bonusMin,
              wordCount: normalizeWordCount(U.qs('[data-f="wordCount"]', mm).value),
              durationVisible: U.qs('[data-f="durVisible"]', mm).checked
            };
            var lockedV = U.qs('[data-f="locked"]', mm).checked;
            var saved;
            if (isNew) {
              saved = S.addModule(payload);
              if (!lockedV) S.setModuleLocked(saved.id, false);
            } else {
              S.updateModule(m.id, payload);
              S.setModuleLocked(m.id, lockedV);
              saved = S.moduleById(m.id);
            }
            c();
            U.toast(isNew ? '模组已创建' : '模组已更新');
            if (opts.onDone) opts.onDone(saved);
          }
        }
      ],
      onMount: function (mm) {
        // 色板
        U.qsa('[data-sw] .swatch', mm).forEach(function (b) {
          b.addEventListener('click', function () {
            U.qsa('[data-sw] .swatch', mm).forEach(function (x) { x.classList.remove('is-on'); });
            b.classList.add('is-on');
            var c = b.getAttribute('data-c');
            U.qs('[data-f="color"]', mm).value = c;
          });
        });
        // 预设快捷按钮：点击填入到 preset 输入框（光标定位到冒号后方便输入名字）
        U.qsa('.preset-btn', mm).forEach(function (b) {
          b.addEventListener('click', function () {
            var v = b.getAttribute('data-preset-v');
            var inp = U.qs('[data-f="preset"]', mm);
            inp.value = v;
            inp.focus();
            if (v !== '暂未车卡') { inp.setSelectionRange(v.length, v.length); }
          });
        });
        // HO 后缀按钮：点击在当前文本末尾追加后缀
        U.qsa('.ho-btn', mm).forEach(function (b) {
          b.addEventListener('click', function () {
            var v = b.getAttribute('data-ho-v');
            var inp = U.qs('[data-f="preset"]', mm);
            var cur = inp.value.trim();
            if (!cur) return;
            if (cur.indexOf(v) !== -1) return;
            inp.value = cur + v;
            inp.focus();
            inp.setSelectionRange(inp.value.length, inp.value.length);
          });
        });
        // 进度节点：新增 / 删除 / 切换勾选
        U.qs('[data-act="add-node"]', mm).addEventListener('click', function () {
          var progEl = U.qs('[data-prog]', mm);
          var note = U.qs('.set-note', progEl);
          if (note) note.remove();
          var idx = U.qsa('.prog-edit-row', progEl).length;
          var row = U.el('<div class="prog-edit-row" data-idx="' + idx + '">' +
            '<span class="prog-grip" title="拖动排序" draggable="true">' + icon('i-grip') + '</span>' +
            '<button type="button" class="prog-ck-btn" data-act="toggle-ck"></button>' +
            '<input class="input prog-edit-text" data-f="progText" value="" placeholder="章节 / 节点名" maxlength="60">' +
            '<button type="button" class="btn btn-sm btn-ghost prog-del" data-act="del-node">' + icon('i-x') + '</button>' +
          '</div>');
          progEl.appendChild(row);
          bindProgRow(row, mm);
          U.qs('.prog-edit-text', row).focus();
        });
        U.qsa('.prog-edit-row', mm).forEach(function (row) { bindProgRow(row, mm); });
        function bindProgRow(row, mm) {
          var ck = U.qs('.prog-ck-btn', row);
          if (ck) ck.addEventListener('click', function () { ck.classList.toggle('is-checked'); });
          var del = U.qs('[data-act="del-node"]', row);
          if (del) del.addEventListener('click', function () { row.remove(); });
          /* 拖拽排序：仅通过 grip 触发 */
          var grip = U.qs('.prog-grip', row);
          if (grip) {
            grip.addEventListener('dragstart', function (e) {
              progDragRow = row;
              row.classList.add('is-dragging');
              try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); } catch (err) {}
            });
            grip.addEventListener('dragend', function () {
              row.classList.remove('is-dragging');
              U.qsa('.prog-edit-row', mm).forEach(function (r) { r.classList.remove('is-drop-before', 'is-drop-after'); });
              progDragRow = null;
            });
          }
          /* 在行上检测 dragover，显示插入线 */
          row.addEventListener('dragover', function (e) {
            e.preventDefault();
            if (!progDragRow || progDragRow === row) return;
            e.dataTransfer.dropEffect = 'move';
            var rect = row.getBoundingClientRect();
            var after = (e.clientY - rect.top) > rect.height / 2;
            U.qsa('.prog-edit-row', mm).forEach(function (r) { r.classList.remove('is-drop-before', 'is-drop-after'); });
            row.classList.add(after ? 'is-drop-after' : 'is-drop-before');
          });
          row.addEventListener('dragleave', function () { row.classList.remove('is-drop-before', 'is-drop-after'); });
          row.addEventListener('drop', function (e) {
            e.preventDefault();
            row.classList.remove('is-drop-before', 'is-drop-after');
            if (!progDragRow || progDragRow === row) return;
            var progEl = U.qs('[data-prog]', mm);
            var rect = row.getBoundingClientRect();
            var after = (e.clientY - rect.top) > rect.height / 2;
            if (after) {
              if (row.nextSibling) progEl.insertBefore(progDragRow, row.nextSibling);
              else progEl.appendChild(progDragRow);
            } else {
              progEl.insertBefore(progDragRow, row);
            }
          });
        }
        // 自定义颜色同步取消色板选中，若命中则高亮
        U.qs('[data-f="color"]', mm).addEventListener('input', function (e) {
          var v = e.target.value.toLowerCase();
          U.qsa('[data-sw] .swatch', mm).forEach(function (x) {
            x.classList.toggle('is-on', x.getAttribute('data-c').toLowerCase() === v);
          });
        });
        // 改动默认时长即视为锁定（避免下次全局调整被覆盖）
        var durGroup = U.qs('[data-dur-group="dur"]', mm);
        U.qsa('input', durGroup).forEach(function (x) {
          x.addEventListener('input', function () {
            var lk = U.qs('[data-f="locked"]', mm);
            if (!lk.checked) lk.checked = true;
          });
        });
        U.bindDurField(mm);
      }
    });
  }

  function mount(root) {
    rootEl = root;
    // 若本次刷新来自"检查更新"，自动展开已归档模组
    try {
      if (localStorage.getItem('mote-coc-calendar:show-archived-on-load') === '1') {
        showArchived = true;
        localStorage.removeItem('mote-coc-calendar:show-archived-on-load');
      }
    } catch (e) {}
    render();
  }

  return { mount: mount, render: render, openEditor: openEditor, askDelete: askDelete };
})();

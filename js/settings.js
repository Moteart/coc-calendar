/* ============================================================
   settings.js · 设置：时长规则 / 数据档案 / 回收站 / 关于
   ============================================================ */
window.Settings = (function () {
  'use strict';
  var S = Store, U = UI, esc = U.esc, icon = U.icon;

  var rootEl = null;

  function render() {
    if (!rootEl) return;
    var st = S.settings();
    var usage = S.usage();
    var trash = S.trash();
    var lockedCount = S.modules().filter(function (m) { return m.durationLocked; }).length;

    rootEl.innerHTML =
      '<div class="page"><div class="set-wrap">' +

        /* ---- 时长规则 ---- */
        '<div class="set-card">' +
          '<div class="set-head">' + icon('i-clock') + '<span class="t">时长规则</span></div>' +
          '<div class="set-body">' +
            '<div class="set-row">' +
              '<div class="lab"><b>全局默认单场时长</b>' +
                '<span>新建日程、新建模组时的默认时长。修改后会同步所有「未锁定」的模组（当前有 ' +
                (S.modules().length - lockedCount) + ' 个未锁定、' + lockedCount + ' 个已锁定）。</span></div>' +
              '<div style="flex:none">' + U.durField({ value: st.defaultDuration, group: 'gdur' }) + '</div>' +
            '</div>' +
            '<div class="set-row" style="border-bottom:none;padding-top:0">' +
              '<div class="lab"></div>' +
              '<button class="btn btn-sm btn-primary" data-act="save-dur">' + icon('i-save') + '<span>保存并同步</span></button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* ---- 显示 ---- */
        '<div class="set-card">' +
          '<div class="set-head">' + icon('i-calendar') + '<span class="t">日历显示</span></div>' +
          '<div class="set-body">' +
            '<div class="set-row">' +
              '<div class="lab"><b>一周起始</b><span>日历第一列显示周几</span></div>' +
              '<div class="seg" data-seg="weekStart" style="flex:none">' +
                '<button type="button" data-v="1" class="' + (st.weekStart == 1 ? 'is-on' : '') + '">周一</button>' +
                '<button type="button" data-v="0" class="' + (st.weekStart == 0 ? 'is-on' : '') + '">周日</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* ---- 数据档案 ---- */
        '<div class="set-card">' +
          '<div class="set-head">' + icon('i-save') + '<span class="t">数据档案</span></div>' +
          '<div class="set-body">' +
            '<div class="set-row">' +
              '<div class="lab"><b>导出备份</b>' +
                '<span>把全部模组、日程与统计记录导出为 JSON 文件，可长期保存或迁移到别的设备。</span></div>' +
              '<button class="btn btn-sm" data-act="export">' + icon('i-upload') + '<span>导出</span></button>' +
            '</div>' +
            '<div class="set-row">' +
              '<div class="lab"><b>导入备份</b>' +
                '<span>选择此前导出的 JSON 文件。可选择「合并」（保留双方、取较新的）或「覆盖」（清空现有数据）。</span></div>' +
              '<button class="btn btn-sm" data-act="import">' + icon('i-download') + '<span>导入</span></button>' +
            '</div>' +
            '<div class="set-row" style="border-bottom:none">' +
              '<div class="lab"><b>存储占用</b>' +
                '<span>本地数据 ' + (usage.bytes / 1024).toFixed(1) + ' KB · ' +
                usage.modules + ' 个模组 · ' + usage.sessions + ' 条日程 · ' + usage.overrides + ' 条场次记录' +
                '<br>数据同时保存在浏览器 localStorage 与 IndexedDB 中，网站更新不会清除。</span></div>' +
              '<input type="file" accept=".json,application/json" data-file style="display:none">' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* ---- 回收站 ---- */
        '<div class="set-card">' +
          '<div class="set-head">' + icon('i-trash') + '<span class="t">回收站</span>' +
            '<span class="spacer"></span>' +
            (trash.length ? '<span class="chip">' + trash.length + ' 项</span>' : '') +
          '</div>' +
          '<div class="set-body">' +
            (trash.length
              ? '<div class="trash-list">' + trash.map(function (t) {
                  return '<div class="trash-item">' +
                    '<span class="sw" style="background:' + esc(t.color) + '"></span>' +
                    '<span class="nm">' + (t.kind === 'module' ? icon('i-layers') + ' ' : icon('i-calendar') + ' ') + esc(t.name) + '</span>' +
                    '<span class="dt">' + esc(new Date(t.at).toLocaleDateString('zh-CN')) + '</span>' +
                    '<button class="btn btn-sm btn-ghost" data-restore="' + esc(t.kind + '|' + t.id) + '" title="恢复">' + icon('i-undo') + '</button>' +
                    '</div>';
                }).join('') + '</div>' +
                '<div class="set-note">项目保留 30 天，超期后清空回收站时会被彻底删除。</div>' +
                '<button class="btn btn-sm btn-danger" data-act="purge" style="margin-top:10px">' + icon('i-trash') + '<span>清空回收站</span></button>'
              : U.empty('i-trash', '回收站是空的', '删除的模组与日程会先放在这里')) +
          '</div>' +
        '</div>' +

        /* ---- 关于 ---- */
        '<div class="set-card">' +
          '<div class="set-head">' + icon('i-info') + '<span class="t">关于</span></div>' +
          '<div class="set-body">' +
            '<div class="set-row">' +
              '<div class="lab"><b>MOTE跑团日历</b>' +
                '<span>自用跑团日程与时长统计 · 纯本地存储，不上传任何数据</span></div>' +
            '</div>' +
            '<div class="set-row">' +
              '<div class="lab"><b>离线使用</b>' +
                '<span>已启用 Service Worker 缓存，断网也能正常打开。可在浏览器中「添加到主屏幕」当作应用使用。</span></div>' +
              '<button class="btn btn-sm" data-act="reload">' + icon('i-undo') + '<span>检查更新</span></button>' +
            '</div>' +
            '<div class="set-row" style="border-bottom:none">' +
              '<div class="lab"><b>清空全部数据</b>' +
                '<span>删除所有模组、日程与统计记录，且不可恢复。建议先导出备份。</span></div>' +
              '<button class="btn btn-sm btn-danger" data-act="wipe">' + icon('i-alert') + '<span>清空</span></button>' +
            '</div>' +
          '</div>' +
        '</div>' +

      '</div></div>';

    bind();
  }

  function bind() {
    var el = rootEl;
    U.bindDurField(el);

    /* 全局时长 */
    U.qs('[data-act="save-dur"]', el).addEventListener('click', function () {
      var min = U.readDurField(el, 'gdur');
      if (min <= 0) { U.toast('时长需大于 0', 'warn'); return; }
      var n = S.setDefaultDuration(min);
      U.toast('已设为 ' + S.fmtDur(min) + '，同步 ' + n + ' 个未锁定模组');
      render();
    });

    /* 周起始 */
    U.qsa('[data-seg="weekStart"] button', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var v = +b.getAttribute('data-v');
        S.updateSettings({ weekStart: v });
        Calendar.render();
        render();
      });
    });

    /* 导出 */
    U.qs('[data-act="export"]', el).addEventListener('click', function () {
      try {
        var data = S.exportJSON();
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'MOTE跑团日历-备份-' + S.todayStr() + '.json';
        document.body.appendChild(a); a.click();
        setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
        U.toast('备份已导出');
      } catch (e) {
        U.toast('导出失败：' + e.message, 'err');
      }
    });

    /* 导入 */
    var fileInput = U.qs('[data-file]', el);
    U.qs('[data-act="import"]', el).addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var obj;
        try { obj = JSON.parse(String(reader.result)); }
        catch (e) { U.toast('文件不是有效的 JSON', 'err'); fileInput.value = ''; return; }
        var err = null;
        try { err = (obj && obj.data) ? null : '文件格式不正确'; } catch (e) { err = '文件格式不正确'; }
        if (err) { U.toast(err, 'err'); fileInput.value = ''; return; }

        U.modal({
          title: '导入备份',
          icon: 'i-upload',
          body: '<p style="margin:0 0 12px;color:var(--ink-2);line-height:1.7">文件包含 ' +
            ((obj.data.modules || []).length) + ' 个模组、' + ((obj.data.sessions || []).length) + ' 条日程。</p>' +
            '<div style="display:flex;flex-direction:column;gap:8px">' +
            '<button class="btn btn-block" data-mode="merge" style="justify-content:flex-start">' + icon('i-plus') +
              '<span><b>合并导入</b> · 保留现有数据，同 ID 取较新</span></button>' +
            '<button class="btn btn-block" data-mode="replace" style="justify-content:flex-start">' + icon('i-undo') +
              '<span><b>覆盖导入</b> · 清空现有数据后写入</span></button>' +
            '</div>',
          buttons: [{ text: '取消', kind: 'ghost', onClick: function (m, c) { c(); fileInput.value = ''; } }],
          onMount: function (m, close) {
            U.qsa('[data-mode]', m).forEach(function (b) {
              b.addEventListener('click', function () {
                var mode = b.getAttribute('data-mode');
                close();
                if (mode === 'replace') {
                  U.confirm({
                    title: '覆盖导入？',
                    text: '现有的全部模组、日程与统计记录会被备份文件取代，此操作不可撤销。',
                    hint: '建议先导出当前数据作为备份。',
                    okText: '覆盖导入', danger: true
                  }).then(function (ok) { if (ok) doImport(obj, mode); else fileInput.value = ''; });
                } else {
                  doImport(obj, mode);
                }
              });
            });
          }
        });
      };
      reader.onerror = function () { U.toast('读取文件失败', 'err'); fileInput.value = ''; };
      reader.readAsText(f, 'utf-8');
    });

    /* 回收站 */
    U.qsa('[data-restore]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-restore').split('|');
        S.restoreTrash(p[0], p[1]);
        U.toast('已恢复');
        render();
      });
    });
    var purge = U.qs('[data-act="purge"]', el);
    if (purge) purge.addEventListener('click', function () {
      U.confirm({
        title: '清空回收站？',
        text: '回收站中的 ' + S.trash().length + ' 项将被彻底删除，无法恢复。',
        okText: '清空', danger: true
      }).then(function (ok) { if (ok) { S.purgeTrash(); U.toast('回收站已清空'); render(); } });
    });

    /* 更新 / 清空 */
    U.qs('[data-act="reload"]', el).addEventListener('click', function () {
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
      } else {
        location.reload();
      }
    });

    U.qs('[data-act="wipe"]', el).addEventListener('click', function () {
      U.confirm({
        title: '清空全部数据？',
        text: '所有模组、日程、统计记录都会被删除，且无法恢复。',
        hint: '强烈建议先「导出备份」。',
        okText: '我确认清空', danger: true
      }).then(function (ok) {
        if (!ok) return;
        S.wipe();
        U.toast('数据已清空');
        App.go('calendar');
      });
    });
  }

  function doImport(obj, mode) {
    var r = S.importJSON(obj, mode);
    if (!r.ok) { U.toast('导入失败：' + r.error, 'err'); return; }
    U.toast((mode === 'replace' ? '已覆盖导入' : '已合并导入') + '：' + r.modules + ' 个模组 / ' + r.sessions + ' 条日程');
    App.go('calendar');
  }

  function mount(root) { rootEl = root; render(); }

  return { mount: mount, render: render };
})();

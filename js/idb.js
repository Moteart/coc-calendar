/* ============================================================
   idb.js · IndexedDB 极简 KV 封装
   作为主持久化层，容量大、不受 localStorage 清理策略影响
   ============================================================ */
window.IDB = (function () {
  'use strict';

  var DB_NAME = 'mote-coc-calendar';
  var DB_VER = 1;
  var STORE = 'kv';
  var _db = null;
  var _failing = false;

  function open() {
    if (_db) return Promise.resolve(_db);
    if (_failing) return Promise.reject(new Error('idb-unavailable'));
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') { _failing = true; return reject(new Error('idb-unavailable')); }
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); }
      catch (e) { _failing = true; return reject(e); }

      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { _db = req.result; resolve(_db); };
      req.onerror = function () { _failing = true; reject(req.error || new Error('idb-open-failed')); };
      req.onblocked = function () { reject(new Error('idb-blocked')); };
    });
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode);
        var store = t.objectStore(STORE);
        var out;
        try { out = fn(store); } catch (e) { reject(e); return; }
        t.oncomplete = function () { resolve(out && out.__req ? out.__req.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('idb-abort')); };
      });
    });
  }

  function wrap(req) { return { __req: req }; }

  return {
    get: function (key) {
      return tx('readonly', function (s) { return wrap(s.get(key)); }).catch(function () { return null; });
    },
    set: function (key, val) {
      return tx('readwrite', function (s) { s.put(val, key); }).catch(function () { return false; });
    },
    del: function (key) {
      return tx('readwrite', function (s) { s.delete(key); }).catch(function () { return false; });
    },
    available: function () { return !_failing && typeof indexedDB !== 'undefined'; }
  };
})();

/* Service Worker - 离线缓存
   核心 HTML/JS/CSS/manifest 走 network-first（防止旧版 JS 误覆盖新数据）；
   图标等稳定资源走 cache-first + 后台更新。
   兼容子路径部署（如 GitHub Pages /coc-calendar/）：
   - 以 registration.scope 推导 BASE，把请求路径归一化为站内相对路径再匹配
   - 所有网络请求 cache:'no-cache'，绕开浏览器 HTTP 短缓存，保证更新即时可达 */

const CACHE_NAME = 'coc-calendar-v7';
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, '');
const NET_FIRST = [
  '/', '/index.html', '/css/style.css', '/manifest.json',
  '/js/idb.js', '/js/store.js', '/js/ui.js', '/js/schedule.js',
  '/js/calendar.js', '/js/modules.js', '/js/stats.js', '/js/settings.js', '/js/app.js'
];
const CACHE_FIRST = ['/icon.svg', '/icon-192.png', '/icon-512.png'];

/* 把绝对 pathname 转为站内相对路径（'/coc-calendar/js/app.js' -> '/js/app.js'） */
function relPath(pathname) {
  if (BASE && pathname === BASE) return '/';
  if (BASE && pathname.indexOf(BASE + '/') === 0) return pathname.slice(BASE.length);
  return pathname;
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => Promise.allSettled(NET_FIRST.concat(CACHE_FIRST).map(a => c.add(BASE + a))))
      .then(results => {
        // 预缓存失败时输出警告（部署路径错误时便于排查）
        if (self.console && results) {
          results.forEach(function (r, i) {
            if (r && r.status === 'rejected') console.warn('[SW] precache fail:', BASE + NET_FIRST.concat(CACHE_FIRST)[i]);
          });
        }
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.startsWith('blob:')) return;

  const url = new URL(e.request.url);
  const rel = relPath(url.pathname);

  // SPA 导航请求：统一回退到 index.html
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
          return resp;
        })
        .catch(() => caches.match(e.request).then(c => c || caches.match(BASE + '/index.html')))
    );
    return;
  }

  const isNetFirst = NET_FIRST.some(p => rel === p);
  if (isNetFirst) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
          return resp;
        }
        return caches.match(e.request).then(c => c || caches.match(BASE + '/index.html'));
      }).catch(() => caches.match(e.request).then(c => c || caches.match(BASE + '/index.html')))
    );
    return;
  }

  const isCacheFirst = CACHE_FIRST.some(p => rel === p);
  if (isCacheFirst) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) {
          fetch(e.request).then(resp => {
            if (resp && resp.ok) caches.open(CACHE_NAME).then(c => c.put(e.request, resp.clone()));
          }).catch(() => {});
          return cached;
        }
        return fetch(e.request).then(resp => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
          }
          return resp;
        }).catch(() => caches.match(BASE + '/index.html'));
      })
    );
    return;
  }

  // 其他资源（同源静态文件）：stale-while-revalidate
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request, { cache: 'no-cache' }).then(resp => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
          }
          return resp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

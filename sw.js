/* ===========================================================
   轻声 LightTodo · Service Worker
   目标：安装到桌面后可离线打开；静态资源缓存优先，页面导航网络优先
   =========================================================== */
'use strict';

const VERSION = 'lighttodo-v6';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/base.css',
  './css/screens.css',
  './css/pwa.css',
  './js/store.js',
  './js/persona.js',
  './js/nlu.js',
  './js/reminder.js',
  './js/chat.js',
  './js/views.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

// 壳资源白名单（首次 fetch 时惰性解析成绝对地址）
let SHELL_SET = null;
function isShell(href) {
  if (!SHELL_SET) {
    SHELL_SET = Object.create(null);
    SHELL.forEach(function (s) {
      try { SHELL_SET[new URL(s, self.registration.scope).href] = true; } catch (err) { /* 忽略非法条目 */ }
    });
  }
  return !!SHELL_SET[href];
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== VERSION; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：先网络（拿最新版本），断网时回退到缓存的壳
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        const copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // 只接管预缓存清单内的壳资源；清单外（如 tools 自检页、icon 大图）直通网络，
  // 否则改完文件刷新拿到的还是旧缓存，调试与迭代会被误导
  if (!isShell(url.href)) return;

  // 静态资源：缓存优先，命中后后台静默更新
  e.respondWith(
    caches.match(req).then(function (hit) {
      const network = fetch(req).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || network;
    })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

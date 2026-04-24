const CACHE_NAME = 'hosting-mgr-v1';
const STATIC_ASSETS = [
  '/',
  '/static/js/app.js',
  '/static/manifest.json',
  '/static/icons/icon.svg',
];

// ── Install: cache static assets ──────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ─────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: network-first for API, cache-first for static ──
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.pathname.startsWith('/api/')) {
    // Network first for API calls
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache first for static assets
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
  }
});

// ── Push notifications ─────────────────────────────────────
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: 'SB-Hosting', body: 'You have pending notifications' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/static/icons/icon.svg',
      badge: '/static/icons/icon.svg',
      tag: data.tag || 'hosting-mgr',
      renotify: true,
      data: data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.length > 0) {
        wins[0].focus();
        wins[0].navigate(e.notification.data);
      } else {
        clients.openWindow(e.notification.data || '/');
      }
    })
  );
});

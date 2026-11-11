// Service worker Bedikot : affiche les rappels envoyés par le serveur.
const CACHE = 'bedikot-v2';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
// réseau d'abord, cache si hors ligne
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./'))),
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Bedikot', body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Bedikot', {
      body: d.body || '',
      tag: d.tag || 'bedikot',
      renotify: true,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      data: { url: d.url || './', slot: d.slot },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.postMessage({ slot: e.notification.data && e.notification.data.slot }); return c.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});

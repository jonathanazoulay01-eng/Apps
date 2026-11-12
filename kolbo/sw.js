// Service worker Kol Bo : l'app marche hors ligne et se met à jour toute seule.
const CACHE = 'kolbo-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('kolbo-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
// réseau d'abord (pour avoir la dernière version), cache si hors ligne ; les polices Google sont gardées aussi
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  const fonts = u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com';
  if (u.origin !== location.origin && !fonts) return;
  e.respondWith(
    fetch(e.request, fonts ? {} : { cache: 'no-cache' })
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./'))),
  );
});

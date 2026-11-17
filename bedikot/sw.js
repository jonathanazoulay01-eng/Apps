// Service worker Bedikot : affiche les rappels envoyés par le serveur.
const CACHE = 'rappels-v14';
const API = 'https://qddkzkqhzbbwrfledovv.supabase.co/functions/v1/bedikot';
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
    fetch(e.request, { cache: 'no-cache' }) // toujours vérifier s'il y a une nouvelle version
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
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Rappel', body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Rappel', {
      body: d.body || '',
      tag: d.tag || 'bedikot',
      renotify: true,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      requireInteraction: true,
      // boutons sous la notification (Android, ordinateur ; l'iPhone ne les affiche pas)
      actions: Array.isArray(d.actions) ? d.actions : [],
      data: { url: d.url || './', slot: d.slot, id: d.id },
    }),
  );
});

const call = (body) =>
  fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  if (e.action === 'done' && data.id && data.slot) {
    e.waitUntil(call({ action: 'done', id: data.id, slot: data.slot }));
    return;
  }
  if (e.action === 'snooze' && data.id && data.slot) {
    e.waitUntil(call({ action: 'snooze', id: data.id, slot: data.slot, minutes: 20 }));
    return;
  }
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

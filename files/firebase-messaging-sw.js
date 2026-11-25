// YUNO background alerts. This small file runs on the phone even when YUNO is minimized or the phone is locked.
// It does not need your Firebase keys: the server sends the words, this file just shows them.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; }
  catch (e) { try { p = { data: { body: event.data.text() } }; } catch (e2) { p = {}; } }
  const d = p.data || p.notification || p || {};
  const title = d.title || 'YUNO';
  const opts = {
    body: d.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [250, 100, 250, 100, 250],
    requireInteraction: d.sticky === '1',
    data: { url: d.url || '/' }
  };
  if (d.tag) { opts.tag = d.tag; opts.renotify = true; }
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        try {
          if (new URL(c.url).pathname === target.pathname && 'focus' in c) return c.focus();
        } catch (e) {}
      }
      return self.clients.openWindow(target.href);
    })
  );
});

/* Noctibat: Mitteilungen im Hintergrund (Inaya, 2026-10-14)
   Zeigt Push-Mitteilungen an, auch wenn die App geschlossen ist, und öffnet beim Antippen den passenden Chat.
   Bewusst ohne Firebase-Bibliothek und ohne Zwischenspeicher: Diese Datei kümmert sich nur um Mitteilungen, nicht um das Laden der Seite. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let p = {}; try { p = e.data ? e.data.json() : {}; } catch { p = {}; }
  const d = p.data || p.notification || p || {};
  const call = d.kind === 'call';
  // iPhone verlangt zu jedem Push eine sichtbare Mitteilung, darum immer anzeigen
  e.waitUntil(self.registration.showNotification(d.title || 'Noctibat', {
    body: d.body || '',
    icon: '/pwa/icon-192.png',
    badge: '/pwa/icon-192.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: call,
    vibrate: call ? [400, 200, 400, 200, 400] : [120],
    data: {link: d.link || '/'}
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = new URL(e.notification.data?.link || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(list => {
    const w = list.find(c => c.url.startsWith(self.location.origin));
    if (w) { w.postMessage({nfOpen: link}); return w.focus(); }
    return self.clients.openWindow(link);
  }));
});

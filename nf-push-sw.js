/* Noctibat: Mitteilungen im Hintergrund (Inaya, 2026-10-14)
   Zeigt Push-Mitteilungen an, auch wenn die App geschlossen ist, und öffnet beim Antippen den passenden Chat.
   Bewusst ohne Firebase-Bibliothek und ohne Zwischenspeicher: Diese Datei kümmert sich nur um Mitteilungen, nicht um das Laden der Seite. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const SEEN = new Set();
self.addEventListener('push', e => {
  let p = {}; try { p = e.data ? e.data.json() : {}; } catch { p = {}; }
  const d = p.data || p.notification || p || {};
  const call = d.kind === 'call', eid = d.eid || '';
  // v1078: Kommt dieselbe Sache doppelt an (z. B. über zwei Geräte-Schlüssel auf demselben Gerät), ersetzt sie still die schon gezeigte statt einer zweiten Mitteilung.
  // iPhone verlangt zu jedem Push eine sichtbare Mitteilung, darum immer anzeigen
  e.waitUntil((async () => {
    let dup = !!eid && SEEN.has(eid);
    if (eid) { SEEN.add(eid); if (SEEN.size > 200) SEEN.delete(SEEN.values().next().value); }
    if (eid && !dup) { try { dup = (await self.registration.getNotifications()).some(n => n.data && n.data.eid === eid); } catch {} }
    const tag = d.tag || eid || undefined;
    return self.registration.showNotification(d.title || 'Noctibat', {
      body: d.body || '',
      icon: '/pwa/icon-192.png',
      badge: '/pwa/icon-192.png',
      tag,
      renotify: !!tag && !dup,
      silent: dup || undefined,
      requireInteraction: call,
      vibrate: dup ? undefined : call ? [400, 200, 400, 200, 400] : [120],
      data: {link: d.link || '/', eid}
    });
  })());
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

// Shiptorio service worker: only here so "you're the bottleneck" notifications work on phones
// (Android Chrome needs showNotification from a worker). Tapping one brings the game back up.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => "focus" in c);
      return open ? open.focus() : self.clients.openWindow(url);
    }),
  );
});

// On-demand only: never prefetch music before consent. Hashed chunks are immutable;
// keep only the most recently used score version, bounded across deployments.
const MUSIC_CACHE = "shiptorio-music-v2";
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !/^\/assets\/foundryPlayer-[\w-]+\.js$/.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(MUSIC_CACHE);
    const hit = await cache.match(event.request);
    if (hit) return hit;
    const response = await fetch(event.request);
    if (response.ok) {
      for (const key of await cache.keys()) await cache.delete(key);
      await cache.put(event.request, response.clone());
    }
    return response;
  })());
});

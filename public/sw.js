importScripts("/sw-strategy.js");

const { CACHE_NAME, INSTALL_ASSETS, cacheableStaticRequest, obsoleteWattmerlegCaches } = self.WattmerlegSwStrategy;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(INSTALL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(obsoleteWattmerlegCaches(keys).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== location.origin ||
    url.pathname.startsWith("/api/") ||
    event.request.cache === "no-store"
  ) {
    return;
  }
  if (!cacheableStaticRequest(event.request, location.origin)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
      }
      return response;
    })),
  );
});

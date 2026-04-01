const CACHE_NAME = "workshare-web-v6";
const APP_SHELL = ["/", "/project/", "/manifest.json", "/manifest.webmanifest", "/workshare-logo.png"];

function canBeCached(request, response) {
  return request.method === "GET" && response && response.status === 200 && response.type !== "opaque";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        for (const url of APP_SHELL) {
          try {
            await cache.add(url);
          } catch {
            // App shell entries are optional here; runtime fetch will refill cache.
          }
        }
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        const fresh = await fetch(request);
        if (canBeCached(request, fresh)) {
          void cache.put(request, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }

        if (request.mode === "navigate") {
          const fallback = await cache.match("/");
          if (fallback) {
            return fallback;
          }
        }

        return Response.error();
      }
    })(),
  );
});

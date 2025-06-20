export default `const CACHE_NAME = "wx-cache-v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === "/api/wx" || url.pathname === "/api/daily") {
    if (event.request.headers.get("x-skip-cache")) {
      event.respondWith(fetchAndCache(event.request));
    } else {
      event.respondWith(cacheThenNetwork(event.request));
    }
  } else if (url.pathname.startsWith("/img")) {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname === "/api/article") {
    event.respondWith(cacheThenNetwork(event.request));
  }
});

async function fetchAndCache(request) {
  const cache = await caches.open(CACHE_NAME);
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function cacheThenNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request)
      .then((res) => {
        if (res.ok) cache.put(request, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone());
    return res;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}
`;

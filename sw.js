const CACHE_NAME = "wx-cache-v2";
const META_CACHE = "wx-cache-meta-v1";
const MAX_IMG_CACHE_AGE = 6 * 24 * 60 * 60 * 1000;

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME && n !== META_CACHE)
          .map((n) => caches.delete(n)),
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
  } else if (
    matchImgCache(url) &&
    event.request.destination === "image"
  ) {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname.startsWith("/img")) {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname === "/api/article") {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname === "/") {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname === "/ideas") {
    event.respondWith(cacheThenNetwork(event.request));
  }
});

function matchImgCache(url) {
  if (url.hostname === IMG_CACHE) return true;
  const inner = url.searchParams.get("url");
  if (inner) {
    try {
      return new URL(inner).hostname === IMG_CACHE;
    } catch {}
  }
  return false;
}

async function fetchAndCache(request) {
  const cache = await caches.open(CACHE_NAME);
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") {
    await cache.put(request, res.clone());
    if (request.destination === "image") {
      const meta = await caches.open(META_CACHE);
      await meta.put(request.url, new Response(Date.now().toString()));
    }
  }
  return res;
}

async function cacheThenNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const isImg = request.destination === "image";
  if (cached) {
    if (isImg) {
      const meta = await caches.open(META_CACHE);
      const metaRes = await meta.match(request.url);
      if (metaRes) {
        const ts = parseInt(await metaRes.text());
        if (!Number.isNaN(ts) && Date.now() - ts < MAX_IMG_CACHE_AGE) {
          fetch(request)
            .then(async (res) => {
              if (res.ok || res.type === "opaque") {
                await cache.put(request, res.clone());
                await meta.put(request.url, new Response(Date.now().toString()));
              }
            })
            .catch(() => {});
          return cached;
        }
      }
    } else {
      fetch(request)
        .then((res) => {
          if (res.ok || res.type === "opaque") cache.put(request, res.clone());
        })
        .catch(() => {});
      return cached;
    }
  }
  try {
    const res = await fetch(request);
    if (res.ok || res.type === "opaque") {
      await cache.put(request, res.clone());
      if (isImg) {
        const meta = await caches.open(META_CACHE);
        await meta.put(request.url, new Response(Date.now().toString()));
      }
    }
    return res;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

const CACHE_NAME = "wx-cache-v2";
const CACHE_AGE = 6 * 24 * 60 * 60 * 1000;
const TS_HEADER = "X-Cache-Timestamp";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) => n !== CACHE_NAME)
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
    if (res.type === "opaque") {
      const headers = new Headers();
      headers.set(TS_HEADER, Date.now().toString());
      const ct = res.headers.get("Content-Type");
      if (ct) headers.set("Content-Type", ct);
      const cachedRes = new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
      await cache.put(request, cachedRes);
    } else {
      const resForCache = res.clone();
      const headers = new Headers(resForCache.headers);
      headers.set(TS_HEADER, Date.now().toString());
      const cachedRes = new Response(resForCache.body, {
        status: resForCache.status,
        statusText: resForCache.statusText,
        headers,
      });
      await cache.put(request, cachedRes);
    }
  }
  return res;
}

async function cacheThenNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    const ts = parseInt(cached.headers.get(TS_HEADER) || "0");
    if (!Number.isNaN(ts) && Date.now() - ts < CACHE_AGE) {
      return cached;
    }
    fetch(request)
      .then(async (res) => {
        if (res.ok || res.type === "opaque") {
          if (res.type === "opaque") {
            const headers = new Headers();
            headers.set(TS_HEADER, Date.now().toString());
            const ct = res.headers.get("Content-Type");
            if (ct) headers.set("Content-Type", ct);
            const cachedRes = new Response(res.body, {
              status: res.status,
              statusText: res.statusText,
              headers,
            });
            await cache.put(request, cachedRes);
          } else {
            const resForCache = res.clone();
            const headers = new Headers(resForCache.headers);
            headers.set(TS_HEADER, Date.now().toString());
            const cachedRes = new Response(resForCache.body, {
              status: resForCache.status,
              statusText: resForCache.statusText,
              headers,
            });
            await cache.put(request, cachedRes);
          }
        }
      })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res.ok || res.type === "opaque") {
      if (res.type === "opaque") {
        const headers = new Headers();
        headers.set(TS_HEADER, Date.now().toString());
        const ct = res.headers.get("Content-Type");
        if (ct) headers.set("Content-Type", ct);
        const cachedRes = new Response(res.body, {
          status: res.status,
          statusText: res.statusText,
          headers,
        });
        await cache.put(request, cachedRes);
      } else {
        const resForCache = res.clone();
        const headers = new Headers(resForCache.headers);
        headers.set(TS_HEADER, Date.now().toString());
        const cachedRes = new Response(resForCache.body, {
          status: resForCache.status,
          statusText: resForCache.statusText,
          headers,
        });
        await cache.put(request, cachedRes);
      }
    }
    return res;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

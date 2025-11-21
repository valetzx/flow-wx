const CACHE_NAME = "wx-cache-v2";
const CACHE_AGE = 6 * 24 * 60 * 60 * 1000;
const TS_HEADER = "X-Cache-Timestamp";
let injectPaths = [];
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'injectFlow') {
    injectPaths = Array.isArray(event.data.paths) ? event.data.paths : [];
  }
});
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
  if (url.pathname === "/api/wx" || url.pathname === "/api/bil" || url.pathname === "/api/daily" || url.pathname === "/api/plugins") {
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
  } else if (url.pathname.startsWith("/plugin/")) {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname.startsWith("/a/") && url.searchParams.get("view") === "1") {
    event.respondWith(cacheThenNetwork(event.request));
  // } else if (url.pathname === "/api/article") {
  //   event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname === "/") {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname === "/common.css" || url.pathname === "/common.js" || url.pathname === "/sidebar.js" || url.pathname === "/ideas.css" || url.pathname === "/settings.html" || url.pathname === "/sidebar.html") {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname === "/ideas") {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname === "/game21") {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname === "/add") {
    event.respondWith(cacheThenNetwork(event.request));
  } else if (url.pathname === "/update") {
    event.respondWith(cacheOnly(event.request));
  } else if (url.pathname === "/flowInject.json") {
    event.respondWith(cacheOnly(event.request));
  } else if (injectPaths.includes(url.pathname)) {
    event.respondWith(cacheOnly(event.request));
  } else if (/^\/web\.(html|css|js)$/.test(url.pathname)) {
    event.respondWith(cacheOnly(event.request));
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
  let res;
  try {
    res = await fetch(request);
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response("fetch error", { status: 502 });
  }
  if (res.ok || res.type === "opaque") {
    if (res.type === "opaque") {
      await cache.put(request, res.clone());
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
            await cache.put(request, res.clone());
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
        await cache.put(request, res.clone());
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

async function cacheOnly(request) {
  const cache = await caches.open(CACHE_NAME);
  const res = await cache.match(request);
  return res || new Response("not found", { status: 404 });
}

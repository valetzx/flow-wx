// Cloudflare Worker version of server.ts
import * as cheerio from "cheerio";
import mainHtml from "./main.html";
import ideasHtml from "./ideas.html";
import adminHtml from "./admin.html";
// import swHtml from "./sw.js";
import articleText from "./article.txt";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function withCors(headers = {}) {
  return { ...headers, ...CORS_HEADERS };
}



const DAILY_URL = "https://www.cikeee.com/api?app_key=pub_23020990025";
const DAILY_TTL = 60 * 60 * 8000;
const CACHE_TTL = 60 * 60 * 1000;

const fallbackSentences = [
  "小荷才露尖尖角",
  "早有蜻蜓立上头",
  "采菊东篱下",
  "悠然见南山",
  "看看内容吧",
  "日长篱落无人过",
  "惟有蜻蜓蛱蝶飞",
  "小娃撑小艇",
  "日长篱落无人过",
  "惟有蜻蜓蛱蝶飞",
  "偷采白莲回",
  "不解藏踪迹",
  "浮萍一道开",
];

function randomSentence() {
  return fallbackSentences[Math.floor(Math.random() * fallbackSentences.length)];
}

let urls = [];
let urlsInit = false;
let cache = { data: null, timestamp: 0 };
let dailyCache = { data: null, timestamp: 0 };

async function getUrls(env) {
  if (!urlsInit) {
    urlsInit = true;
    if (env.WX_URL) {
      try {
        const res = await fetch(env.WX_URL);
        if (res.ok) {
          const txt = await res.text();
          urls = txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        }
      } catch {}
    }
    if (urls.length === 0) {
      urls = articleText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    }
  }
  return urls;
}

function injectConfig(html, apiDomains, imgDomains) {
  if (!apiDomains.length && !imgDomains.length) return html;
  const script = `<script>window.API_DOMAINS=${JSON.stringify(
    apiDomains,
  )};window.IMG_DOMAINS=${JSON.stringify(imgDomains)};</script>`;
  return html.replace("</head>", `${script}</head>`);
}

function proxifyHtml(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  $('[style]').each((_, el) => {
    let style = $(el).attr('style') ?? '';
    style = style.replace(/url\((['"]?)(https?:\/\/[^'"\)]+)\1\)/g, (match, q, url) => {
      if (url.includes('mmbiz')) {
        const clean = url.replace(/&amp;/g, '&');
        return `url(${q}/img?url=${encodeURIComponent(clean)}${q})`;
      }
      return match;
    });
    $(el).attr('style', style);
  });
  return $.html();
}

async function proxyImage(imgUrl) {
  try {
    const wechatRes = await fetch(imgUrl, {
      headers: {
        Referer: "https://mp.weixin.qq.com/",
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!wechatRes.ok) {
      return new Response("fetch image fail", {
        status: wechatRes.status,
        headers: withCors(),
      });
    }
    return new Response(wechatRes.body, {
      status: 200,
      headers: withCors({
        "Content-Type": wechatRes.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      }),
    });
  } catch {
    return new Response("proxy error", { status: 502, headers: withCors() });
  }
}

async function scrape(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const name = $('#activity-name').text().trim() ||
      $('.rich_media_title').text().trim() ||
      randomSentence();
    const time = $('#publish_time').text().trim() ||
      $('meta[property="article:published_time"]').attr('content')?.trim();
    const description = $('meta[property="og:description"]').attr('content')?.trim() ||
      $('#js_content p').first().text().trim();
    const images = [];
    $('#js_content img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src) images.push(src.split('?')[0]);
    });
    const jsonWxRaw = $('catch#json-wx').html()?.trim();
    let jsonWx;
    if (jsonWxRaw) {
      try {
        jsonWx = JSON.parse(jsonWxRaw.replace(/&quot;/g, '"'));
      } catch (e) {
        jsonWx = { parseError: e.message, raw: jsonWxRaw };
      }
    }
    return { [name]: { time, description, images, jsonWx, url } };
  } finally {
    clearTimeout(timer);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors({ "Content-Type": "application/json; charset=utf-8" }),
  });
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: withCors() });
    }

    const { pathname, searchParams } = new URL(req.url);
    const apiDomains = (env.API_DOMAINS || "")
      .split(/[,\s]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    const imgDomains = (env.IMG_DOMAINS || "")
      .split(/[,\s]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    const cacheImgDomain = env.IMG_CACHE || "";

    const indexHtml = injectConfig(mainHtml, apiDomains, imgDomains);
    const ideasPage = injectConfig(ideasHtml, apiDomains, imgDomains);
    const adminPage = injectConfig(adminHtml, apiDomains, imgDomains);

    const urls = await getUrls(env);

    if (pathname === "/api/wx") {
      try {
        if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
          return json(cache.data);
        }
        const results = await Promise.allSettled(urls.map(scrape));
        const merged = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            Object.assign(merged, r.value);
          } else {
            merged[`(抓取失败) ${urls[i]}`] = { error: String(r.reason) };
          }
        });
        cache = { data: merged, timestamp: Date.now() };
        return json(merged);
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (pathname === "/api/daily") {
      try {
        if (dailyCache.data && Date.now() - dailyCache.timestamp < DAILY_TTL) {
          return json(dailyCache.data);
        }
        const res = await fetch(DAILY_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        dailyCache = { data, timestamp: Date.now() };
        return json(data);
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (pathname === "/api/article") {
      const url = searchParams.get("url") || urls[0];
      if (!url) return json({ error: "missing url" }, 400);
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0",
            Referer: "https://mp.weixin.qq.com/",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const $ = cheerio.load(html, { decodeEntities: false });
        const title = $('#activity-name').text().trim() ||
          $('.rich_media_title').text().trim() ||
          randomSentence();
        $('#js_content img').each((_, el) => {
          const src = $(el).attr('data-src') || $(el).attr('src');
          if (src) {
            $(el).attr('src', `/img?url=${encodeURIComponent(src)}`);
            $(el).removeAttr('data-src');
          }
        });
        const content = proxifyHtml($('#js_content').html() || "");
        const page = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${title}</title></head><body><h1 class="text-2xl font-semibold mb-2">${title}</h1>${content}</body></html>`;
        return new Response(page, {
          headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
        });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (pathname === "/sw.js") {
        const swHtml = `
const IMG_CACHE = ${JSON.stringify(cacheImgDomain)};
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
        `;
        return new Response(swHtml, {
          headers: withCors({ "Content-Type": "application/javascript" })
      });
    }

    if (pathname === "/img") {
      const imgUrl = searchParams.get("url");
      if (!imgUrl) return new Response("missing url", { status: 400, headers: withCors() });
      return await proxyImage(imgUrl);
    }

    if (pathname === "/@admin") {
      return new Response(adminPage, {
        headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
      });
    }

    if (pathname === "/ideas") {
      return new Response(ideasPage, {
        headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
      });
    }

    return new Response(indexHtml, {
      headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
    });
  },
};

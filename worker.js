// Cloudflare Worker version of server.ts
import * as cheerio from "cheerio";
import mainHtml from "./main.html";
import ideasHtml from "./ideas.html";
import adminHtml from "./admin.html";
// import swHtml from "./sw.js";
import articleText from "./article.txt";
import biliText from "./bili.txt";
import { parseArticles, randomSentence } from "./lib/articleUtils.js?raw";
import { fetchWxTitle, scrapeWx } from "./lib/wx.js?raw";
import { fetchBiliTitle, scrapeBili } from "./lib/bil.js?raw";

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


let articles = [];
let articlesInit = false;
let cache = { data: null, timestamp: 0 };
let dailyCache = { data: null, timestamp: 0 };
let biliArticles = [];
let biliInit = false;
let bilCache = { data: null, timestamp: 0 };


async function getArticles(env) {
  if (!articlesInit) {
    articlesInit = true;
    if (env.WX_URL) {
      try {
        const res = await fetch(env.WX_URL);
        if (res.ok) {
          const txt = await res.text();
          articles = parseArticles(txt);
        }
      } catch {}
    }
    if (articles.length === 0) {
      articles = parseArticles(articleText);
    }

    for (const art of articles) {
      if (!art.title || (Array.isArray(art.title) && art.title.length === 0) || (typeof art.title === 'string' && art.title.trim() === '')) {
        art.title = await fetchWxTitle(art.url);
      }
    }
  }
  return articles;
}

async function getBiliArticles(env) {
  if (!biliInit) {
    biliInit = true;
    if (env.BIL_URL) {
      try {
        const res = await fetch(env.BIL_URL);
        if (res.ok) {
          const txt = await res.text();
          biliArticles = parseArticles(txt);
        }
      } catch {}
    }
    if (biliArticles.length === 0) {
      biliArticles = parseArticles(biliText);
    }

    for (const art of biliArticles) {
      if (!art.title || (Array.isArray(art.title) && art.title.length === 0) || (typeof art.title === "string" && art.title.trim() === "")) {
        art.title = await fetchBiliTitle(art.url);
      }
    }
  }
  return biliArticles;
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
    style = style.replace(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/g, (match, q, url) => {
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

async function buildArticlePage(url, abbr) {
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
    let title = $('#activity-name').text().trim() ||
      $('.rich_media_title').text().trim() ||
      randomSentence();
    if (abbr) {
      const found = articles.find((a) => a.abbrlink === abbr);
      if (found && found.title) title = found.title;
    }
    $('#js_content img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src) {
        const imgPath = `?url=${encodeURIComponent(src)}`;
        const domain = imgDomains[0];
        const full = domain ? domain.replace(/\/$/, '') + imgPath : imgPath;
        $(el).attr('src', full);
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

// scraping functions moved to lib modules

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

    const abbrMatch = pathname.match(/^\/a\/([\w-]+)$/);
    if (abbrMatch) {
      const abbr = abbrMatch[1];
      const found = articles.find((a) => a.abbrlink === abbr);
      if (found) {
        if (searchParams.get("view") === "1") {
          return await buildArticlePage(found.url, abbr);
        }
        return Response.redirect(found.url, 302);
      }
      return new Response("not found", { status: 404, headers: withCors() });
    }
    const apiDomains = (env.API_DOMAINS || "")
      .split(/[,\s]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    const imgDomains = (env.IMG_DOMAINS || "/img")
      .split(/[,\s]+/)
      .map((d) => d.trim())
      .filter(Boolean);
    const cacheImgDomain = env.IMG_CACHE || "mmbiz.qpic.cn";

    const indexHtml = injectConfig(mainHtml, apiDomains, imgDomains);
    const ideasPage = injectConfig(ideasHtml, apiDomains, imgDomains);
    const adminPage = injectConfig(adminHtml, apiDomains, imgDomains);

    const articles = await getArticles(env);

    if (pathname === "/api/wx") {
      try {
        if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
          return json(cache.data);
        }
        const results = await Promise.allSettled(
          articles.map((article) => scrapeWx(article)),
        );
        const merged = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            Object.assign(merged, r.value);
          } else {
            merged[`(抓取失败) ${articles[i].url}`] = { error: String(r.reason) };
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

    if (pathname === "/api/bil") {
      try {
        if (bilCache.data && Date.now() - bilCache.timestamp < CACHE_TTL) {
          console.log("/api/bil cache");
          return json(bilCache.data);
        }
        const list = await getBiliArticles(env);
        const results = await Promise.allSettled(
          list.map((article) => scrapeBili(article)),
        );
        const merged = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            Object.assign(merged, r.value);
          } else {
            merged[`(抓取失败) ${list[i].url}`] = { error: String(r.reason) };
          }
        });
        bilCache = { data: merged, timestamp: Date.now() };
        console.log("/api/bil success");
        return json(merged);
      } catch (err) {
        console.log("/api/bil fail:", err.message);
        return json({ error: err.message }, 500);
      }
    }

//     if (pathname === "/api/article") {
//       const abbr = searchParams.get("abbr");
//       let url = searchParams.get("url");
//       if (abbr) {
//         const found = articles.find((a) => a.abbrlink === abbr);
//         if (found) url = found.url;
//       }
//       if (!url) url = articles[0]?.url;
//       if (!url) return json({ error: "missing url" }, 400);
//       try {
//         const res = await fetch(url, {
//           headers: {
//             "User-Agent": "Mozilla/5.0",
//             Referer: "https://mp.weixin.qq.com/",
//           },
//         });
//         if (!res.ok) throw new Error(`HTTP ${res.status}`);
//         const html = await res.text();
//         const $ = cheerio.load(html, { decodeEntities: false });
//         let title = $('#activity-name').text().trim() ||
//           $('.rich_media_title').text().trim() ||
//           randomSentence();
//         if (abbr) {
//           const found = articles.find((a) => a.abbrlink === abbr);
//           if (found && found.title) title = found.title;
//         }
//         $('#js_content img').each((_, el) => {
//           const src = $(el).attr('data-src') || $(el).attr('src');
//           if (src) {
//             $(el).attr('src', `/img?url=${encodeURIComponent(src)}`);
//             $(el).removeAttr('data-src');
//           }
//         });
//         const content = proxifyHtml($('#js_content').html() || "");
//         const page = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${title}</title></head><body><h1 class="text-2xl font-semibold mb-2">${title}</h1>${content}</body></html>`;
//         return new Response(page, {
//           headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
//         });
//       } catch (err) {
//         return json({ error: err.message }, 500);
//       }
//     }

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
  } else if (url.pathname.startsWith("/a/") && url.searchParams.get("view") === "1") {
    event.respondWith(cacheThenNetwork(event.request));
  // } else if (url.pathname === "/api/article") {
  //   event.respondWith(cacheThenNetwork(event.request));
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

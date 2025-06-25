// Cloudflare Worker version of server.ts
import * as cheerio from "cheerio";
import mainHtml from "./main.html";
import ideasHtml from "./ideas.html";
import adminHtml from "./admin.html";
import commonCss from "./static/common.css";
import ideasCss from "./static/ideas.css";
import { commonJs } from "./static/common.js?raw";
import sidebarHtml from "./static/sidebar.html";
import settingsHtml from "./static/settings.html";
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

let articles = [];
let articlesInit = false;
let wxCache = { data: null, timestamp: 0 };
let bilCache = { data: null, timestamp: 0 };
let dailyCache = { data: null, timestamp: 0 };

function parseArticles(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("---")) {
    return trimmed
      .split(/\r?\n/)
      .map((l) => ({ url: l.trim() }))
      .filter((a) => a.url);
  }

  const parts = trimmed.split(/^---\s*$/m).map((p) => p.trim()).filter(Boolean);
  const arr = [];
  for (const part of parts) {
    const lines = part.split(/\r?\n/);
    const meta = {};
    let current = null;
    for (const line of lines) {
      const kv = line.match(/^([\w]+):\s*(.*)$/);
      if (kv) {
        current = kv[1];
        const value = kv[2];
        if (value === "") {
          if (current === "tags") {
            meta[current] = [];
          } else {
            meta[current] = "";
          }
        } else {
          meta[current] = value;
        }
        continue;
      }
      const m = line.match(/^\s*-\s*(.+)$/);
      if (m && current) {
        if (!Array.isArray(meta[current])) meta[current] = [];
        meta[current].push(m[1]);
      }
    }
    if (meta.url) arr.push(meta);
  }
  return arr;
}

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

    async function fetchTitle(url) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal });
        const html = await res.text();
        const $ = cheerio.load(html, { decodeEntities: false });
        const t = $('#activity-name').text().trim() || $('.rich_media_title').text().trim();
        return t || randomSentence();
      } catch {
        return randomSentence();
      } finally {
        clearTimeout(timer);
      }
    }

    for (const art of articles) {
      if (!art.title || (Array.isArray(art.title) && art.title.length === 0) || (typeof art.title === 'string' && art.title.trim() === '')) {
        art.title = await fetchTitle(art.url);
      }
    }
  }
  return articles;
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

async function buildBiliPage(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const title = $('.opus-module-title__text').first().text().trim() || randomSentence();
    $('.opus-module-content img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        const clean = src.startsWith('//') ? `https:${src}` : src;
        const imgPath = `?url=${encodeURIComponent(clean)}`;
        const domain = imgDomains[0];
        const full = domain ? domain.replace(/\/$/, '') + imgPath : imgPath;
        $(el).attr('src', full);
      }
    });
    const content = $('.opus-module-content').first().html() || '';
    const page = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${title}</title></head><body><h1 class="text-2xl font-semibold mb-2">${title}</h1>${content}</body></html>`;
    return new Response(page, { headers: withCors({ "Content-Type": "text/html; charset=utf-8" }) });
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

async function scrape(article) {
  const { url } = article;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const name = article.title ||
      $('#activity-name').text().trim() ||
      $('.rich_media_title').text().trim() ||
      randomSentence();
    const time = article.date ||
      $('#publish_time').text().trim() ||
      $('meta[property="article:published_time"]').attr('content')?.trim();
    const description = article.describe || $('meta[property="og:description"]').attr('content')?.trim() ||
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
    return { [name]: { time, description, images, jsonWx, url, tags: article.tags, abbrlink: article.abbrlink, date: article.date } };
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeBili(article) {
  const { url } = article;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const name = article.title || $('.opus-module-title__text').first().text().trim() || randomSentence();
    const description = article.describe || $('.opus-module-content').first().text().trim();
    const images = [];
    $('.opus-module-content img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) images.push(src.startsWith('//') ? `https:${src}` : src);
    });
    return { [name]: { description, images, url, tags: article.tags, abbrlink: article.abbrlink, date: article.date } };
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

    const abbrMatch = pathname.match(/^\/a\/([\w-]+)$/);
    if (abbrMatch) {
      const abbr = abbrMatch[1];
      const found = articles.find((a) => a.abbrlink === abbr);
      if (found) {
        if (searchParams.get("view") === "1") {
          if (found.url.includes('bilibili.com')) {
            return await buildBiliPage(found.url);
          }
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
        if (wxCache.data && Date.now() - wxCache.timestamp < CACHE_TTL) {
          return json(wxCache.data);
        }
        const wxArticles = articles.filter((a) => a.url.includes("mp.weixin.qq.com"));
        const results = await Promise.allSettled(wxArticles.map(scrape));
        const merged = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            Object.assign(merged, r.value);
          } else {
            merged[`(抓取失败) ${wxArticles[i].url}`] = { error: String(r.reason) };
          }
        });
        wxCache = { data: merged, timestamp: Date.now() };
        return json(merged);
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (pathname === "/api/bil") {
      try {
        if (bilCache.data && Date.now() - bilCache.timestamp < CACHE_TTL) {
          return json(bilCache.data);
        }
        const bilArticles = articles.filter((a) => a.url.includes("bilibili.com"));
        const results = await Promise.allSettled(bilArticles.map(scrapeBili));
        const merged = {};
        results.forEach((r, i) => {
          if (r.status === "fulfilled") {
            Object.assign(merged, r.value);
          } else {
            merged[`(抓取失败) ${bilArticles[i].url}`] = { error: String(r.reason) };
          }
        });
        bilCache = { data: merged, timestamp: Date.now() };
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
  if (url.pathname === "/api/wx" || url.pathname === "/api/bil" || url.pathname === "/api/daily") {
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

    if ([
      "/common.css",
      "/ideas.css",
      "/common.js",
      "/sidebar.html",
      "/settings.html",
    ].includes(pathname)) {
      const ext = pathname.split(".").pop();
      const type =
        ext === "css" ? "text/css" :
        ext === "js" ? "text/javascript" :
        "text/html";
      const content =
        pathname === "/common.css" ? commonCss :
        pathname === "/ideas.css" ? ideasCss :
        pathname === "/common.js" ? commonJs :
        pathname === "/sidebar.html" ? sidebarHtml :
        settingsHtml;
      return new Response(content, {
        headers: withCors({ "Content-Type": `${type}; charset=utf-8` }),
      });
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

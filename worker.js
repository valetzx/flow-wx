// Cloudflare Worker version of server.ts
import * as cheerio from "cheerio";
import mainHtml from "./main.html";
import ideasHtml from "./ideas.html";
import adminHtml from "./admin.html";
import swHtml from "./sw.js?raw";
import articleText from "./article.txt";

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

function injectConfig(html, apiDomains) {
  if (!apiDomains.length) return html;
  const script = `<script>window.API_DOMAINS=${JSON.stringify(apiDomains)};</script>`;
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
      return new Response("fetch image fail", { status: wechatRes.status });
    }
    return new Response(wechatRes.body, {
      status: 200,
      headers: {
        "Content-Type": wechatRes.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("proxy error", { status: 502 });
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
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(req, env) {
    const { pathname, searchParams } = new URL(req.url);
    const apiDomains = (env.API_DOMAINS || "")
      .split(/[,\s]+/)
      .map((d) => d.trim())
      .filter(Boolean);

    const indexHtml = injectConfig(mainHtml, apiDomains);
    const ideasPage = injectConfig(ideasHtml, apiDomains);
    const adminPage = injectConfig(adminHtml, apiDomains);

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
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    if (pathname === "/sw.js") {
      return new Response(swHtml, {
        headers: { "Content-Type": "text/javascript; charset=utf-8" },
      });
    }

    if (pathname === "/img") {
      const imgUrl = searchParams.get("url");
      if (!imgUrl) return new Response("missing url", { status: 400 });
      return await proxyImage(imgUrl);
    }

    if (pathname === "/@admin") {
      return new Response(adminPage, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    if (pathname === "/ideas") {
      return new Response(ideasPage, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response(indexHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
};

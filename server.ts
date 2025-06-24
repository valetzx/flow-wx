// deno run -A server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.224.0/path/mod.ts";
import cheerio from "npm:cheerio@1.0.0-rc.12";
import { parseArticles, randomSentence } from "./lib/articleUtils.js";
import { fetchWxTitle, scrapeWx } from "./lib/wx.js";
import { fetchBiliTitle, scrapeBili } from "./lib/bil.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function withCors(headers: HeadersInit = {}): HeadersInit {
  return { ...headers, ...CORS_HEADERS };
}

// ---------- 基础配置 ----------
const PORT = Number(Deno.env.get("PORT") ?? 8000); // Deno Deploy 会自动注入
const __dirname = dirname(fromFileUrl(import.meta.url));
const apiDomainsEnv = Deno.env.get("API_DOMAINS") || "";
const apiDomains = apiDomainsEnv
  .split(/[,\s]+/)
  .map((d) => d.trim())
  .filter(Boolean);
const imgDomainsEnv = Deno.env.get("IMG_DOMAINS") || "";
const imgDomains = imgDomainsEnv
  .split(/[,\s]+/)
  .map((d) => d.trim())
  .filter(Boolean);
const cacheImgDomain = Deno.env.get("IMG_CACHE") || "";

function injectConfig(html: string): string {
  if (apiDomains.length === 0 && imgDomains.length === 0) return html;
  const script = `<script>window.API_DOMAINS=${JSON.stringify(apiDomains)};window.IMG_DOMAINS=${JSON.stringify(imgDomains)};</script>`;
  return html.replace("</head>", `${script}</head>`);
}

const indexHtml = injectConfig(
  await Deno.readTextFile(join(__dirname, "main.html")),
);
const ideasHtml = injectConfig(
  await Deno.readTextFile(join(__dirname, "ideas.html")),
);
const swRaw = await Deno.readTextFile(join(__dirname, "sw.js"));
const swHtml = `const IMG_CACHE = ${JSON.stringify(cacheImgDomain)};\n${swRaw}`;
const adminHtml = injectConfig(
  await Deno.readTextFile(join(__dirname, "admin.html")),
);
// 微信文章列表
const WX_URL = Deno.env.get("WX_URL") || "article.txt";
// B站文章列表
const BIL_URL = Deno.env.get("BIL_URL") || "bili.txt";
const DAILY_URL = "https://www.cikeee.com/api?app_key=pub_23020990025";
const DAILY_TTL = 60 * 60 * 8000;
let dailyCache: { data: unknown; timestamp: number } = { data: null, timestamp: 0 };

interface ArticleMeta {
  url: string;
  title?: string;
  tags?: string[];
  abbrlink?: string;
  describe?: string;
  date?: string;
}


let articles: ArticleMeta[] = [];
try {
  const res = await fetch(WX_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  articles = parseArticles(text);
} catch {
  const localText = await Deno.readTextFile(join(__dirname, "article.txt"));
  articles = parseArticles(localText);
}

let bilArticles: ArticleMeta[] = [];
try {
  const res = await fetch(BIL_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  bilArticles = parseArticles(text);
} catch {
  try {
    const localText = await Deno.readTextFile(join(__dirname, "bili.txt"));
    bilArticles = parseArticles(localText);
  } catch {}
}


for (const art of articles) {
  if (!art.title ||
    (Array.isArray(art.title) && art.title.length === 0) ||
    (typeof art.title === "string" && art.title.trim() === "")) {
    art.title = await fetchWxTitle(art.url);
  }
}

for (const art of bilArticles) {
  if (!art.title ||
    (Array.isArray(art.title) && art.title.length === 0) ||
    (typeof art.title === "string" && art.title.trim() === "")) {
    art.title = await fetchBiliTitle(art.url);
  }
}

// 抓取结果缓存（JSON）
const CACHE_TTL = 60 * 60 * 1000;
let cache: { data: unknown; timestamp: number } = { data: null, timestamp: 0 };
let bilCache: { data: unknown; timestamp: number } = { data: null, timestamp: 0 };

// ---------- 业务函数 ----------
// scraping functions moved to lib modules

// ---------- 工具：把文章 HTML 里的微信图片替换成代理地址 (可选) ----------
function proxifyHtml(html: string): string {
  const $ = cheerio.load(html, { decodeEntities: false });

  // background-image or other url() references in style attributes
  $('[style]').each((_, el) => {
    let style = $(el).attr('style') ?? '';
    style = style.replace(
      /url\((['"]?)(https?:\/\/[^'")]+)\1\)/g,
      (match, quote, url) => {
        if (url.includes('mmbiz')) {
          const clean = url.replace(/&amp;/g, '&');
          return `url(${quote}?url=${encodeURIComponent(clean)}${quote})`;
        }
        return match;
      },
    );
    $(el).attr('style', style);
  });

  return $.html();
}

// ---------- 生成离线文章页面 ----------
async function buildArticlePage(url: string, abbr?: string): Promise<Response> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Deno)",
        Referer: "https://mp.weixin.qq.com/",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    let title = $("#activity-name").text().trim() ||
      $(".rich_media_title").text().trim() ||
      randomSentence();
    if (abbr) {
      const found = articles.find((a) => a.abbrlink === abbr);
      if (found?.title) title = found.title;
    }
    $("#js_content img").each((_, el) => {
      const src = $(el).attr("data-src") || $(el).attr("src");
      if (src) {
        const imgPath = `?url=${encodeURIComponent(src)}`;
        const domain = imgDomains[0];
        const full = domain ? domain.replace(/\/$/, "") + imgPath : imgPath;
        $(el).attr("src", full);
        $(el).removeAttr("data-src");
      }
    });
    const content = proxifyHtml($("#js_content").html() || "");
    const page = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <h1 class="text-2xl font-semibold mb-2">${title}</h1>
    ${content}
  </body>
</html>`;
    return new Response(page, {
      headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// ---------- 反向代理图片 ----------
async function proxyImage(imgUrl: string): Promise<Response> {
  try {
    const wechatRes = await fetch(imgUrl, {
      headers: {
        Referer: "https://mp.weixin.qq.com/", // 关键！
        "User-Agent": "Mozilla/5.0 (Deno)",
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
        // 透传 Content-Type
        "Content-Type": wechatRes.headers.get("Content-Type") ?? "image/jpeg",
        // 强缓存一年
        "Cache-Control": "public, max-age=31536000, immutable",
      }),
    });
  } catch (_e) {
    // 微信有时 302 空图 + 403，统统返回 502 方便前端兜底
    return new Response("proxy error", { status: 502, headers: withCors() });
  }
}

// ---------- HTTP 路由 ----------
async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: withCors() });
  }

  const { pathname, searchParams } = new URL(req.url);

  // /a/{abbr} —— 短链接跳转
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

  // /api/wx —— 抓取并返回 JSON
  if (pathname === "/api/wx") {
    try {
      if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
        return json(cache.data);
      }

      const results = await Promise.allSettled(
        articles.map((article) => scrapeWx(article)),
      );
      const merged: Record<string, unknown> = {};
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

  // /api/daily —— 获取每日电影台词等信息
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

  // /api/bil —— 抓取并返回 B 站文章信息
  if (pathname === "/api/bil") {
    try {
      if (bilCache.data && Date.now() - bilCache.timestamp < CACHE_TTL) {
        console.log("/api/bil cache");
        return json(bilCache.data);
      }
      const results = await Promise.allSettled(
        bilArticles.map((article) => scrapeBili(article)),
      );
      const merged: Record<string, unknown> = {};
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          Object.assign(merged, r.value);
        } else {
          merged[`(抓取失败) ${bilArticles[i].url}`] = { error: String(r.reason) };
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

//   // /api/article —— 抓取单篇文章并返回 HTML
//   if (pathname === "/api/article") {
//     const abbr = searchParams.get("abbr");
//     let url = searchParams.get("url");
//     if (abbr) {
//       const found = articles.find((a) => a.abbrlink === abbr);
//       if (found) url = found.url;
//     }
//     if (!url) url = articles[0]?.url;
//     if (!url) return json({ error: "missing url" }, 400);
//     try {
//       const res = await fetch(url, {
//         headers: {
//           "User-Agent": "Mozilla/5.0 (Deno)",
//           Referer: "https://mp.weixin.qq.com/",
//         },
//       });
//       if (!res.ok) throw new Error(`HTTP ${res.status}`);
//       const html = await res.text();
//       const $ = cheerio.load(html, { decodeEntities: false });
//       let title = $("#activity-name").text().trim() ||
//         $(".rich_media_title").text().trim() ||
//         randomSentence();
//       if (abbr) {
//         const found = articles.find((a) => a.abbrlink === abbr);
//         if (found?.title) title = found.title;
//       }
//       // 将微信文章中的 data-src 替换为 src，方便直接展示图片
//       $("#js_content img").each((_, el) => {
//         const src = $(el).attr("data-src") || $(el).attr("src");
//         if (src) {
//           const imgPath = `?url=${encodeURIComponent(src)}`;
//           const domain = imgDomains[0];
//           const full = domain ? domain.replace(/\/$/, "") + imgPath : imgPath;
//           $(el).attr("src", full);
//           $(el).removeAttr("data-src");
//         }
//       });
//       const content = proxifyHtml($("#js_content").html() || "");
//       const page = `<!DOCTYPE html>
// <html lang="zh-CN">
//   <head>
//     <meta charset="utf-8" />
//     <title>${title}</title>
//   </head>
//   <body>
//     <h1 class="text-2xl font-semibold mb-2">${title}</h1>
//     ${content}
//   </body>
// </html>`;
//       return new Response(page, {
//         headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
//       });
//     } catch (err) {
//       return json({ error: err.message }, 500);
//     }
//   }

  if (pathname === "/sw.js") {
    return new Response(swHtml, {
      headers: withCors({ "Content-Type": "text/javascript; charset=utf-8" }),
    });
  }

  // /img?url=ENCODED —— 微信图床反向代理
  if (pathname === "/img") {
    const imgUrl = searchParams.get("url");
    if (!imgUrl) return new Response("missing url", { status: 400, headers: withCors() });
    return await proxyImage(imgUrl);
  }

  // /@admin —— 管理页面
  if (pathname === "/@admin") {
    return new Response(adminHtml, {
      headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
    });
  }

  // /ideas —— 灵感瀑布流页面
  if (pathname === "/ideas") {
    return new Response(ideasHtml, {
      headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
    });
  }

  // 其他路径 —— 静态首页
  return new Response(indexHtml, {
    headers: withCors({ "Content-Type": "text/html; charset=utf-8" }),
  });
}

// ---------- 辅助 ----------
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: withCors({ "Content-Type": "application/json; charset=utf-8" }),
  });
}

// ---------- 启动 ----------
serve(handler, { port: PORT });
console.log(`Server running on http://localhost:${PORT}`);

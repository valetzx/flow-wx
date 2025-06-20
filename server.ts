// deno run -A server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.224.0/path/mod.ts";
import cheerio from "npm:cheerio@1.0.0-rc.12";

// ---------- 基础配置 ----------
const PORT = Number(Deno.env.get("PORT") ?? 8000); // Deno Deploy 会自动注入
const __dirname = dirname(fromFileUrl(import.meta.url));
const indexHtml = await Deno.readTextFile(join(__dirname, "main.html"));
const ideasHtml = await Deno.readTextFile(join(__dirname, "ideas.html"));
const swHtml = await Deno.readTextFile(join(__dirname, "sw.js"));
const fallbackSentences = [
  "小荷才露尖尖角",
  "早有蜻蜓立上头",
  "采菊东篱下",
  "悠然见南山",
  "看看内容吧",
];
function randomSentence() {
  return fallbackSentences[
    Math.floor(Math.random() * fallbackSentences.length)
  ];
}
// 微信文章列表
const WX_URL = Deno.env.get("WX_URL") || "article.txt";
const DAILY_URL = "https://www.cikeee.com/api?app_key=pub_23020990025";
const DAILY_TTL = 60 * 60 * 1000; // 1 小时
let dailyCache: { data: unknown; timestamp: number } = { data: null, timestamp: 0 };
let urls: string[] = [];
try {
  const res = await fetch(WX_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  urls = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
} catch {
  const localText = await Deno.readTextFile(join(__dirname, "article.txt"));
  urls = localText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

// 抓取结果缓存（JSON）
const CACHE_TTL = 10 * 60 * 1000; // 10 分钟
let cache: { data: unknown; timestamp: number } = { data: null, timestamp: 0 };

// ---------- 业务函数 ----------
async function scrape(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Deno)" },
      signal: controller.signal,
    });
    const html = await res.text();

    const $ = cheerio.load(html, { decodeEntities: false });

    const name = $("#activity-name").text().trim() ||
      $(".rich_media_title").text().trim() ||
      randomSentence();

    const time = $("#publish_time").text().trim() ||
      $('meta[property="article:published_time"]').attr("content")?.trim();

    const description =
      $('meta[property="og:description"]').attr("content")?.trim() ||
      $("#js_content p").first().text().trim();

    const images: string[] = [];
    $("#js_content img").each((_, el) => {
      const src = $(el).attr("data-src") || $(el).attr("src");
      if (src) images.push(src.split("?")[0]);
    });

    // 解析 <catch id="json-wx">
    let jsonWxRaw = $("catch#json-wx").html()?.trim();
    let jsonWx: unknown;
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

// ---------- 工具：把文章 HTML 里的微信图片替换成代理地址 (可选) ----------
function proxifyHtml(html: string): string {
  return html.replace(
    /https?:\/\/mmbiz[^"'?]+\.(?:jpg|jpeg|png|gif)/g,
    (m) => `/img?url=${encodeURIComponent(m)}`,
  );
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
      return new Response("fetch image fail", { status: wechatRes.status });
    }

    return new Response(wechatRes.body, {
      status: 200,
      headers: {
        // 透传 Content-Type
        "Content-Type": wechatRes.headers.get("Content-Type") ?? "image/jpeg",
        // 强缓存一年
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (e) {
    // 微信有时 302 空图 + 403，统统返回 502 方便前端兜底
    return new Response("proxy error", { status: 502 });
  }
}

// ---------- HTTP 路由 ----------
async function handler(req: Request): Promise<Response> {
  const { pathname, searchParams } = new URL(req.url);

  // /api/wx —— 抓取并返回 JSON
  if (pathname === "/api/wx") {
    try {
      if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
        return json(cache.data);
      }

      const results = await Promise.allSettled(urls.map(scrape));
      const merged: Record<string, unknown> = {};
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

  // /api/test —— 抓取单篇文章并返回 HTML
  if (pathname === "/api/test") {
    const url = searchParams.get("url") || urls[0];
    if (!url) return json({ error: "missing url" }, 400);
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
      const title = $("#activity-name").text().trim() ||
        $(".rich_media_title").text().trim() ||
        randomSentence();
      // 将微信文章中的 data-src 替换为 src，方便直接展示图片
      $("#js_content img").each((_, el) => {
        const src = $(el).attr("data-src") || $(el).attr("src");
        if (src) {
          $(el).attr("src", `/img?url=${encodeURIComponent(src)}`);
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

  // /img?url=ENCODED —— 微信图床反向代理
  if (pathname === "/img") {
    const imgUrl = searchParams.get("url");
    if (!imgUrl) return new Response("missing url", { status: 400 });
    return await proxyImage(imgUrl);
  }

  // /ideas —— 灵感瀑布流页面
  if (pathname === "/ideas") {
    return new Response(ideasHtml, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // 其他路径 —— 静态首页
  return new Response(indexHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ---------- 辅助 ----------
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// ---------- 启动 ----------
serve(handler, { port: PORT });
console.log(`Server running on http://localhost:${PORT}`);

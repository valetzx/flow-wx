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

// 微信文章列表
const urls = [
  "https://mp.weixin.qq.com/s?__biz=MzA5NzQ4ODg5OA==&tempkey=MTMyN19MSXM4UUljL1k1b0JFQ3l1cDFRZC1ycjB6eVpHT3UzX1pFXzc1QmVRaEdZU2xSYmJFdWU1aVI0TzhoWTk3UDZKalZMMGtCTFVuQi1PaWtjTWtSZzV4Q0RZYUdRRTlkUWVSYlJ1N0hwQ3dYekw4MEFQdWFjV1pqWGQ1YUN6WEd3cHp2ZU5Ua2NYR3dwbGZfYklxZGNONldJQ21qV2k1ejNjZDB6V1Fnfn4%3D&chksm=10a1584027d6d156adbdc5e78ac1c88b1c59eba36c0091f517860b53529a90f76fbc8881a206#rd",
  "https://mp.weixin.qq.com/s/d-h4lk1eHbUvUV5HOZlb-Q",
];

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

    const name =
      $("#activity-name").text().trim() ||
      $(".rich_media_title").text().trim() ||
      url;

    const time =
      $("#publish_time").text().trim() ||
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

    return { [name]: { time, description, images, jsonWx } };
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

  // /img?url=ENCODED —— 微信图床反向代理
  if (pathname === "/img") {
    const imgUrl = searchParams.get("url");
    if (!imgUrl) return new Response("missing url", { status: 400 });
    return await proxyImage(imgUrl);
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

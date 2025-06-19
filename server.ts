// server.ts   ——  deno run -A server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.224.0/path/mod.ts";
import cheerio from "npm:cheerio@1.0.0-rc.12";   // Deno 原生支持 npm 包 :contentReference[oaicite:0]{index=0}

// -------- 配置 --------
const PORT = Number(Deno.env.get("PORT") ?? 8000);            // Deno Deploy 会自动注入 PORT
const __dirname = dirname(fromFileUrl(import.meta.url));
const indexHtml = await Deno.readTextFile(join(__dirname, "main.html"));

const urls = [
  "https://mp.weixin.qq.com/s?__biz=MzA5NzQ4ODg5OA==&tempkey=MTMyN19MSXM4UUljL1k1b0JFQ3l1cDFRZC1ycjB6eVpHT3UzX1pFXzc1QmVRaEdZU2xSYmJFdWU1aVI0TzhoWTk3UDZKalZMMGtCTFVuQi1PaWtjTWtSZzV4Q0RZYUdRRTlkUWVSYlJ1N0hwQ3dYekw4MEFQdWFjV1pqWGQ1YUN6WEd3cHp2ZU5Ua2NYR3dwbGZfYklxZGNONldJQ21qV2k1ejNjZDB6V1Fnfn4%3D&chksm=10a1584027d6d156adbdc5e78ac1c88b1c59eba36c0091f517860b53529a90f76fbc8881a206#rd",
  "https://mp.weixin.qq.com/s/d-h4lk1eHbUvUV5HOZlb-Q",
];

const CACHE_TTL = 10 * 60 * 1_000; // 10 min
let cache: { data: unknown; timestamp: number } = { data: null, timestamp: 0 };

// -------- 抓取逻辑 --------
async function scrape(url: string) {
  // 15 s 超时
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

    // 解析 <catch id="json-wx">...</catch>
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

// -------- HTTP 处理器 --------
async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  // /api/wx —— 返回 JSON
  if (pathname === "/api/wx") {
    try {
      // 简单内存缓存
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

  // 其余路径 —— 返回静态首页
  return new Response(indexHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// -------- 启动 --------
serve(handler, { port: PORT });
console.log(`Server running on http://localhost:${PORT}`);

// -------- 工具函数 --------
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

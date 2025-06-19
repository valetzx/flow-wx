import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";

/* -------- 预设要抓取的微信文章链接 -------- */
const urls = [
  "https://mp.weixin.qq.com/s?__biz=MzA5NzQ4ODg5OA==&tempkey=MTMyN19MSXM4UUljL1k1b0JFQ3l1cDFRZC1ycjB6eVpHT3UzX1pFXzc1QmVRaEdZU2xSYmJFdWU1aVI0TzhoWTk3UDZKalZMMGtCTFVuQi1PaWtjTWtSZzV4Q0RZYUdRRTlkUWVSYlJ1N0hwQ3dYekw4MEFQdWFjV1pqWGQ1YUN6WEd3cHp2ZU5Ua2NYR3dwbGZfYklxZGNONldJQ21qV2k1ejNjZDB6V1Fnfn4%3D&chksm=10a1584027d6d156adbdc5e78ac1c88b1c59eba36c0091f517860b53529a90f76fbc8881a206#rd",
  "https://mp.weixin.qq.com/s/d-h4lk1eHbUvUV5HOZlb-Q",
];

/* -------- 单篇抓取逻辑 -------- */
async function scrape(url) {
  // 1. 请求页面
  const { data: html } = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Node.js)" },
    timeout: 15000,
  });

  /* 2. 加载 Cheerio，关闭 decodeEntities → 保留原始引号 */
  const $ = cheerio.load(html, { decodeEntities: false });

  /* 3. 现有字段 */
  const name =
    $("#activity-name").text().trim() || $(".rich_media_title").text().trim();

  const time =
    $("#publish_time").text().trim() ||
    $('meta[property="article:published_time"]').attr("content")?.trim();

  const description =
    $('meta[property="og:description"]').attr("content")?.trim() ||
    $("#js_content p").first().text().trim();

  const images = [];
  $("#js_content img").each((_, el) => {
    const src = $(el).attr("data-src") || $(el).attr("src");
    if (src) images.push(src.split("?")[0]);
  });

  /* 4. 解析 <catch id="json-wx"> … </catch> */
  let jsonWxRaw = $("catch#json-wx").html()?.trim(); // 直接拿 innerHTML
  let jsonWx;
  if (jsonWxRaw) {
    try {
      // 有些页面会把 " 用 &quot; 编码；先简单还原一下
      jsonWx = JSON.parse(jsonWxRaw.replace(/&quot;/g, '"'));
    } catch (e) {
      // 解析失败时，保留原始内容以便排查
      jsonWx = { parseError: e.message, raw: jsonWxRaw };
    }
  }

  /* 5. 返回结果（把 jsonWx 合并进去）*/
  return {
    [name || url]: {
      time,
      description,
      images,
      jsonWx, // ← 新增字段
    },
  };
}

/* -------- Express 服务 -------- */
const app = express();

/* GET /api/wx 直接返回合并 JSON */
app.get("/api/wx", async (_req, res) => {
  try {
    const results = await Promise.allSettled(urls.map(scrape));
    const merged = {};

    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        Object.assign(merged, r.value);
      } else {
        merged[`(抓取失败) ${urls[i]}`] = { error: r.reason.message };
      }
    });

    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* 启动 */
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000/api/wx");
});

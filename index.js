const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const port = 3000;
const app = express();
const indexHtml = fs.readFileSync(path.join(__dirname, 'main.html'), 'utf8');
const urls = [
  'https://mp.weixin.qq.com/s?__biz=MzA5NzQ4ODg5OA==&tempkey=MTMyN19MSXM4UUljL1k1b0JFQ3l1cDFRZC1ycjB6eVpHT3UzX1pFXzc1QmVRaEdZU2xSYmJFdWU1aVI0TzhoWTk3UDZKalZMMGtCTFVuQi1PaWtjTWtSZzV4Q0RZYUdRRTlkUWVSYlJ1N0hwQ3dYekw4MEFQdWFjV1pqWGQ1YUN6WEd3cHp2ZU5Ua2NYR3dwbGZfYklxZGNONldJQ21qV2k1ejNjZDB6V1Fnfn4%3D&chksm=10a1584027d6d156adbdc5e78ac1c88b1c59eba36c0091f517860b53529a90f76fbc8881a206#rd',
  'https://mp.weixin.qq.com/s/d-h4lk1eHbUvUV5HOZlb-Q'
];

async function scrape(url) {
  const { data: html } = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Node.js)' },
    timeout: 15000
  });

  const $ = cheerio.load(html, { decodeEntities: false });

  const name = $('#activity-name').text().trim() ||
               $('.rich_media_title').text().trim() ||
               url;

  const time = $('#publish_time').text().trim() ||
               $('meta[property="article:published_time"]').attr('content')?.trim();

  const description = $('meta[property="og:description"]').attr('content')?.trim() ||
                      $('#js_content p').first().text().trim();

  const images = [];
  $('#js_content img').each((_, el) => {
    const src = $(el).attr('data-src') || $(el).attr('src');
    if (src) images.push(src.split('?')[0]);
  });

  // 解析 <catch id="json-wx"> ... </catch>
  let jsonWxRaw = $('catch#json-wx').html()?.trim();
  let jsonWx;
  if (jsonWxRaw) {
    try {
      jsonWx = JSON.parse(jsonWxRaw.replace(/&quot;/g, '"'));
    } catch (e) {
      jsonWx = { parseError: e.message, raw: jsonWxRaw };
    }
  }

  return {
    [name]: {
      time,
      description,
      images,
      jsonWx
    }
  };
}

let cache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000; // 10 min

// ---------------- /api/wx 路由 ----------------
app.get('/api/wx', async (_req, res) => {
  try {
    // 命中缓存
    if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
      return res.json(cache.data);
    }

    // 并发抓取
    const results = await Promise.allSettled(urls.map(scrape));
    const merged = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        Object.assign(merged, r.value);
      } else {
        merged[`(抓取失败) ${urls[i]}`] = { error: r.reason.message };
      }
    });

    cache = { data: merged, timestamp: Date.now() };
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- 静态首页 ----------------
app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(Html);
});

app.use((_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(Html);
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

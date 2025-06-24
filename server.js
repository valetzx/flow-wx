// node server.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const app = express();
const PORT = Number(process.env.PORT || 8000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

app.use((req, res, next) => {
  Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

const apiDomains = (process.env.API_DOMAINS || '').split(/[\s,]+/).filter(Boolean);
const imgDomains = (process.env.IMG_DOMAINS || '').split(/[\s,]+/).filter(Boolean);
const cacheImgDomain = process.env.IMG_CACHE || '';

function injectConfig(html) {
  if (!apiDomains.length && !imgDomains.length) return html;
  const script = `<script>window.API_DOMAINS=${JSON.stringify(apiDomains)};window.IMG_DOMAINS=${JSON.stringify(imgDomains)};</script>`;
  return html.replace('</head>', `${script}</head>`);
}

const indexHtml = injectConfig(await fs.readFile(path.join(__dirname, 'main.html'), 'utf8'));
const ideasHtml = injectConfig(await fs.readFile(path.join(__dirname, 'ideas.html'), 'utf8'));
const adminHtml = injectConfig(await fs.readFile(path.join(__dirname, 'admin.html'), 'utf8'));
const swRaw = await fs.readFile(path.join(__dirname, 'sw.js'), 'utf8');
const swHtml = `const IMG_CACHE = ${JSON.stringify(cacheImgDomain)};\n${swRaw}`;

const fallbackSentences = [
  '小荷才露尖尖角',
  '早有蜻蜓立上头',
  '采菊东篱下',
  '悠然见南山',
  '看看内容吧',
  '日长篱落无人过',
  '惟有蜻蜓蛱蝶飞',
  '小娃撑小艇',
  '日长篱落无人过',
  '惟有蜻蜓蛱蝶飞',
  '偷采白莲回',
  '不解藏踪迹',
  '浮萍一道开',
];
function randomSentence() {
  return fallbackSentences[Math.floor(Math.random() * fallbackSentences.length)];
}

const WX_URL = process.env.WX_URL || path.join(__dirname, 'article.txt');
const DAILY_URL = 'https://www.cikeee.com/api?app_key=pub_23020990025';
const DAILY_TTL = 60 * 60 * 8000;
let dailyCache = { data: null, timestamp: 0 };

function parseArticles(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('---')) {
    return trimmed.split(/\r?\n/).map(l => ({ url: l.trim() })).filter(a => a.url);
  }
  const parts = trimmed.split(/^---\s*$/m).map(p => p.trim()).filter(Boolean);
  const arr = [];
  for (const part of parts) {
    const lines = part.split(/\r?\n/);
    const meta = {};
    let current = null;
    for (const line of lines) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) {
        current = kv[1];
        const value = kv[2];
        if (value === '') {
          if (current === 'tags') meta[current] = [];
          else meta[current] = '';
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

let articles = [];
try {
  const res = await fetch(WX_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const txt = await res.text();
  articles = parseArticles(txt);
} catch {
  const localText = await fs.readFile(path.join(__dirname, 'article.txt'), 'utf8');
  articles = parseArticles(localText);
}

async function fetchTitle(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Node)' },
      signal: controller.signal,
    });
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

const CACHE_TTL = 60 * 60 * 1000;
let cache = { data: null, timestamp: 0 };

async function scrape(article) {
  const { url } = article;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Node)' },
      signal: controller.signal,
    });
    const html = await res.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const name = article.title || $('#activity-name').text().trim() || $('.rich_media_title').text().trim() || randomSentence();
    const time = article.date || $('#publish_time').text().trim() || $('meta[property="article:published_time"]').attr('content');
    const description = article.describe || $('meta[property="og:description"]').attr('content') || $('#js_content p').first().text().trim();
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
    return {
      [name]: {
        time,
        description,
        images,
        jsonWx,
        url,
        tags: article.tags,
        abbrlink: article.abbrlink,
        date: article.date,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function proxifyHtml(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  $('[style]').each((_, el) => {
    let style = $(el).attr('style') ?? '';
    style = style.replace(/url\((['"]?)(https?:\/\/[^'"]+)\1\)/g, (match, q, url) => {
      if (url.includes('mmbiz')) {
        const clean = url.replace(/&amp;/g, '&');
        return `url(${q}?url=${encodeURIComponent(clean)}${q})`;
      }
      return match;
    });
    $(el).attr('style', style);
  });
  return $.html();
}

async function buildArticlePage(url, abbr, res) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Node)',
        Referer: 'https://mp.weixin.qq.com/',
      },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    let title = $('#activity-name').text().trim() || $('.rich_media_title').text().trim() || randomSentence();
    if (abbr) {
      const found = articles.find(a => a.abbrlink === abbr);
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
    const content = proxifyHtml($('#js_content').html() || '');
    const page = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${title}</title></head><body><h1 class="text-2xl font-semibold mb-2">${title}</h1>${content}</body></html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(page);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function proxyImage(imgUrl, res) {
  try {
    const wechatRes = await fetch(imgUrl, {
      headers: {
        Referer: 'https://mp.weixin.qq.com/',
        'User-Agent': 'Mozilla/5.0 (Node)',
      },
    });
    if (!wechatRes.ok) {
      res.status(wechatRes.status);
      return res.send('fetch image fail');
    }
    res.setHeader('Content-Type', wechatRes.headers.get('Content-Type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    const buf = await wechatRes.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch {
    res.status(502).send('proxy error');
  }
}

app.get('/a/:abbr', async (req, res) => {
  const abbr = req.params.abbr;
  const found = articles.find(a => a.abbrlink === abbr);
  if (found) {
    if (req.query.view === '1') {
      return await buildArticlePage(found.url, abbr, res);
    }
    return res.redirect(found.url);
  }
  res.status(404).send('not found');
});

app.get('/api/wx', async (req, res) => {
  try {
    if (cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
      return res.json(cache.data);
    }
    const results = await Promise.allSettled(articles.map(scrape));
    const merged = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        Object.assign(merged, r.value);
      } else {
        merged[`(抓取失败) ${articles[i].url}`] = { error: String(r.reason) };
      }
    });
    cache = { data: merged, timestamp: Date.now() };
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/daily', async (req, res) => {
  try {
    if (dailyCache.data && Date.now() - dailyCache.timestamp < DAILY_TTL) {
      return res.json(dailyCache.data);
    }
    const r = await fetch(DAILY_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    dailyCache = { data, timestamp: Date.now() };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bil', async (_req, res) => {
  try {
    const r = await fetch(
      'https://www.bilibili.com/opus/953541215728435240',
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $ = cheerio.load(html, { decodeEntities: false });
    const title = $('.opus-module-title__text').first().text().trim();
    const content = $('.opus-module-content').first().text().trim();
    const images = [];
    $('.opus-module-content img').each((_, el) => {
      const src = $(el).attr('src');
      if (src) images.push(src.startsWith('//') ? `https:${src}` : src);
    });
    console.log('/api/bil success');
    res.json({ title, content, images });
  } catch (err) {
    console.log('/api/bil fail:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// app.get('/api/article', async (req, res) => {
//   let { abbr, url } = req.query;
//   if (abbr) {
//     const found = articles.find(a => a.abbrlink === abbr);
//     if (found) url = found.url;
//   }
//   if (!url) url = articles[0]?.url;
//   if (!url) return res.status(400).json({ error: 'missing url' });
//   try {
//     const r = await fetch(url, {
//       headers: {
//         'User-Agent': 'Mozilla/5.0 (Node)',
//         Referer: 'https://mp.weixin.qq.com/',
//       },
//     });
//     if (!r.ok) throw new Error(`HTTP ${r.status}`);
//     const html = await r.text();
//     const $ = cheerio.load(html, { decodeEntities: false });
//     let title = $('#activity-name').text().trim() || $('.rich_media_title').text().trim() || randomSentence();
//     if (abbr) {
//       const found = articles.find(a => a.abbrlink === abbr);
//       if (found && found.title) title = found.title;
//     }
//     $('#js_content img').each((_, el) => {
//       const src = $(el).attr('data-src') || $(el).attr('src');
//       if (src) {
//         const imgPath = `?url=${encodeURIComponent(src)}`;
//         const domain = imgDomains[0];
//         const full = domain ? domain.replace(/\/$/, '') + imgPath : imgPath;
//         $(el).attr('src', full);
//         $(el).removeAttr('data-src');
//       }
//     });
//     const content = proxifyHtml($('#js_content').html() || '');
//     const page = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" /><title>${title}</title></head><body><h1 class="text-2xl font-semibold mb-2">${title}</h1>${content}</body></html>`;
//     res.setHeader('Content-Type', 'text/html; charset=utf-8');
//     res.send(page);
//   } catch (err) {
//     res.status(500).json({ error: err.message });
//   }
// });

app.get('/sw.js', (req, res) => {
  res.type('application/javascript').send(swHtml);
});

app.get('/img', async (req, res) => {
  const imgUrl = req.query.url;
  if (!imgUrl) return res.status(400).send('missing url');
  await proxyImage(imgUrl, res);
});

app.get('/@admin', (req, res) => {
  res.type('html').send(adminHtml);
});

app.get('/ideas', (req, res) => {
  res.type('html').send(ideasHtml);
});

app.get('*', (req, res) => {
  res.type('html').send(indexHtml);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'dist');
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const apiDomains = (process.env.API_DOMAINS || '').split(/[\s,]+/).filter(Boolean);
const imgDomains = (process.env.IMG_DOMAINS || '').split(/[\s,]+/).filter(Boolean);
const cacheImgDomain = process.env.IMG_CACHE || '';

function injectConfig(html) {
  if (!apiDomains.length && !imgDomains.length) return html;
  const script = `<script>window.API_DOMAINS=${JSON.stringify(apiDomains)};window.IMG_DOMAINS=${JSON.stringify(imgDomains)};</script>`;
  return html.replace('</head>', `${script}</head>`);
}

async function buildHtml(name) {
  const raw = await fs.readFile(path.join(__dirname, name), 'utf8');
  const html = injectConfig(raw);
  const outName = name === 'main.html' ? 'index.html' : name;
  await fs.writeFile(path.join(outDir, outName), html);
}

await buildHtml('main.html');
await buildHtml('ideas.html');
await buildHtml('add.html');
await buildHtml('admin.html');

const swRaw = await fs.readFile(path.join(__dirname, 'static', 'sw.js'), 'utf8');
const swOut = `const IMG_CACHE = ${JSON.stringify(cacheImgDomain)};\n${swRaw}`;
await fs.writeFile(path.join(outDir, 'sw.js'), swOut);
await fs.copyFile(path.join(__dirname, 'static', 'common.css'), path.join(outDir, 'common.css'));
await fs.copyFile(path.join(__dirname, 'static', 'ideas.css'), path.join(outDir, 'ideas.css')).catch(() => {});
await fs.copyFile(path.join(__dirname, 'article.txt'), path.join(outDir, 'article.txt')).catch(() => {});
await fs.copyFile(path.join(__dirname, 'static', 'common.js'), path.join(outDir, 'common.js'));
await fs.copyFile(path.join(__dirname, 'static', 'sidebar.html'), path.join(outDir, 'sidebar.html'));
await fs.copyFile(path.join(__dirname, 'static', 'settings.html'), path.join(outDir, 'settings.html'));

// ---------------- 额外的静态化逻辑 ----------------

function parseArticles(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('---')) {
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

const WX_URL = process.env.WX_URL || path.join(__dirname, 'article.txt');
const DAILY_URL = 'https://www.cikeee.com/api?app_key=pub_23020990025';

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
articles.sort((a, b) => {
  const aLink = (a.abbrlink || '').toString();
  const bLink = (b.abbrlink || '').toString();
  return aLink.localeCompare(bLink);
});

await fs.mkdir(path.join(outDir, 'api'), { recursive: true });

// 抓取 /api/wx 的数据
let wxData = null;
try {
  const results = await Promise.allSettled(
    articles.map(async (article) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(article.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Node)' },
          signal: controller.signal,
        });
        const html = await res.text();
        const cheerio = await import('cheerio');
        const $ = cheerio.load(html, { decodeEntities: false });
        const name =
          article.title ||
          $('#activity-name').text().trim() ||
          $('.rich_media_title').text().trim() ||
          '无标题';
        const date =
          article.date ||
          $('#publish_time').text().trim() ||
          $('meta[property="article:published_time"]').attr('content');
        const description =
          article.describe ||
          $('meta[property="og:description"]').attr('content') ||
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
        return {
          [name]: {
            date,
            description,
            images,
            jsonWx,
            url: article.url,
            tags: article.tags,
            abbrlink: article.abbrlink,
          },
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );
  const merged = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      Object.assign(merged, r.value);
    } else {
      merged[`(抓取失败) ${articles[i].url}`] = { error: String(r.reason) };
    }
  });
  wxData = merged;
} catch (e) {
  wxData = { error: e.message };
}

await fs.writeFile(
  path.join(outDir, 'api', 'wx'),
  JSON.stringify(wxData, null, 2)
);

// 抓取 /api/daily 的数据
let dailyData = null;
try {
  const res = await fetch(DAILY_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  dailyData = await res.json();
} catch (e) {
  dailyData = { error: e.message };
}
await fs.writeFile(
  path.join(outDir, 'api', 'daily'),
  JSON.stringify(dailyData, null, 2)
);

// 生成 /a/{abbr} 的静态重定向页面
for (const art of articles) {
  if (!art.abbrlink) continue;
  const dir = path.join(outDir, 'a', art.abbrlink);
  await fs.mkdir(dir, { recursive: true });
  const redirectHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${art.url}"></head><body><p>Redirecting to <a href="${art.url}">${art.url}</a></p></body></html>`;
  await fs.writeFile(path.join(dir, 'index.html'), redirectHtml);
}

console.log('Build complete in', outDir);

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, 'dist');
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });
const cacheDir = path.join(outDir, 'cache');
await fs.mkdir(cacheDir, { recursive: true });

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
await buildHtml('game21.html');
await buildHtml('admin.html');

const swRaw = await fs.readFile(path.join(__dirname, 'static', 'sw.js'), 'utf8');
const swOut = `const IMG_CACHE = ${JSON.stringify(cacheImgDomain)};\n${swRaw}`;
await fs.writeFile(path.join(outDir, 'sw.js'), swOut);
await fs.copyFile(path.join(__dirname, 'static', 'common.css'), path.join(outDir, 'common.css'));
await fs.copyFile(path.join(__dirname, 'static', 'ideas.css'), path.join(outDir, 'ideas.css')).catch(() => {});
await fs.copyFile(path.join(__dirname, 'article.txt'), path.join(outDir, 'article.txt')).catch(() => {});
await fs.copyFile(path.join(__dirname, 'static', 'common.js'), path.join(outDir, 'common.js'));
await fs.copyFile(path.join(__dirname, 'static', 'sidebar.js'), path.join(outDir, 'sidebar.js'));
await fs.copyFile(path.join(__dirname, 'static', 'sidebar.html'), path.join(outDir, 'sidebar.html'));
await fs.copyFile(path.join(__dirname, 'static', 'settings.html'), path.join(outDir, 'settings.html'));

const cheerio = await import('cheerio');

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

function proxifyHtml(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  $('[style]').each((_, el) => {
    let style = $(el).attr('style') ?? '';
    style = style.replace(/url\((['"]?)(https?:\/\/[^'"]+)\1\)/g, (m, q, url) => {
      if (url.includes('mmbiz')) {
        const clean = url.replace(/&amp;/g, '&');
        return `url(${q}?url=${encodeURIComponent(clean)}${q})`;
      }
      return m;
    });
    $(el).attr('style', style);
  });
  return $.html();
}

async function buildArticlePage(url, abbr) {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Node)',
      Referer: 'https://mp.weixin.qq.com/',
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  const $ = cheerio.load(html, { decodeEntities: false });
  let title = $('#activity-name').text().trim() || $('.rich_media_title').text().trim() || '无标题';
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
  const headExtra = '<meta name="viewport" content="width=device-width,initial-scale=1" />\n<style>img{max-width:100%;height:auto;display:block;margin:0 auto;}</style>';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" />${headExtra}<title>${title}</title></head><body><h1 class="text-2xl font-semibold mb-2">${title}</h1>${content}</body></html>`;
}

async function buildBiliPage(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Node)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const html = await r.text();
  const $ = cheerio.load(html, { decodeEntities: false });
  const title = $('.opus-module-title__text').first().text().trim() || '无标题';
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
  const headExtra = '<meta name="viewport" content="width=device-width,initial-scale=1" />\n<style>img{max-width:100%;height:auto;display:block;margin:0 auto;}</style>';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8" />${headExtra}<title>${title}</title></head><body><h1 class="text-2xl font-semibold mb-2">${title}</h1>${content}</body></html>`;
}

await fs.mkdir(path.join(outDir, 'api'), { recursive: true });

const pluginSrcDir = path.join(__dirname, 'plugin');
const pluginOutDir = path.join(outDir, 'plugin');
const pluginList = [];
try {
  const files = await fs.readdir(pluginSrcDir);
  await fs.mkdir(pluginOutDir, { recursive: true });
  for (const file of files) {
    if (!file.endsWith('.html')) continue;
    const src = path.join(pluginSrcDir, file);
    const dest = path.join(pluginOutDir, file);
    await fs.copyFile(src, dest);
    const html = await fs.readFile(src, 'utf8');
    const $ = cheerio.load(html);
    const title = $('title').text().trim() || file.replace(/\.html$/, '');
    const show = $('meta[name="show"]').attr('content') === '1';
    pluginList.push({ name: title, file, show });
  }
} catch {}
await fs.writeFile(
  path.join(outDir, 'api', 'plugins'),
  JSON.stringify(pluginList, null, 2)
);

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

  try {
    const page = art.url.includes('bilibili.com')
      ? await buildBiliPage(art.url)
      : await buildArticlePage(art.url, art.abbrlink);
    await fs.writeFile(path.join(cacheDir, `${art.abbrlink}.html`), page);
  } catch (e) {
    console.error('build page failed for', art.url, e.message);
  }
}

console.log('Build complete in', outDir);

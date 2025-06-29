function parseArticles(text) {
  text = text.trim();
  if (!text.startsWith('---')) {
    return text.split(/\r?\n/).map(l => ({ url: l.trim() })).filter(a => a.url);
  }
  const parts = text.split(/^---\s*$/m).map(p => p.trim()).filter(Boolean);
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

function randomSentence() {
  const list = [
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
  return list[Math.floor(Math.random() * list.length)];
}

async function scrape(article) {
  const { url } = article;
  const res = await fetch(url);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let title = article.title ||
    doc.querySelector('#activity-name')?.textContent.trim() ||
    doc.querySelector('.rich_media_title')?.textContent.trim() ||
    randomSentence();
  const time = article.date ||
    doc.querySelector('#publish_time')?.textContent.trim() ||
    doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content')?.trim();
  const description = article.describe ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('#js_content p')?.textContent.trim();
  const images = Array.from(doc.querySelectorAll('#js_content img')).map(img => (img.getAttribute('data-src') || img.getAttribute('src'))?.split('?')[0]).filter(Boolean);
  const catchEl = doc.querySelector('catch#json-wx');
  let jsonWx;
  if (catchEl && catchEl.textContent) {
    try {
      jsonWx = JSON.parse(catchEl.textContent.trim().replace(/&quot;/g, '"'));
    } catch (e) {
      jsonWx = { parseError: e.message, raw: catchEl.textContent.trim() };
    }
  }
  return {
    [title]: { time, description, images, jsonWx, url, tags: article.tags, abbrlink: article.abbrlink, date: article.date }
  };
}

document.getElementById('generateBtn').addEventListener('click', async () => {
  const file = document.getElementById('fileInput').files[0];
  if (!file) {
    alert('Please select article.txt');
    return;
  }
  const text = await file.text();
  const articles = parseArticles(text);
  const wxArticles = articles.filter(a => a.url.includes('mp.weixin.qq.com'));
  const results = await Promise.allSettled(wxArticles.map(scrape));
  const merged = {};
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      Object.assign(merged, r.value);
    } else {
      merged[`(抓取失败) ${wxArticles[i].url}`] = { error: String(r.reason) };
    }
  });
  document.getElementById('output').textContent = JSON.stringify(merged, null, 2);
});

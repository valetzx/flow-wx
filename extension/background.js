// Background service worker for Flow WX Scraper

// Parse article.txt format into an array of article metadata
function parseArticles(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith('---')) {
    return trimmed
      .split(/\r?\n/)
      .map(l => ({ url: l.trim() }))
      .filter(a => a.url);
  }
  const parts = trimmed.split(/^---\s*$/m).map(p => p.trim()).filter(Boolean);
  const arr = [];
  for (const part of parts) {
    const lines = part.split(/\r?\n/);
    const meta = {};
    let current = null;
    for (const line of lines) {
      const kv = line.match(/^([\w]+):\s*(.*)$/);
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

// Fetch title if not provided
async function fetchTitle(url) {
  const res = await fetch(url);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const t = doc.querySelector('#activity-name')?.textContent?.trim() ||
            doc.querySelector('.rich_media_title')?.textContent?.trim() ||
            doc.querySelector('.opus-module-title__text')?.textContent?.trim() ||
            '';
  return t || 'Untitled';
}

// Scrape article details
async function scrape(article) {
  const res = await fetch(article.url);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const name = article.title && article.title.trim() !== ''
    ? article.title
    : doc.querySelector('#activity-name')?.textContent?.trim() ||
      doc.querySelector('.rich_media_title')?.textContent?.trim() ||
      doc.querySelector('.opus-module-title__text')?.textContent?.trim() ||
      'Untitled';
  const time = article.date ||
    doc.querySelector('#publish_time')?.textContent?.trim() ||
    doc.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
    '';
  const description = article.describe ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    doc.querySelector('#js_content p')?.textContent?.trim() ||
    '';
  const images = Array.from(doc.querySelectorAll('#js_content img'))
    .map(img => (img.getAttribute('data-src') || img.getAttribute('src'))?.split('?')[0])
    .filter(Boolean);
  return { [name]: { time, description, images, url: article.url, tags: article.tags, abbrlink: article.abbrlink, date: article.date } };
}

// Process article text, fetch data and store in chrome.storage
async function processArticleText(text) {
  const articles = parseArticles(text);
  for (const art of articles) {
    if (!art.title || (Array.isArray(art.title) && art.title.length === 0) || (typeof art.title === 'string' && art.title.trim() === '')) {
      art.title = await fetchTitle(art.url);
    }
  }
  const result = {};
  for (const art of articles) {
    try {
      const data = await scrape(art);
      Object.assign(result, data);
    } catch (e) {
      result[`(fetch error) ${art.url}`] = { error: String(e) };
    }
  }
  await chrome.storage.local.set({ wxData: result });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'processArticleFile') {
    processArticleText(message.text).then(() => sendResponse({ ok: true }));
    return true; // async
  }
  if (message.type === 'getWxData') {
    chrome.storage.local.get('wxData').then(data => {
      sendResponse({ data: data.wxData || {} });
    });
    return true;
  }
});

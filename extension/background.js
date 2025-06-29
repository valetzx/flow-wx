const fallbackSentences = [
  "两只黄鹂鸣翠柳",
  "一行白鹭上青天",
  "窗含西岭千秋雪",
  "门泊东吴万里船",
];

function randomSentence() {
  return fallbackSentences[Math.floor(Math.random() * fallbackSentences.length)];
}

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
          meta[current] = current === 'tags' ? [] : '';
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

async function fetchArticleData(article) {
  try {
    const res = await fetch(article.url);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = article.title ||
      doc.querySelector('#activity-name')?.textContent.trim() ||
      doc.querySelector('.rich_media_title')?.textContent.trim() ||
      randomSentence();
    const time = article.date ||
      doc.querySelector('#publish_time')?.textContent.trim() ||
      doc.querySelector('meta[property="article:published_time"]')?.content?.trim();
    const description = article.describe ||
      doc.querySelector('meta[property="og:description"]')?.content?.trim() ||
      doc.querySelector('#js_content p')?.textContent.trim();
    const images = Array.from(doc.querySelectorAll('#js_content img')).map(img => {
      const src = img.getAttribute('data-src') || img.getAttribute('src');
      return src ? src.split('?')[0] : null;
    }).filter(Boolean);
    const jsonWxEl = doc.querySelector('catch#json-wx');
    let jsonWx;
    if (jsonWxEl) {
      const raw = jsonWxEl.innerHTML.trim();
      if (raw) {
        try {
          jsonWx = JSON.parse(raw.replace(/&quot;/g, '"'));
        } catch (e) {
          jsonWx = { parseError: e.message, raw };
        }
      }
    }
    return { [title]: { time, description, images, jsonWx, url: article.url, tags: article.tags, abbrlink: article.abbrlink, date: article.date } };
  } catch (e) {
    return { [`(抓取失败) ${article.url}`]: { error: String(e) } };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'generateWxApi') {
    (async () => {
      let { articleText } = await chrome.storage.local.get('articleText');
      if (!articleText) {
        sendResponse({ error: 'No article.txt loaded' });
        return;
      }
      const articles = parseArticles(articleText);
      const wxArticles = articles.filter(a => a.url.includes('mp.weixin.qq.com'));
      const results = await Promise.all(wxArticles.map(fetchArticleData));
      const merged = {};
      results.forEach(r => Object.assign(merged, r));
      sendResponse({ data: merged });
    })();
    return true; // keep the channel open
  }
});

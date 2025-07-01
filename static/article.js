const ARTICLE_URL = 'https://flow-l95ei0m8.maozi.io/article.txt';

function gmGet(key, def) {
  if (typeof GM_getValue !== 'undefined') return Promise.resolve(GM_getValue(key, def));
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return Promise.resolve(def);
    try { return Promise.resolve(JSON.parse(raw)); } catch { return Promise.resolve(raw); }
  } catch {
    return Promise.resolve(def);
  }
}

function gmSet(key, val) {
  if (typeof GM_setValue !== 'undefined') return Promise.resolve(GM_setValue(key, val));
  try {
    const v = typeof val === 'string' ? val : JSON.stringify(val);
    localStorage.setItem(key, v);
  } catch {}
  return Promise.resolve();
}

function fetchText(url) {
  return fetch(url).then(r => r.text());
}

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

function serializeArticles(arr) {
  return arr.map(a => {
    const lines = [
      '---',
      `url: ${a.url || ''}`,
      `title: ${a.title || ''}`,
      'tags:'
    ];
    if (Array.isArray(a.tags)) {
      a.tags.forEach(t => lines.push(`  - ${t}`));
    }
    lines.push(`abbrlink: ${a.abbrlink || ''}`);
    lines.push(`describe: ${a.describe || ''}`);
    lines.push(`date: ${a.date || ''}`);
    lines.push('---');
    return lines.join('\n');
  }).join('\n\n');
}

let articleArr = [];
let currentIndex = -1;

function sortArticles() {
  articleArr.sort((a, b) => {
    const aLink = (a.abbrlink || '').toString();
    const bLink = (b.abbrlink || '').toString();
    return aLink.localeCompare(bLink);
  });
}

function renderList(panel) {
  sortArticles();
  const listEl = panel.querySelector('#articleList');
  listEl.innerHTML = '';
  articleArr.forEach((a, i) => {
    const li = document.createElement('li');
    li.textContent = a.abbrlink || '(none)';
    li.dataset.index = i;
    if (i === currentIndex) li.classList.add('active');
    li.addEventListener('click', () => selectArticle(panel, i));
    listEl.appendChild(li);
  });
}

function selectArticle(panel, i) {
  currentIndex = i;
  renderList(panel);
  const art = articleArr[i];
  if (!art) return;
  panel.querySelector('#detailUrl').value = art.url || '';
  panel.querySelector('#detailTitle').value = art.title || '';
  panel.querySelector('#detailTags').value = Array.isArray(art.tags) ? art.tags.join(',') : '';
  panel.querySelector('#detailAbbrlink').value = art.abbrlink || '';
  panel.querySelector('#detailDescribe').value = art.describe || '';
  panel.querySelector('#detailDate').value = art.date || '';
}

function updateArticleText(panel) {
  const text = serializeArticles(articleArr);
  panel.querySelector('#articleText').value = text;
  gmSet('articleText', text);
}

function loadArticlesFromText(panel, text) {
  articleArr = parseArticles(text);
  sortArticles();
  panel.querySelector('#articleManager').style.display = 'flex';
  renderList(panel);
  if (articleArr.length) selectArticle(panel, 0);
}

function randomSentence() {
  const list = [
    '小荷才露尖尖角','早有蜻蜓立上头','采菊东篱下','悠然见南山','看看内容吧',
    '日长篱落无人过','惟有蜻蜓蛱蝶飞','小娃撑小艇','日长篱落无人过','惟有蜻蜓蛱蝶飞',
    '偷采白莲回','不解藏踪迹','浮萍一道开'
  ];
  return list[Math.floor(Math.random() * list.length)];
}

async function scrapeWx(article) {
  const { url } = article;
  const html = await fetchText(url);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let title = article.title ||
    doc.querySelector('#activity-name')?.textContent.trim() ||
    doc.querySelector('.rich_media_title')?.textContent.trim() ||
    randomSentence();
  const date = article.date ||
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
    [title]: { date, description, images, jsonWx, url, tags: article.tags, abbrlink: article.abbrlink }
  };
}

async function scrapeBili(article) {
  const { url } = article;
  const html = await fetchText(url);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = article.title ||
    doc.querySelector('.opus-module-title__text')?.textContent.trim() ||
    randomSentence();
  const description = article.describe ||
    doc.querySelector('.opus-module-content')?.textContent.trim();
  const images = Array.from(doc.querySelectorAll('.opus-module-content img')).map(img => {
    let src = img.getAttribute('src');
    if (src && src.startsWith('//')) src = 'https:' + src;
    return src;
  }).filter(Boolean);
  return {
    [title]: { description, images, url, tags: article.tags, abbrlink: article.abbrlink, date: article.date }
  };
}

function switchTab(panel, name) {
  panel.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  panel.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === name + 'Tab');
  });
}

function initPanel(panel) {
  panel.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchTab(panel, t.dataset.tab));
  });

  panel.querySelector('#fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    panel.querySelector('#articleText').value = text;
    gmSet('articleText', text);
    loadArticlesFromText(panel, text);
  });

  panel.querySelector('#generateBtn').addEventListener('click', async () => {
    const text = panel.querySelector('#articleText').value.trim();
    if (!text) {
      alert('Please input article.txt');
      return;
    }
    gmSet('articleText', text);
    const includeWx = panel.querySelector('#includeWx').checked;
    const includeBil = panel.querySelector('#includeBil').checked;
    const articles = parseArticles(text);
    const wxArticles = includeWx ? articles.filter(a => a.url.includes('mp.weixin.qq.com')) : [];
    const bilArticles = includeBil ? articles.filter(a => a.url.includes('bilibili.com')) : [];

    const [wxResults, bilResults] = await Promise.all([
      Promise.allSettled(wxArticles.map(scrapeWx)),
      Promise.allSettled(bilArticles.map(scrapeBili))
    ]);

    const wxMerged = {};
    wxResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        Object.assign(wxMerged, r.value);
      } else {
        wxMerged[`(抓取失败) ${wxArticles[i].url}`] = { error: String(r.reason) };
      }
    });
    const bilMerged = {};
    bilResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        Object.assign(bilMerged, r.value);
      } else {
        bilMerged[`(抓取失败) ${bilArticles[i].url}`] = { error: String(r.reason) };
      }
    });
    const wxLocal = { ...wxMerged, ...bilMerged };
    gmSet('wxLocal', wxLocal);
    try { localStorage.setItem('wxLocal', JSON.stringify(wxLocal)); } catch {}
    panel.querySelector('#wxOutput').textContent = includeWx ? JSON.stringify(wxMerged, null, 2) : '';
    panel.querySelector('#bilOutput').textContent = includeBil ? JSON.stringify(bilMerged, null, 2) : '';

    window.currentWx = includeWx ? wxMerged : null;
    window.currentBil = includeBil ? bilMerged : null;
    switchTab(panel, 'result');
  });

  panel.querySelector('#downloadWx').addEventListener('click', () => {
    if (!window.currentWx) return;
    const blob = new Blob([JSON.stringify(window.currentWx, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wx';
    a.click();
    URL.revokeObjectURL(url);
  });

  panel.querySelector('#downloadBil').addEventListener('click', () => {
    if (!window.currentBil) return;
    const blob = new Blob([JSON.stringify(window.currentBil, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bil';
    a.click();
    URL.revokeObjectURL(url);
  });

  panel.querySelector('#addArticle').addEventListener('click', () => {
    articleArr.push({ url: '', title: '', tags: [], abbrlink: '', describe: '', date: '' });
    renderList(panel);
    selectArticle(panel, articleArr.length - 1);
    updateArticleText(panel);
  });

  panel.querySelector('#deleteArticle').addEventListener('click', () => {
    if (currentIndex < 0) return;
    articleArr.splice(currentIndex, 1);
    if (currentIndex >= articleArr.length) currentIndex = articleArr.length - 1;
    renderList(panel);
    if (currentIndex >= 0) selectArticle(panel, currentIndex);
    else {
      ['detailUrl','detailTitle','detailTags','detailAbbrlink','detailDescribe','detailDate']
        .forEach(id => { panel.querySelector('#'+id).value = ''; });
    }
    updateArticleText(panel);
  });

  panel.querySelector('#saveArticle').addEventListener('click', () => {
    if (currentIndex < 0) return;
    const art = articleArr[currentIndex];
    art.url = panel.querySelector('#detailUrl').value;
    art.title = panel.querySelector('#detailTitle').value;
    art.tags = panel.querySelector('#detailTags').value.split(/[\,\n]+/).map(t => t.trim()).filter(Boolean);
    art.abbrlink = panel.querySelector('#detailAbbrlink').value;
    art.describe = panel.querySelector('#detailDescribe').value;
    art.date = panel.querySelector('#detailDate').value;
    sortArticles();
    const newIndex = articleArr.indexOf(art);
    currentIndex = newIndex;
    updateArticleText(panel);
    renderList(panel);
    selectArticle(panel, currentIndex);
  });
}

async function init(panel) {
  const storedText = await gmGet('articleText', '');
  if (storedText) {
    panel.querySelector('#articleText').value = storedText;
    loadArticlesFromText(panel, storedText);
  } else {
    try {
      const text = await fetchText(ARTICLE_URL);
      panel.querySelector('#articleText').value = text;
      gmSet('articleText', text);
      loadArticlesFromText(panel, text);
    } catch (e) {
      console.error('Failed to fetch default article.txt', e);
    }
  }
  const wxLocal = await gmGet('wxLocal');
  if (wxLocal) {
    panel.querySelector('#wxOutput').textContent = JSON.stringify(wxLocal, null, 2);
    panel.querySelector('#bilOutput').textContent = '';
    if (window.sharedStorage && typeof window.sharedStorage.set === 'function') {
      window.sharedStorage.set('wxLocal', JSON.stringify(wxLocal)).catch(() => {});
    }
  }
}

window.commonReady?.then(() => {
  const panel = document.getElementById('flowWxPanel');
  if (!panel) return;
  initPanel(panel);
  init(panel);
});

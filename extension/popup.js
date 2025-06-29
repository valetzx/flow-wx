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

async function scrapeWx(article) {
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

async function scrapeBili(article) {
  const { url } = article;
  const res = await fetch(url);
  const html = await res.text();
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

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === name + 'Tab');
  });
}

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get('articleText', res => {
    if (res.articleText) {
      document.getElementById('articleText').value = res.articleText;
      window.articles = parseArticles(res.articleText);
      renderArticleList();
    } else {
      window.articles = [];
    }
  });
});

document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  document.getElementById('articleText').value = text;
  chrome.storage.local.set({ articleText: text });
  window.articles = parseArticles(text);
  renderArticleList();
});

document.getElementById('generateBtn').addEventListener('click', async () => {
  const text = document.getElementById('articleText').value.trim();
  if (!text) {
    alert('Please input article.txt');
    return;
  }
  chrome.storage.local.set({ articleText: text });
  const articles = parseArticles(text);
  window.articles = articles;
  renderArticleList();
  const wxArticles = articles.filter(a => a.url.includes('mp.weixin.qq.com'));
  const bilArticles = articles.filter(a => a.url.includes('bilibili.com'));

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
  document.getElementById('wxOutput').textContent = JSON.stringify(wxMerged, null, 2);
  document.getElementById('bilOutput').textContent = JSON.stringify(bilMerged, null, 2);

  window.currentWx = wxMerged;
  window.currentBil = bilMerged;
  switchTab('result');
});

document.getElementById('downloadWx').addEventListener('click', () => {
  if (!window.currentWx) return;
  const blob = new Blob([JSON.stringify(window.currentWx, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'wx';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('downloadBil').addEventListener('click', () => {
  if (!window.currentBil) return;
  const blob = new Blob([JSON.stringify(window.currentBil, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bil';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('fullscreenBtn').addEventListener('click', () => {
  if (chrome.runtime.openIndexPage) {
    chrome.runtime.openIndexPage();
  } else {
    window.open(chrome.runtime.getURL('popup.html'));
  }
});

document.getElementById('settingsBtn').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
});

function serializeArticles(list) {
  return list.map(a => {
    const lines = ['---'];
    lines.push('url: ' + (a.url || ''));
    lines.push('title: ' + (a.title || ''));
    lines.push('tags:');
    (a.tags || []).forEach(t => lines.push('  - ' + t));
    lines.push('abbrlink: ' + (a.abbrlink || ''));
    lines.push('describe: ' + (a.describe || ''));
    lines.push('date: ' + (a.date || ''));
    lines.push('---');
    return lines.join('\n');
  }).join('\n\n');
}

function updateArticleText() {
  const text = serializeArticles(window.articles);
  document.getElementById('articleText').value = text;
  chrome.storage.local.set({ articleText: text });
}

function renderArticleList() {
  const listEl = document.getElementById('articleList');
  if (!listEl) return;
  if (!Array.isArray(window.articles)) window.articles = [];
  window.articles.sort((a,b)=>String(a.abbrlink||'').localeCompare(String(b.abbrlink||'')));
  listEl.innerHTML = '';
  window.articles.forEach((a,i)=>{
    const li = document.createElement('li');
    li.textContent = a.abbrlink || '(空)';
    li.dataset.index = i;
    li.addEventListener('click', ()=>openEditor(i));
    listEl.appendChild(li);
  });
}

function openEditor(index) {
  const ed = document.getElementById('articleEditor');
  if (!ed) return;
  const a = window.articles[index];
  ed.dataset.index = index;
  ed.innerHTML = `
    url: <input type="text" id="eUrl"><br>
    title: <input type="text" id="eTitle"><br>
    tags: <input type="text" id="eTags"><br>
    abbrlink: <input type="text" id="eAbbrlink"><br>
    describe: <input type="text" id="eDescribe"><br>
    date: <input type="text" id="eDate"><br>
  `;
  ed.querySelector('#eUrl').value = a.url || '';
  ed.querySelector('#eTitle').value = a.title || '';
  ed.querySelector('#eTags').value = (a.tags || []).join(', ');
  ed.querySelector('#eAbbrlink').value = a.abbrlink || '';
  ed.querySelector('#eDescribe').value = a.describe || '';
  ed.querySelector('#eDate').value = a.date || '';
  ed.querySelectorAll('input').forEach(inp => inp.addEventListener('input', saveEditor));
}

function saveEditor() {
  const ed = document.getElementById('articleEditor');
  const idx = parseInt(ed.dataset.index, 10);
  const a = window.articles[idx];
  a.url = ed.querySelector('#eUrl').value;
  a.title = ed.querySelector('#eTitle').value;
  a.tags = ed.querySelector('#eTags').value.split(',').map(s=>s.trim()).filter(Boolean);
  a.abbrlink = ed.querySelector('#eAbbrlink').value;
  a.describe = ed.querySelector('#eDescribe').value;
  a.date = ed.querySelector('#eDate').value;
  updateArticleText();
  renderArticleList();
}

document.getElementById('addArticleBtn').addEventListener('click', () => {
  window.articles.push({ url: '', title: '', tags: [], abbrlink: '', describe: '', date: '' });
  renderArticleList();
  openEditor(window.articles.length - 1);
  updateArticleText();
});

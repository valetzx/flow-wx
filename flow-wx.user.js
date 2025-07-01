// ==UserScript==
// @name         Flow WX Extractor
// @namespace    https://github.com/example/flow-wx
// @version      1.0
// @description  Generate data from article.txt for WeChat/Bilibili articles
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      *
// ==/UserScript==

(function() {
  'use strict';

  const ARTICLE_URL = 'https://flow-l95ei0m8.maozi.io/article.txt';

  function gmGet(key, def) {
    if (typeof GM_getValue !== 'undefined') return Promise.resolve(GM_getValue(key, def));
    return Promise.resolve(def);
  }
  function gmSet(key, val) {
    if (typeof GM_setValue !== 'undefined') return Promise.resolve(GM_setValue(key, val));
    return Promise.resolve();
  }
  function fetchText(url) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: 'GET',
          url,
          onload: r => resolve(r.responseText),
          onerror: r => reject(r)
        });
      } else {
        fetch(url).then(r => r.text()).then(resolve).catch(reject);
      }
    });
  }

  const style = `#flowWxPanel{font-family:system-ui,sans-serif;padding:12px;background:#f3f4f6;width:320px;position:fixed;top:50px;right:20px;z-index:100000}
#flowWxPanel button,#flowWxPanel input,#flowWxPanel select{font:inherit;border-radius:.375rem;border:1px solid #d1d5db;padding:4px 8px}
#flowWxPanel button{background:#3b82f6;color:#fff;cursor:pointer;border:none}
#flowWxPanel button:hover{background:#2563eb}
#flowWxPanel pre{white-space:pre-wrap;word-break:break-all;max-height:300px;overflow-y:auto}
#flowWxPanel .tabs{display:flex;align-items:center;margin-bottom:8px;background:#fff;border-radius:.5rem;box-shadow:0 1px 2px rgba(0,0,0,0.1);overflow:hidden}
#flowWxPanel .tab{flex:1;padding:6px 0;text-align:center;cursor:pointer;border-right:1px solid #e5e7eb}
#flowWxPanel .tab:last-child{border-right:none}
#flowWxPanel .tab.active{background:#3b82f6;color:#fff}
#flowWxPanel .tab-actions{margin-left:auto;display:flex;gap:4px;padding:0 6px}
#flowWxPanel .tab-actions button{background:transparent;color:#374151;border:none}
#flowWxPanel .tab-actions button:hover{background:#e5e7eb}
#flowWxPanel .tab-content{display:none;background:#fff;border-radius:.5rem;box-shadow:0 1px 2px rgba(0,0,0,0.1);padding:8px}
#flowWxPanel .tab-content.active{display:block}
#flowWxPanel textarea{width:100%;height:120px;border-radius:.375rem;border:1px solid #d1d5db;padding:4px}
#flowWxPanel .article-manager{display:flex;gap:6px;margin-top:6px}
#flowWxPanel .article-list{width:80px;border:1px solid #e5e7eb;padding:4px;overflow-y:auto;max-height:210px;background:#f9fafb;border-radius:.375rem}
#flowWxPanel .article-list ul{list-style:none;padding:0;margin:0}
#flowWxPanel .list-actions{display:flex;gap:4px;margin-bottom:4px}
#flowWxPanel .article-list li{cursor:pointer;margin:2px 0;padding:2px 4px;border-radius:.25rem}
#flowWxPanel .article-list li.active{background:#e5e7eb}
#flowWxPanel .article-detail{flex:1;background:#f9fafb;padding:6px;border-radius:.375rem;border:1px solid #e5e7eb}
#flowWxPanel .article-detail .row{display:flex;align-items:center;margin-bottom:4px}
#flowWxPanel .article-detail .row span{width:60px}
#flowWxPanel .article-detail input{flex:1;padding:4px;border-radius:.375rem;border:1px solid #d1d5db}
#flowWxPanel .options{display:flex;gap:8px;margin:6px 0}
#flowWxPanel .options label{display:flex;align-items:center;gap:2px}`;

  const html = `
<div class="tabs">
  <div class="tab active" data-tab="edit">文章</div>
  <div class="tab" data-tab="result">结果</div>
  <div class="tab-actions">
    <button id="fullscreenBtn" title="Fullscreen">⛶</button>
    <button id="settingsBtn" title="Settings">⚙</button>
  </div>
</div>
<div id="editTab" class="tab-content active">
  <input type="file" id="fileInput" accept=".txt">
  <textarea id="articleText" placeholder="article.txt 内容" style="display:none;"></textarea>
  <div id="articleManager" class="article-manager" style="display:none;">
    <div class="article-list">
      <div class="list-actions">
        <button id="addArticle">+</button>
        <button id="deleteArticle" title="Delete">-</button>
      </div>
      <ul id="articleList"></ul>
    </div>
    <div class="article-detail" id="detailContainer">
      <div class="row"><span>url:</span><input id="detailUrl"></div>
      <div class="row"><span>title:</span><input id="detailTitle"></div>
      <div class="row"><span>tags:</span><input id="detailTags"></div>
      <div class="row"><span>abbrlink:</span><input id="detailAbbrlink"></div>
      <div class="row"><span>describe:</span><input id="detailDescribe"></div>
      <div class="row"><span>date:</span><input id="detailDate"></div>
      <div class="row" style="justify-content:flex-end"><button id="saveArticle">保存</button></div>
    </div>
  </div>
  <div class="options">
    <label><input type="checkbox" id="includeWx" checked>wx</label>
    <label><input type="checkbox" id="includeBil" checked>bil</label>
    <button id="generateBtn" style="margin-left: auto">生成</button>
  </div>
</div>
<div id="resultTab" class="tab-content">
  <div>
    <h3>wx</h3>
    <pre id="wxOutput"></pre>
    <button id="downloadWx">Download wx</button>
  </div>
  <div>
    <h3>bil</h3>
    <pre id="bilOutput"></pre>
    <button id="downloadBil">Download bil</button>
  </div>
</div>`;

  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'flowWxPanel';
    panel.innerHTML = `<style>${style}</style>` + html;
    panel.style.display = 'none';
    document.body.appendChild(panel);
    return panel;
  }

  const panel = createPanel();

  GM_registerMenuCommand('Toggle Flow WX', () => {
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });

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

  function renderList() {
    sortArticles();
    const listEl = panel.querySelector('#articleList');
    listEl.innerHTML = '';
    articleArr.forEach((a, i) => {
      const li = document.createElement('li');
      li.textContent = a.abbrlink || '(none)';
      li.dataset.index = i;
      if (i === currentIndex) li.classList.add('active');
      li.addEventListener('click', () => selectArticle(i));
      listEl.appendChild(li);
    });
  }

  function selectArticle(i) {
    currentIndex = i;
    renderList();
    const art = articleArr[i];
    if (!art) return;
    panel.querySelector('#detailUrl').value = art.url || '';
    panel.querySelector('#detailTitle').value = art.title || '';
    panel.querySelector('#detailTags').value = Array.isArray(art.tags) ? art.tags.join(',') : '';
    panel.querySelector('#detailAbbrlink').value = art.abbrlink || '';
    panel.querySelector('#detailDescribe').value = art.describe || '';
    panel.querySelector('#detailDate').value = art.date || '';
  }

  function updateArticleText() {
    const text = serializeArticles(articleArr);
    panel.querySelector('#articleText').value = text;
    gmSet('articleText', text);
  }

  function loadArticlesFromText(text) {
    articleArr = parseArticles(text);
    sortArticles();
    panel.querySelector('#articleManager').style.display = 'flex';
    renderList();
    if (articleArr.length) selectArticle(0);
  }

  function randomSentence() {
    const list = [
      '小荷才露尖尖角','早有蜻蜓立上头','采菊东篱下','悠然见南山','看看内容吧','日长篱落无人过','惟有蜻蜓蛱蝶飞','小娃撑小艇','日长篱落无人过','惟有蜻蜓蛱蝶飞','偷采白莲回','不解藏踪迹','浮萍一道开'
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

  function switchTab(name) {
    panel.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === name);
    });
    panel.querySelectorAll('.tab-content').forEach(c => {
      c.classList.toggle('active', c.id === name + 'Tab');
    });
  }

  panel.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  async function init() {
    const storedText = await gmGet('articleText', '');
    if (storedText) {
      panel.querySelector('#articleText').value = storedText;
      loadArticlesFromText(storedText);
    } else {
      try {
        const text = await fetchText(ARTICLE_URL);
        panel.querySelector('#articleText').value = text;
        gmSet('articleText', text);
        loadArticlesFromText(text);
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

  panel.querySelector('#fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    panel.querySelector('#articleText').value = text;
    gmSet('articleText', text);
    loadArticlesFromText(text);
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
    try { localStorage.setItem('wxLocal', JSON.stringify(wxLocal)); } catch (e) {}
    panel.querySelector('#wxOutput').textContent = includeWx ? JSON.stringify(wxMerged, null, 2) : '';
    panel.querySelector('#bilOutput').textContent = includeBil ? JSON.stringify(bilMerged, null, 2) : '';

    window.currentWx = includeWx ? wxMerged : null;
    window.currentBil = includeBil ? bilMerged : null;
    switchTab('result');
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
    renderList();
    selectArticle(articleArr.length - 1);
    updateArticleText();
  });

  panel.querySelector('#deleteArticle').addEventListener('click', () => {
    if (currentIndex < 0) return;
    articleArr.splice(currentIndex, 1);
    if (currentIndex >= articleArr.length) currentIndex = articleArr.length - 1;
    renderList();
    if (currentIndex >= 0) selectArticle(currentIndex);
    else {
      ['detailUrl','detailTitle','detailTags','detailAbbrlink','detailDescribe','detailDate']
        .forEach(id => { panel.querySelector('#'+id).value = ''; });
    }
    updateArticleText();
  });

  panel.querySelector('#saveArticle').addEventListener('click', () => {
    if (currentIndex < 0) return;
    const art = articleArr[currentIndex];
    art.url = panel.querySelector('#detailUrl').value;
    art.title = panel.querySelector('#detailTitle').value;
    art.tags = panel.querySelector('#detailTags').value.split(/[,\n]+/).map(t => t.trim()).filter(Boolean);
    art.abbrlink = panel.querySelector('#detailAbbrlink').value;
    art.describe = panel.querySelector('#detailDescribe').value;
    art.date = panel.querySelector('#detailDate').value;
    sortArticles();
    const newIndex = articleArr.indexOf(art);
    currentIndex = newIndex;
    updateArticleText();
    renderList();
    selectArticle(currentIndex);
  });

  init();
})();

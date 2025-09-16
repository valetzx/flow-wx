function includeHTML() {
  const includes = document.querySelectorAll('[data-include]');
  return Promise.all(Array.from(includes).map(async el => {
    const file = el.getAttribute('data-include');
    if (file) {
      try {
        const res = await fetch(file);
        if (res.ok) {
          el.innerHTML = await res.text();
        }
      } catch {}
    }
  }));
}

function initDarkMode() {
  const darkModeToggle = document.getElementById('darkModeToggle');
  if (!darkModeToggle) return;
  const isDarkMode = localStorage.getItem('darkMode') === 'true' ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches &&
      localStorage.getItem('darkMode') !== 'false');
  if (isDarkMode) {
    document.documentElement.classList.add('dark');
    darkModeToggle.checked = true;
  }
  darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('darkMode', 'true');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('darkMode', 'false');
    }
  });
}

function setupSplash() {
  const splashScreen = document.getElementById('splashScreen');
  if (!splashScreen) return;
  const startTime = performance.now();
  window.hideSplash = function(immediate=false) {
    const delay = immediate ? 0 : Math.max(0, 2000 - (performance.now() - startTime));
    setTimeout(() => {
      splashScreen.style.opacity = '0';
      splashScreen.addEventListener('transitionend', () => {
        splashScreen.remove();
        document.body.classList.add('loaded');
      }, { once: true });
    }, delay);
  };
  window.addEventListener('error', () => {
    splashScreen.innerHTML = `
      <div style="text-align:center;color:#fff;padding:20px">
        <h2>加载遇到问题</h2>
        <p>请检查网络连接</p>
        <button onclick="location.reload()">重试</button>
      </div>
    `;
  });
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (!document.body.classList.contains('loaded')) window.hideSplash();
    }, 10000);
  });
}

function setupTagListDrag() {
  const tagList = document.getElementById('tagList');
  if (!tagList) return;
  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  tagList.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDown = true;
    startX = e.pageX - tagList.offsetLeft;
    scrollLeft = tagList.scrollLeft;
    tagList.classList.add('cursor-grabbing');
  });
  tagList.addEventListener('mouseleave', () => {
    isDown = false;
    tagList.classList.remove('cursor-grabbing');
  });
  tagList.addEventListener('mouseup', () => {
    isDown = false;
    tagList.classList.remove('cursor-grabbing');
  });
  tagList.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - tagList.offsetLeft;
    const walk = x - startX;
    tagList.scrollLeft = scrollLeft - walk;
  });
}

window.commonReady = new Promise(resolve => {
  document.addEventListener('DOMContentLoaded', async () => {
    await includeHTML();
    initDarkMode();
    setupSplash();
    setupTagListDrag();
    
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "tbkb63wh98");
    
    resolve();
  });
});

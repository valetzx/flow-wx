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


initDarkMode();
window.commonReady = new Promise(resolve => {
  document.addEventListener('DOMContentLoaded', async () => {
    await includeHTML();
    setupSplash();
    resolve();
  });
});

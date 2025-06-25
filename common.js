// Tailwind config and common UI utilities
// Tailwind dark mode setup
if (typeof tailwind !== 'undefined') {
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          primary: 'rgb(var(--primary))',
          secondary: 'rgb(var(--secondary))',
          accent: 'rgb(var(--accent))',
          surface: 'rgb(var(--surface))',
          'on-surface': 'rgb(var(--on-surface))',
          card: 'rgb(var(--card))',
          border: 'rgb(var(--border))'
        }
      }
    }
  };
}
// Dark mode toggle
document.addEventListener('DOMContentLoaded', () => {
  const darkModeToggle = document.getElementById('darkModeToggle');
  const isDark = localStorage.getItem('darkMode') === 'true' ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches &&
      localStorage.getItem('darkMode') !== 'false');
  if (isDark) {
    document.documentElement.classList.add('dark');
    if (darkModeToggle) darkModeToggle.checked = true;
  }
  if (darkModeToggle) {
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
});

const splashScreen = document.getElementById('splashScreen');
const startTime = performance.now();
function hideSplash(immediate = false) {
  const delay = immediate ? 0 : Math.max(0, 2000 - (performance.now() - startTime));
  setTimeout(() => {
    splashScreen.style.opacity = '0';
    splashScreen.addEventListener('transitionend', () => {
      splashScreen.remove();
      document.body.classList.add('loaded');
    }, { once: true });
  }, delay);
}
window.hideSplash = hideSplash;
window.addEventListener('error', () => {
  splashScreen.innerHTML = `\n          <div style="text-align:center;color:#fff;padding:20px">\n            <h2>加载遇到问题</h2>\n            <p>请检查网络连接</p>\n            <button onclick="location.reload()">重试</button>\n          </div>\n        `;
});
window.addEventListener('load', () => {
  setTimeout(() => {
    if (!document.body.classList.contains('loaded')) hideSplash();
  }, 10000);
});

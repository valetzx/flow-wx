
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


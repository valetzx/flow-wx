document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    chrome.storage.local.set({ articleText: reader.result });
  };
  reader.readAsText(file);
});

document.getElementById('generateBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'generateWxApi' }, (res) => {
    const pre = document.getElementById('result');
    if (res && res.data) {
      pre.textContent = JSON.stringify(res.data, null, 2);
    } else {
      pre.textContent = 'Failed to generate';
    }
  });
});

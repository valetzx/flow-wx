document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  chrome.runtime.sendMessage({ type: 'processArticleFile', text }, (res) => {
    const status = document.getElementById('status');
    if (chrome.runtime.lastError) {
      status.textContent = chrome.runtime.lastError.message;
    } else if (res && res.ok) {
      status.textContent = 'Processed successfully';
    } else {
      status.textContent = 'Failed to process';
    }
  });
});

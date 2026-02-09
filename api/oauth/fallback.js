export default async function handler(req, res) {
  try {
    const { code, state, scope } = req.query;
    if (!code) {
      return res.redirect(`${process.env.FLUTTER_SCHEME}://cnb/login?error=无授权code`);
    }

    const redirectUrl = `${process.env.FLUTTER_SCHEME}://cnb/callback?code=${code}&state=${state || ''}&scope=${scope || ''}`;

    const htmlPage = `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>授权码获取成功</title>
        <style>
          body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f5f5f5; }
          .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; }
          .code-box { margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 4px; word-break: break-all; font-family: monospace; }
          .copy-btn { padding: 10px 20px; background: #0070f3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
          .copy-btn:hover { background: #0051a2; }
          .tip { margin-top: 20px; color: #666; font-size: 14px; }
          .countdown { color: #0070f3; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>授权码获取成功</h2>
          <p>您的授权code：</p>
          <div class="code-box" id="codeDisplay">${code}</div>
          <button class="copy-btn" id="copyBtn">复制授权码</button>
          <div class="tip">页面将在 <span class="countdown" id="countdown">1</span> 秒后自动跳转...</div>
        </div>

        <script>
          const copyBtn = document.getElementById('copyBtn');
          const codeDisplay = document.getElementById('codeDisplay');
          const countdown = document.getElementById('countdown');
          
          copyBtn.addEventListener('click', async () => {
            try {
              await navigator.clipboard.writeText(codeDisplay.textContent);
              copyBtn.textContent = '复制成功！';
              setTimeout(() => {
                copyBtn.textContent = '复制授权码';
              }, 2000);
            } catch (err) {
              alert('复制失败，请手动复制：' + codeDisplay.textContent);
            }
          });

          // 倒计时并自动跳转
          let seconds = 1;
          const timer = setInterval(() => {
            seconds--;
            countdown.textContent = seconds;
            if (seconds <= 0) {
              clearInterval(timer);
              window.location.href = '${redirectUrl}';
            }
          }, 1000);
        </script>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(htmlPage);

  } catch (err) {
    res.redirect(`${process.env.FLUTTER_SCHEME}://cnb/login?error=${err.message}`);
  }
}

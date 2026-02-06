// api/oauth/fallback.js
export default async function handler(req, res) {
  try {
    const { code, state, scope } = req.query;
    // 无code直接重定向到App的登录页
    if (!code) {
      return res.redirect(`${process.env.FLUTTER_SCHEME}://cnb/login?error=无授权code`);
    }
    // 重定向到Flutter Scheme，拼接code/state/scope参数
    const redirectUrl = `${process.env.FLUTTER_SCHEME}://cnb/callback?code=${code}&state=${state || ''}&scope=${scope || ''}`;
    // 302重定向，让WebView跳转到App
    res.writeHead(302, { Location: redirectUrl });
    res.end();
  } catch (err) {
    res.redirect(`${process.env.FLUTTER_SCHEME}://cnb/login?error=${err.message}`);
  }
}
const https = require('https');
const querystring = require('querystring');

// 环境变量增加默认值，避免未定义
const CNB_CLIENT_ID = process.env.CNB_CLIENT_ID || '';
const CNB_CLIENT_SECRET = process.env.CNB_CLIENT_SECRET || '';
const CNB_DOMAIN = 'https://cnb.cool';
const VERCEL_REDIRECT_URI = process.env.VERCEL_REDIRECT_URI || '';

// 解析CNB域名，拆分host和protocol（方便https请求）
const cnbHost = new URL(CNB_DOMAIN).host;
const cnbPath = '/oauth2/token';

// Basic认证头生成（加空值判断）
const getBasicAuthHeader = () => {
  if (!CNB_CLIENT_ID || !CNB_CLIENT_SECRET) return '';
  const authStr = `${CNB_CLIENT_ID}:${CNB_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(authStr, 'utf-8').toString('base64')}`;
};

// 封装https POST请求（替代axios）
const httpsPost = (host, path, params, headers) => {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify(params);
    const options = {
      host,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        ...headers
      },
      timeout: 10000 // 10秒超时
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          // 解析JSON响应
          resolve({
            status: res.statusCode,
            data: JSON.parse(data)
          });
        } catch (e) {
          reject(new Error(`响应解析失败: ${e.message}, 原始数据: ${data}`));
        }
      });
    });

    // 超时/错误处理
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时（10秒）'));
    });
    req.on('error', (err) => reject(err));
    // 发送请求体
    req.write(postData);
    req.end();
  });
};

export default async function handler(req, res) {
  // 完整CORS跨域头
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*'); // 生产替换为你的Flutter域名
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // 仅支持POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, msg: '仅支持POST请求' });
  }

  try {
    const { code, refresh_token } = req.body || {};
    // 空值判断
    if (!code && !refresh_token) {
      return res.status(400).json({ success: false, msg: '缺少code或refresh_token' });
    }
    // 构造请求参数
    let params = {};
    if (code) {
      if (!VERCEL_REDIRECT_URI) {
        return res.status(400).json({ success: false, msg: '服务端未配置VERCEL_REDIRECT_URI' });
      }
      params = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: VERCEL_REDIRECT_URI
      };
    } else if (refresh_token) {
      params = {
        grant_type: 'refresh_token',
        refresh_token
      };
    }
    // 构造请求头
    const basicAuth = getBasicAuthHeader();
    const headers = {};
    if (basicAuth) headers.Authorization = basicAuth;

    // 发送https POST请求
    const responseData = await httpsPost(cnbHost, cnbPath, params, headers);
    // 校验上游返回状态
    if (responseData.status < 200 || responseData.status >= 400) {
      throw new Error(`第三方接口返回错误: ${JSON.stringify(responseData.data)}`);
    }
    // 校验核心字段
    const { access_token, expires_in, refresh_token: newRefreshToken, token_type } = responseData.data || {};
    if (!access_token || !expires_in || !newRefreshToken || !token_type) {
      return res.status(400).json({ success: false, msg: '第三方接口返回字段不完整' });
    }

    // 返回Flutter需要的字段（加CORS头）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      success: true,
      data: {
        access_token,
        expires_in,
        refresh_token: newRefreshToken,
        token_type
      }
    });
  } catch (error) {
    console.error('请求失败:', error.message);
    // 兜底CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      success: false,
      msg: error.message || '服务端请求失败',
      data: null
    });
  }
}

// Vercel运行时配置，指定Node版本
export const config = {
  runtime: 'nodejs18.x',
};
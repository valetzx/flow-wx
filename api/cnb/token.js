import axios from 'axios';

// 从Vercel环境变量读取
const CNB_CLIENT_ID = process.env.CNB_CLIENT_ID;
const CNB_CLIENT_SECRET = process.env.CNB_CLIENT_SECRET;
const CNB_DOMAIN = 'https://cnb.cool';
const VERCEL_REDIRECT_URI = process.env.VERCEL_REDIRECT_URI;

// HTTP Basic认证头
const getBasicAuthHeader = () => {
  const authStr = `${CNB_CLIENT_ID}:${CNB_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(authStr).toString('base64')}`;
};

const cnbAxios = axios.create({
  baseURL: CNB_DOMAIN,
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': getBasicAuthHeader()
  },
  timeout: 10000
});

export default async function handler(req, res) {
  // 跨域预检
  if (req.method === 'OPTIONS') return res.status(200).end();
  // 只支持POST
  if (req.method !== 'POST') return res.status(405).json({ success: false, msg: '仅支持POST' });

  try {
    const { code, refresh_token } = req.body;
    let responseData;

    // code换token / refresh_token刷新二选一
    if (code) {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: VERCEL_REDIRECT_URI
      });
      responseData = await cnbAxios.post('/oauth2/token', params);
    } else if (refresh_token) {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token
      });
      responseData = await cnbAxios.post('/oauth2/token', params);
    } else {
      return res.status(400).json({ success: false, msg: '缺少code或refresh_token' });
    }

    // 只返回Flutter需要的核心字段
    res.status(200).json({
      success: true,
      data: {
        access_token: responseData.data.access_token,
        expires_in: responseData.data.expires_in,
        refresh_token: responseData.data.refresh_token,
        token_type: responseData.data.token_type
      }
    });
  } catch (error) {
    const errorMsg = error.response?.data || error.message;
    res.status(error.response?.status || 500).json({
      success: false,
      msg: errorMsg,
      data: null
    });
  }
}
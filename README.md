# 将指定的微信公众号渲染为瀑布流

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WX_URL` | `必填` | 获取的微信公众号文章列表，如果不填会从本地 `article.txt` 读取 |
| `API_DOMAINS` | `(可选)` | 提供 `/api/wx`、`/api/article` 和 `/api/daily` 的备用域名，多个域名用逗号或空格分隔 |
| `IMG_DOMAINS` | `(可选)` | 图片代理 `/img` 的备用域名，多个域名用逗号或空格分隔 |

## 部署到 Cloudflare Workers

1. 安装 [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
2. 运行 `wrangler publish` 部署。
3. 部署前可通过 `wrangler dev` 本地调试。

项目中的 HTML 与文本文件会在构建时作为字符串引入，规则已在 `wrangler.toml` 中配置。

Workers 会读取 `WX_URL`、`API_DOMAINS` 和 `IMG_DOMAINS` 这几个环境变量。

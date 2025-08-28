# 将指定的微信公众号渲染为瀑布流

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ARTICLES_DIR` | `可选` | 微信公众号文章 Markdown 文件目录，默认读取本地 `articles` |
| `API_DOMAINS` | `可选` | 提供 `/api/wx`、`/api/article` 和 `/api/daily` 的备用域名，多个域名用逗号或空格分隔 |
| `IMG_DOMAINS` | `可选` | 图片代理 `/img` 的备用域名，多个域名用逗号或空格分隔 |

## 部署到 Deno  (推荐)

直接 fork+star 本项目，在 `articles/` 目录下新增或修改 Markdown 文件以配置需要抓取的文章。每篇文章形如：

```txt
---
url: https://example.com/wechat-article
title: 可选自定义标题
tags:
  - 可选标签
abbrlink: 可选短链
describe: 可选描述
date: 2024-01-01 12:00:00
---
```

每个文件命名为其 `abbrlink`，如 `1indoordesign.md`。配置完成后在 Deno 面板中选择你 fork 的仓库导入，选择 `server.ts` 进行部署。

## 部署到 Cloudflare Workers

1. 安装 [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
2. 运行 `wrangler publish` 部署。
3. 部署前可通过 `wrangler dev` 本地调试。

项目中的 HTML 与文本文件会在构建时作为字符串引入，规则已在 `wrangler.toml` 中配置。

Workers 会读取 `API_DOMAINS` 和 `IMG_DOMAINS` 这几个环境变量。

## 构建静态站点并部署到 GitHub Pages

1. `npm install` 安装依赖。
2. 根据需要设置 `API_DOMAINS`、`IMG_DOMAINS` 等环境变量。
3. 运行 `npm run build`，构建结果位于 `dist/` 目录，可直接推送到 GitHub Pages。

构建后的页面会在运行时请求你配置的 API 域名，因此可将 API 部署在下文的 Cloudflare Workers 或 Node.js 服务中。

## 使用 Node.js 部署 API

执行 `npm start` 即可启动 `server.js`，它提供与 `server.ts` 相同的接口，适合部署在支持 Node.js 的平台。



# 将指定的微信公众号渲染为瀑布流

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `WX_URL` | `必填` | 获取的微信公众号文章列表，如果不填会从本地 `article.txt` 读取 |
| `API_DOMAINS` | `可选` | 提供 `/api/wx`、`/api/article` 和 `/api/daily` 的备用域名，多个域名用逗号或空格分隔 |
| `IMG_DOMAINS` | `可选` | 图片代理 `/img` 的备用域名，多个域名用逗号或空格分隔 |

## 部署到 Deno  (推荐)

直接fork+star本项目，修改 `article.txt` 以配置需要抓取的文章。每篇文章形如：

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

若文件不以 `---` 开头，则仍按旧格式（每行一个 URL）解析。
配置完成后在 Deno 面板中选择你 fork 的仓库导入，选择 `server.ts` 进行部署。

## 部署到 Cloudflare Workers

1. 安装 [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
2. 运行 `wrangler publish` 部署。
3. 部署前可通过 `wrangler dev` 本地调试。

项目中的 HTML 与文本文件会在构建时作为字符串引入，规则已在 `wrangler.toml` 中配置。

Workers 会读取 `WX_URL`、`API_DOMAINS` 和 `IMG_DOMAINS` 这几个环境变量。

## 构建静态站点并部署到 GitHub Pages

1. `npm install` 安装依赖。
2. 根据需要设置 `API_DOMAINS`、`IMG_DOMAINS` 等环境变量。
3. 运行 `npm run build`，构建结果位于 `dist/` 目录，可直接推送到 GitHub Pages。

构建后的页面会在运行时请求你配置的 API 域名，因此可将 API 部署在下文的 Cloudflare Workers 或 Node.js 服务中。

## 使用 Node.js 部署 API

执行 `npm start` 即可启动 `server.js`，它提供与 `server.ts` 相同的接口，适合部署在支持 Node.js 的平台。


## 项目结构

```
.
├── README.md              项目说明文档
├── LICENSE                项目采用的许可协议
├── add.html               添加卡片和书签的页面，带有 Tailwind 样式和服务工作线程注入
├── admin.html             管理后台页面，用于在线编辑和加载数据
├── article.txt            需要抓取的文章列表配置
├── build.js               构建脚本，生成静态站点和 API 缓存
├── ideas.html             展示文章瀑布流的页面
├── main.html              图集首页页面
├── node.js                Node.js 版本的 API 服务入口
├── node_modules/          第三方依赖库目录
├── package.json           项目依赖与构建脚本定义
├── server.ts              Deno 版本的服务端实现
├── static/                静态资源目录
│   ├── common.css         通用样式文件
│   ├── common.js          通用前端逻辑
│   ├── ideas.css          文章页面的附加样式
│   ├── settings.html      设置面板 HTML 模板
│   ├── sidebar.html       侧边栏 HTML 模板
│   └── sw.js              Service Worker 脚本
├── extension/             浏览器扩展源码
│   ├── manifest.json      扩展配置清单
│   ├── options.html       扩展设置页
│   ├── popup.html         扩展弹窗页面
│   └── popup.js           扩展前端逻辑
├── vercel.json            Vercel 路由与部署配置
├── worker.js              Cloudflare Workers 版本的服务端实现
└── wrangler.toml          Cloudflare Workers 构建配置
```


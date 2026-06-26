# 企业独立站 Demo 合集

本仓库包含两个可独立运行的「企业独立站」演示项目，演示「客户描述需求 → 用现代开源技术栈生成并交付企业官网」的两条主流路线：

| Demo | 技术栈 | 特点 | 目录 |
|---|---|---|---|
| **Payload Demo** | Payload CMS + Next.js（前后端一体） | 单项目、TS 原生、Next.js 内嵌后台，最快上线 | [`payload-demo/`](./payload-demo) |
| **Strapi Demo** | Strapi（后端 CMS）+ Next.js（独立前端） | 后台与前端分离、可视化内容管理、易批量托管 | [`strapi-demo/`](./strapi-demo) |

两个 demo 内容均为中文企业官网示例（公司介绍、服务列表、联系方式），并配有种子数据。

---

## 1. Payload + Next.js Demo

Payload 把 Headless CMS 与 Next.js 应用合并在同一个项目里，`/admin` 是后台、`/` 是官网前台，数据默认存 SQLite。

```bash
cd payload-demo
cp .env.example .env          # 按需修改 PAYLOAD_SECRET 等
pnpm install
pnpm dev                      # http://localhost:3000  (前台)
                              # http://localhost:3000/admin (后台)
```

首次进入 `/admin` 创建管理员账号即可在后台管理内容。生产构建：

```bash
pnpm build && pnpm start
```

## 2. Strapi + Next.js Demo

后端 Strapi 提供可视化后台与 REST/GraphQL API，前端 Next.js 通过 API 拉取内容。后端首次启动会自动**种子化**示例服务/公司信息，并开放公开读取权限。

**后端（端口 1337）：**

```bash
cd strapi-demo/backend
cp .env.example .env          # 按需修改各类 secret
pnpm install
pnpm develop                  # http://localhost:1337/admin
```

**前端（端口 3000，或自定义）：**

```bash
cd strapi-demo/frontend
cp .env.local.example .env.local   # NEXT_PUBLIC_STRAPI_URL=http://localhost:1337
pnpm install
pnpm dev                      # http://localhost:3000
```

前端在后端不可用时会自动回退到内置示例内容，页面上会标注数据来源（Strapi CMS / 内置示例）。

---

## 一键部署建议

- **Payload Demo** → Vercel（Next 原生）+ 托管数据库（Postgres）。
- **Strapi Demo** → 前端 Vercel；后端用 Coolify / Railway / 自托管，配 Postgres。

## 说明

- 各项目的真实 `.env`、`node_modules`、构建产物、SQLite 数据库文件均已在 `.gitignore` 中排除，仓库内只保留 `.env.example` 模板。
- 两个 demo 互不依赖，可单独运行。注意端口冲突：同时跑时给其中一个 Next.js 指定不同端口，例如 `pnpm dev -p 3001`。

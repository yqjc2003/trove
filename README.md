# 拾藏（CatchLinger）

个人收藏统一管理系统。把散落在各个 App、GitHub star、Chrome/Edge 收藏夹里的链接，
通过 AI Agent 解读后收敛到一个带标签、笔记、归档与阅读追踪的统一存储里。

- **后端**：Supabase（Postgres + Auth + RLS）——唯一的数据与认证后端
- **前端 / API / MCP**：Next.js 16（App Router），部署在 Vercel
- **采集**：`catchlinger-capture` Skill + MCP 服务端 + REST API

## 核心设计

Web 界面遵循 [DESIGN.md](DESIGN.md) 的「收集流 / 回看台」规范：回看台一次聚焦一条未读链接，收集流按首次收藏日期呈现来路，藏库提供可分享的检索镜头，「我的语言」维护个人标签词汇表与 Agent 连接。

### 分类即标签

系统**没有独立的分类维度**。每个用户拥有一套完全独立的标签空间：

- AI Agent 解读出什么标签就存什么标签 —— 不做语义映射、不预置分类清单
- Web 页面支持 DIY：新建 / 改名 / 删除标签，以及修改任意一条收藏的标签
- 按标签检索（可多选，AND 语义）
- 标签数量上限**按通道分层**（见下节）

Agent 采集通常选 1–2 个可聚合多篇内容的较宽标签，最多 3 个；先复用既有领域/技术栈，必要时加学习方式或场景。例如 HashMap 源码文章用 `java`、`源码阅读`，具体类名、API 等细节留在标题与摘要里。此策略在 Skill 与 MCP 工具指引中执行，服务端不做语义分类映射，历史标签不会自动改写。

另有一个自动识别的**内容形态**字段（文章 / 视频 / 仓库 / 工具 / 社交 / 文档 / 其他），
它是正交的技术维度，**不承载**「工作 / 生活 / 家庭」这类语义分类。

### 手工添加收藏（Web）

Web 端不只是只读的：`/items/new` 可以手工新建一条收藏（链接 / 标题 / 摘要 / 标签），
列表页空状态与页头都有入口；标签也可以在详情页随时增删改。

标签数量上限按**通道**分层：

| 通道 | 入口 | 数据库角色 | 标签上限 |
|---|---|---|---|
| Agent 采集 | MCP / Skill / REST（API Key） | `service_role` | ≤ **3** |
| 手工整理 | Web UI（Server Action，会话） | `authenticated` | **不限** |

两道闸一起生效：

- 应用层用 `ItemWriteOptions.maxTags` 显式传 `null` 表示放行（默认是 3）
- 数据库层用 `auth.role()` 分流 —— `service_role` 限 3，`authenticated` 直接放行

> REST 即便带着会话 Cookie 也仍按程序化通道处理（上限 3）：Web UI 走 Server Action，
> 才是那条「不限数量」的通道。

### AI 解读在 Agent 侧

服务端不持有任何 LLM 凭据，也不抓取网页正文（因此没有 SSRF 面）。
流程是：

```
Agent 取 URL 列表  →  Agent 抓正文  →  Agent 自己产出 title/summary/≤3 tags  →  写入 API
```

所以 Skill 与 MCP 的职责边界很清楚：它们负责「搬运」和「校验」，理解内容是 Agent 的事。

### GitHub star 免 Token 采集

读 star 列表用 GitHub 的**公开端点** `GET /users/{username}/starred`，**不需要 GITHUB_TOKEN**。

那 username 从哪来？CatchLinger 用 GitHub OAuth 登录时，Supabase 已经把 GitHub 资料
（`user_name` / `preferred_username`）写进了 `auth.users`。服务端在
`GET /api/trove/account` 里把它交出来，Skill 拿着已有的 API Key 就能自取：

```
node scripts/github-stars.mjs --limit 50
→ { mode: "public-user", user: "…", username_source: "catchlinger-account", stars: [...] }
```

所以采集 star **只需要配 `CATCHLINGER_API_BASE` + `CATCHLINGER_API_KEY`**，用户什么都不用额外配。
`GITHUB_TOKEN` 仍然可选：配了配额从 60 次/小时提到 5000 次/小时，也能读私密 profile 的 star。

### 重复录入 = Upsert

同一 URL 重复录入永远只对应一条条目，写入即 upsert：

| 字段 | 没传时 | 传了时 |
|---|---|---|
| `title` / `summary` | 保留原值 | 覆盖（非空才覆盖） |
| `tags` | **完全保留原标签** | 整体替换 |
| `notes` | 不追加 | 追加一条新笔记 |
| `collected_at` / 归档状态 / 已读状态 / 点击次数 | **不变** | 仍不变 |

因此反复导入同一批书签不会让老条目永远不过期，也不会把用户主动归档的条目复活。

### 点击追踪

Web 里的原文链接先走 `/r/{id}`：按当前用户读取收藏，校验 HTTP(S) 目标后立即 **302** 跳转。
点击追踪通过响应后的后台任务执行，在同一个数据库事务里记录点击行为、累加点击数、首次点击标记已读。
统计失败或超时不阻断原文访问，服务端仅记录不含敏感请求数据的诊断日志；统计数据为尽力记录。
未登录、收藏不存在/不属于当前用户，或无法安全读取目标地址时回到站内列表，不泄露收藏链接。
MCP / Skill 打开收藏时只标记已读，不产生点击事件。

### 超期提醒

`收藏时间 > N 天`（默认 14，天数可配）且 `从未阅读`（`read_at IS NULL`）的条目
进入「待读」清单，在仪表盘与 `/reminders` 页展示。

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env.local     # 填入 Supabase URL / publishable key / secret key / pooler 连接串

# 3. 初始化数据库
pnpm db:push                   # 读 .env.local 的 SUPABASE_DB_URL，逐文件事务化应用 db/migrations/*.sql
#   或：把 db/migrations/0001_init.sql 粘进 Supabase Dashboard → SQL Editor（幂等，可重复执行）

# 4. 本地起服务
pnpm dev
```

打开 http://localhost:3000 注册账号即可使用。注册会自动创建 profile 与**空白**的标签空间
（不预置任何标签）。

> 本机没有 Docker，无法 `supabase start` 起本地实例，schema 需要推到托管项目。
> 直连 `db.<ref>.supabase.co` 是 IPv6-only 主机，迁移走 pooler 连接串（用户名要带项目 ref）。

## 注册与登录

登录页有四种入口：

| 入口 | 什么时候用 | 说明 |
|---|---|---|
| **创建账号** | 第一次用 | 填邮箱 + 密码 → **立即登录**，不需要点确认邮件 |
| **密码登录** | 已有账号 | 直接登录；密码错时会提示去「创建账号」 |
| **邮件验证码** | 不想记密码 | 发一次性登录链接；受 Supabase 免费 SMTP 额度限制（每小时约 2 封），不常用 |
| **使用 GitHub 登录** | 可选 | 需要先在 Supabase 后台启用 GitHub provider，没启用时按钮置灰并说明原因 |

注册成功即自动创建 `profiles` 行与**空白**的个人标签空间 —— 由数据库触发器
`trove_handle_new_user`（触发器名 `trg_on_auth_user_created`）完成，不预置任何标签。

### 注册是「注册即登录」

应用侧用 service-role 直接建号并把邮箱标记为已确认（`admin.createUser`），
**不发确认邮件**，因此也不受 Supabase 免费 SMTP 每小时 2 封额度的限制
（走公开 `signUp` 会直接吃到 `429 over_email_send_rate_limit`，新用户根本注册不了）。

**取舍**：这等于放弃邮箱归属验证 —— 任何人都可以用任意邮箱注册。
个人收藏工具可以接受；哪天要开放给多用户，把这一层换回确认邮件即可
（改 `src/lib/auth/signup.ts` 的主路径）。

前提与细节：

- 注册需要 `SUPABASE_SERVICE_ROLE_KEY`（服务端专用，绝不能进前端）。没配时会
  自动退回「发确认邮件」的旧流程，不会硬失败。
- 密码少于 6 位在**应用层**就拦下，不会打到 Supabase。
- 邮箱已存在时：密码对得上直接登录；密码不对提示「已经注册过了」，
  不会覆盖或泄露已有账号。
- 上一次注册被邮件额度打断、留下「已存在但未确认」的账号时，会自动确认并登录。

### 启用 GitHub 登录（三步）

GitHub provider 在 Supabase 后台默认是关的。不配置时登录页会把按钮置灰并指出原因，
不会给用户一个必然报错的死按钮。要启用：

1. **GitHub 建 OAuth App** —— Settings → Developer settings → OAuth Apps → New OAuth App
   - Homepage URL：你的站点地址
   - Authorization callback URL：`https://sqpmotynmrpglsqvkmht.supabase.co/auth/v1/callback`
   - 记下 Client ID 与 Client Secret
2. **Supabase 开 provider** —— Dashboard → Authentication → Providers → GitHub
   - 填入 Client ID / Client Secret 并启用
3. **Supabase 加回调白名单** —— Dashboard → Authentication → URL Configuration → Redirect URLs
   - 加 `http://localhost:3000/auth/callback`（本地开发）
   - 加 `https://<你的生产域名>/auth/callback`
   - Site URL 设为生产域名

应用侧的回调落地页是 `GET /auth/callback`：浏览器走 PKCE，OAuth 回来时只带一个 `?code=`，
必须由服务端拿它换 session 再写 Cookie —— 少这个路由 OAuth 登录就必然失败。

## 部署到 Vercel

导入 GitHub 仓库后，在 Vercel 项目设置里配好环境变量再部署：

| 变量 | 值 | 说明 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<项目ref>.supabase.co` | Supabase 项目地址 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` | publishable key（可暴露给浏览器） |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` | **服务端专用**，Dashboard → Project Settings → API Keys；注册流程也要用它建号 |
| `NEXT_PUBLIC_SITE_URL` | `https://<你的生产域名>` | 生产站点地址，用于 MCP / Skill 回调与绝对链接 |

> 仓库里不写任何 key 字面量（见 AGENTS.md 约定 10）。实际取值见本地 `.env.local`
> 或 Dashboard → Project Settings → API Keys。

`SUPABASE_DB_URL` **不需要**配到 Vercel —— 它只给本地 `pnpm db:push` 用。

## 目录结构

```
db/migrations/0001_init.sql   建表 + RLS + 触发器 + RPC
scripts/db-push.mjs           迁移执行器（逐文件事务化，幂等）
src/app/                      页面（概览/收藏/详情/归档/待读/设置）+ API 路由 + MCP
src/app/r/[id]/route.ts       302 重定向 + 点击追踪
src/app/actions/auth.ts       注册 Server Action（建号 + 自动确认邮箱）
src/lib/auth/                 凭据解析、API Key、注册流程编排
src/lib/domain/               纯逻辑：URL 规范化、内容形态、标签、超期判定
src/lib/db/trove-db.ts        唯一的数据访问入口（强制 user_id 过滤）
src/lib/services/             业务逻辑（REST / MCP / Server Action 复用同一层）
src/lib/mcp/server.ts         MCP 工具注册
skills/catchlinger-capture/   Skill：SKILL.md + 6 个零依赖 Node 脚本
tests/                        Vitest 单测（离线可跑）+ 集成测试（默认 skip）
docs/                         API / MCP / Skill / 验收文档
```

## 安全模型

- 两种凭据统一解析为 `user_id + scopes`：
  - **Supabase 会话**（Web UI）—— Cookie + RLS
  - **CatchLinger API Key**（Skill / MCP / CLI）—— `trv_` 前缀，服务端只存 SHA-256 哈希
- 为什么不用 Supabase JWT 做 MCP：access_token 约 1 小时过期，而 MCP 的请求头是静态的，
  必须用长效密钥。
- 所有 service-role 数据访问收口在 `TroveDb` 一个类里，构造函数强制要求 `userId`，
  并有一条单测扫描 `src/`，断言业务表的 `.from()` 调用不出现在这个文件之外。

## 常用命令

```bash
pnpm dev          # 开发服务器
pnpm build        # 生产构建
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
pnpm test         # Vitest 单测
pnpm db:push      # 推送数据库迁移
pnpm skill:install  # 把 Skill 装到 ~/.agents/skills/（Codex 用户级全局目录）
```

## 接入方式

| 方式 | 端点 | 认证 |
|---|---|---|
| Web | `https://<你的生产域名>/` `/items` `/items/new` `/items/[id]` `/archive` `/reminders` `/settings` | Supabase 会话 |
| REST | `https://<你的生产域名>/api/trove/*` | `Authorization: Bearer <trv_key>` |
| MCP | `https://<你的生产域名>/api/mcp` | `Authorization: Bearer <trv_key>` |

详见 [docs/api.md](docs/api.md)、[docs/mcp.md](docs/mcp.md)、[docs/skill.md](docs/skill.md)。

## 许可证

Apache-2.0

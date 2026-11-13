# AGENTS.md — trove 开发约定

给后续在这个仓库里干活的 Agent（以及人类贡献者）的约定与关键约束。

## 硬性约束

1. **不引入 Docker / `supabase start` / bun / deno** —— 本机没有，且方案已定：
   后端是 Supabase 托管项目，运行时是 Node。
2. **MCP 包不要装错**：`mcp-handler@2` 必须配 `@modelcontextprotocol/server@2` + `zod@4`。
   装 `@modelcontextprotocol/sdk`（1.x）是错的 —— 那不是同一个包。
3. **分类即标签**：不要新增 `categories` 表、不要新增独立的分类字段、
   不要在服务端做标签→分类映射。`content_type` 只承担技术维度。
4. **AI 解读在 Agent 侧**：服务端不引入任何 LLM 依赖、不抓网页正文。
5. **URL scheme 白名单**：只接受 http/https；`/r/[id]` 只 302 到 http(s)。
6. **标签上限按通道分层**：Agent 通道（MCP / Skill / REST，API Key）每个收藏至多 3 个，
   Web 手工通道（会话）不限。应用层用 `ItemWriteOptions.maxTags`（`null` = 不限），
   数据库层用 `auth.role()` 分流（`service_role` 限 3，`authenticated` 放行）。
7. **`collected_at` 不可被 upsert 覆盖**：`trove_upsert_item` 的 `on conflict do update`
   不含该列（也不含 status / archived_at / read_at / click_count / url）。
8. **UI 保持极简**：不要渐变、发光、阴影卡片、逐条淡入、网格背景。
   用发丝线和字号层级做层级，大留白。
9. **日志卫生**：不打印 API Key / JWT / `authInfo.token`；Key 只记录 `prefix`。
10. **密钥只进 `.env.local`**（已被 gitignore），绝不提交。
11. **不要用 `current_setting('request.jwt.claim.role')` 判断角色** —— PostgREST 只设
    `request.jwt.claims`（整段 JSON），不设单个 claim 的 GUC，那个写法永远拿到 NULL。
    一律用 `auth.role()` / `auth.uid()`。
12. **注册必须走 Server Action + service-role**（`src/app/actions/auth.ts`）：
    service-role key 绝不能出现在浏览器端。注册逻辑与接线在
    `src/lib/auth/signup.ts`，应用层与集成测试共用同一份 `buildSignUpDeps`，
    不要在两边各写一套。

## Supabase 实测要点（踩过的坑，别再踩）

这几条都是在真实托管项目上验过的，改 SQL 前先看一眼：

- **SECURITY DEFINER RPC 是双通道的**：`trove_upsert_item` / `trove_replace_item_tags`
  同时授予 `authenticated` 与 `service_role`。函数内按 `auth.role()` 分流：
  `authenticated` 一律用 `auth.uid()` 并**忽略传入的 `p_user_id`**（防跨用户写），
  其它（service_role）才信任 `p_user_id`。
- **Supabase 对 public schema 有默认权限**：新表默认授 anon 全量表权限，
  新函数默认授 anon EXECUTE。`revoke ... from public` **不够**，
  必须显式 `revoke ... from public, anon`。
- **PostgREST 的 schema 缓存是懒加载**：新建/替换函数后若报
  `PGRST202 Could not find the function ... in the schema cache`，
  执行 `notify pgrst, 'reload schema';`（迁移文件末尾已带这一句）。
- **直连 `db.<ref>.supabase.co` 是 IPv6-only**（RFC 8482 空 AAAA 记录），
  IPv4 环境连不上。走 pooler：用户名必须带项目 ref（`postgres.<项目ref>`），
  否则报 `no tenant identifier provided`。
- **手写 `auth.users` 行会被 GoTrue 拒绝**：`500: Database error querying schema`
  的真因是 `confirmation_token` 等字符串列是 NULL 而不是空串。
  详见 <https://supabase.com/docs/guides/troubleshooting/database-error-saving-new-user>。
  最省事的做法还是走 Auth API 注册 + 在 Dashboard 里开自动确认。

### 认证 / 注册的实测要点

- **`mailer_autoconfirm` 改不了**（GoTrue 配置走平台环境变量，Postgres 侧改不了；
  `auth.instances` 表是空的且只在多实例模式生效）。想在托管项目上免确认邮件，
  只能走 Management API（需要 Personal Access Token）或应用侧自己确认。
- **免费 SMTP 每小时只有 2 封额度**：托管项目默认 `mailer_autoconfirm = false`，
  公开 `POST /auth/v1/signup` 会发确认邮件，额度耗尽后直接返回
  `429 over_email_send_rate_limit`——**新用户根本注册不了**。
- **注册改用 `admin.auth.admin.createUser({ email, password, email_confirm: true })`**：
  它不发任何邮件，因此不受 SMTP 额度限制；实测建号即 `email_confirmed_at` 已填，
  签发的 JWT `role` 仍是 `authenticated`，RLS 行为与公开注册完全一致。
- **admin 建号不校验邮箱域名**：公开 `signUp` 会拒 `example.com` / 无 MX 的域
  （`email_address_invalid`），`admin.createUser` 会照收。应用侧已接受
  「不做邮箱归属验证」这个取舍，见 README 的「注册是『注册即登录』」。
- **GoTrue 的错误码要按 `error_code` 判，别只看 `msg`**：
  - 邮箱已存在 → `email_exists`（422，msg 是
    `A user with this email address has already been registered`）
  - 密码太短 → `weak_password`（422，msg 是 `Password should be at least 6 characters.`）
  - 密码对但邮箱没确认 → `email_not_confirmed`（400，msg 是 `Email not confirmed`）
  - 邮件额度耗尽 → `over_email_send_rate_limit`（429）
- **「已存在但未确认」的账号要能自愈**：用 `admin.auth.admin.listUsers({ page, perPage })`
  按邮箱找回 id，再 `updateUserById(id, { email_confirm: true })` 就能登录。
- **GoTrue 防枚举**：对「已存在且已确认」的邮箱，公开 `signUp` 返回 200 但
  **既没有 user 也没有 session**，不能当成「注册成功」。

## 数据访问收口

`src/lib/db/trove-db.ts` 是**唯一**允许出现业务表 `.from()` 的地方
（`items` / `notes` / `tags` / `item_tags` / `click_events` / `api_keys` / `profiles`）。
构造函数强制要求 `userId`，缺失即抛 `SCOPED_CLIENT_REQUIRES_USER_ID`。

`tests/unit/trove-db-scope.test.ts` 会扫描 `src/` 断言这条规则不被破坏。
新增表访问时，请加到 `TroveDb` 里，而不是在 service 层直接 `.from()`。

## 分层

```
路由 / MCP 工具 / Server Action
        ↓
src/lib/services/*        业务逻辑与校验（REST / MCP / Action 复用同一层）
        ↓
src/lib/domain/*          纯函数：URL 规范化、内容形态、标签、超期判定
        ↓
src/lib/db/trove-db.ts    唯一数据访问入口
```

`src/lib/domain/` 必须是**纯函数**——不碰网络、不碰数据库，这样能离线跑单测。

`src/lib/auth/` 是认证专用的一层（凭据解析、API Key、注册编排），
同样遵守「依赖注入、离线可测」，不直接 `.from()` 业务表。

## GitHub star 采集（免 Token）

读 star 列表走 GitHub 的**公开端点** `GET /users/{username}/starred`，
**不需要 GITHUB_TOKEN**。username 由服务端提供：

```
auth.users.raw_user_meta_data（GitHub OAuth 写入）
        ↓  src/lib/auth/github-identity.ts（纯函数 extractGithubIdentity，可离线单测）
       fetchGithubIdentity(userId)（service-role，只按当前 user id 查）
        ↓  src/lib/services/account.ts
   GET /api/trove/account → { github_username, ... }
        ↓
   Skill: github-stars.mjs → GET /users/{username}/starred
```

- **不要**要求用户配 `GITHUB_TOKEN` —— CatchLinger 用 GitHub OAuth 登录时服务端已经知道 username，
  Skill 手里有 API Key 就能自取（`username_source="catchlinger-account"`）。
- `GITHUB_TOKEN` 只是**可选加速器**：配额 60/h → 5000/h，且能读私密 profile 的 star。
- `GITHUB_TOKEN` 只在 GitHub API 调用里用，**绝不写进仓库或 `.env.local`**；
  真要长期配就放 `~/.config/catchlinger/env`。
- 公开端点对私密 profile 返回**空列表**（不是 404）—— 遇到 0 条要提示「可能是私密 profile」。
- 抓仓库详情（`fetch-content.mjs` 遇 GitHub 链接走 API）**每个仓库消耗一次配额**，
  star 多时建议配 token。

## 注册流程

```
浏览器 → POST /login（Server Action：signUpAction）
          ↓  薄壳：取客户端、算 emailRedirectTo、校验密码长度
       buildSignUpDeps（src/lib/auth/signup.ts）
          ↓  把真实客户端接成 SignUpDeps（应用层与集成测试共用同一份接线）
       runSignUp（src/lib/auth/signup.ts）
          ↓  纯编排，deps 注入，离线可单测
       Supabase
```

- **主路径**：`admin.createUser({ email_confirm: true })` → `signInWithPassword` → 写 Cookie。
  不发确认邮件，因此不受 SMTP 额度限制。
- **兜底**（没配 service-role）：公开 `signUp` → 必要时
  `updateUserById(id, { email_confirm: true })` → `signInWithPassword`。
- **别把 `admin.createUser` 换成公开 `signUp`**：托管项目的免费 SMTP 每小时 2 封，
  额度一耗公开注册就 429，等于注册功能不可用。

## Upsert 语义

重复录入走 upsert，字段级规则见 README 的表格。实现要点：

- 应用层组装 `p_payload` 时，**未提供的字段一律不写 key**。数据库侧用
  `p_payload ? 'field'` 判断「本次是否显式提供了该字段」。
- 写入顺序是「先校验、后写」：先归一 + 校验标签数量，通过了才调
  `trove_upsert_item`，避免出现「标题已更新但标签没生效」的中间态。
- 标签整体替换走 `trove_replace_item_tags`（先校验归属与数量，再清旧绑定再插新绑定）。

## 测试

- Vitest，单测必须**离线可跑**，不依赖网络或数据库。
- 需要真实数据库的测试放 `tests/integration/`，默认 skip，
  需 `TROVE_TEST_*` 环境变量才启用：
  - `TROVE_TEST_APP_URL` —— 应用地址（REST API 基址）
  - `TROVE_TEST_SUPABASE_URL` / `TROVE_TEST_ANON_KEY` / `TROVE_TEST_SERVICE_KEY`
  - `TROVE_TEST_EMAIL` / `TROVE_TEST_PASSWORD` —— 会话通道用（`session.test.ts`）
  - `TROVE_TEST_KEY` / `TROVE_TEST_KEY_B` —— API Key 通道用（`supabase.test.ts`）
  - 注册通道（`signup.test.ts`）只要上面那组
    `TROVE_TEST_SUPABASE_URL` / `TROVE_TEST_ANON_KEY` / `TROVE_TEST_SERVICE_KEY`
- service 层测试用 `tests/helpers/fake-db.ts` 的 `FakeTroveDb`。
  它的 upsert 语义严格照抄 SQL（`p_payload ? 'field'` → 只覆盖显式出现的字段），
  改动时两边要同步。

## 数据库迁移

`pnpm db:push` → `scripts/db-push.mjs`：读 `.env.local` 里的 `SUPABASE_DB_URL`
（Supabase pooler 连接串），按文件名顺序把 `db/migrations/*.sql` 逐个应用，
**每个文件一个事务**，失败即回滚；已应用过的文件按 checksum 跳过，
文件内容变了则重新应用（迁移本身是幂等的）。

台账表：`public.trove_schema_migrations`（基础设施表，不进 `TroveDb`）。

## 质量门禁

每完成一个阶段跑：

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## 命令行与脚本

- Windows PowerShell 5.1：`.ps1` 脚本必须存成 **UTF-8 with BOM**，
  否则中文会被按 ANSI 读取导致解析错误。
- Skill 脚本（`skills/catchlinger-capture/scripts/*.mjs`）是零依赖 Node ESM，
  只用内置 API，不参与 Next 构建（已在 eslint 与 tsconfig 中排除）。

## 提交信息

中文 conventional commits，例如：

```
feat(items): 支持按标签检索
fix(redirect): 点击追踪失败时不再吞掉错误
chore(deps): 升级 mcp-handler 到 2.x
```

**完成修改后自动 commit 并 push** —— 用户已授权本仓库在质量门禁通过后自动提交和推送，无需重复确认。只提交本次任务的改动，保留无关的未提交修改；提交信息使用中文 conventional commits。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

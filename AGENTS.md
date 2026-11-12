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
6. **标签 ≤3**：应用层校验 + 数据库触发器（含 advisory lock）双重保险。
7. **`collected_at` 不可被 upsert 覆盖**：`trove_upsert_item` 的 `on conflict do update`
   不含该列（也不含 status / archived_at / read_at / click_count / url）。
8. **UI 保持极简**：不要渐变、发光、阴影卡片、逐条淡入、网格背景。
   用发丝线和字号层级做层级，大留白。
9. **日志卫生**：不打印 API Key / JWT / `authInfo.token`；Key 只记录 `prefix`。
10. **密钥只进 `.env.local`**（已被 gitignore），绝不提交。
11. **不要用 `current_setting('request.jwt.claim.role')` 判断角色** —— PostgREST 只设
    `request.jwt.claims`（整段 JSON），不设单个 claim 的 GUC，那个写法永远拿到 NULL。
    一律用 `auth.role()` / `auth.uid()`。

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
- Skill 脚本（`skills/trove-capture/scripts/*.mjs`）是零依赖 Node ESM，
  只用内置 API，不参与 Next 构建（已在 eslint 与 tsconfig 中排除）。

## 提交信息

中文 conventional commits，例如：

```
feat(items): 支持按标签检索
fix(redirect): 点击追踪失败时不再吞掉错误
chore(deps): 升级 mcp-handler 到 2.x
```

**推送前先问用户** —— 本仓库没有「改完直接 push」的授权。

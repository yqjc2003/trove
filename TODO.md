# Trove 未来功能规划（TODO）

> 更新时间：2026-11-13 · 状态：进行中
> 本文只列**尚未实现**的能力。已实现的部分见 [README.md](README.md) 与 [DESIGN.md](DESIGN.md)。
> 每条都标注了与 [AGENTS.md](AGENTS.md) 硬性约束的关系——**凡是冲突的，先改约束再动代码**，
> 否则代码和文档会各说各话。

## 0. 路线图总览

| # | 主题 | 优先级 | 依赖 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | 收藏导出：CSV + Google 书签栏 HTML | P0 | — | 待开发 |
| 2 | AI MaaS 配置与服务端 AI 解读通道 | P0 | 1（可并行） | 待开发 |
| 3 | 导入向导扩展（CSV / 多来源）+ 导入报告 | P1 | 1（共用导出格式知识） | 待开发 |
| 4 | 全文检索（从子串匹配升级到全文索引） | P1 | — | 待开发 |
| 5 | 采集批次日志与导入回执 | P1 | — | 待开发 |
| 6 | 坏链检查 | P1 | 5（复用任务调度） | 待开发 |
| 7 | 统计全量聚合 | P1 | — | 待开发 |
| 8 | 持久化 snooze 与「今日一条」 | P1 | — | 待开发 |
| 9 | 标签批量整理（用户主动合并） | P1 | — | 待开发 |
| 10 | RSS / 邮件转发入口 | P1 | 需先定授权与隐私策略 | 待评估 |
| 11 | 浏览器扩展与一键保存 | P2 | 1（导出格式可复用） | 待评估 |
| 12 | 只读公开分享链接 | P2 | — | 待评估 |
| 13 | 高亮与离线副本 | P2 | 版权策略待定 | 待评估 |
| 14 | 移动端 PWA / Share Sheet | P2 | 11 | 待评估 |
| 15 | 知识库问答（带出处引用） | P2 | 2、4 | 待评估 |
| 16 | 图片 / PDF / OCR | P2 | — | 待评估 |
| 17 | 视频 / 播客转录 | P2 | 成本与版权评估后做 | 待评估 |

优先级口径与 [docs/market-positioning.md](docs/market-positioning.md) 对齐：
**P0** = 种子客户可感知，**P1** = 留存与迁移，**P2** = 知识库扩展。

---

## P0 — 下一批要做

### 1. 收藏导出：CSV + Google 书签栏 HTML

#### 现状

- `src/app/api/trove/export/route.ts` 只有一个 `GET`，固定返回 `ctx.db.exportAll()` 的 JSON。
- `src/lib/db/trove-db.ts:571` 的 `exportAll()` 返回 `profile / tags / items / notes / click_events`，
  但 **items 不带 tags**——`item_tags` 的关联关系没有导出。现在的 JSON 导出实际上丢了
  「哪条收藏挂了哪些标签」，导入回来只能按 URL 匹配重建标签。**这条要在本次一并修掉。**
- `src/app/settings/page.tsx:89` 设置页只有一个「导出 JSON」链接。
- `src/components/ImportBookmarks.tsx` 只支持 Netscape HTML 与 CatchLinger JSON 两种导入。

#### 目标

- `GET /api/trove/export?format=csv | html | json`，默认 `json`（保持向后兼容）。
- **CSV**：给 Excel / Numbers 做表格分析与离线备份。
- **HTML**：Netscape Bookmark 格式，**Google 书签栏可直接导入**（Chrome / Edge / Firefox 同样能吃）。
- 范围两种：**全量** 与 **当前藏库筛选结果**。

#### 设计要点

1. **响应形态**：`withAuth` 固定返回 JSON 信封（`src/lib/http.ts:60`），文件下载必须拿到原始
   `Response`。新增 `withAuthRaw(req, handler)`：handler 直接返回 `Response`，异常仍走 `fail()`。
2. **筛选复用**：藏库页的筛选本来就写在 URL 里（DESIGN.md §5「筛选写入 URL」）→ 导出接口接受
   **同一套 query 参数**（`q` / `domain` / `tags` / `content_type` / `source` / `status` / `read` /
   `overdue` / `collected_from` / `collected_to` / `sort` / `order`），复用 `listItems` service，
   **绝不另写一套过滤逻辑**。
3. **分页拉取**：`listItems` 默认 `limit` 是 50，导出必须循环分页（每页 200）取完，不能一次拉全量。
4. **CSV 细节**：
   - UTF-8 **带 BOM**——Excel 不认 BOM 会中文乱码，这是最常见的踩坑点。
   - 列：`title, url, domain, tags, summary, content_type, source, source_ref, status,
     collected_at, read_at, click_count, notes`
   - `tags` 用 `;` 连接；多条 `notes` 用 `\n---\n` 连接。
   - **CSV 注入防护**：单元格以 `=` `+` `-` `@` 开头时前置单引号 `'`。
   - 字段用双引号包裹，内部 `"` 转义成 `""`。
5. **HTML（Netscape Bookmark）细节**：
   ```html
   <!DOCTYPE NETSCAPE-Bookmark-file-1>
   <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
   <TITLE>Bookmarks</TITLE>
   <H1>Bookmarks</H1>
   <DL><p>
   <DT><A HREF="..." ADD_DATE="1700000000">Title</A>
   </DL><p>
   ```
   - `ADD_DATE` = `collected_at` 的 Unix 秒。
   - 标题与 URL 必须 HTML 转义（`&` `<` `>` `"`）——标题里出现 `&` 极其常见。
   - **本期做扁平结构**（已决策）：不按标签生成文件夹层级。
   - 导入行为说明：Google 会把条目放进「书签栏」下以文件名命名的新文件夹。
6. **标签关联修复**：`exportAll()` 补上 item → tags（批量走 `getTagsForItems`），
   JSON / CSV / HTML 三种格式都要带标签。
7. **i18n**：设置页文案与导出文件名进 `src/lib/i18n.ts`。

#### 改动清单

| 文件 | 改动 |
| --- | --- |
| `src/app/api/trove/export/route.ts` | 加 `format` 参数与三种响应分支 |
| `src/lib/http.ts` | 新增 `withAuthRaw` |
| `src/lib/services/export.ts` | **新增**：`buildCsv` / `buildBookmarkHtml` / `collectItems`（纯函数，离线可单测） |
| `src/lib/db/trove-db.ts` | `exportAll()` 补 item → tags 关联 |
| `src/app/settings/page.tsx`、`src/lib/i18n.ts` | 三个导出入口与文案 |
| `src/app/items/page.tsx` | 藏库页「导出当前镜头」 |
| `tests/unit/export.test.ts` | **新增**（CSV 转义、HTML 转义、BOM、筛选复用、空库） |

#### 验收标准

- [ ] CSV 用 Excel / Numbers 打开中文不乱码（确认带 BOM）。
- [ ] 以 `=` 开头的标题导出后不被当成公式执行。
- [ ] HTML 导入 Google 书签栏成功，条目数与导出数一致。
- [ ] 带 `&` 的标题在 HTML 里正确转义，导入后显示正常。
- [ ] 「导出当前筛选」的结果条数与页面上看到的完全一致。
- [ ] CSV 每行都带自己的标签（关联不再丢）。
- [ ] 空库导出不报错，产出带表头的空文件。
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 全绿。

#### 待定

- CSV 是否默认包含 `notes`（可能含私密内容）→ 倾向默认包含，设置页给一个「不含笔记」开关。
- 是否给 HTML 加标签文件夹层级 → **本期已决策不做**，留作后续小增强。

---

### 2. AI MaaS 配置与服务端 AI 解读通道

#### 本次已定的前提

**Agent 抓正文，服务端只转发。** 服务端不主动抓网页正文，保留「无 SSRF 面」这条属性——
这是 AGENTS.md 约束 #4 的核心价值，不因为要加 AI 就丢掉。

> ⚠️ **但必须诚实说明：新增 AI 通道会引入一个新的出网面。**
> 服务端会向**用户自己配置的** MaaS `base_url` 发请求。这个面和「服务端抓网页正文」的 SSRF 面
> 不是一回事，但同样需要防护（见下面「base_url 安全校验」）。**这是本次改动唯一的
> 新增攻击面，必须单独设闸。**

#### 现状

- 服务端完全没有 LLM 相关代码，AGENTS.md 约束 #4 写死「服务端不引入任何 LLM 依赖、不抓网页正文」。
- `src/lib/mcp/server.ts:118` 的 `AI_GUIDANCE` 明确告诉 Agent「AI 解读由调用方负责」。
- Skill 侧靠 `skills/catch-and-linger/scripts/fetch-content.mjs` 抓正文，由 Agent 自己产出
  title / summary / tags。

#### 目标

- 用户可配置自己的 **AI MaaS**（OpenAI 兼容接口），支持：
  - **新增时**自动生成 summary + tags；
  - **对现有数据**批量生成 summary + tags。
- 两条解读路径**并存**：Agent 自己解读（原路径，默认）／ Agent 传正文给服务端解读（新增，可选）。

#### 设计要点

**A. 配置模型**

新表 `ai_providers`（`db/migrations/0002_ai.sql`，幂等）：

```sql
create table if not exists public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  provider text not null default 'openai-compatible',
  base_url text not null,
  model text not null,
  api_key_ciphertext text not null,
  api_key_hint text not null,
  enabled boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ai_providers_user_name_idx on public.ai_providers(user_id, name);
```

- RLS：`auth.uid() = user_id`；**显式 `revoke ... from public, anon`**（AGENTS.md 实测要点：
  Supabase 对 public schema 有默认权限，只 revoke public 不够）。
- 触发器 `trg_ai_providers_touch_updated_at`。
- **密钥加密**：应用层 **AES-256-GCM**（Node 内置 `crypto`，零新依赖），密钥来自
  `AI_KEY_ENCRYPTION_SECRET`（32 字节 base64）环境变量，**只进 `.env.local`，绝不提交**。
  存储格式 `iv:tag:ciphertext`。
- **密钥卫生**：库里不存明文（连 service_role 也读不到明文）；接口只回显 `api_key_hint`（末 4 位）；
  日志只记 provider 名与模型，**绝不记 key / 完整 URL query**（AGENTS.md 约定 9）。
- 新增环境变量：`AI_KEY_ENCRYPTION_SECRET`（必填）、`AI_REQUEST_TIMEOUT_MS`（默认 30000）。

**B. Provider 兼容性**

- 第一版只做 **OpenAI 兼容**：`POST {base_url}/chat/completions`，
  body `{ model, messages, temperature, response_format: { type: 'json_object' } }`。
- 一套协议覆盖：OpenAI / DeepSeek / 通义 / 智谱 / Kimi / OpenRouter / SiliconFlow /
  Ollama / vLLM。
- Anthropic 原生协议放 P1。
- **不引入任何 LLM SDK**——直接 `fetch`，保持依赖为零。

**C. `base_url` 安全校验（新增硬约束）**

- 只允许 `https`；本地 Ollama（`http://localhost` / `127.0.0.1`）需显式开关才放行。
- 解析主机名后拒绝：**回环 / 私有网段 / 链路本地 / 云元数据**（`169.254.169.254`）。
- **每次调用前重新解析**（防 DNS rebinding）。
- 响应体大小上限 + 硬超时。

**D. 解读链路**

```
Agent 抓正文 → content_excerpt
   ↓  POST /api/trove/ai/enrich  { items: [{ url, title, content_excerpt }] }
服务端：校验 → 取用户默认 provider → 调 MaaS → { summary, tags[] }
   ↓  写回：summary（≤1000）+ tags（≤3，走 trove_replace_item_tags，origin='agent'）
```

- 新增 `src/lib/domain/ai-prompt.ts`：**纯函数**——拼提示词 + 解析模型返回的 JSON，
  离线可单测（符合 `src/lib/domain/` 必须是纯函数这条约定）。
- 新增 `src/lib/services/ai.ts`：`enrichItems`（批量，逐条独立失败）+ `callMaaS`（网络层，
  依赖可注入便于单测）。
- 提示词沿用 [docs/skill.md](docs/skill.md) 的输出语言规则：跟随用户语言；技术名保留原名；
  `summary` 写「说明主题 / 主要内容 / 用途」，**不写采集日志**；`tags` 1–2 个、最多 3 个，
  **优先复用用户已有标签**（把现有标签列表喂进提示词）。
- 成本控制：`content_excerpt` 截断到约 4000 字符；单批条数上限；用户可设「本次最多处理 N 条」。

**E. 不覆盖用户编辑**（重要，默认行为）

- `summary` 已存在且是用户手填 → **默认不覆盖**（显式 `force: true` 才覆盖）。
- 该条目已有 `origin='user'` 的标签 → **不整体替换**，改为合并 AI 建议的新标签。
- 写回仍走现有 `trove_upsert_item` / `trove_replace_item_tags`，遵守 upsert 语义
  （`collected_at` / `status` / `read_at` / `click_count` 不被覆盖）。

**F. 对现有数据的批量增强**

- 新表 `ai_enrich_jobs`：`user_id, item_id, status(pending|running/done/failed/skipped),
  reason, updated_at`。
- MCP 工具 `catchlinger_list_pending_enrich` + `catchlinger_submit_enrich`；
  REST 端点 `POST /api/trove/ai/enrich`。
- 流程：用户在藏库勾选条目 → 服务端建 pending job → Agent（MCP / Skill）拉清单 →
  抓正文 → 提交 → 服务端调 MaaS 写回 → 回写 job 状态。
- **采集路径天然可用**：Skill 采集时带上 `content_excerpt`，服务端直接增强。

**G. UI**

- 设置页新增「AI 解读」区：provider 列表、新增 / 编辑 / 删除、**测试连接**、设为默认、
  输出语言偏好。
- 藏库页「AI 增强」批量入口 + 进度反馈。
- 详情页「用 AI 重新生成摘要和标签」。

#### 改动清单

| 文件 | 改动 |
| --- | --- |
| `db/migrations/0002_ai.sql` | **新增**：`ai_providers` / `ai_enrich_jobs` + RLS + revoke + 触发器 |
| `src/lib/domain/ai-prompt.ts` | **新增**：提示词拼装与模型输出解析（纯函数） |
| `src/lib/services/ai.ts` | **新增**：`enrichItems` / `callMaaS` / `base_url` 校验 |
| `src/lib/db/trove-db.ts` | 新增两个表的读写方法（**唯一允许出现 `.from()` 的文件**） |
| `src/app/api/trove/ai/enrich/route.ts` | **新增**：批量增强端点 |
| `src/lib/mcp/server.ts` | 新增两个 MCP 工具；改写 `AI_GUIDANCE` 文案 |
| `src/app/settings/page.tsx` | 「AI 解读」配置区 |
| `src/app/items/page.tsx`、`src/app/items/[id]/page.tsx` | 批量增强 / 单条重新生成入口 |
| `src/types/index.ts` | `AiProvider` / `AiEnrichJob` 类型 |
| `tests/unit/ai-prompt.test.ts`、`tests/unit/ai-provider.test.ts` | **新增**（离线） |

#### 必须同步修改的既有约定

**先改文档，再改代码**，否则代码和文档各说各话：

- [ ] `AGENTS.md` 约束 #4：「服务端不引入任何 LLM 依赖、不抓网页正文」
  → 改为「服务端不抓网页正文；LLM 调用是**可选的、用户自带 key 的转发通道**」。
- [ ] `README.md`：「服务端不持有任何 LLM 凭据」
  → 改为「默认不持有；开启 AI 解读后由用户自带 key，服务端只做转发」。
- [ ] `src/lib/mcp/server.ts` 的 `AI_GUIDANCE`：说明两种解读模式并存。
- [ ] `skills/catch-and-linger/SKILL.md`：同步新增的「传正文给服务端解读」路径。
- [ ] `docs/api.md` / `docs/mcp.md`：补新端点与工具。
- [ ] `.env.example`：补 `AI_KEY_ENCRYPTION_SECRET` / `AI_REQUEST_TIMEOUT_MS`。

#### 验收标准

- [ ] 服务端代码里搜不到任何 LLM SDK 依赖（只有 `fetch`）。
- [ ] 未配置 provider 时，采集与保存路径**行为完全不变**（不报错、不阻断）。
- [ ] `base_url` 指向 `http://169.254.169.254/` 或 `http://10.0.0.1/` 时被拒绝并给出明确原因。
- [ ] 接口响应、日志、错误消息里搜不到 API Key 明文。
- [ ] 用户手填的 `summary` 与 `origin='user'` 的标签不会被 AI 覆盖（除非显式 `force`）。
- [ ] AI 生成的标签数量 ≤ 3，写回后 `origin='agent'`。
- [ ] `collected_at` / `read_at` / `click_count` 在 AI 写回后保持不变。
- [ ] 单元测试离线可跑，不触网。
- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 全绿。

#### 待定决策

- 平台是否代持共享 MaaS key → 倾向**不做**，避免服务端变成公共代理。
- Anthropic 原生协议 → 放 P1。
- 是否支持本地 Ollama（http）→ 倾向支持，但要显式开关。

---

## P1 — 留存与迁移

### 3. 导入向导扩展（CSV / 多来源）+ 导入报告

- **现状**：`ImportBookmarks.tsx` 只认 Netscape HTML 与 CatchLinger JSON；上限 500 条。
- **目标**：支持 CSV（Raindrop / Chrome bookmarks CSV / Pocket CSV / 通用 `url,title,tags`）、
  导入前预览、导入报告（新增 / 更新 / 失败数、失败原因、标签复用情况）。
- **复用**：与 #1 的 CSV 解析规则对称，两边共用一套 CSV 读写工具。
- **注意**：`mode='replace'` 会先 `deleteAllItems()` 清空当前用户全部收藏——导入向导要二次确认。

### 4. 全文检索

- **现状**：`trove-db.ts` 的 `sanitizeSearchTerm` + `or(title.ilike, summary.ilike, url.ilike)`
  只是子串匹配，命中不了正文。
- **目标**：摘要 / 正文 / 笔记的全文检索。
- **方案**：`pg_trgm` + GIN 索引（托管项目一般可 `create extension`），中文先走 trigram 近似匹配；
  中文分词（pg_jieba 等）需要 superuser，托管项目未必能给权限——**务实路径是先 trigram，
  语义 / 向量检索放 P2**。
- **诚实性**：界面上要写清「关键词匹配，不伪装成语义问答」（DESIGN.md §5）。

### 5. 采集批次日志与导入回执

- **依据**：DESIGN.md §4 明确——只有持久化采集日志后，才可以提供批次回执；不能用 `updated_at`
  推断导入历史。
- **目标**：新表 `import_batches` + `items.batch_id`；回执展示新增 / 更新 / 失败数、失败原因、
  标签复用情况、字段变更。
- **约束**：重复采集**不得**刷新 `collected_at`。

### 6. 坏链检查

- **目标**：定时检测收藏 URL 可达性，标记失效链接。
- **方案**：Vercel Cron + `link_checks` 表；HEAD 优先、GET 回退；限速；结果在藏库里可见。
- **注意**：抓取行为要遵守 robots 与频率限制，别把用户站点打成灾。

### 7. 统计全量聚合

- **现状**：`getStats` 只取最近 200 条（`src/lib/services/reminders.ts:38`），
  DESIGN.md §3 已声明「全量聚合属于后续数据层改进」。
- **目标**：DB 侧聚合（视图或 RPC），统计口径与界面标注一致。

### 8. 持久化 snooze 与「今日一条」

- **现状**：回看台的「稍后再看」只在本次挂载的回看会话里跳过，**不写数据库**。
- **目标**：`items.snoozed_until` 字段 + 「今日一条」固定推荐位。
- **红线**：snooze **不得**改 `collected_at`——否则超期判定会漂。

### 9. 标签批量整理（用户主动触发）

- **现状**：Skill 侧有 `skills/catch-and-linger/data/tag-aliases.json`，服务端没有。
- **目标**：用户显式把 A 合并到 B（保留 B、解绑 A、条目标签不变）。
- **红线**：这是**用户操作**，不是服务端自动映射——AGENTS.md 约束 #3「分类即标签，不做服务端
  标签→分类映射」依然成立。历史标签不会自动改写。

### 10. RSS / 邮件转发入口

- 邮件转发要先定授权与隐私策略（收件箱、发信域名、退订），不能先写代码再补合规。

---

## P2 — 知识库扩展

### 11. 浏览器扩展与一键保存

- Chrome + Edge 扩展，一键存当前页；扩展可复用 #1 的导出格式知识。
- 浏览器扩展的登录走 OAuth 授权码 + PKCE，不要塞长期 API Key。

### 12. 只读公开分享链接

- 分享一个集合的只读链接；**默认不含笔记**，含笔记要显式勾选。

### 13. 高亮与离线副本

- 先做高亮；离线副本涉及整页存储，**版权与授权策略必须先定**（market-positioning P1）。

### 14. 移动端 PWA / Share Sheet

- 先 PWA（可分享到系统分享面板），再考虑原生。

### 15. 知识库问答（带出处引用）

- 依赖 #2（AI 通道）与 #4（全文检索）。每个结论必须能点回原文出处。

### 16. 图片 / PDF / OCR

### 17. 视频 / 播客转录

- 成本与版权评估后再做；服务端仍不主动抓正文（约束 #4）。

---

## 技术债（可以搭车做）

- [ ] **导出 JSON 丢失 item ↔ tag 关联**——见 #1，已列入本次。
- [ ] `getStats` / `listReminders` 的 200 条上限——见 #7。
- [ ] `/api/trove/export` 没有格式参数——见 #1。
- [ ] `MCP` 与 `Skill` 的错误码各写一套，未收敛到 `src/lib/domain/errors.ts`。
- [ ] `src/lib/i18n.ts` 只有 `zh-CN` / `en-US`，未见其他语言包。

---

## 全局约定

### 质量门禁

每个阶段结束都要跑：

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

### 测试约定

- 单测**必须离线可跑**，不依赖网络或数据库。
- 需要真实后端的测试放 `tests/integration/`，默认 skip，需 `TROVE_TEST_*` 环境变量才启用。
- **集成测试必须自清理**：用 `afterAll` 兜底（不能只靠最后一个 `it` 清理），清理条件要**可证伪**
  （按 URL 前缀 / RFC 2606 保留域 / 自己造的标签名白名单匹配）。
  写 `if (item.id.startsWith('it') || item.id)` 这种恒真条件，等于「删光该账号的全部条目」。
- 远程网络的 `beforeAll` / `afterAll` 必须显式传 timeout（如 `afterAll(fn, 180000)`），
  否则默认 10s 会让**测试本体全绿但套件判失败**。

### 提交

- 中文 conventional commits，例如 `feat(items): 支持按标签检索`、`feat(export): 支持 CSV 与书签栏 HTML 导出`。
- **完成修改后自动 commit 并 push**（本仓库已授权，质量门禁通过后直接提交，无需重复确认）。
- 只提交本次任务的改动，保留无关的未提交修改。

### 分层红线

新增功能请守住这几条，别让后面的人还债：

```
路由 / MCP 工具 / Server Action
        ↓
src/lib/services/*        业务逻辑与校验
        ↓
src/lib/domain/*          纯函数（不碰网络、不碰数据库）
        ↓
src/lib/db/trove-db.ts    唯一数据访问入口（.from() 只允许出现在这里）
```

- `src/lib/domain/` 必须是纯函数——这样能离线跑单测。
- `src/lib/db/trove-db.ts` 是**唯一**允许出现业务表 `.from()` 的地方；
  `tests/unit/trove-db-scope.test.ts` 会扫描 `src/` 断言这条规则不被破坏。
- 新增表访问时，请加到 `TroveDb` 里，而不是在 service 层直接 `.from()`。

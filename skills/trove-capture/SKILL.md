---
name: trove-capture
description: Capture URLs into the user's Trove bookmark collection. Resolves single or multiple URLs, GitHub stars, or local Chrome/Edge bookmarks; extracts page content; generates a title, summary and up to 3 tags with AI; then saves them via the Trove REST API or MCP. Use when the user asks to 收藏 / 加入 trove / 保存这些链接 / 导入书签 / 同步 GitHub star / 整理收藏.
license: Apache-2.0
---

# trove-capture

把链接收进用户的 Trove 收藏系统：**解析正文 → AI 解读 → 写入统一存储**。

## 核心原则

1. **AI 解读由你（Agent）负责。** 服务端不抓正文、不调用任何模型。你必须先拿到正文，自己产出 `title` / `summary` / `tags`，再调用写入接口。
2. **标签语义完全由你决定。** 系统没有预设分类清单，也**不会**把你的标签映射到「工作 / 生活 / 家庭」等固定分类。**你解读出什么领域/主题的标签，就原样提交什么标签**（中文或英文都行，服务端只做大小写与空白归一）。
3. **但标签命名空间要克制。** 用户的标签空间是长期资产，碎片化（`gis` 与 `gis数据`、`springboot` 与 `spring boot`）会让检索越来越难用。**新增标签前必须先过一遍 `tag-resolver.mjs`**（见「标签归一」一节）—— 能复用既有标签就别新造。
4. **每个用户拥有独立的一套标签。** 其他用户的标签你既看不到也用不了。
5. **重复录入是 upsert，不会产生重复条目。** 详见「重复录入」一节。

## 环境准备

需要两个环境变量：

| 变量 | 说明 |
|---|---|
| `TROVE_API_BASE` | 例如 `https://trove.sxyicheng.tech/api/trove` |
| `TROVE_API_KEY` | `trv_` 开头的长效 API Key |
| `GITHUB_TOKEN` | 可选；读取 star 列表时必需（匿名调用会被限流） |

放在环境变量里，或写进 `~/.config/trove/env`（`KEY=VALUE` 格式，每行一条）。

如果缺少 `TROVE_API_KEY`，提示用户到 trove 的「设置 → API Key」生成。

## 三种模式

根据用户意图选择模式：

### 模式 A — 单个或多个 URL

```bash
node scripts/fetch-content.mjs "<url>" ["<url2>" ...]
```

一次可传多个 URL，输出 JSON 数组；只传一个时输出单个对象。

### 模式 B — GitHub star 列表

```bash
node scripts/github-stars.mjs [--limit 50]
```

输出 `{ count, stars: [{ full_name, html_url, description, topics, language, ... }] }`。
每个 star 视为一个待收录链接，其 `html_url` 就是目标 URL。

> `401` → 提示配置 `GITHUB_TOKEN`。
> `403` → 触发限流，同样提示配置 token；不要无限重试。

### 模式 C — 本地 Chrome / Edge 收藏夹

```bash
node scripts/read-bookmarks.mjs [--browser chrome|edge|all] [--profile Default] [--limit 200] [--folder "书签栏"]
```

输出 `{ count, total_read, errors, bookmarks: [{ url, title, folder, date_added }] }`。
浏览器正在运行时也能读取；单个浏览器失败不影响另一个。

## 标准工作流

```
① 取得 URL 列表（模式 A / B / C）
        ↓
② 取得正文：node scripts/fetch-content.mjs "<url1>" "<url2>" ...
        ↓
③ 你自己解读：产出 title / summary / 候选标签
        ↓
③.5 标签归一：node scripts/tag-resolver.mjs resolve "<所有候选标签>" ...
        ↓
④ 写入：node scripts/trove-api.mjs save-many '[{...}]'（标签用归一后的）
        ↓
⑤ 汇报：新增 N 条 / 更新 M 条 / 失败 K 条
```

### ② 抓正文

- GitHub 仓库链接会自动改走 GitHub API，返回结构化的仓库信息（语言 / Stars / Topics / 描述），信息质量优于 HTML 抓取。
- `extraction` 字段说明抓取质量：
  - `full` —— 正文完整，可放心解读。
  - `partial` —— 正文太短，通常是 JS 渲染站点。此时退化为 `og:description` + `og_title` + 域名，并在 summary 里**如实说明**「页面为动态渲染，未取到正文」，**不要编造**。
  - `none` —— 抓取失败（网络错误或非 200）。此时用返回的 `title` / `meta_description`（如果有），summary 写明「未能抓取正文，仅依据页面元信息整理」。**绝不虚构内容。**

### ③ AI 解读

对每个 URL 产出：

| 字段 | 要求 |
|---|---|
| `title` | 必填，≤300 字符。用页面真实标题；没有就用域名 + 内容类型 |
| `summary` | 可选，≤1000 字符。**说明这个链接是什么、解决什么问题**，不要复述标题 |
| `tags` | 可选，**≤3 个**。标签名由你决定：领域、主题、技术栈、使用场景都可以 |

标签建议：
- 归一由服务端做（小写、去 `#`、折叠空白），你直接给有意义的名称即可。
- 中文标签完全支持。
- **来源站点不是主题标签**（掘金 / 知乎 / CSDN / 公众号……）——`items.source` 记录的是**采集通道**（`skill` / `mcp` / `manual` / `bookmark` / `github`），不是发布平台。要标注「这篇来自掘金」时可以有意识地用它，resolver 只给提示、不强制。
- **产出的是「候选标签」，必须先过「标签归一」再写入。**

### ③.5 标签归一（**必做**）

标签空间是长期资产。碎片化一旦成规模就没法收拾，所以**新增任何标签前先查一遍既有标签**：

```bash
node scripts/tag-resolver.mjs resolve "标签1" "标签2" "标签3"
```

批量场景把**所有条目用到的候选标签一次传进去**（去重由脚本处理），一次拿回整张映射表。

返回的每个候选有三种 `action`：

| action | 含义 | 你该怎么做 |
|---|---|---|
| `reuse` | 命名空间里已有等价标签 | **直接用 `resolved`**，不要新造 |
| `candidate` | 有相近的既有标签，但**不一定等价** | 读 `reason` 和 `candidates`：能表达你的语义就用 `resolved`；不能就换候选或新建。**不要默认新建** |
| `new` | 确实没有相近的 | 才允许新建 |

配套还有 `warning` 字段：命中「来源站点名」黑名单时会提示别用。

**匹配规则**（resolver 内部逻辑，你只需理解结论）：

| 关系 | 例子 | 处理 |
|---|---|---|
| 归一后同词 | `springboot` / `spring boot` | 复用既有那一个（统一拼写） |
| 等价组 | `jdk8` → `jdk`、`gis数据` → `gis` | 统一到 `canonical` |
| 同族但不等价 | `java` / `java nio` / `java并发` | **只提示，不自动替换**——它们确实不同 |
| 上下位 | `向量数据库` ⊃ `数据库` | 给出候选，由你判断 |

等价组 / 同族组定义在 `data/tag-aliases.json`，可以随时增删：

- `equivalent` —— 真正等价的同一个概念，`canonical` 是首选写法。**命中后 resolver 直接复用 canonical**。
- `related` —— 同一族但不等价，只作提醒。
- `avoid` —— 不该作为标签的来源站点名。

> 发现新的同义标签时，**顺手把等价组补进 `data/tag-aliases.json`**，下次就自动收拢了。

### ④ 写入

单个：

```bash
node scripts/trove-api.mjs save '{"url":"https://...","title":"...","summary":"...","tags":["a","b"],"source":"skill"}'
```

批量（推荐，单次 ≤50 条）：

```bash
node scripts/trove-api.mjs save-many '[{"url":"...","title":"...","summary":"...","tags":["..."]}, ...]'
```

`source` 可选：`manual` / `skill` / `mcp` / `github` / `bookmark` —— 记录「这条是从哪来的」。模式 B 用 `github`，模式 C 用 `bookmark`，其他用 `skill`。

响应：

```json
{ "items": [{ "id": "...", "created": true, "tags": ["..."] }],
  "created": 1, "updated": 0, "errors": [] }
```

### ⑤ 汇报

最后向用户汇总：**新增 N 条 / 更新 M 条 / 失败 K 条**（失败时列出失败的 URL 与原因）。批量中单条失败不影响其余。

## 硬约束

| 约束 | 值 | 越界表现 |
|---|---|---|
| 单次提交条数 | ≤ 50 | 服务端拒绝，请分批 |
| 每个收藏的标签数 | ≤ 3 | `422 MAX_TAGS_EXCEEDED`，请砍到 3 个 |
| 新增标签前必须过 resolver | `action=reuse` 不得新造同名标签 | 命名空间碎片化 |
| title 长度 | ≤ 300 | 422 |
| summary 长度 | ≤ 1000 | 422 |

超限时**先砍标签再重试**，不要盲目重试同一个请求。

## 重复录入（upsert）

同一 URL 再次提交**不会**新建重复条目，而是更新既有条目。字段级规则：

| 字段 | 没传时 | 传了时 |
|---|---|---|
| `title` | 保留原值 | 覆盖（非空才覆盖） |
| `summary` | 保留原值 | 覆盖（非空才覆盖） |
| `tags` | **完全保留原标签** | 整体替换该条标签 |
| `notes` | 不追加 | 追加一条新笔记（笔记不覆盖） |
| `collected_at` / 归档状态 / 已读状态 / 点击次数 | **不变** | 仍不变 |

要点：
- **没传 `tags` 就不会清空已有标签** —— 只补标题/摘要的局部更新很安全。
- 响应里的 `created` 告诉你这次是新建（`true`）还是更新（`false`）。
- 重录**不会**重置收藏时间，所以超期提醒不会被反复导入刷掉。

## 排查

```bash
node scripts/trove-api.mjs search --q 关键词 --limit 10   # 确认是否已收录
node scripts/trove-api.mjs stats                          # 总数 / 未读 / 超期
node scripts/trove-api.mjs tags                           # 既有标签（完整 JSON）
```

标签命名空间工具：

```bash
node scripts/tag-resolver.mjs list                             # 紧凑列出既有标签（name×count）
node scripts/tag-resolver.mjs resolve "标签" [...]              # 解析候选标签 → 复用哪个既有标签
node scripts/tag-resolver.mjs audit                            # 找出既有标签里的近重复分组
node scripts/tag-resolver.mjs merge <from> <to> [--dry-run]   # 把 from 合并进 to
```

`merge` 会把挂了 `from` 的收藏逐条改挂到 `to`，再删掉 `from` 标签。
**先 `--dry-run` 看影响面**（会打印受影响的条目与新的标签集），确认后再执行。
注意 Agent 通道每个收藏至多 3 个标签：合并不会增加标签数，但如果某条收藏本来就超过 3 个，合并会失败并被单独列出（需在 Web 端手工调整）。

接口返回错误时，脚本会打印 `{ "error": { "code": "...", "message": "..." } }` 并以非 0 退出码结束。常见码：

| 码 | 含义 | 处理 |
|---|---|---|
| `UNAUTHORIZED` | API Key 无效或已吊销 | 让用户去设置页重新生成 |
| `MAX_TAGS_EXCEEDED` | 标签超过 3 个 | 砍到 3 个再提交 |
| `VALIDATION_ERROR` | 字段不合法 | 按 message 修正 |
| `INVALID_SCHEME` | 不是 http/https 链接 | 跳过该 URL |

## 也可以走 MCP

如果 MCP 已配置（`trove` 服务器），同样的能力以工具形式提供：`trove_save`、`trove_save_many`、`trove_search`、`trove_list_tags`、`trove_manage_tag`、`trove_get`、`trove_update`、`trove_archive`、`trove_delete`、`trove_add_note`、`trove_mark_read`、`trove_stats`、`trove_list_reminders`。

REST 与 MCP 走同一套 service 层，语义完全一致。

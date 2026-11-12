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
3. **每个用户拥有独立的一套标签。** 其他用户的标签你既看不到也用不了。
4. **重复录入是 upsert，不会产生重复条目。** 详见「重复录入」一节。

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
③ 你自己解读：产出 title / summary / tags
        ↓
④ 写入：node scripts/trove-api.mjs save-many '[{...}, {...}]'
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
- 存之前先调 `node scripts/trove-api.mjs tags` 看看既有标签。**已有语义匹配的标签就复用**，避免同义标签碎片化；确需新标签才新增。

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
node scripts/trove-api.mjs tags                           # 既有标签
```

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

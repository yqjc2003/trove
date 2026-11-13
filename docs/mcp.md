# MCP 服务端

**端点**：`https://<site>/api/mcp`（Streamable HTTP，GET / POST）

**认证**：`Authorization: Bearer <trv_key>`。使用与 Skill 的 `CATCHLINGER_API_KEY` 相同的 API Key，工具所需 scope 仍须满足权限要求。

支持两种凭据：

- **长效 API Key**（推荐）：`trv_` 开头，服务端只存 SHA-256 哈希。
  为什么不用 Supabase JWT —— access_token 约 1 小时过期，而 MCP 客户端的请求头是静态的，
  必须用长效密钥。
- **同源 Cookie 会话**：仅用于 WebMCP 桥接场景，且只信任 `Sec-Fetch-Site: same-origin`
  的请求。

**作用域**：`items:read`、`items:write`、`notes:write`、`stats:read`。
缺少权限时工具返回结构化错误（`isError: true`），而不是抛异常。

**注册到本机运行时**（`~/.minimax/mcp.json` 形如）：

```jsonc
{
  "mcpServers": {
    "catchlinger": {
      "type": "http",
      "url": "https://<site>/api/mcp",
      "headers": { "Authorization": "Bearer trv_…" }
    }
  }
}
```

也可以用 `mavis mcp create` 注册。

---

## 工具清单

所有工具返回 `{ content: [{ type: "text", text: "<json>" }] }`，
出错时带 `isError: true`，正文是 `{ "error": { "code", "message" } }`。

### `catchlinger_search`

按关键词、域名、标签、内容形态、来源与状态检索。

| 入参 | 类型 |
|---|---|
| `q` | string? |
| `domain` | string? |
| `tags` | string[]?（AND 语义） |
| `content_type` | `article`/`video`/`repo`/`tool`/`social`/`doc`/`other`? |
| `source` | `manual`/`skill`/`mcp`/`github`/`bookmark`? |
| `status` | `active`/`archived`/`all`? |
| `read` | `read`/`unread`/`all`? |
| `overdue` | boolean? |
| `limit` | number?（≤200） |

返回精简条目数组：`id` `title` `url` `domain` `summary` `tags` `content_type` `status`
`collected_at` `read_at` `click_count`。

### `catchlinger_get`

入参 `id`（uuid）。返回 `{ item, notes, clicks }`。

### `catchlinger_save`

入参：`url` `title`（必填）`summary?` `tags?`（≤3）`content_type?` `source?`
`source_ref?` `content_excerpt?` `notes?`

返回 `{ id, created, normalized_url, domain, title, tags }`。
`created: false` 表示命中已有条目并完成 upsert。

### `catchlinger_save_many`

入参 `{ items: [...] }`（≤50）。返回 `{ items, created, updated, errors }`，
单条失败不阻断其余。

### `catchlinger_update`

入参 `id` + 可选 `title` `summary` `tags` `content_type` `status` `read` `notes`
`notes_mode`。传 `tags` 即整体替换，不传则保持原样。

### `catchlinger_archive`

入参 `{ ids: string[], archived?: boolean }`。返回 `{ updated, errors }`。

### `catchlinger_delete`

入参 `id`。硬删除（笔记与点击记录一并删除）。

### `catchlinger_add_note`

入参 `{ id, body_md }`。追加一条 Markdown 笔记（可多条，历史可追溯）。

### `catchlinger_mark_read`

入参 `{ id, read }`。返回 `{ id, read_at }`。

### `catchlinger_stats`

无入参。返回统计概览（总数 / 未读 / 超期 / 标签分布 / 来源分布 / 常用域名）。

### `catchlinger_list_reminders`

无入参。返回超期未读清单，含 `days_overdue`。

### `catchlinger_account`

无入参。返回当前账号信息：邮箱、昵称、GitHub 用户名与头像。

`github_username` 可直接用于读取该用户的 star 列表（GitHub 公开端点，无需 Token）。

### `catchlinger_list_tags`

无入参。返回当前用户全部标签（含 `count` 与 `origin`）。
**保存前先调它**，优先复用既有标签，避免同义标签碎片化。

### `catchlinger_manage_tag`

| 入参 | 说明 |
|---|---|
| `action` | `create` / `rename` / `delete` |
| `name` | `create` 时用 |
| `new_name` | `rename` 时用 |
| `tag_id` | `rename` / `delete` 时用 |

改名只影响标签名，已绑定收藏的关系不变；删除会把该标签从所有收藏上解绑。

---

## 给 Agent 的提示

工具描述里已经写明：**AI 解读由调用方负责**。

正确用法：

```
1. 用 fetch-content 之类的工具拿到正文
2. 自己产出 title（≤300）、summary（≤1000）、tags（≤3）
3. 调用 catchlinger_save / catchlinger_save_many 写入
```

标签语义完全由 Agent 决定 —— 系统没有预设分类清单，也不会把标签映射到
「工作 / 生活」等固定分类，Agent 解读出什么就存什么（中文或英文都可以）。

标签的粒度应略高于文章关键词，通常选 1–2 个可聚合多篇内容的标签（最多 3 个），不必凑满。保存前调用 `catchlinger_list_tags`，优先复用较宽的领域/技术栈，必要时加学习方式或场景。例如 Java HashMap、ArrayList 源码文章都可用 `java`、`源码阅读`，具体类名、方法、API、错误码等保留在标题/摘要中。批量采集先收敛共享主题；新增标签前判断是否能自然容纳多篇内容，避免每篇一个专属标签。用户明确要求细分时除外。这是 Agent 选词指引，不是服务端分类映射，也不会自动改动历史标签。

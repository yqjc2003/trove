# REST API

**Base**：`https://<site>/api/trove`

**认证**：`Authorization: Bearer <trv_key | supabase_jwt>`

- `trv_…`：在「设置 → API Key」生成的长效密钥，服务端只存 SHA-256 哈希。
  供 Skill / MCP / CLI 使用。
- Supabase JWT：Web 端会话令牌，约 1 小时过期。

**响应包络**

```jsonc
// 成功
{ "data": { /* ... */ } }

// 失败
{ "error": { "code": "MAX_TAGS_EXCEEDED", "message": "每个收藏最多 3 个标签" } }
```

**错误码**

| code | HTTP | 含义 |
|---|---|---|
| `UNAUTHORIZED` | 401 | 缺少凭据或凭据无效 |
| `FORBIDDEN` | 403 | 权限不足 |
| `NOT_FOUND` | 404 | 资源不存在或不属于当前用户 |
| `TAG_NAME_CONFLICT` | 409 | 标签名已存在 |
| `VALIDATION_ERROR` | 422 | 字段不合法 |
| `MAX_TAGS_EXCEEDED` | 422 | 标签超过 3 个 |
| `INVALID_SCHEME` | 422 | 不是 http/https 链接 |
| `RATE_LIMITED` | 429 | 请求过于频繁 |
| `INTERNAL` | 500 | 服务器内部错误 |

**字段长度上限**

| 字段 | 上限 |
|---|---|
| `title` | 300 |
| `summary` | 1000 |
| `content_excerpt` | 2000 |
| `url` | 2048 |
| `tags[].name` | 32 |
| `notes.body_md` | 50 KB |

批量单次最多 50 条。

---

## 收藏

### `GET /items` — 检索收藏

查询参数：

| 参数 | 说明 |
|---|---|
| `q` | 标题 / 摘要 / URL 模糊匹配 |
| `domain` | 精确匹配域名 |
| `tag` | 标签，**可重复传入**（AND 语义） |
| `content_type` | `article` `video` `repo` `tool` `social` `doc` `other` |
| `source` | `manual` `skill` `mcp` `github` `bookmark` |
| `status` | `active`（默认）`archived` `all` |
| `read` | `read` `unread` `all`（默认） |
| `overdue` | `true` 时只返回超期未读 |
| `collected_from` / `collected_to` | ISO 时间 |
| `sort` | `collected_at`（默认）`click_count` `title` |
| `order` | `desc`（默认）`asc` |
| `limit` | 默认 50，上限 200 |
| `offset` | 分页偏移 |

响应：

```jsonc
{
  "data": {
    "items": [ /* 每项含 tags[] */ ],
    "total": 128,
    "limit": 50,
    "offset": 0
  }
}
```

### `POST /items` — 保存（upsert）

单条：

```jsonc
{
  "url": "https://example.com/post",
  "title": "标题",
  "summary": "这个链接是什么、解决什么问题",
  "tags": ["数据库", "向量检索"],
  "content_type": "article",
  "source": "skill",
  "source_ref": "可选",
  "notes": "可选，创建后追加一条 Markdown 笔记"
}
```

批量：`{ "items": [ ... ] }`，最多 50 条。

响应：

```jsonc
{
  "data": {
    "items": [{ "id": "…", "created": true, "normalized_url": "…", "domain": "…", "title": "…", "tags": ["…"] }],
    "created": 1,
    "updated": 0,
    "errors": []
  }
}
```

`created + updated + errors.length` 恒等于提交条数。批量中单条失败不阻断其余，
失败项在 `errors` 里带 `index` 与 `code`。

**Upsert 语义**：同一 URL（按 `normalized_url` 判定）重复提交只保留一条并更新。
未提供的字段保留旧值；传了 `tags` 就整体替换，没传就保留原标签。
详见 README 的字段表。

### `GET /items/{id}` — 详情

响应 `{ "data": { "item": {…}, "notes": [...], "clicks": [...] } }`。
`clicks` 是最近 20 次点击记录。

### `PATCH /items/{id}` — 更新

可改字段：`title` `summary` `tags`（整体替换）`content_type` `status` `read` `notes`
（配 `notes_mode: 'append' | 'replace'`）。

### `DELETE /items/{id}` — 硬删除

级联删除笔记、标签绑定与点击记录。**归档是可逆的替代方案**。

### `GET /items/{id}/notes` · `POST /items/{id}/notes`

列出 / 追加 Markdown 笔记。

### `POST /items/{id}/read`

```jsonc
{ "read": true }   // 标记已读
{ "read": false }  // 清除已读，重新进入超期候选
```

响应 `{ "data": { "read_at": "2026-11-12T…" } }`。

---

## 标签

标签是系统里唯一的分类维度，每个用户一套独立命名空间。

### `GET /tags`

```jsonc
{ "data": { "tags": [{ "id": "…", "name": "数据库", "origin": "agent", "count": 12 }] } }
```

`origin`：`agent`（AI 解读产生）| `user`（用户手动创建）。
`count` 是被多少条收藏使用。

### `POST /tags`

```jsonc
{ "name": "读书" }
```

同名已存在时幂等返回既有标签，`created: false`。

### `PATCH /tags/{id}`

改名。绑定关系按 id 关联，**改名不影响任何收藏**。
与既有标签重名 → `409 TAG_NAME_CONFLICT`。

### `DELETE /tags/{id}`

```jsonc
{ "data": { "deleted": true, "unbound": 7 } }
```

从所有收藏上解绑，`unbound` 是受影响的收藏数。

---

## 统计与提醒

### `GET /stats`

```jsonc
{
  "data": {
    "total": 128, "active": 100, "archived": 28,
    "unread": 42, "overdue": 9, "added_7d": 5,
    "by_tag": [{ "name": "数据库", "count": 12 }],
    "by_source": [{ "source": "skill", "count": 60 }],
    "by_content_type": [{ "content_type": "article", "count": 80 }],
    "top_domains": [{ "domain": "github.com", "count": 30 }]
  }
}
```

### `GET /reminders`

超期未读清单，阈值取自 `profiles.reminder_days`（默认 14 天，可在设置页调整）。

```jsonc
{
  "data": {
    "reminders": [
      { "item": {…}, "days_overdue": 20 }
    ]
  }
}
```

---

## 账号

### `GET /account`

```jsonc
{
  "data": {
    "user_id": "dceb207f-…",
    "email": "you@example.com",
    "display_name": "你的昵称",
    "github_username": "yqjc2003",
    "github_account_id": "6190566",
    "github_avatar_url": "https://avatars.githubusercontent.com/u/6190566?v=4"
  }
}
```

只返回**当前用户自己**的资料。

`github_username` 是 trove 用 GitHub OAuth 登录时存下的 GitHub 登录名
（邮箱注册的账号为 `null`）。客户端拿它就能走 GitHub 的**公开端点**
`GET /users/{username}/starred` 读 star 列表 —— **不需要 GITHUB_TOKEN**。

---

## 导入导出

### `GET /export`

全量 JSON：`{ profile, tags, items, notes, click_events }`。

### `POST /import`

```jsonc
{ "mode": "merge", "items": [ … ], "tags": [ { "name": "…" } ] }
```

`merge`（默认）按 `normalized_url` upsert；`replace` 先清空当前用户全部收藏再写入。

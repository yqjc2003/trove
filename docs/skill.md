# Skill：`trove-capture`

把链接收进 trove 收藏系统：**解析正文 → AI 解读 → 写入统一存储**。

**源码**：`skills/trove-capture/`（仓库内）
**安装位置**：`~/.minimax/skills/trove-capture/`

```bash
pnpm skill:install     # 幂等：已存在则覆盖，并清掉目标端多余的旧文件
```

## 配置

| 变量 | 说明 |
|---|---|
| `TROVE_API_BASE` | 例如 `https://trove.example.com/api/trove` |
| `TROVE_API_KEY` | `trv_` 开头的长效 API Key（在 trove「设置 → API Key」生成） |
| `GITHUB_TOKEN` | 可选；读取 star 列表时必需（匿名调用会被限流） |

放在环境变量里，或写进 `~/.config/trove/env`（`KEY=VALUE` 格式，每行一条）。

## 脚本

四个零依赖 Node ESM 脚本，只用 Node 内置 API。

### `scripts/fetch-content.mjs <url…>`

抓网页正文，输出结构化 JSON：

```jsonc
{
  "url": "…", "status": 200,
  "title": "…", "meta_description": "…",
  "og_title": "…", "og_description": "…", "site_name": "…",
  "text": "正文（≤8000 字符）",
  "extraction": "full" | "partial" | "none",
  "lang": "zh-CN"
}
```

- GitHub 仓库链接自动改走 GitHub API，返回结构化的仓库信息（语言 / Stars / Topics / 描述）。
- `extraction` 字段说明抓取质量：`full` 可放心解读；`partial` 通常是 JS 渲染站点，
  应退化为 `og:description` + 域名并**如实说明**，不要编造；`none` 是抓取失败。
- 超时 15 秒，失败不抛栈，返回 HTTP 状态码。

### `scripts/read-bookmarks.mjs`

读取本机 Chrome / Edge 书签。

```bash
node read-bookmarks.mjs [--browser chrome|edge|all] [--profile Default]
                        [--limit 200] [--folder "书签栏"]
```

输出 `{ count, total_read, errors, bookmarks: [{ url, title, folder, date_added }] }`。
浏览器运行时也能读；JSON 解析失败重试 3 次（间隔 300ms）；单个浏览器失败不影响另一个。

### `scripts/github-stars.mjs`

读取当前用户的 GitHub star 列表。

```bash
node github-stars.mjs [--limit 50]
```

输出 `{ count, stars: [{ full_name, html_url, description, topics, language, ... }] }`。
`401`（缺 token）或 `403`（限流）会给出明确提示并以非 0 退出码结束。

### `scripts/trove-api.mjs`

REST 客户端。

```bash
node trove-api.mjs save '<json>'
node trove-api.mjs save-many '<json[]>'
node trove-api.mjs search --q 关键词 --tag a --tag b --limit 20
node trove-api.mjs stats
node trove-api.mjs tags
node trove-api.mjs notes --id <id> --body '<md>'
```

错误时打印 `{ "error": { code, message } }` 并以非 0 退出码结束。

## 工作流

```
① 取 URL 列表：手输 / github-stars.mjs / read-bookmarks.mjs
        ↓
② 取正文：fetch-content.mjs
        ↓
③ AI 解读：产出 title / summary / ≤3 tags（标签语义由 Agent 自己决定）
        ↓
④ 写入：trove-api.mjs save-many
        ↓
⑤ 汇报：新增 N 条 / 更新 M 条 / 失败 K 条
```

## 硬约束

| 约束 | 值 | 越界表现 |
|---|---|---|
| 单次提交条数 | ≤ 50 | 服务端拒绝，分批提交 |
| 每个收藏的标签数 | ≤ 3 | `422 MAX_TAGS_EXCEEDED` |
| title 长度 | ≤ 300 | 422 |
| summary 长度 | ≤ 1000 | 422 |

## 定时采集

书签采集必须在**本机**执行（本地文件），所以定时器用**本地 Agent 定时任务**
调用本 Skill；GitHub star 也走本机以复用同一套解读流程。

每次运行产出「本次新增 N 条 / 更新 M 条 / 失败 K 条」的报告。

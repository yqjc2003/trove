# Skill：`catch-and-linger`

把链接收进 CatchLinger 收藏系统：**解析正文 → AI 解读 → 写入统一存储**。

**源码**：`skills/catch-and-linger/`（仓库内）
**安装位置**：`~/.agents/skills/catch-and-linger/`（Codex 用户级全局 Skills 目录）

推荐从 GitHub Release 下载，不需要 clone 整个仓库：

```powershell
$work = Join-Path $env:TEMP "catch-and-linger-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $work | Out-Null
$zip = Join-Path $work 'catch-and-linger.zip'
Invoke-WebRequest 'https://github.com/yqjc2003/trove/releases/latest/download/catch-and-linger.zip' -OutFile $zip
Expand-Archive -LiteralPath $zip -DestinationPath $work
& (Join-Path $work 'install-catch-and-linger.ps1')
```

开发仓库内仍可运行 `pnpm skill:install`；两种方式都幂等，并会清理目标端多余的旧文件。

安装后请重新开启一个 Codex 会话，Skill 才会被发现。

## 配置

| 变量 | 说明 |
|---|---|
| `CATCHLINGER_API_BASE` | 例如 `https://<你的站点>/api/trove` |
| `CATCHLINGER_API_KEY` | `trv_` 开头的长效 API Key（在 CatchLinger「设置 → API Key」生成） |
| `GITHUB_USERNAME` | 可选；GitHub 用户名。设了就能**免 Token** 读 star 列表 |
| `GITHUB_TOKEN` | 可选；设了配额从 60 次/小时提到 5000 次/小时，也能读私密 profile 的 star |

放在环境变量里，或写进 `~/.config/catchlinger/env`（`KEY=VALUE` 格式，每行一条）。

## 脚本

零依赖 Node ESM 脚本，只用 Node 内置 API。

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

读取 GitHub star 列表。

```bash
node github-stars.mjs [--limit 50] [--user <GitHub用户名>]
```

输出 `{ mode, count, stars: [{ full_name, html_url, description, topics, language, starred_at, ... }], rateLimit }`。

**用户名从哪来（按优先级）**：`--user` > `GITHUB_USERNAME` > **trove 账号**
（调 `GET /account` 拿 `github_username`）> `GITHUB_TOKEN`（此时读自己的 star）。

CatchLinger 用 GitHub OAuth 登录时服务端已经存下了 GitHub 用户名，所以
**只要配了 CATCHLINGER_API_KEY，star 列表就能读，不需要 GITHUB_TOKEN，也不用手填用户名**。

拿到用户名后走公开端点 `GET /users/{username}/starred`（不需要 Token）；
公开端点读不到私密 profile 的 star，这种情况才需要 `GITHUB_TOKEN`。

`401`（Token 无效）、`403`（限流）、`404`（用户名不存在）会给出明确提示并以非 0 退出码结束。

### `scripts/catchlinger-api.mjs`

REST 客户端。

```bash
node catchlinger-api.mjs save '<json>'
node catchlinger-api.mjs save-many '<json[]>'
node catchlinger-api.mjs search --q 关键词 --tag a --tag b --limit 20
node catchlinger-api.mjs stats
node catchlinger-api.mjs tags
node catchlinger-api.mjs notes --id <id> --body '<md>'
node catchlinger-api.mjs account
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
④ 写入：catchlinger-api.mjs save-many
        ↓
⑤ 汇报：新增 N 条 / 更新 M 条 / 失败 K 条
```

## 硬约束

采集标签通常取 1–2 个较宽、可复用的主题，最多 3 个。先浏览既有标签，再用 resolver 归一；HashMap 源码文章使用 `java`、`源码阅读`，具体类名等细节写入标题和摘要。完整的粒度示例与批量选词规则见 `skills/catch-and-linger/SKILL.md` 的「标签粒度：先归组，再归一」。

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

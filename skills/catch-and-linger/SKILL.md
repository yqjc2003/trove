---
name: catch-and-linger
description: 将用户提供的 HTTP(S) 链接收录到本机 CatchLinger 桌面客户端。
---

# 收藏链接到本地 CatchLinger

当用户要求收藏或收录链接时，调用本地 CatchLinger 桌面客户端，不使用线上网站、Supabase 或远程 API。桌面应用需要运行，并在「设置 → 本地 MCP」启用服务。

优先使用已连接的 `catchlinger_save` MCP 工具，每次传入一个 `url`；等待工具返回并据实报告 `created`、`exists` 或警告。客户端负责读取网页、按本地已有标签分类、调用已配置的 AI，并保存正文和图片。重复网址不会覆盖已有收藏。工具失败时不要声称已保存。

若 Agent 没有配置 MCP，可用本技能自带的零依赖 Node 脚本：

```sh
node <本技能目录>/scripts/capture.mjs https://example.com/article
```

可传入多个 URL；逐项调用并汇报结果。脚本自动从本机桌面应用的数据目录 `.env.local` 读取本地 MCP 密钥，也可通过 `CATCHLINGER_MCP_TOKEN` 显式提供；不要输出或记录密钥。默认地址为 `http://127.0.0.1:46917/mcp`。`CATCHLINGER_MCP_URL` 仅允许本机 HTTP 地址。连接失败时，请用户启动客户端并启用本地 MCP，不要访问旧的线上服务。

可使用 `catchlinger_list_tags` 查看已有标签，使用 `catchlinger_search` 搜索本地收藏。未经用户要求不要删除或覆盖已有收藏。

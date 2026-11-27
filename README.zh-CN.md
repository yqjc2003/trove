# 拾藏 CatchLinger

本地优先的收藏和阅读客户端。Rust + Tauri 使用操作系统 WebView；网页正文、图片、标签和批注保存在本地 SQLite。可选配置 DeepSeek 为收录内容生成摘要和已有标签。

## 开发

Windows 需要 Rust、Microsoft C++ Build Tools（含 Windows SDK）和 WebView2 Runtime，以及 Node.js、pnpm。

```sh
pnpm install
pnpm desktop:dev
```

`pnpm build` 构建桌面程序；`pnpm lint && pnpm typecheck && pnpm test` 检查前端和 Skill，`cargo test --locked --manifest-path src-tauri/Cargo.toml` 检查 Rust。数据目录说明见 [桌面端说明](desktop/README.md)。

## 本地 MCP 与 Skill

在客户端「设置 → 本地 MCP」启用服务。地址固定为 `http://127.0.0.1:46917/mcp`；密钥在同一设置页面查看。服务需要客户端运行，仅监听本机，默认关闭。外部 Agent 通过 Streamable HTTP 连接时配置 `Authorization: Bearer <本地密钥>`；不要把密钥提交、发送到远程服务或写进项目文件。

提供 `catchlinger_save`、`catchlinger_search`、`catchlinger_list_tags`。`catchlinger_save` 接收 `url`，客户端抓取和分析内容并保存；重复链接不会覆盖已有收藏。配置、数据和密钥属于当前操作系统用户。

仓库的 [catch-and-linger Skill](skills/catch-and-linger/SKILL.md) 可使用 MCP 或 Node 脚本提交网址。Windows 下运行 `pnpm skill:install` 可将其安装到当前用户的 Agent 技能目录。浏览器扩展位于 [extension](extension)，通过本地 MCP 将当前网址交给客户端；在扩展设置中填写客户端的本地 MCP 密钥。

手工备份与 WebDAV 云同步尚未实现；Microsoft 账号同步也尚未实现。原 Web 服务、Supabase、线上 REST/MCP 和迁移文件已移除，不会自动迁移旧云端数据。

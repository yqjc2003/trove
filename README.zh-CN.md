# 拾藏 · CatchLinger

[English](README.md) | **简体中文**

拾藏是本地优先的桌面收藏与阅读应用，用于收录链接、阅读文章和整理笔记。客户端基于 Rust 和 Tauri，使用操作系统自带的 WebView，不内嵌 Chrome，也不依赖在线账号或托管后端。收藏保存在本机 SQLite 中。

## 主要功能

- 收录文章链接、视频链接、代码库及手写 Markdown 笔记。客户端提取网页正文、公开代码库 README 或可读取的视频介绍；无法提取时仍可保存链接并手工补充信息。
- 离线阅读已保存的 Markdown 正文和本地图片，调整字体、字号、文字颜色和背景，并自动记录阅读位置。音频和视频不会保存到本地。
- 使用已有标签、喜欢和归档整理内容；支持标签组合筛选，以及按标题、标签和正文搜索。在阅读器中选择文字或代码可添加批注，并在「笔记」中按文章查看。
- 可选配置 DeepSeek，生成摘要、从已有标签中选择最多三个标签，并在条件允许时优化 Markdown 排版；不配置 AI 也可以保存内容。
- 可选启用本地 MCP 服务，让 Agent、内置 Skill 和浏览器扩展将网址交给桌面客户端收录。

图片保存有数量和大小限制；需要登录或依赖 JavaScript 渲染的网站可能无法完整读取。启用 DeepSeek 后，参与分析的网页内容会发送给该服务。详细说明和限制见[桌面端文档](desktop/README.md)。

## 开始使用

Windows 环境需要 Node.js、pnpm、Rust、Microsoft C++ Build Tools（含 Windows SDK）和 WebView2 Runtime。安装后在项目根目录运行：

```sh
pnpm install
pnpm desktop:dev
```

如需 AI 功能，可在「设置 → AI 设置」中配置 DeepSeek。点击「＋」收录网址或手写文章。通过本地 MCP 收录时，需要保持桌面客户端运行。

```sh
pnpm build                 # 构建桌面程序，不生成安装包
pnpm desktop:build         # 生成 Windows NSIS 安装程序
pnpm lint
pnpm typecheck
pnpm test
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Windows 安装程序生成在 `src-tauri/target/release/bundle/nsis/`。首次构建可能下载 NSIS 打包工具。安装程序使用系统 WebView2 Runtime；如果电脑尚未安装，可能需要联网安装该运行时。

## 本地 MCP、Skill 与浏览器扩展

在客户端「设置 → 本地 MCP」启用服务。服务默认关闭，仅监听 `127.0.0.1:46917`，随客户端退出而停止；开启后下次启动客户端会自动恢复。访问密钥可在同一设置页面查看。

MCP 客户端使用 Streamable HTTP 连接 `http://127.0.0.1:46917/mcp`，请求头设置为 `Authorization: Bearer <本地密钥>`。服务提供 `catchlinger_save`、`catchlinger_search` 和 `catchlinger_list_tags`；重复收录已有网址不会覆盖原收藏。请妥善保管密钥，不要提交到仓库。

[catch-and-linger Skill](skills/catch-and-linger/SKILL.md) 可将网址交给正在运行的客户端。Windows 下执行 `pnpm skill:install` 可为当前用户安装 Skill。[浏览器扩展](extension/)同样通过本地 MCP 工作：以未打包扩展方式加载后，在扩展设置中填写本地密钥。

## 数据与限制

SQLite 数据库和归档图片位于应用的本地数据目录，AI 和 MCP 密钥保存在该目录的 `.env.local`；阅读位置保存在本地 WebView 存储中。开发或隔离测试可使用环境变量 `CATCHLINGER_DATA_DIR` 指定其他绝对路径，此操作不会迁移已有数据。

Windows 默认数据目录为 `%LOCALAPPDATA%\catchlinger`。首次启动时会从旧目录 `tech.sxyicheng.catchlinger` 复制数据库和密钥，已存在的新文件不会被覆盖；旧目录继续保留，也用于兼容原有阅读位置。升级前请退出旧版客户端。

手工备份、WebDAV 同步和 Microsoft 账号同步尚未实现；旧托管服务的数据不会自动迁移。收录、隐私和存储细节见[桌面端文档](desktop/README.md)。

## 许可

[Apache License 2.0](LICENSE)

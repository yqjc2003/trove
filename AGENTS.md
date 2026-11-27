# CatchLinger 开发约定

- 项目以 Rust + Tauri 桌面客户端为核心，使用系统 WebView，不恢复 Next.js、Supabase、线上账号或旧网站。
- 收藏、正文、图片、标签和批注保存在客户端 SQLite。数据库升级必须兼容已有数据，事务内完成关联修改。
- 分类即标签，`content_type` 只表示技术形态。只接受 HTTP(S) 网址；重复采集不可无意覆盖已有正文、标签或阅读状态。
- MCP 只监听 `127.0.0.1`，默认关闭，必须验证本地密钥、Host 和 Origin；不得输出密钥或令牌。密钥只保存在应用数据目录的 `.env.local`，不提交到仓库。
- AI 与网页提取在本机客户端执行。浏览器扩展与 Skill 只把网址交给客户端，不另行抓取和解读。
- UI 保持极简，无渐变、发光、阴影卡片或网格背景。保留阅读位置、批注和离线资源。
- 不引入 Docker、bun 或 deno。Node 用于桌面构建、Skill 和测试。
- Windows PowerShell 5.1 脚本保存为 UTF-8 with BOM。
- 质量检查：`pnpm lint && pnpm typecheck && pnpm test && pnpm build`，涉及 Rust 时还需 `cargo test --locked`。
- 完成修改并通过检查后自动 commit 和 push；只提交本次改动，保留无关文件。提交信息使用中文 conventional commits。

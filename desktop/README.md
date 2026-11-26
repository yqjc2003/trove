# 桌面端开发中

这是 Rust + Tauri 本地客户端的初始骨架，尚不能替代现有应用。可以配置 DeepSeek、读取网页标题和正文、生成摘要及最多三个标签，并保存在本地 SQLite。点击收藏标题可以阅读已提取的正文，调整字体、字号、文字颜色和背景；旧收藏首次打开时会尝试重新抓取正文。图片等静态资源的离线保存、MCP、CLI、备份和 WebDAV 均尚未实现。

Windows 开发需要 Rust、Microsoft C++ Build Tools（包含 C++ 桌面开发和 Windows SDK）及 WebView2 Runtime。安装依赖后，在仓库根目录运行：

```sh
pnpm install
pnpm desktop:dev
```

数据库位于 Tauri 应用本地数据目录的 `trove.sqlite3`。此开发版本的数据格式尚未稳定，不应保存唯一副本。

在「AI 设置」中填写 DeepSeek 模型名称和 API Key 后保存。Key 保存在应用本地数据目录的 `.env.local` 中，配置页不会回显已有密钥；留空保存可保留原密钥。输入网址并移开焦点会自动解析，也可点击「解析网页」重试。解析时，网页标题与最多 18000 个字符的正文会发送给 DeepSeek。需要登录或依赖 JavaScript 渲染的页面可能无法读取，可手动填写并保存。

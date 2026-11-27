# CatchLinger · 拾藏

**English** | [简体中文](README.zh-CN.md)

CatchLinger is a local-first desktop app for collecting, reading, and annotating links and notes. Built with Rust and Tauri, it uses the operating system's WebView; it does not bundle Chrome or require an online account or hosted backend. Collections are stored locally in SQLite.

## Features

- Save article links, video links, repositories, and handwritten Markdown notes. The client extracts readable articles, public repository README files, or available video descriptions; links can also be saved when extraction fails.
- Read saved Markdown and locally archived images offline. Customize the reader's font, size, text color, and background; reading positions are remembered. Audio and video are not archived.
- Organize items with existing tags, favorites, and archives; combine tag filters and search titles, tags, and article text. Select text or code in the reader to add annotations, then review them by article in Notes.
- Optionally configure DeepSeek to generate summaries, select up to three existing tags, and improve Markdown formatting when possible. Content can still be saved without AI.
- Optionally enable a local MCP service so agents, the included Skill, and the browser extension can submit URLs to the desktop app.

Images have size and count limits, and sites requiring login or JavaScript rendering may not be fully readable. DeepSeek receives the extracted content used for analysis when enabled. See the [desktop notes](desktop/README.md) for details and limitations.

## Getting started

On Windows, install Node.js, pnpm, Rust, Microsoft C++ Build Tools with the Windows SDK, and WebView2 Runtime. Then run:

```sh
pnpm install
pnpm desktop:dev
```

Use **Settings → AI settings** to configure DeepSeek if desired. Use **+** to add a link or write a note. The desktop application must be running for local MCP capture.

```sh
pnpm build                 # Build the desktop executable without an installer
pnpm lint
pnpm typecheck
pnpm test
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

## Local MCP, Skill, and browser extension

Enable **Settings → Local MCP** in the client. The service is off by default, listens only on `127.0.0.1:46917`, and stops with the app. Once enabled, the setting is restored on subsequent launches. The settings screen displays the local access token.

Connect an MCP client using Streamable HTTP at `http://127.0.0.1:46917/mcp` with the header `Authorization: Bearer <local-token>`. The service exposes `catchlinger_save`, `catchlinger_search`, and `catchlinger_list_tags`. Saving an existing URL does not overwrite the existing item. Keep the token private and do not commit it.

The [catch-and-linger Skill](skills/catch-and-linger/SKILL.md) sends URLs to the running client. On Windows, install it for the current user with `pnpm skill:install`. The [browser extension](extension/) also uses local MCP; load it as an unpacked extension and enter the local token in its settings.

## Data and limitations

The SQLite database and archived images live in the application's local data directory; AI and MCP secrets are stored in its `.env.local`. Reading positions use local WebView storage. For development or isolated testing, `CATCHLINGER_DATA_DIR` can select a different absolute data directory; this does not migrate existing data.

Manual backup, WebDAV synchronization, and Microsoft account synchronization are not yet implemented. Data from the former hosted service is not automatically migrated. See [desktop documentation](desktop/README.md) for capture, privacy, and storage details.

## License

[Apache License 2.0](LICENSE)

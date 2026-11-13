export function buildAgentInstallPrompt({
  apiBase,
  apiKey,
}: {
  apiBase: string;
  apiKey: string;
}): string {
  return `请帮我安装并连接 CatchLinger 收藏 Skill。

1. 用 PowerShell 下载最新 Release（无需 clone 完整仓库）：
   $work = Join-Path $env:TEMP "catch-and-linger-$([guid]::NewGuid())"
   New-Item -ItemType Directory -Path $work | Out-Null
   $zip = Join-Path $work 'catch-and-linger.zip'
   Invoke-WebRequest 'https://github.com/yqjc2003/trove/releases/latest/download/catch-and-linger.zip' -OutFile $zip
   Expand-Archive -LiteralPath $zip -DestinationPath $work
   & (Join-Path $work 'install-catch-and-linger.ps1')
   它会把新版 Skill 安装到 ~/.agents/skills/catch-and-linger/，并移除已弃用的旧 Skill。
2. 创建或更新 ~/.config/catchlinger/env，写入：
   CATCHLINGER_API_BASE=${apiBase}
   CATCHLINGER_API_KEY=${apiKey}
3. 重开一个 Codex 会话后，确认 catch-and-linger 已可用；再用它收下一个链接。

这把 Key 只属于我的 CatchLinger 藏库。请不要提交、记录到仓库，或分享给其他人。`;
}

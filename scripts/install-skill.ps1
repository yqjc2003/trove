<#
.SYNOPSIS
  把仓库里的 skills/trove-capture 同步到本机 Codex 的用户级全局 Skills 目录。

.DESCRIPTION
  幂等：已存在则整体覆盖。默认目标目录为 $env:USERPROFILE\.agents\skills\trove-capture，
  可用 -Target 覆盖。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/install-skill.ps1
#>
[CmdletBinding()]
param(
  [string]$Target = (Join-Path $env:USERPROFILE '.agents\skills\trove-capture')
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot 'skills\trove-capture'

if (-not (Test-Path $source)) {
  throw "找不到 Skill 源目录：$source"
}

Write-Host "源目录  : $source"
Write-Host "目标目录: $Target"

if (-not (Test-Path $Target)) {
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
  Write-Host '已创建目标目录'
}

# 整体复制（覆盖同名文件），并清掉目标端多余的旧文件
Copy-Item -Path (Join-Path $source '*') -Destination $Target -Recurse -Force

$stale = Get-ChildItem -Path $Target -Recurse -File |
  Where-Object {
    $rel = $_.FullName.Substring($Target.Length).TrimStart('\')
    -not (Test-Path (Join-Path $source $rel))
  }

foreach ($file in $stale) {
  Write-Host "删除多余文件: $($file.FullName)"
  Remove-Item -LiteralPath $file.FullName -Force
}

Write-Host ''
Write-Host '安装完成：'
Get-ChildItem -Path $Target -Recurse -File |
  ForEach-Object { Write-Host "  $($_.FullName.Substring($Target.Length).TrimStart('\'))" }

Write-Host ''
Write-Host '下一步：'
Write-Host '  1) 在 trove 的「设置 → API Key」生成密钥'
Write-Host '  2) 配置环境变量 TROVE_API_BASE / TROVE_API_KEY（可写入 ~/.config/trove/env）'
Write-Host '  3) 重开 Codex 会话，再调用 $trove-capture：把链接收进 trove'

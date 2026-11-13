<#
.SYNOPSIS
  从 CatchLinger Skill Release 包安装到 Codex 的用户级全局 Skills 目录。

.DESCRIPTION
  Release 包内应同时包含本脚本与 catch-and-linger 目录。
  安装新版时会清理弃用的 trove-capture / catchlinger-capture 全局 Skill。
#>
[CmdletBinding()]
param(
  [string]$Target = (Join-Path $env:USERPROFILE '.agents\skills\catch-and-linger')
)

$ErrorActionPreference = 'Stop'

$source = Join-Path $PSScriptRoot 'catch-and-linger'
$legacyTargets = @(
  (Join-Path $env:USERPROFILE '.agents\skills\trove-capture'),
  (Join-Path $env:USERPROFILE '.agents\skills\catchlinger-capture')
)

if (-not (Test-Path (Join-Path $source 'SKILL.md') -PathType Leaf)) {
  throw "Release 包不完整：找不到 $source\SKILL.md"
}

Write-Host "源目录  : $source"
Write-Host "目标目录: $Target"

foreach ($legacyTarget in $legacyTargets) {
  if (
    (Test-Path $legacyTarget) -and
    ([System.IO.Path]::GetFullPath($legacyTarget) -ne [System.IO.Path]::GetFullPath($Target))
  ) {
    Remove-Item -LiteralPath $legacyTarget -Recurse -Force
    Write-Host "已移除弃用的旧 Skill: $legacyTarget"
  }
}

if (-not (Test-Path $Target)) {
  New-Item -ItemType Directory -Path $Target -Force | Out-Null
}

Copy-Item -Path (Join-Path $source '*') -Destination $Target -Recurse -Force

$stale = Get-ChildItem -Path $Target -Recurse -File |
  Where-Object {
    $rel = $_.FullName.Substring($Target.Length).TrimStart('\')
    -not (Test-Path (Join-Path $source $rel))
  }

foreach ($file in $stale) {
  Remove-Item -LiteralPath $file.FullName -Force
}

Write-Host '安装完成：catch-and-linger 已安装到全局 Skills 目录。'

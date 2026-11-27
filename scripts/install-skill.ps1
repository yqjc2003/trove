[CmdletBinding()]
param([string]$Target = (Join-Path $env:USERPROFILE '.agents\skills\catch-and-linger'))
$ErrorActionPreference = 'Stop'
$source = Join-Path (Split-Path -Parent $PSScriptRoot) 'skills\catch-and-linger'
if (-not (Test-Path -LiteralPath (Join-Path $source 'SKILL.md') -PathType Leaf)) { throw '找不到 Skill 源文件。' }
New-Item -ItemType Directory -Path $Target -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $Target -Recurse -Force
Write-Host '安装完成。请启动拾藏客户端并在设置中启用本地 MCP。'
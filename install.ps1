# Installs the Sitewright skill for Claude Code on Windows.
#
#   .\install.ps1              personal install  -> $HOME\.claude\skills\sitewright   (every project)
#   .\install.ps1 -Project     project install   -> .\.claude\skills\sitewright       (this folder only; commit it to share with a team)
#   .\install.ps1 -Dir <path>  install into <path>\sitewright
#
# It copies files; it does not run npm, touch your settings, or send anything anywhere.
param(
  [switch]$Project,
  [string]$Dir = ''
)
$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $here 'skill\sitewright'
if (-not (Test-Path (Join-Path $src 'SKILL.md'))) { throw "sitewright: cannot find $src\SKILL.md - run this from a full clone of the repository." }

if ($Dir) { $base = $Dir }
elseif ($Project) { $base = Join-Path (Get-Location) '.claude\skills' }
else {
  $cfg = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { Join-Path $HOME '.claude' }
  $base = Join-Path $cfg 'skills'
}

$dest = Join-Path $base 'sitewright'
if (Test-Path $dest) { Write-Host "sitewright: $dest already exists - replacing it with this version."; Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $base | Out-Null
Copy-Item $src $dest -Recurse

Write-Host "sitewright: installed to $dest"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Start a new Claude Code session (skills are read when a session starts)."
Write-Host '  2. Ask:  "Use Sitewright to make a landing page and a dashboard for my business"'
Write-Host "     or type  /sitewright"
Write-Host "  3. For the browser tests it runs, you need Node 20+ and:  npm i playwright; npx playwright install chromium"

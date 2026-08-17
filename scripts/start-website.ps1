$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $siteRoot
$env:LUMI_SITE_HOST = '127.0.0.1'
$env:LUMI_SITE_PORT = '4173'
node server.mjs

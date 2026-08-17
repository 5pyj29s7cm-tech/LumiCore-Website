param(
  [string]$ConfigPath = "$env:USERPROFILE\.cloudflared\config.yml",
  [string]$TunnelName = "lumi-website"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Cloudflare config not found: $ConfigPath"
}
cloudflared tunnel --config $ConfigPath run $TunnelName

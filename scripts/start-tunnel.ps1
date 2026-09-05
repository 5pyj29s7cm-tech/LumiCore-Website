param(
  [string]$ConfigPath = "$env:ProgramData\LumiCore\cloudflared\lumi.yml",
  [string]$TunnelName = "lumi"
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Cloudflare config not found: $ConfigPath"
}
cloudflared tunnel --config $ConfigPath run $TunnelName

$ErrorActionPreference = 'Stop'
$siteRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $siteRoot
if (Test-Path -LiteralPath (Join-Path $siteRoot '.cloudflared')) {
  throw 'Move Cloudflare credentials and runtime files outside the website directory before starting production.'
}

$runtimeRoot = Join-Path $env:ProgramData 'LumiCore\website'
$logDirectory = Join-Path $runtimeRoot 'logs'
$logAcl = New-Object System.Security.AccessControl.DirectorySecurity
$logAcl.SetAccessRuleProtection($true, $false)
foreach ($sidValue in @('S-1-5-18', 'S-1-5-32-544')) {
  $sid = New-Object System.Security.Principal.SecurityIdentifier($sidValue)
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $logAcl.AddAccessRule($rule)
}
foreach ($directory in @($runtimeRoot, $logDirectory)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  if ((Get-Item -Force -LiteralPath $directory).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    throw 'Website runtime directories must not be junctions or symbolic links.'
  }
  Set-Acl -LiteralPath $directory -AclObject $logAcl
}
$env:LUMI_SITE_HOST = '127.0.0.1'
$env:LUMI_SITE_PORT = '80'
$env:LUMI_SITE_LOG_DIR = $logDirectory
& 'D:\node.exe' server.mjs
exit $LASTEXITCODE

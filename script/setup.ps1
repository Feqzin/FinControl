param(
  [switch]$Migrate
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

Write-Host "[setup] Instalando dependencias..."
npm install
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if ($Migrate) {
  npm run setup -- --migrate
} else {
  npm run setup
}

exit $LASTEXITCODE

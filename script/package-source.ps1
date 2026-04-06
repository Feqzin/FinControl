param(
  [string]$OutputName = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

try {
  $trackedFiles = git ls-files
  if (-not $trackedFiles) {
    throw "Nenhum arquivo rastreado encontrado. Verifique se este diretorio e um repositorio git."
  }

  $blockedEntries = @(".env", ".env.local", "node_modules", "dist", ".git")
  foreach ($file in $trackedFiles) {
    $normalized = $file -replace "\\", "/"
    foreach ($blocked in $blockedEntries) {
      if ($normalized -eq $blocked -or $normalized.StartsWith("$blocked/")) {
        throw "Arquivo/pasta sensivel rastreado no git: '$normalized'. Corrija antes de gerar pacote."
      }
    }
  }

  if ([string]::IsNullOrWhiteSpace($OutputName)) {
    $OutputName = "debt-control-source-{0}.zip" -f (Get-Date -Format "yyyyMMdd-HHmmss")
  } elseif (-not $OutputName.EndsWith(".zip", [System.StringComparison]::OrdinalIgnoreCase)) {
    $OutputName = "$OutputName.zip"
  }

  $artifactsDir = Join-Path $repoRoot "artifacts"
  New-Item -ItemType Directory -Path $artifactsDir -Force | Out-Null

  $outputZip = Join-Path $artifactsDir $OutputName
  if (Test-Path $outputZip) {
    Remove-Item -LiteralPath $outputZip -Force
  }

  $stagingDir = Join-Path ([System.IO.Path]::GetTempPath()) ("debt-control-source-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Path $stagingDir | Out-Null

  try {
    foreach ($relativePath in $trackedFiles) {
      $sourcePath = Join-Path $repoRoot $relativePath
      if (-not (Test-Path -LiteralPath $sourcePath)) {
        continue
      }

      $destinationPath = Join-Path $stagingDir $relativePath
      $destinationDir = Split-Path $destinationPath -Parent
      if (-not (Test-Path -LiteralPath $destinationDir)) {
        New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
      }

      Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    }

    Compress-Archive -Path (Join-Path $stagingDir "*") -DestinationPath $outputZip -CompressionLevel Optimal
  } finally {
    if (Test-Path -LiteralPath $stagingDir) {
      Remove-Item -LiteralPath $stagingDir -Recurse -Force
    }
  }

  Write-Host "Pacote source-only gerado em: $outputZip"
} finally {
  Pop-Location
}

param(
  [string]$OutputName = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $repoRoot

function Test-PathSegment {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Segment
  )

  $escapedSegment = [Regex]::Escape($Segment)
  return $Path -match "(^|/)$escapedSegment(/|$)"
}

try {
  $trackedFiles = git ls-files
  if (-not $trackedFiles) {
    throw "Nenhum arquivo rastreado encontrado. Verifique se este diretorio e um repositorio git."
  }

  $blockedCriticalPathSegments = @(
    ".git",
    "node_modules",
    "dist"
  )

  $excludedPathSegments = @(
    "artifacts",
    "diagnostics",
    "attached_assets",
    ".local",
    ".agents",
    ".config",
    ".cache"
  )

  $repoLeafName = Split-Path -Path $repoRoot -Leaf
  $duplicateProjectSegments = @("Debt-Control", $repoLeafName) `
    | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } `
    | Sort-Object -Unique
  $excludedPathSegments += $duplicateProjectSegments

  $blockedExtensions = @(".zip", ".7z", ".tar.gz", ".tar", ".tgz")
  $blockedSensitiveExtensions = @(".pem", ".key", ".p12", ".pfx", ".kdbx", ".crt")
  $excludedTracked = New-Object 'System.Collections.Generic.HashSet[string]'

  :trackedLoop foreach ($file in $trackedFiles) {
    $normalized = $file -replace "\\", "/"
    $sourcePath = Join-Path $repoRoot $file

    if (-not (Test-Path -LiteralPath $sourcePath)) {
      continue
    }

    if ($normalized -match '(^|/)\.env(\..+)?$' -and $normalized -ne ".env.example") {
      throw "Arquivo sensivel rastreado no git: '$normalized'. Corrija antes de gerar pacote."
    }

    if ($normalized -match '(^|/)\.envrc$') {
      throw "Arquivo sensivel rastreado no git: '$normalized'. Corrija antes de gerar pacote."
    }

    foreach ($blocked in $blockedCriticalPathSegments) {
      if (Test-PathSegment -Path $normalized -Segment $blocked) {
        throw "Pasta critica indevida rastreada no git: '$normalized'. Corrija antes de gerar pacote."
      }
    }

    foreach ($excluded in $excludedPathSegments) {
      if (Test-PathSegment -Path $normalized -Segment $excluded) {
        $excludedTracked.Add($normalized) | Out-Null
        continue trackedLoop
      }
    }

    foreach ($extension in $blockedExtensions) {
      if ($normalized.EndsWith($extension, [System.StringComparison]::OrdinalIgnoreCase)) {
        $excludedTracked.Add($normalized) | Out-Null
        continue
      }
    }

    foreach ($extension in $blockedSensitiveExtensions) {
      if ($normalized.EndsWith($extension, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Arquivo potencialmente sensivel rastreado no git: '$normalized'. Corrija antes de gerar pacote."
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
      $normalized = $relativePath -replace "\\", "/"
      if ($excludedTracked.Contains($normalized)) {
        continue
      }

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

  if ($excludedTracked.Count -gt 0) {
    Write-Host "Aviso: $($excludedTracked.Count) arquivos rastreados foram excluidos automaticamente do pacote por politica de seguranca."
    $preview = $excludedTracked | Sort-Object | Select-Object -First 25
    $preview | ForEach-Object { Write-Host "  - $_" }
    if ($excludedTracked.Count -gt 25) {
      Write-Host "  ... e mais $($excludedTracked.Count - 25) arquivo(s)."
    }
  }

  Write-Host "Pacote source-only gerado em: $outputZip"
} finally {
  Pop-Location
}

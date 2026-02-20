$ErrorActionPreference = "Stop"

$outDir = Join-Path $PSScriptRoot "..\out"
$outDir = [System.IO.Path]::GetFullPath($outDir)

if (!(Test-Path $outDir)) {
  Write-Host "No out directory found: $outDir"
  exit 0
}

$files = Get-ChildItem -Path $outDir -File -Recurse | Where-Object {
  $_.Extension -in @(".exe", ".msi", ".zip", ".yml", ".blockmap")
}

if ($files.Count -eq 0) {
  Write-Host "No release artifacts found in $outDir"
  exit 0
}

$lines = @("# Titan Desktop Checksums", "")
foreach ($file in $files) {
  $hash = Get-FileHash -Path $file.FullName -Algorithm SHA256
  $relativePath = $file.FullName.Substring($outDir.Length).TrimStart("\")
  $lines += "- $relativePath"
  $lines += "  - sha256: $($hash.Hash.ToLower())"
}

$checksumFile = Join-Path $outDir "checksums.txt"
$lines | Set-Content -Path $checksumFile -Encoding UTF8
Write-Host "Checksums written to $checksumFile"

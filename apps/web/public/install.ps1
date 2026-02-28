#Requires -Version 5.1
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Titan Always-On Daemon Installer" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "Error: Node.js is not installed." -ForegroundColor Red
    Write-Host "Please install Node.js 22+ from https://nodejs.org"
    exit 1
}

$nodeVersion = (node -v) -replace 'v', '' -split '\.' | Select-Object -First 1
if ([int]$nodeVersion -lt 22) {
    Write-Host "Error: Node.js 22+ is required (found v$(node -v))." -ForegroundColor Red
    Write-Host "Please upgrade from https://nodejs.org"
    exit 1
}

Write-Host "Node.js $(node -v) detected" -ForegroundColor Green
Write-Host ""

# Install titan-daemon
Write-Host "Installing titan-daemon..."
npm install -g titan-daemon@latest

Write-Host ""
Write-Host "Running setup wizard..."
titan-daemon setup

Write-Host ""
Write-Host "Titan Always-On Daemon installed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Commands:"
Write-Host "  titan-daemon status   - Check daemon status"
Write-Host "  titan-daemon logs     - View Alfred logs"
Write-Host "  titan-daemon restart  - Restart the daemon"
Write-Host "  titan-daemon stop     - Stop the daemon"
Write-Host ""

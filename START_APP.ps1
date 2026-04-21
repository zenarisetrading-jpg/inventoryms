# Inventory OS Startup Script (PowerShell)
Write-Host "Checking environment..." -ForegroundColor Cyan

$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

# Navigate to frontend
Set-Location "$root\frontend"

# Check node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies (this may take a minute)..." -ForegroundColor Yellow
    npm install
}

# Start Vite
Write-Host "Launching dev server..." -ForegroundColor Green
npm run dev

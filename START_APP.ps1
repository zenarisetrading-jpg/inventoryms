# ZenVentory Startup Engine
Clear-Host
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "     ZENVENTORY OPERATIONS ENGINE         " -ForegroundColor Cyan -NoNewline
Write-Host " [AUTH]" -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

# 1. Environment Verification
Write-Host "[1/3] Verifying Environment..." -ForegroundColor White
if (-not (Test-Path "$root\frontend\.env")) {
    Write-Host "WARNING: .env file missing in frontend directory!" -ForegroundColor Red
    Write-Host "Creating template .env file..." -ForegroundColor Gray
    "VITE_SUPABASE_URL=`nVITE_SUPABASE_ANON_KEY=" | Out-File -FilePath "$root\frontend\.env" -Encoding utf8
}

# 2. Dependency Management
Set-Location "$root\frontend"
if (-not (Test-Path "node_modules")) {
    Write-Host "[2/3] Installing Dependencies..." -ForegroundColor White
    npm install
} else {
    Write-Host "[2/3] Dependencies Verified." -ForegroundColor Green
}

# 3. Application Launch
Write-Host "[3/3] Launching Secure Environment..." -ForegroundColor White
Write-Host "------------------------------------------" -ForegroundColor Cyan
Write-Host "Access the portal at: http://localhost:5173" -ForegroundColor Green
Write-Host "Status: Authenticated Mode Enabled" -ForegroundColor Yellow
Write-Host "------------------------------------------" -ForegroundColor Cyan

npm run dev

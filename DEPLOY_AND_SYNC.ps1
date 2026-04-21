# DEPLOY_AND_SYNC.ps1
# This script handles everything: deployments AND starting a new sync.

Write-Host "--- S2C STARTUP ENGINE ---" -ForegroundColor Cyan

$env:VITE_SUPABASE_URL = "https://eiezhzlpirdiqsotvogx.supabase.co"
$env:VITE_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZXpoemxwaXJkaXFzb3R2b2d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMTEwMDMsImV4cCI6MjA4Nzc4NzAwM30.s_vewTvQP-n8j9Z-ncRAsgf_-wslJDk7kBWvMLM7gbg"

# Step 1: Deploy latest logic
Write-Host "Deploying latest Replenishment Logic..." -ForegroundColor Yellow
npx supabase functions deploy sync upload-locad-report dashboard --project-ref eiezhzlpirdiqsotvogx

# Step 2: Trigger Sync
Write-Host "Triggering Full System Sync (this may take 10-20 seconds)..." -ForegroundColor Yellow
$response = Invoke-RestMethod -Method Post `
  -Uri "$($env:VITE_SUPABASE_URL)/functions/v1/sync/all" `
  -Headers @{ Authorization = "Bearer $($env:VITE_SUPABASE_ANON_KEY)" }

Write-Host "--- SYNC COMPLETE ---" -ForegroundColor Green
$response | ConvertTo-Json

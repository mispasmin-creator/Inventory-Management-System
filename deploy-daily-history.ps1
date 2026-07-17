# Sets the Edge Function secrets from .env and deploys daily-inventory-history.
# Run from the project root:  .\deploy-daily-history.ps1

$ErrorActionPreference = 'Stop'
$projectRef = 'ozrgaddkpixwvcyypqid'

# --- read .env ---
$envPath = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $envPath)) { throw ".env not found at $envPath" }

$envVars = @{}
foreach ($line in Get-Content $envPath) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $idx = $trimmed.IndexOf('=')
    if ($idx -lt 1) { continue }
    $envVars[$trimmed.Substring(0, $idx).Trim()] = $trimmed.Substring($idx + 1).Trim()
}

# The service_role key is injected by Supabase automatically, so it is not here.
$needed = @(
    'PURCHASE_URL', 'PURCHASE_ANON_KEY',
    'PRODUCTION_URL', 'PRODUCTION_ANON_KEY',
    'ORDER_URL', 'ORDER_ANON_KEY',
    'SALES_OF_RAW_MATERIAL_URL', 'SALES_OF_RAW_MATERIAL_ANON_KEY'
)

$missing = $needed | Where-Object { -not $envVars.ContainsKey($_) -or $envVars[$_] -eq '' }
if ($missing) { throw "Missing in .env: $($missing -join ', ')" }

# .env has the URL and key swapped for this project in some checkouts; api.js
# works around it at runtime, so do the same here.
if ($envVars['SALES_OF_RAW_MATERIAL_URL'].StartsWith('eyJ')) {
    $tmp = $envVars['SALES_OF_RAW_MATERIAL_URL']
    $envVars['SALES_OF_RAW_MATERIAL_URL'] = $envVars['SALES_OF_RAW_MATERIAL_ANON_KEY']
    $envVars['SALES_OF_RAW_MATERIAL_ANON_KEY'] = $tmp
    Write-Host 'Note: swapped SALES_OF_RAW_MATERIAL url/key (they are reversed in .env).'
}

# Invoke npx directly. Going through the call operator (`& npx ...`) makes npm
# lose the package spec and fail with "could not determine executable to run".
Write-Host "`n=== 1/2  Setting secrets ===" -ForegroundColor Cyan
$secretArgs = $needed | ForEach-Object { "$_=$($envVars[$_])" }
npx supabase secrets set --project-ref $projectRef $secretArgs
if ($LASTEXITCODE -ne 0) { throw 'Setting secrets failed.' }

Write-Host "`n=== 2/2  Deploying function ===" -ForegroundColor Cyan
npx supabase functions deploy daily-inventory-history --project-ref $projectRef
if ($LASTEXITCODE -ne 0) { throw 'Deploy failed.' }

Write-Host "`nDone. Function deployed and secrets set." -ForegroundColor Green

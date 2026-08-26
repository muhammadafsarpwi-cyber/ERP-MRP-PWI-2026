#!/usr/bin/env pwsh
# db-inspect.ps1 — Login, fetch all master-data, dump to JSON files
# Requires: PowerShell 5.1+, Invoke-WebRequest

$ErrorActionPreference = 'Stop'
$Base = 'http://localhost:3001/api/v1'
$OutDir = 'D:\ERP-MRP-PWI-2026\backend\scripts\out'

# Ensure output directory exists
if (!(Test-Path -LiteralPath $OutDir)) {
    New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
    Write-Host "[OK] Created output directory: $OutDir"
}

# --- 1. Login ---
Write-Host "`n=== Logging in ==="
$loginBody = '{"email":"dev@erp-local.test","password":"Dev#2026Test"}'
try {
    $loginResp = Invoke-WebRequest -Uri "$Base/auth/login" -Method Post -Body $loginBody -ContentType 'application/json; charset=utf-8' -UseBasicParsing
    $loginJson = $loginResp.Content | ConvertFrom-Json
    Write-Host "[DEBUG] Login response keys: $($loginJson.PSObject.Properties.Name -join ', ')"
    $token = $loginJson.token
    if (-not $token) { $token = $loginJson.access_token }
    if (-not $token) { throw "No token in login response. Full: $($loginResp.Content.Substring(0, [Math]::Min(500, $loginResp.Content.Length)))" }
    Write-Host "[OK] Login successful. Token length: $($token.Length)"
} catch {
    Write-Host "[FAIL] Login failed: $_"
    exit 1
}

$headers = @{
    'Authorization' = "Bearer $token"
    'Content-Type'  = 'application/json; charset=utf-8'
}

# --- 2. Define endpoints to fetch ---
$endpoints = @(
    @{ Name = 'items';          Url = "$Base/master-data/items?page=1&limit=1000" },
    @{ Name = 'uoms';           Url = "$Base/master-data/uom?page=1&limit=100" },
    @{ Name = 'categories';     Url = "$Base/master-data/categories?page=1&limit=100" },
    @{ Name = 'divisions';      Url = "$Base/divisions?page=1&limit=100" },
    @{ Name = 'sections';       Url = "$Base/sections?page=1&limit=100" },
    @{ Name = 'departments';    Url = "$Base/departments?page=1&limit=100" },
    @{ Name = 'companies';      Url = "$Base/companies?page=1&limit=100" },
    @{ Name = 'branches';       Url = "$Base/branches?page=1&limit=100" },
    @{ Name = 'business-units'; Url = "$Base/business-units?page=1&limit=100" },
    @{ Name = 'warehouses';     Url = "$Base/warehouses?page=1&limit=100" },
    @{ Name = 'warehouse-locations'; Url = "$Base/warehouse-locations?page=1&limit=100" },
    @{ Name = 'routings';       Url = "$Base/production/routings" },
    @{ Name = 'machines';       Url = "$Base/machines?page=1&limit=100" },
    @{ Name = 'machine-targets'; Url = "$Base/production/machine-targets?page=1&limit=100" },
    @{ Name = 'boms';           Url = "$Base/bom?page=1&limit=100" },
    @{ Name = 'customers';      Url = "$Base/customer/customers?page=1&limit=100" },
    @{ Name = 'suppliers';      Url = "$Base/procurement/suppliers?page=1&limit=100" }
)

# --- 3. Fetch each endpoint and save ---
foreach ($ep in $endpoints) {
    $name = $ep.Name
    $url  = $ep.Url
    $outFile = Join-Path $OutDir "out-$name.json"
    Write-Host "`n--- Fetching $name ---"
    Write-Host "  URL: $url"
    try {
        $resp = Invoke-WebRequest -Uri $url -Method Get -Headers $headers -UseBasicParsing
        $content = $resp.Content
        # Pretty-print JSON
        $pretty = ($content | ConvertFrom-Json) | ConvertTo-Json -Depth 50
        [System.IO.File]::WriteAllText($outFile, $pretty, [System.Text.UTF8Encoding]::new($false))
        # Count records
        $parsed = $content | ConvertFrom-Json
        $count = 0
        if ($parsed.data -is [System.Array]) { $count = $parsed.data.Count }
        elseif ($parsed.total -ne $null)    { $count = $parsed.total }
        Write-Host "[OK] Saved $count records -> $outFile"
    } catch {
        $statusCode = ''
        if ($_.Exception.Response) { $statusCode = [int]$_.Exception.Response.StatusCode }
        Write-Host "[WARN] $name failed (HTTP $statusCode): $_"
        $errJson = "{`"error`": true, `"endpoint`": `"$name`", `"message`": `"$($_.Exception.Message)`", `"statusCode`": $statusCode}"
        [System.IO.File]::WriteAllText($outFile, $errJson, [System.Text.UTF8Encoding]::new($false))
    }
}

# --- 4. Fetch routing operations (nested under each routing) ---
Write-Host "`n--- Fetching routing operations (per routing) ---"
$routingsFile = Join-Path $OutDir 'out-routings.json'
$opsFile = Join-Path $OutDir 'out-ops.json'
if (Test-Path $routingsFile) {
    $routingsJson = [System.IO.File]::ReadAllText($routingsFile) | ConvertFrom-Json
    $allOps = @()
    if ($routingsJson.data -is [System.Array]) {
        foreach ($r in $routingsJson.data) {
            $rid = $r.id
            if ($rid) {
                try {
                    $rResp = Invoke-WebRequest -Uri "$Base/production/routings/$rid" -Method Get -Headers $headers -UseBasicParsing
                    $rDetail = ($rResp.Content | ConvertFrom-Json)
                    if ($rDetail.data.operations -is [System.Array]) {
                        foreach ($op in $rDetail.data.operations) {
                            $op | Add-Member -NotePropertyName 'routingId' -NotePropertyValue $rid -Force
                            $op | Add-Member -NotePropertyName 'routingCode' -NotePropertyValue ($r.code) -Force
                            $allOps += $op
                        }
                    }
                } catch {
                    Write-Host "  [WARN] Could not fetch routing $rid : $_"
                }
            }
        }
    }
    $opsObj = @{ success = $true; data = $allOps; total = $allOps.Count }
    $opsPretty = $opsObj | ConvertTo-Json -Depth 50
    [System.IO.File]::WriteAllText($opsFile, $opsPretty, [System.Text.UTF8Encoding]::new($false))
    Write-Host "[OK] Collected $($allOps.Count) operations across all routings -> $opsFile"
}

Write-Host "`n=== DONE ==="
Write-Host "All output files are in: $OutDir"

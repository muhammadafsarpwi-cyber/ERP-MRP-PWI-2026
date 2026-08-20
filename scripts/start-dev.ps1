#Requires -Version 5.1
<#
.SYNOPSIS
    Start ERP-MRP-PWI-2026 local development environment.
.DESCRIPTION
    Starts backend (port 3001) and frontend (port 3000).
    Detects existing processes to avoid duplicates.
    Verifies HTTP health with bounded timeouts.
.PARAMETER SkipFrontend
    Skip starting the frontend dev server.
.PARAMETER SkipBackend
    Skip starting the backend server.
.EXAMPLE
    .\scripts\start-dev.ps1
    .\scripts\start-dev.ps1 -SkipFrontend
#>
param(
    [switch]$SkipFrontend,
    [switch]$SkipBackend
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$BackendDir = Join-Path $ProjectRoot "backend"
$FrontendDir = Join-Path $ProjectRoot "frontend"
$PidFile = Join-Path $ProjectRoot "scripts\.erp-dev-pids.json"
$TimeoutSec = 180

function Test-TcpPort {
    param([int]$Port)
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $ar = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        $wait = $ar.AsyncWaitHandle.WaitOne(2000, $false)
        if ($wait) {
            try { $tcp.EndConnect($ar) } catch {}
            $connected = $tcp.Connected
            $tcp.Close()
            return $connected
        }
        $tcp.Close()
        return $false
    } catch {
        return $false
    }
}

function Get-PortProcess {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($conn) { return (Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue) }
    } catch {}
    return $null
}

function Test-HttpEndpoint {
    param([string]$Url, [int]$TimeoutSec = 5)
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return @{ Ok = $true; StatusCode = $resp.StatusCode }
    } catch {
        return @{ Ok = $false; StatusCode = 0 }
    }
}

function Start-Backend {
    if (Test-TcpPort -Port 3001) {
        $proc = Get-PortProcess -Port 3001
        $name = if ($proc) { "$($proc.ProcessName) (PID: $($proc.Id))" } else { "unknown process" }
        Write-Host "[SKIP] Backend already running on port 3001 - $name" -ForegroundColor Yellow
        if ($proc) { return $proc.Id }
        return 0
    }

    Write-Host "[START] Starting backend on port 3001..." -ForegroundColor Cyan

    $mainJs = Join-Path $BackendDir "dist\main.js"
    if (-not (Test-Path $mainJs)) {
        Write-Host "[BUILD] dist/main.js not found. Building backend..." -ForegroundColor Yellow
        Push-Location $BackendDir
        & npx nest build 2>&1 | Out-Null
        if (-not (Test-Path $mainJs)) {
            & npx tsc 2>&1 | Out-Null
        }
        Pop-Location
        if (-not (Test-Path $mainJs)) {
            Write-Host "[ERROR] Backend build failed. dist/main.js still missing." -ForegroundColor Red
            return $null
        }
        Write-Host "[BUILD] Backend build complete." -ForegroundColor Green
    }

    $startInfo = Start-Process -FilePath "node" `
        -ArgumentList "dist/main.js" `
        -WorkingDirectory $BackendDir `
        -NoNewWindow `
        -PassThru

    Write-Host "[START] Backend process started (PID: $($startInfo.Id))" -ForegroundColor Green
    return $startInfo.Id
}

function Start-Frontend {
    if (Test-TcpPort -Port 3000) {
        $proc = Get-PortProcess -Port 3000
        $name = if ($proc) { "$($proc.ProcessName) (PID: $($proc.Id))" } else { "unknown process" }
        Write-Host "[SKIP] Frontend already running on port 3000 - $name" -ForegroundColor Yellow
        if ($proc) { return $proc.Id }
        return 0
    }

    Write-Host "[START] Starting frontend on port 3000..." -ForegroundColor Cyan

    $reactScripts = Join-Path $FrontendDir "node_modules\.bin\react-scripts.cmd"
    if (-not (Test-Path $reactScripts)) {
        Write-Host "[BUILD] Installing frontend dependencies..." -ForegroundColor Yellow
        Push-Location $FrontendDir
        & npm install --legacy-peer-deps 2>&1 | Out-Null
        Pop-Location
        if (-not (Test-Path $reactScripts)) {
            Write-Host "[ERROR] Frontend dependencies install failed." -ForegroundColor Red
            return $null
        }
        Write-Host "[BUILD] Frontend dependencies installed." -ForegroundColor Green
    }

    $startInfo = Start-Process -FilePath "cmd.exe" `
        @("/c", "set BROWSER=none&& cd /d `"$FrontendDir`" && node_modules\.bin\react-scripts.cmd start") `
        -NoNewWindow `
        -PassThru

    Write-Host "[START] Frontend process started (PID: $($startInfo.Id))" -ForegroundColor Green
    return $startInfo.Id
}

function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSec = 180, [string]$ServiceName)
    $elapsed = 0
    while ($elapsed -lt $TimeoutSec) {
        if (Test-TcpPort -Port $Port) {
            Write-Host "[WAIT] $ServiceName ready on port $Port after ${elapsed}s" -ForegroundColor Green
            return $true
        }
        Start-Sleep -Seconds 3
        $elapsed += 3
        if ($elapsed % 15 -eq 0) {
            Write-Host "[WAIT] $ServiceName still starting... (${elapsed}s / ${TimeoutSec}s)" -ForegroundColor DarkYellow
        }
    }
    Write-Host "[FAIL] $ServiceName did not start within ${TimeoutSec}s on port $Port" -ForegroundColor Red
    return $false
}

# --- MAIN ---
Write-Host ""
Write-Host "================================================" -ForegroundColor White
Write-Host "  ERP-MRP-PWI-2026 Local Development Startup" -ForegroundColor White
Write-Host "================================================" -ForegroundColor White
Write-Host ""

$results = @{
    Frontend = "FAIL"
    Backend  = "FAIL"
    API      = "FAIL"
    Browser  = "FAIL"
}

$backendPid = $null
$frontendPid = $null

# --- Backend ---
if (-not $SkipBackend) {
    $backendPid = Start-Backend
    if ($backendPid) {
        $backendReady = Wait-ForPort -Port 3001 -TimeoutSec $TimeoutSec -ServiceName "Backend"
        if ($backendReady) {
            Start-Sleep -Seconds 3
            $health = Test-HttpEndpoint -Url "http://localhost:3001/api/v1/health"
            if ($health.Ok) {
                $results.Backend = "PASS"
                Write-Host "[HEALTH] Backend health check: PASS (HTTP $($health.StatusCode))" -ForegroundColor Green
            } else {
                Write-Host "[HEALTH] Backend port open but health endpoint failed" -ForegroundColor Red
            }
        }
    }
} else {
    if (Test-TcpPort -Port 3001) {
        $results.Backend = "PASS"
        Write-Host "[SKIP] Backend check skipped, port 3001 is listening" -ForegroundColor Yellow
    }
}

# --- Swagger ---
if ($results.Backend -eq "PASS") {
    $swagger = Test-HttpEndpoint -Url "http://localhost:3001/api/docs"
    if ($swagger.Ok) {
        $results.API = "PASS"
        Write-Host "[HEALTH] Swagger docs: PASS (HTTP $($swagger.StatusCode))" -ForegroundColor Green
    } else {
        Write-Host "[HEALTH] Swagger docs endpoint failed" -ForegroundColor Red
    }
}

# --- Frontend ---
if (-not $SkipFrontend) {
    $frontendPid = Start-Frontend
    if ($frontendPid) {
        $frontendReady = Wait-ForPort -Port 3000 -TimeoutSec $TimeoutSec -ServiceName "Frontend"
        if ($frontendReady) {
            Start-Sleep -Seconds 5
            $browser = Test-HttpEndpoint -Url "http://localhost:3000"
            if ($browser.Ok) {
                $results.Frontend = "PASS"
                $results.Browser = "PASS"
                Write-Host "[HEALTH] Frontend serving React app: PASS (HTTP $($browser.StatusCode))" -ForegroundColor Green
            } else {
                Write-Host "[HEALTH] Frontend port open but HTTP failed" -ForegroundColor Red
            }
        }
    }
} else {
    if (Test-TcpPort -Port 3000) {
        $results.Frontend = "PASS"
        $results.Browser = "PASS"
        Write-Host "[SKIP] Frontend check skipped, port 3000 is listening" -ForegroundColor Yellow
    }
}

# --- Save PIDs for stop-dev.ps1 ---
$pidData = @{
    backendPid  = $backendPid
    frontendPid = $frontendPid
    startedAt   = (Get-Date).ToString("o")
}
$pidData | ConvertTo-Json | Set-Content -Path $PidFile -Force

# --- Frontend -> Backend communication check ---
if ($results.Frontend -eq "PASS" -and $results.Backend -eq "PASS") {
    $envContent = Get-Content (Join-Path $FrontendDir ".env") -ErrorAction SilentlyContinue
    if ($envContent -match "REACT_APP_API_URL=http://localhost:3001/api/v1") {
        Write-Host "[CONFIG] Frontend -> Backend URL configured correctly" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Frontend .env may not point to localhost:3001/api/v1" -ForegroundColor Yellow
    }
}

# --- Summary ---
Write-Host ""
Write-Host "================================================" -ForegroundColor White
Write-Host "  STARTUP RESULTS" -ForegroundColor White
Write-Host "================================================" -ForegroundColor White
Write-Host "  Frontend 3000: $($results.Frontend)" -ForegroundColor $(if ($results.Frontend -eq "PASS") { "Green" } else { "Red" })
Write-Host "  Backend  3001: $($results.Backend)" -ForegroundColor $(if ($results.Backend -eq "PASS") { "Green" } else { "Red" })
Write-Host "  Swagger:      $($results.API)" -ForegroundColor $(if ($results.API -eq "PASS") { "Green" } else { "Red" })
Write-Host "  Browser:      $($results.Browser)" -ForegroundColor $(if ($results.Browser -eq "PASS") { "Green" } else { "Red" })
Write-Host ""
Write-Host "  URLs:" -ForegroundColor White
Write-Host "    Frontend:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "    Backend:   http://localhost:3001/api/v1" -ForegroundColor Cyan
Write-Host "    Swagger:   http://localhost:3001/api/docs" -ForegroundColor Cyan
Write-Host "    Health:    http://localhost:3001/api/v1/health" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor White
Write-Host ""

$allPass = ($results.Frontend -eq "PASS") -and ($results.Backend -eq "PASS")
if ($allPass) {
    Write-Host "RESULT: PASS" -ForegroundColor Green
} else {
    Write-Host "RESULT: FAIL" -ForegroundColor Red
}

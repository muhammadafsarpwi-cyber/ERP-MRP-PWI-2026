#Requires -Version 5.1
<#
.SYNOPSIS
    Stop ERP-MRP-PWI-2026 local development processes.
.DESCRIPTION
    Safely stops only the ERP development processes on ports 3000 and 3001.
    Uses PID file from start-dev.ps1 when available, falls back to port detection.
.PARAMETER Force
    Force kill without waiting for graceful shutdown.
.EXAMPLE
    .\scripts\stop-dev.ps1
    .\scripts\stop-dev.ps1 -Force
#>
param(
    [switch]$Force
)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$PidFile = Join-Path $ProjectRoot "scripts\.erp-dev-pids.json"

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

function Get-PortProcessId {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
        if ($conn) { return $conn.OwningProcess }
    } catch {}
    return $null
}

Write-Host ""
Write-Host "================================================" -ForegroundColor White
Write-Host "  ERP-MRP-PWI-2026 Local Development Shutdown" -ForegroundColor White
Write-Host "================================================" -ForegroundColor White
Write-Host ""

$results = @{
    Backend  = "STOPPED"
    Frontend = "STOPPED"
}

function Stop-Safe {
    param([int]$ProcessId, [string]$ServiceName, [switch]$ForceKill)

    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if (-not $proc) {
        Write-Host "[OK] $ServiceName process (PID $ProcessId) already gone" -ForegroundColor Yellow
        return "STOPPED"
    }

    Write-Host "[STOP] $ServiceName (PID: $ProcessId, $($proc.ProcessName))" -ForegroundColor Cyan

    if ($ForceKill) {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    } else {
        Stop-Process -Id $ProcessId -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        $still = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
        if ($still) {
            Write-Host "[FORCE] $ServiceName did not stop gracefully, force killing..." -ForegroundColor Yellow
            Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
        }
    }

    Start-Sleep -Seconds 1
    return "STOPPED"
}

# --- Try PID file first ---
if (Test-Path $PidFile) {
    try {
        $pidData = Get-Content $PidFile -Raw | ConvertFrom-Json
        Write-Host "[INFO] Found PID file from $(if ($pidData.startedAt) { $pidData.startedAt } else { 'unknown time' })" -ForegroundColor DarkGray

        if ($pidData.backendPid) {
            Stop-Safe -ProcessId $pidData.backendPid -ServiceName "Backend" -ForceKill:$Force
        }

        if ($pidData.frontendPid) {
            Stop-Safe -ProcessId $pidData.frontendPid -ServiceName "Frontend" -ForceKill:$Force
        }
    } catch {
        Write-Host "[WARN] Could not parse PID file: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# --- Port-based cleanup (catches orphans) ---
Write-Host ""
Write-Host "[CHECK] Verifying ports are freed..." -ForegroundColor DarkGray

# Backend (port 3001)
if (Test-TcpPort -Port 3001) {
    $targetPid = Get-PortProcessId -Port 3001
    if ($targetPid) {
        Stop-Safe -ProcessId $targetPid -ServiceName "Backend (orphan)" -ForceKill:$Force
    }
    Start-Sleep -Seconds 1
    if (Test-TcpPort -Port 3001) {
        Write-Host "[FAIL] Backend still responding on port 3001" -ForegroundColor Red
        $results.Backend = "FAIL"
    } else {
        Write-Host "[OK] Backend stopped (port 3001 freed)" -ForegroundColor Green
    }
} else {
    Write-Host "[OK] Backend not running on port 3001" -ForegroundColor Yellow
}

# Frontend (port 3000)
if (Test-TcpPort -Port 3000) {
    $targetPid = Get-PortProcessId -Port 3000
    if ($targetPid) {
        Stop-Safe -ProcessId $targetPid -ServiceName "Frontend (orphan)" -ForceKill:$Force
    }
    Start-Sleep -Seconds 1
    if (Test-TcpPort -Port 3000) {
        Write-Host "[FAIL] Frontend still responding on port 3000" -ForegroundColor Red
        $results.Frontend = "FAIL"
    } else {
        Write-Host "[OK] Frontend stopped (port 3000 freed)" -ForegroundColor Green
    }
} else {
    Write-Host "[OK] Frontend not running on port 3000" -ForegroundColor Yellow
}

# --- Clean up PID file ---
if (Test-Path $PidFile) {
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] PID file removed" -ForegroundColor DarkGray
}

# --- Summary ---
Write-Host ""
Write-Host "================================================" -ForegroundColor White
Write-Host "  STOP RESULTS" -ForegroundColor White
Write-Host "================================================" -ForegroundColor White
Write-Host "  Frontend 3000: $($results.Frontend)" -ForegroundColor $(if ($results.Frontend -eq "STOPPED") { "Green" } else { "Red" })
Write-Host "  Backend  3001: $($results.Backend)" -ForegroundColor $(if ($results.Backend -eq "STOPPED") { "Green" } else { "Red" })
Write-Host "================================================" -ForegroundColor White
Write-Host ""

$allStopped = ($results.Frontend -eq "STOPPED") -and ($results.Backend -eq "STOPPED")
if ($allStopped) {
    Write-Host "RESULT: All ERP dev services stopped." -ForegroundColor Green
} else {
    Write-Host "RESULT: Some services could not be stopped." -ForegroundColor Red
}

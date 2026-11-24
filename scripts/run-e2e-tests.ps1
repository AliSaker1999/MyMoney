# M17 E2E Test Runner
# Runs Maestro flows against the emulator
# Usage: .\run-e2e-tests.ps1

param(
    [string]$Device = "emulator-5554",
    [switch]$Clean,
    [switch]$Install
)

$ErrorActionPreference = "Stop"

Write-Host "M17 E2E Test Suite" -ForegroundColor Cyan
Write-Host "Running Maestro flows against $Device`n" -ForegroundColor Gray

# Check if maestro is installed
$maestroVersion = maestro --version 2>$null
if (-not $maestroVersion) {
    Write-Host "ERROR: Maestro not found. Install from https://maestro.mobile.dev" -ForegroundColor Red
    exit 1
}

Write-Host "Maestro: $maestroVersion`n" -ForegroundColor Gray

# Build release APK if requested
if ($Clean -or $Install) {
    Write-Host "Building release APK..." -ForegroundColor Yellow
    & .\build-android-release.ps1 -NoPrebuild
    if (-not $?) {
        Write-Host "Build failed" -ForegroundColor Red
        exit 1
    }
}

# Install APK if requested
if ($Install) {
    Write-Host "Installing APK to $Device..." -ForegroundColor Yellow
    adb -s $Device install -r android/app/build/outputs/apk/release/app-release.apk
    if (-not $?) {
        Write-Host "Install failed" -ForegroundColor Red
        exit 1
    }
    Start-Sleep -Seconds 2
}

# List of test flows
$flows = @(
    "onboarding",
    "transactions",
    "budgets",
    "goals",
    "debts",
    "reports"
)

$passed = 0
$failed = 0

foreach ($flow in $flows) {
    $flowPath = "e2e/maestro/$flow.yaml"
    if (-not (Test-Path $flowPath)) {
        Write-Host "⊘ $flow - flow not found`n" -ForegroundColor Yellow
        $failed++
        continue
    }

    Write-Host "▶ Running $flow..." -ForegroundColor Cyan
    maestro test --device $Device $flowPath

    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ $flow passed`n" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "✗ $flow failed`n" -ForegroundColor Red
        $failed++
    }
}

# Summary
Write-Host "`nTest Summary" -ForegroundColor Cyan
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })

exit $(if ($failed -gt 0) { 1 } else { 0 })

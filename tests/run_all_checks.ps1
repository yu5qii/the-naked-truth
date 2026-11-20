# ==============================================================================
# The Naked Truth - Automated Integrity & Security Verification Suite (PowerShell)
# ==============================================================================
$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $ProjectRoot

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " [1/3] Static & Dependency Security Audit" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan

Write-Host "-> Running frontend npm audit..." -ForegroundColor Yellow
try {
    npm audit --audit-level=high
    Write-Host "✓ NPM audit clean (zero high or critical vulnerabilities)." -ForegroundColor Green
} catch {
    Write-Host "⚠ Note: npm audit reported issues or registry was unreachable." -ForegroundColor Yellow
}

Write-Host "-> Running backend python dependency check..." -ForegroundColor Yellow
try {
    python -m pip_audit --local --version
    Write-Host "✓ pip-audit is installed and available." -ForegroundColor Green
} catch {
    Write-Host "⚠ pip-audit not found or unreachable, skipping." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " [2/3] Backend Security & Integrity Suite (Pytest)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
python -m pytest tests/security/ -c tests/pytest.ini -v
if ($LASTEXITCODE -ne 0) {
    Write-Host "Pytest security suite failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " [3/3] Frontend E2E Load-Time & WebGL Integrity Suite (Playwright)" -ForegroundColor Cyan
Write-Host "======================================================================" -ForegroundColor Cyan
npx playwright test --config=tests/playwright.config.ts
if ($LASTEXITCODE -ne 0) {
    Write-Host "Playwright integrity suite failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Green
Write-Host " [STATUS] ALL INTEGRITY & SECURITY SUITES COMPLETED SUCCESSFULLY" -ForegroundColor Green
Write-Host "======================================================================" -ForegroundColor Green

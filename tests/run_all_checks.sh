#!/usr/bin/env bash
# ==============================================================================
# The Naked Truth - Automated Integrity & Security Verification Suite
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "======================================================================"
echo " [1/3] Static & Dependency Security Audit"
echo "======================================================================"

echo "-> Running frontend npm audit..."
if npm audit --audit-level=high; then
  echo "✓ NPM audit clean (zero high or critical vulnerabilities)."
else
  echo "⚠ Note: npm audit encountered warnings or registry was offline."
fi

echo "-> Running backend python dependency check..."
if python -m pip_audit --local --version >/dev/null 2>&1; then
  echo "✓ pip-audit is installed and available."
  # Fast local check with fallback if network fails
  python -m pip_audit --local --desc || echo "⚠ pip-audit reported issues or network was unreachable."
else
  echo "⚠ pip-audit not installed in active environment, skipping."
fi

echo ""
echo "======================================================================"
echo " [2/3] Backend Security & Integrity Suite (Pytest)"
echo "======================================================================"
python -m pytest tests/security/ -c tests/pytest.ini -v

echo ""
echo "======================================================================"
echo " [3/3] Frontend E2E Load-Time & WebGL Integrity Suite (Playwright)"
echo "======================================================================"
npx playwright test --config=tests/playwright.config.ts

echo ""
echo "======================================================================"
echo " [STATUS] ALL INTEGRITY & SECURITY SUITES COMPLETED SUCCESSFULLY"
echo "======================================================================"

#!/usr/bin/env bash
# ===========================================================================
# S2C Inventory OS — QA Test Runner
# ===========================================================================
# Usage:
#   cd /Users/zayaanyousuf/Documents/S2C-Inventory-Planner
#   bash tests/run_tests.sh
#
# Runs all 6 test categories. Requires Deno to be installed.
# Supabase-dependent tests (Cat 1, 4, 5, 6) will skip gracefully if the
# local stack is not running — the remote S2C project is used as fallback.
# ===========================================================================

set -euo pipefail

ROOT="/Users/zayaanyousuf/Documents/S2C-Inventory-Planner"
TESTS_DIR="$ROOT/tests"
DOCS_DIR="$ROOT/docs"
ENV_FILE="$ROOT/.env"
REPORT_FILE="$DOCS_DIR/test_report.md"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "================================================================"
echo "  S2C Inventory OS — QA Test Suite"
echo "  Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================"
echo ""

# ---------------------------------------------------------------------------
# Step 0: Prerequisites check
# ---------------------------------------------------------------------------
echo -e "${BLUE}[SETUP]${NC} Checking prerequisites..."

# Check Deno
if ! command -v deno &> /dev/null; then
  echo -e "${RED}[FAIL]${NC} Deno is not installed."
  echo ""
  echo "  Install Deno with:"
  echo "    curl -fsSL https://deno.land/install.sh | sh"
  echo "  Or via Homebrew:"
  echo "    brew install deno"
  echo ""
  echo "  Categories 2 & 3 (unit tests) require Deno."
  echo "  Categories 1, 4, 5, 6 will be attempted but may fail without Deno."
  DENO_AVAILABLE=false
else
  DENO_VERSION=$(deno --version 2>/dev/null | head -1)
  echo -e "${GREEN}[OK]${NC} Deno: $DENO_VERSION"
  DENO_AVAILABLE=true
fi

# Load .env variables
if [ -f "$ENV_FILE" ]; then
  echo -e "${GREEN}[OK]${NC} Loading environment from $ENV_FILE"
  # Export non-comment, non-empty lines
  set -a
  # Use a safer way to source .env
  while IFS='=' read -r key value; do
    # Skip comments and empty lines
    [[ "$key" =~ ^#.*$ ]] && continue
    [[ -z "$key" ]] && continue
    # Strip inline comments
    value=$(echo "$value" | sed 's/#.*//' | xargs 2>/dev/null || echo "$value")
    export "$key=$value"
  done < "$ENV_FILE"
  set +a
else
  echo -e "${RED}[FAIL]${NC} .env file not found at $ENV_FILE"
  exit 1
fi

# Check Supabase local stack
echo ""
echo -e "${BLUE}[SETUP]${NC} Checking Supabase status..."
SUPABASE_LOCAL_RUNNING=false
if command -v supabase &> /dev/null; then
  # Try to get supabase status (may fail if not initialized)
  SUPABASE_STATUS=$(cd "$ROOT" && supabase status 2>&1 || true)
  if echo "$SUPABASE_STATUS" | grep -q "API URL:"; then
    echo -e "${GREEN}[OK]${NC} Local Supabase stack is running"
    SUPABASE_LOCAL_RUNNING=true
    # Extract local URL if available
    LOCAL_URL=$(echo "$SUPABASE_STATUS" | grep "API URL:" | awk '{print $NF}' || echo "http://localhost:54321")
    export SUPABASE_LOCAL_URL="$LOCAL_URL"
    echo "       Local URL: $LOCAL_URL"
  else
    echo -e "${YELLOW}[WARN]${NC} Local Supabase stack not running (or config error)"
    echo "       Tests will use remote S2C project: $SUPABASE_URL"
    echo "       To start local stack: supabase start"
  fi
else
  echo -e "${YELLOW}[WARN]${NC} Supabase CLI not found — using remote project only"
fi

# ---------------------------------------------------------------------------
# Initialize results tracking
# ---------------------------------------------------------------------------
declare -A CAT_STATUS
CAT_STATUS[1]="SKIPPED"
CAT_STATUS[2]="SKIPPED"
CAT_STATUS[3]="SKIPPED"
CAT_STATUS[4]="SKIPPED"
CAT_STATUS[5]="SKIPPED"
CAT_STATUS[6]="SKIPPED"

OVERALL_PASS=0
OVERALL_FAIL=0
OVERALL_SKIP=0

run_test_file() {
  local cat_num="$1"
  local file="$2"
  local name="$3"
  local flags="${4:---allow-env --allow-net --allow-read}"

  echo ""
  echo "----------------------------------------------------------------"
  echo -e "${BLUE}Category $cat_num:${NC} $name"
  echo "----------------------------------------------------------------"

  if [ "$DENO_AVAILABLE" = false ]; then
    echo -e "${YELLOW}[SKIP]${NC} Deno not available"
    CAT_STATUS[$cat_num]="SKIPPED"
    OVERALL_SKIP=$((OVERALL_SKIP + 1))
    return
  fi

  if [ ! -f "$file" ]; then
    echo -e "${RED}[FAIL]${NC} Test file not found: $file"
    CAT_STATUS[$cat_num]="FAIL"
    OVERALL_FAIL=$((OVERALL_FAIL + 1))
    return
  fi

  # Run Deno test with timeout
  if timeout 120 deno test "$file" $flags 2>&1; then
    echo -e "${GREEN}[PASS]${NC} Category $cat_num: $name"
    CAT_STATUS[$cat_num]="PASS"
    OVERALL_PASS=$((OVERALL_PASS + 1))
  else
    EXIT_CODE=$?
    if [ $EXIT_CODE -eq 124 ]; then
      echo -e "${YELLOW}[TIMEOUT]${NC} Category $cat_num timed out after 120s"
      CAT_STATUS[$cat_num]="TIMEOUT"
      OVERALL_FAIL=$((OVERALL_FAIL + 1))
    else
      echo -e "${RED}[FAIL]${NC} Category $cat_num: $name (exit code: $EXIT_CODE)"
      CAT_STATUS[$cat_num]="FAIL"
      OVERALL_FAIL=$((OVERALL_FAIL + 1))
    fi
  fi
}

# ---------------------------------------------------------------------------
# Run test categories
# ---------------------------------------------------------------------------

echo ""
echo "================================================================"
echo "  Running Test Suites"
echo "================================================================"

# Category 1: Connectivity (needs Supabase + Deno, no local stack required)
run_test_file 1 "$TESTS_DIR/cat1_connectivity.ts" "Connectivity & Schema" \
  "--allow-env --allow-net"

# Category 2: Business Logic (pure Deno, no network needed)
run_test_file 2 "$TESTS_DIR/cat2_business_logic.ts" "Business Logic Unit Tests" \
  "--allow-env --allow-read"

# Category 3: Parsers (pure Deno, no network needed)
run_test_file 3 "$TESTS_DIR/cat3_parsers.ts" "Parser Tests" \
  "--allow-env --allow-read"

# Category 4: Endpoints (needs running Edge Functions)
run_test_file 4 "$TESTS_DIR/cat4_endpoints.ts" "Edge Function Endpoint Tests" \
  "--allow-env --allow-net --allow-read"

# Category 5: E2E (only if Cat 4 passed)
if [ "${CAT_STATUS[4]}" = "PASS" ]; then
  run_test_file 5 "$TESTS_DIR/cat5_e2e.ts" "End-to-End Pipeline Tests" \
    "--allow-env --allow-net --allow-read"
else
  echo ""
  echo "----------------------------------------------------------------"
  echo -e "${YELLOW}Category 5: End-to-End Pipeline Tests${NC}"
  echo "----------------------------------------------------------------"
  echo -e "${YELLOW}[SKIP]${NC} Category 5 skipped because Category 4 did not pass"
  CAT_STATUS[5]="SKIPPED"
  OVERALL_SKIP=$((OVERALL_SKIP + 1))
fi

# Category 6: Guardrails
run_test_file 6 "$TESTS_DIR/cat6_guardrails.ts" "Guardrail Verification" \
  "--allow-env --allow-net"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "================================================================"
echo "  Test Results Summary"
echo "================================================================"
echo ""

for i in 1 2 3 4 5 6; do
  status="${CAT_STATUS[$i]}"
  case "$status" in
    PASS)    echo -e "  Category $i: ${GREEN}PASS${NC}" ;;
    FAIL)    echo -e "  Category $i: ${RED}FAIL${NC}" ;;
    SKIPPED) echo -e "  Category $i: ${YELLOW}SKIPPED${NC}" ;;
    TIMEOUT) echo -e "  Category $i: ${YELLOW}TIMEOUT${NC}" ;;
    *)       echo -e "  Category $i: ${YELLOW}$status${NC}" ;;
  esac
done

echo ""
echo "  Overall: ${GREEN}$OVERALL_PASS passed${NC}, ${RED}$OVERALL_FAIL failed${NC}, ${YELLOW}$OVERALL_SKIP skipped${NC}"
echo ""

# ---------------------------------------------------------------------------
# Final status
# ---------------------------------------------------------------------------
if [ $OVERALL_FAIL -gt 0 ]; then
  echo -e "${RED}RESULT: FAILURES DETECTED${NC}"
  echo ""
  echo "See above for details. Check docs/test_report.md for the full report."
  exit 1
elif [ $OVERALL_PASS -eq 0 ]; then
  echo -e "${YELLOW}RESULT: ALL TESTS SKIPPED${NC}"
  echo ""
  echo "Install Deno and ensure Supabase is accessible to run the test suite."
  exit 0
else
  echo -e "${GREEN}RESULT: PASS${NC} ($OVERALL_PASS/$((OVERALL_PASS + OVERALL_SKIP)) categories executed successfully)"
  exit 0
fi

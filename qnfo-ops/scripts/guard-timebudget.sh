#!/usr/bin/env bash
# qnfo-ops OPS-TIME-BUDGET-1 / TOOL-BUDGET-CEILING-1 regression guard.
#
# HARDENED 2026-09-30 (TOOL-BUDGET-CEILING-1).  The 2026-09-06 version carried three
# defects, each measured on 2026-09-30:
#
#   * FALSE NEGATIVE on the streaming arm.  It matched the default with a digit-only
#     regex (OPS_LOOP_DEADLINE_MS", 1[2-9][0-9][0-9][0-9][0-9]) which cannot match the
#     live scientific-notation form `3e5`, so a COMPLIANT value was reported FAIL.
#   * NO CHECK AT ALL on the non-streaming arm.  OPS_NONSTREAM_DEADLINE_MS sat at 3e4
#     (30000 ms) against a canonical 300000 ms -- 10% of canonical -- for every
#     non-streaming client (including the mobile ChatBox client), and this guard never
#     looked at it.  That hole is what produced "tool budget exhausted before these
#     could run".
#   * FALSE NEGATIVE on OPS-DURABLE-1.  It grepped `export class OpsExecWorkflow`, but
#     the shipped form is `var OpsExecWorkflow = class` (worker.js:5291), so the
#     durable-executor check could never pass.
#
# It also used byte identity (`cmp`) for the worker.js / deployed-current.worker.js
# drift check.  A source artifact and a captured bundle are not byte-comparable, so
# that arm fired permanently.  Drift is now judged on the VERSION constant, which is
# what deploy drift actually means.
#
# Every ceiling below is canonical per OPS-SETTINGS-IMMUTABLE-1.  This guard may only
# ever be corrected TOWARD canonical; lowering a ceiling is drift and must fail here.
#
# Usage: bash guard-timebudget.sh   (exit 0 = PASS)
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0
MIN_MS=300000
MIN_ITERS=40
LIVE_URL="${QNFO_OPS_HEALTH_URL:-https://qnfo-ops.q08.workers.dev/health}"

echo "== guard-timebudget.sh =="

# --- 1. legacy panic stub must not return -----------------------------------------
for f in worker.js deployed-current.worker.js; do
  if [ ! -f "$DIR/$f" ]; then echo "FAIL: missing $f"; FAIL=1; continue; fi
  if grep -Fq "Ops tool loop reached its time budget after " "$DIR/$f"; then
    echo "FAIL: panic stub present in $f"; FAIL=1
  fi
done

# --- 2. tool-loop wall budget, BOTH transports ------------------------------------
# Accepts scientific (3e5) and plain (300000) notation; rejects 3e4 / 30000 / <MIN_MS.
check_deadline() {
  f="$1"; var="$2"; raw=""; num=""
  raw="$(grep -o "envInt(env, \"$var\", [0-9eE_.]*)" "$DIR/$f" 2>/dev/null | head -1 | sed 's/.*, //; s/)$//')"
  if [ -z "$raw" ]; then
    echo "FAIL: $var default not found in $f"; FAIL=1; return
  fi
  num="$(printf '%s' "$raw" | tr -d '_' | awk '{printf "%.0f", $1+0}')"
  if [ -z "$num" ] || [ "$num" -lt "$MIN_MS" ]; then
    echo "FAIL: $var default $raw (~${num:-?} ms) < canonical $MIN_MS ms in $f"; FAIL=1
  else
    echo "OK: $var = $raw (~$num ms)"
  fi
}
for f in worker.js deployed-current.worker.js; do
  [ -f "$DIR/$f" ] || continue
  check_deadline "$f" OPS_LOOP_DEADLINE_MS
  check_deadline "$f" OPS_NONSTREAM_DEADLINE_MS
done

# --- 3. iteration cap --------------------------------------------------------------
ITERS="$(grep -o 'var MAX_TOOL_ITERS = [0-9]*;' "$DIR/worker.js" 2>/dev/null | head -1 | grep -o '[0-9]*')"
if [ -z "$ITERS" ] || [ "$ITERS" -lt "$MIN_ITERS" ]; then
  echo "FAIL: MAX_TOOL_ITERS = ${ITERS:-?} < $MIN_ITERS in worker.js"; FAIL=1
else
  echo "OK: MAX_TOOL_ITERS = $ITERS"
fi

# --- 4. version drift (semantic; replaces the byte cmp) ----------------------------
REPO_VER="$(sed -n 's/^var VERSION = "//p' "$DIR/worker.js" | cut -d'"' -f1 | head -1)"
CAP_VER="$(sed -n 's/^var VERSION = "//p' "$DIR/deployed-current.worker.js" | cut -d'"' -f1 | head -1)"
LIVE_VER=""
for i in 1 2 3; do
  LIVE_VER="$(curl -s -m 15 "$LIVE_URL" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 | head -1)"
  [ -n "$LIVE_VER" ] && [ "$LIVE_VER" = "$REPO_VER" ] && break
  sleep 5
done
echo "repo VERSION=$REPO_VER capture=$CAP_VER live=$LIVE_VER"
if [ -z "$LIVE_VER" ]; then
  echo "FAIL: live /health did not report a version (deploy unreachable)"; FAIL=1
elif [ -n "$REPO_VER" ] && [ "$LIVE_VER" != "$REPO_VER" ]; then
  echo "FAIL: live version $LIVE_VER != repo $REPO_VER (deploy drift)"; FAIL=1
fi
if [ -n "$CAP_VER" ] && [ -n "$REPO_VER" ] && [ "$CAP_VER" != "$REPO_VER" ]; then
  echo "WARN: capture $CAP_VER != repo $REPO_VER (stale capture artifact, not a deploy fault)"
fi

# --- 5. CPU ceiling ----------------------------------------------------------------
if ! grep -qE "^cpu_ms = 300000" "$DIR/wrangler.toml"; then
  echo "FAIL: [limits] cpu_ms not 300000 in wrangler.toml (CPU-BUDGET-1)"; FAIL=1
fi

# --- 6. durable async path (OPS-DURABLE-1) -----------------------------------------
if ! grep -qE "OpsExecWorkflow = class|class OpsExecWorkflow" "$DIR/worker.js"; then
  echo "FAIL: OpsExecWorkflow class missing from worker.js (OPS-DURABLE-1)"; FAIL=1
fi
if ! grep -q 'OPS_JOBS_QUEUE' "$DIR/wrangler.toml"; then
  echo "FAIL: OPS_JOBS_QUEUE binding missing from wrangler.toml (OPS-DURABLE-1)"; FAIL=1
fi
if ! grep -qF '[[workflows]]' "$DIR/wrangler.toml"; then
  echo "FAIL: [[workflows]] missing from wrangler.toml (OPS-DURABLE-1)"; FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then echo "GUARD PASS"; else echo "GUARD FAIL"; fi
exit $FAIL

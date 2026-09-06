#!/usr/bin/env bash
# qnfo-ops OPS-TIME-BUDGET-1 regression guard (2026-09-06)
# Fails if: (1) the old 1200-token panic stub code returns to worker.js/deployed-current.worker.js,
# (2) the OPS_LOOP_DEADLINE_MS default drops below 120000 (was 30000 -> killed real multi-tool
# ops-exec runs after ~4 tool rounds), (3) worker.js and deployed-current.worker.js drift, or
# (4) live /health reports a version older than the repo VERSION (DEPLOY-VERIFY-VERSION-1).
# Usage: bash guard-timebudget.sh   (exit 0 = PASS)
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0
echo "== guard-timebudget.sh =="
for f in worker.js deployed-current.worker.js; do
  if grep -Fq "Ops tool loop reached its time budget after " "$DIR/$f"; then
    echo "FAIL: panic stub present in $f"; FAIL=1
  fi
  if ! grep -q "OPS_LOOP_DEADLINE_MS\", 1[2-9][0-9][0-9][0-9][0-9]\|OPS_LOOP_DEADLINE_MS\", 2[0-9][0-9][0-9][0-9][0-9]" "$DIR/$f"; then
    echo "FAIL: OPS_LOOP_DEADLINE_MS default <120000 in $f"; FAIL=1
  fi
done
if ! cmp -s "$DIR/worker.js" "$DIR/deployed-current.worker.js"; then
  echo "FAIL: worker.js != deployed-current.worker.js"; FAIL=1
fi
REPO_VER="$(sed -n 's/^var VERSION = "//p' "$DIR/worker.js" | cut -d\" -f1 | head -1)"
LIVE_VER="$(curl -s -m 15 https://qnfo-ops.q08.workers.dev/health | grep -o "\"version\":\"[^\"]*\"" | cut -d\" -f4 | head -1)"
echo "repo VERSION=$REPO_VER live=$LIVE_VER"
if [ -n "$LIVE_VER" ] && [ "$LIVE_VER" != "$REPO_VER" ]; then
  echo "FAIL: live version $LIVE_VER != repo $REPO_VER (deploy drift)"; FAIL=1
fi
if ! grep -qE "^cpu_ms = 300000" "$DIR/wrangler.toml"; then
  echo "FAIL: [limits] cpu_ms not 300000 in wrangler.toml (CPU-BUDGET-1 - default 30s CPU kills run_code-heavy loops via Error 1102)"; FAIL=1
fi
# OPS-DURABLE-1 (2026-09-06): durable async ops-exec path must stay present (Queue + Workflows executor).
if ! grep -q "export class OpsExecWorkflow" "$DIR/worker.js"; then
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
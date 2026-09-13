#!/usr/bin/env bash
# qnfo-ops ASYNC-JOB-AUDIT-1 regression guard (2026-09-13)
#
# Sibling of guard-timebudget.sh. Behaviour-based, not source-based: it asserts the
# OBSERVED state of the durable async job path, so it does not need to know where the
# defect lives in worker.js (which is past the 32,768-char read cap).
#
# Fails if:
#   (1) any ops_jobs.tool_log is truncated -> non-empty but not valid JSON
#       (2026-09-13 audit: 4 rows sit at exactly 3000 bytes, last byte mid-token, so
#        json_array_length() raises "malformed JSON: SQLITE_ERROR"),
#   (2) any non-empty tool_log does not end with ']',
#   (3) a job-workflow request is logged ok=0 while ops_jobs shows no failure and an
#       in-flight job exists in the same window (envelope-failure vs job-failure
#       conflation, D2), or
#   (4) ops_ai_log.prompt is stored as the literal "[object Object]" (D3).
#
# Usage: bash guard-async-job-audit.sh   (exit 0 = PASS)
# Requires: wrangler authenticated for account edb167b78c9fb901ea5bca3ce58ccc4b.
# NOTE: authored from the qnfo-ops endpoint, which has no shell; the D1 probes below are
# the same predicates the audit ran via ops_d1_query, but this script has NOT been executed.

set -u
DB="${OPS_AUDIT_DB:-qnfo-audit}"
FAIL=0
echo "== guard-async-job-audit.sh =="

d1() { wrangler d1 execute "$DB" --remote --json --command "$1" 2>/dev/null; }

# (1)+(2) tool_log integrity: every non-empty log must end with ']'
TRUNC=$(d1 "SELECT COUNT(*) AS n FROM ops_jobs WHERE tool_log IS NOT NULL AND tool_log <> '[]' AND substr(tool_log,-1,1) <> ']';")
echo "truncated tool_log rows: $TRUNC"
if ! echo "$TRUNC" | grep -q '"n":[[:space:]]*0'; then
  echo "FAIL: tool_log truncated (non-empty but not ending in ']') - see patch D1"
  FAIL=1
fi

# (1b) direct parseability probe: any malformed row makes this raise
BADJSON=$(d1 "SELECT COUNT(*) AS n FROM ops_jobs WHERE json_valid(tool_log)=0 AND tool_log IS NOT NULL;")
echo "malformed-JSON tool_log rows: $BADJSON"
if ! echo "$BADJSON" | grep -q '"n":[[:space:]]*0'; then
  echo "FAIL: tool_log is not valid JSON - see patch D1"
  FAIL=1
fi

# (3) envelope-vs-job conflation: ok=0 on the durable path with zero failed jobs today
OK0=$(d1 "SELECT COUNT(*) AS n FROM ops_ai_log WHERE strategy='job-workflow' AND ok=0 AND ts > datetime('now','-1 day');")
FAILED=$(d1 "SELECT COUNT(*) AS n FROM ops_jobs WHERE status='failed' AND created_at > datetime('now','-1 day');")
echo "job-workflow ok=0 (24h): $OK0   ops_jobs failed (24h): $FAILED"
if ! echo "$OK0" | grep -q '"n":[[:space:]]*0'; then
  if echo "$FAILED" | grep -q '"n":[[:space:]]*0'; then
    echo "FAIL: durable path reports ok=0 while no job actually failed (D2 envelope bug)"
    FAIL=1
  fi
fi

# (4) prompt serialization
OBJ=$(d1 "SELECT COUNT(*) AS n FROM ops_ai_log WHERE prompt LIKE '%[object Object]%' AND ts > datetime('now','-1 day');")
echo "ops_ai_log rows with [object Object] prompt (24h): $OBJ"
if ! echo "$OBJ" | grep -q '"n":[[:space:]]*0'; then
  echo "FAIL: ops_ai_log.prompt not serialized (D3)"
  FAIL=1
fi

# (5) the durable path must still be present and versioned (mirrors guard-timebudget.sh)
DIR="$(cd "$(dirname "$0")/.." && pwd)"
if ! grep -q "export class OpsExecWorkflow" "$DIR/worker.js"; then
  echo "FAIL: OpsExecWorkflow class missing from worker.js (OPS-DURABLE-1)"
  FAIL=1
fi
if ! cmp -s "$DIR/worker.js" "$DIR/deployed-current.worker.js"; then
  echo "FAIL: worker.js != deployed-current.worker.js"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then echo "GUARD PASS"; else echo "GUARD FAIL"; fi
exit $FAIL

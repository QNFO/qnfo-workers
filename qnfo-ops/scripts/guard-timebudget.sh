#!/usr/bin/env bash
# qnfo-ops OPS-TIME-BUDGET-1 / OPS-SETTINGS-IMMUTABLE-1 regression guard.
# Rewritten 2026-09-30 by TOOLBUDGET-CANONICAL-1 and LANDED 2026-09-30 after
# COMMIT-PATHSPEC-DROPS-NON-WORKER-ARTIFACTS-1 proved the first landing attempt
# was written into the CI worktree and then silently dropped by
#   git add -A scripts/ '*worker.js' ci-status/
# a pathspec that cannot match qnfo-ops/scripts/*.sh. The patch reported
# "landed" because it did write the file; the commit step threw it away.
#
# WHAT THE PREVIOUS VERSION GOT WRONG (three false negatives + one orphan)
#   1. It asserted  OPS_LOOP_DEADLINE_MS", 1[2-9][0-9][0-9][0-9][0-9]  -- a regex
#      that cannot match the real literal "3e5" (scientific notation), so the arm
#      it claimed to protect was never actually checked.
#   2. It never checked OPS_NONSTREAM_DEADLINE_MS at all -- the arm that actually
#      drifted to 3e4 (30 s) and caused tool-budget exhaustion for non-streaming
#      (mobile) callers.
#   3. It grepped "export class OpsExecWorkflow" while the source contains
#      "var OpsExecWorkflow = class", so the durable-path check always failed.
#   4. It was ORPHANED: no workflow invoked it, so it never ran. That is the
#      enabling cause of #2 drifting in undetected.
#
# This version parses each literal with python (notation-aware: 3e5 == 300000)
# and asserts BOTH deadline arms, the round cap and the CPU ceiling against the
# canonical OPS-SETTINGS-IMMUTABLE-1 values. Invoked every 30 minutes by
# .github/workflows/guard-timebudget.yml.
#
# Usage: bash guard-timebudget.sh    (exit 0 = PASS, exit 1 = DRIFT)
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
FAIL=0
echo "== guard-timebudget.sh (TOOLBUDGET-CANONICAL-1) =="

python3 - "$DIR" <<'PYEOF'
import re, sys
from pathlib import Path

d = Path(sys.argv[1])
worker = d / "worker.js"
deployed = d / "deployed-current.worker.js"
wrangler = d / "wrangler.toml"

CANON_DEADLINE = 300000      # OPS-SETTINGS-IMMUTABLE-1 tool-loop soft budget
CANON_ROUNDS = 40
CANON_CPU_MS = 300000        # OPS-SETTINGS-IMMUTABLE-1 CPU ceiling
fails = []
warns = []


def read(p):
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return None


def lit(text, argname):
    """Numeric default for envInt(env, ARGNAME, <literal>), notation-aware."""
    m = re.search(r'envInt\(\s*env\s*,\s*"%s"\s*,\s*([0-9eE.+]+)\s*\)' % re.escape(argname), text)
    if not m:
        return None, None
    raw = m.group(1)
    try:
        return raw, float(raw)
    except Exception:
        return raw, None


src = read(worker)
if src is None:
    fails.append("worker.js unreadable")
else:
    for arm in ("OPS_LOOP_DEADLINE_MS", "OPS_NONSTREAM_DEADLINE_MS"):
        raw, val = lit(src, arm)
        if raw is None:
            fails.append("%s default not found in worker.js" % arm)
        elif val is None:
            fails.append("%s literal %r unparseable" % (arm, raw))
        elif val < CANON_DEADLINE:
            fails.append("%s default %s (=%g) < canonical %d" % (arm, raw, val, CANON_DEADLINE))
        else:
            print("OK  %s = %s (%g)" % (arm, raw, val))

    m = re.search(r"var MAX_TOOL_ITERS = (\d+);", src)
    if not m:
        fails.append("var MAX_TOOL_ITERS = <n>; not found in worker.js")
    elif int(m.group(1)) < CANON_ROUNDS:
        fails.append("MAX_TOOL_ITERS = %s < %d" % (m.group(1), CANON_ROUNDS))
    else:
        print("OK  MAX_TOOL_ITERS = %s" % m.group(1))

    if "Ops tool loop reached its time budget after " in src:
        fails.append("panic stub present in worker.js")

    if not re.search(r"(export class OpsExecWorkflow|var OpsExecWorkflow = class|class OpsExecWorkflow)", src):
        fails.append("OpsExecWorkflow class missing from worker.js (OPS-DURABLE-1)")

    if "ops_tool_budget_bail" not in src:
        fails.append("tool-budget bail record missing (TOOLBUDGET-CANONICAL-1 D3a)")

    if "PENDING_TOOLCALLS_NOTE" not in src:
        fails.append("pending-tool-calls recorder missing (TOOL-BUDGET-PENDING-1)")

    dep = read(deployed)
    if dep is None:
        warns.append("deployed-current.worker.js absent")
    elif dep != src:
        warns.append("worker.js != deployed-current.worker.js (capture stale; not a gate)")

wt = read(wrangler)
if wt is None:
    fails.append("wrangler.toml unreadable")
else:
    m = re.search(r"^cpu_ms\s*=\s*(\d+)\s*$", wt, re.M)
    if not m:
        fails.append("[limits] cpu_ms not found in wrangler.toml (CPU-BUDGET-1)")
    elif int(m.group(1)) < CANON_CPU_MS:
        fails.append("[limits] cpu_ms = %s < canonical %d in wrangler.toml (CPU-BUDGET-1)" % (m.group(1), CANON_CPU_MS))
    else:
        print("OK  cpu_ms = %s" % m.group(1))
    if "OPS_JOBS_QUEUE" not in wt:
        fails.append("OPS_JOBS_QUEUE binding missing from wrangler.toml (OPS-DURABLE-1)")
    if "[[workflows]]" not in wt:
        fails.append("[[workflows]] missing from wrangler.toml (OPS-DURABLE-1)")

for w in warns:
    print("WARN: %s" % w)
for f in fails:
    print("FAIL: %s" % f)
print("RESULT: %s" % ("PASS" if not fails else "DRIFT"))
sys.exit(0 if not fails else 1)
PYEOF
RC=$?
if [ "$RC" -ne 0 ]; then FAIL=1; fi

# Live-version comparison is INFORMATIONAL here. Version drift is already gated
# by scripts/deploy-drift-guard.py and .github/workflows/version-bump-guard.yml;
# duplicating it as a hard failure would make this guard red during the normal
# "patch landed, deploy pending" window, and a permanently-red guard is ignored.
REPO_VER="$(sed -n 's/^var VERSION = "//p' "$DIR/worker.js" | cut -d'"' -f1 | head -1)"
LIVE_VER="$(curl -s -m 15 https://ops.qnfo.org/health 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 | head -1)"
echo "INFO repo VERSION=$REPO_VER live=$LIVE_VER"
if [ -n "$LIVE_VER" ] && [ -n "$REPO_VER" ] && [ "$LIVE_VER" != "$REPO_VER" ]; then
  echo "WARN: live version $LIVE_VER != repo $REPO_VER (deploy drift; gated by deploy-drift-guard.py)"
fi

# GUARD-TIMEBUDGET-COVERAGE-GAP-1 (2026-09-30, issue #1515): the guard asserted only the deadline default and the
# absence of the old panic stub, so 3 of the 4 landed tool-budget fixes could regress with
# CI still green. Assert every invariant TOOLBUDGET-CANONICAL-1 relies on.
for f in worker.js deployed-current.worker.js; do
  if ! grep -q 'var MAX_TOOL_ITERS = 40;' "$DIR/$f"; then
    echo "FAIL: MAX_TOOL_ITERS is not the canonical 40 in $f (TOOLBUDGET-CANONICAL-1)"; FAIL=1
  fi
  if ! grep -q 'BUDGET_EXHAUSTED_DIRECTIVE' "$DIR/$f"; then
    echo "FAIL: BUDGET_EXHAUSTED_DIRECTIVE missing from $f (final-round directive)"; FAIL=1
  fi
  if ! grep -q 'CONTINUE_DIRECTIVE' "$DIR/$f"; then
    echo "FAIL: CONTINUE_DIRECTIVE missing from $f (BUDGET-AUTO-CONTINUE-1)"; FAIL=1
  fi
  if ! grep -q 'FUTURE_WORK_RE' "$DIR/$f"; then
    echo "FAIL: FUTURE_WORK_RE missing from $f (future-work prose detector)"; FAIL=1
  fi
  if ! grep -q 'const withTools = iter < maxIters && !deadlineHit;' "$DIR/$f"; then
    echo "FAIL: withTools budget predicate missing from $f (chat tool loop)"; FAIL=1
  fi
  if ! grep -q 'ops_tool_budget_bail' "$DIR/$f"; then
    echo "FAIL: ops_tool_budget_bail event missing from $f (budget-bail observability)"; FAIL=1
  fi
  if ! grep -q 'TOOLBUDGET-DO-LOOP-PARITY-1' "$DIR/$f"; then
    echo "FAIL: DO/WS tool loop lacks the final no-tools round in $f (TOOLBUDGET-DO-LOOP-PARITY-1)"; FAIL=1
  fi
done
if [ "$FAIL" -eq 0 ]; then echo "GUARD PASS"; else echo "GUARD FAIL"; fi
exit $FAIL

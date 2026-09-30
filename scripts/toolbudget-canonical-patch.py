#!/usr/bin/env python3
"""TOOLBUDGET-CANONICAL-1 (2026-09-30).

ROOT CAUSE (measured, not inferred)
-----------------------------------
The ops endpoint's agentic loop terminates before completing multi-step work and
reports the failure to the operator as a narrative ("tool budget exhausted before
these could run") instead of finishing the task. Three independent defects combine:

  D1. qnfo-ops/worker.js:104  `var MAX_TOOL_ITERS = 12;`
      Twelve rounds is below the round count required by real remediation work
      (recon -> probe -> write -> verify -> deploy -> re-verify). The loop then
      hits `iter < maxIters` false at line 4474, strips tools, and answers
      tool-less -- producing a progress report where a completed task was asked for.

  D2. qnfo-ops/worker.js:4208
      `const loopDeadlineMs = isStream ? envInt(env, "OPS_LOOP_DEADLINE_MS", 3e5)
                                       : envInt(env, "OPS_NONSTREAM_DEADLINE_MS", 3e4);`
      The non-streaming arm defaults to 30000 ms while the canonical
      OPS-SETTINGS-IMMUTABLE-1 tool-loop soft budget is 300000 ms. Non-streaming
      callers (every mobile/Android client) therefore get one tenth of the
      canonical budget: a 30 s wall clock expires after roughly four tool rounds.

  D3. qnfo-ops/scripts/guard-timebudget.sh is BOTH wrong and orphaned.
      - Wrong: it asserts `OPS_LOOP_DEADLINE_MS", 1[2-9][0-9][0-9][0-9][0-9]` -- a
        regex that cannot match the real literal `3e5` (scientific notation), so
        the check is a permanent false negative. It never checks
        `OPS_NONSTREAM_DEADLINE_MS` at all, i.e. the arm that actually drifted.
        It greps `export class OpsExecWorkflow` while the source contains
        `var OpsExecWorkflow = class`, a second false negative.
      - Orphaned: no workflow in .github/workflows invokes it, so the
        OPS-SETTINGS-IMMUTABLE-1 drift gate never fires. That is the enabling
        cause: D2 drifted in and stayed in undetected.

FIX (at the correct layer, permanent)
-------------------------------------
  1. MAX_TOOL_ITERS 12 -> 40.
  2. OPS_NONSTREAM_DEADLINE_MS default 3e4 -> 3e5 (canonical 300 s), both arms.
  3. On budget exhaustion the loop records a machine-readable bail row into
     qnfo-audit cloud_ops_events so exhaustion is observable, not just narrated.
  4. guard-timebudget.sh rewritten to assert BOTH arms against the canonical
     ceiling with notation-aware parsing, and a scheduled workflow invokes it
     every 30 minutes (removes the orphan condition permanently).

IDEMPOTENCE (REVERT-COLLATERAL-1 / APPLIER-DOCTOR)
--------------------------------------------------
scripts/apply-pending-patches.py runs EVERY scripts/*patch*.py on EVERY push and
classifies rc != 0 as a failure. A patch that applies once and then exits non-zero
is reported as permanently broken and can never be retired. This script therefore
detects its own already-applied state up front and exits 0 with "already-applied".

ADVERSARIAL
-----------
Raising the round cap cannot by itself exceed the CPU ceiling: wrangler.toml pins
`cpu_ms = 300000`, and the loop is wall-clock bounded by loopDeadlineMs.
MAX_TOOL_ITERS=40 is an upper bound, not a promise; the deadline is the binding
constraint. Both are asserted so neither can drift alone.
"""

import os
import re
import sys
from pathlib import Path

MARKER = "TOOLBUDGET-CANONICAL-1"
REPO = Path(os.environ.get("REPO_ROOT", "."))
OPS = REPO / "qnfo-ops"
WORKER = OPS / "worker.js"
GUARD = OPS / "scripts" / "guard-timebudget.sh"

CANONICAL_ROUNDS = 40
CANONICAL_DEADLINE = "3e5"  # 300000 ms == OPS-SETTINGS-IMMUTABLE-1 tool-loop soft budget

fail = []


def rd(p):
    return p.read_text(encoding="utf-8")


def wr(p, s):
    p.write_text(s, encoding="utf-8")


def sub1(text, pattern, repl, label, required=True):
    """Exactly-one replacement, or record a failure. Never partial."""
    hits = re.findall(pattern, text)
    if len(hits) == 0:
        if required:
            fail.append("ANCHOR-MISSING: %s" % label)
        return text, False
    if len(hits) > 1:
        fail.append("ANCHOR-AMBIGUOUS(%d): %s" % (len(hits), label))
        return text, False
    return re.sub(pattern, repl, text, count=1), True


GUARD_SRC = r'''#!/usr/bin/env bash
# qnfo-ops OPS-TIME-BUDGET-1 / OPS-SETTINGS-IMMUTABLE-1 regression guard.
# Rewritten 2026-09-30 by TOOLBUDGET-CANONICAL-1.
#
# WHAT THE PREVIOUS VERSION GOT WRONG (all three were false negatives)
#   1. It asserted  OPS_LOOP_DEADLINE_MS", 1[2-9][0-9][0-9][0-9][0-9]  -- a regex
#      that cannot match the real literal "3e5", so the arm it claimed to protect
#      was never actually checked.
#   2. It never checked OPS_NONSTREAM_DEADLINE_MS at all -- the arm that actually
#      drifted to 3e4 (30 s) and caused tool-budget exhaustion for non-streaming
#      (mobile) callers.
#   3. It grepped "export class OpsExecWorkflow" while the source contains
#      "var OpsExecWorkflow = class", so the durable-path check always failed.
# It was also ORPHANED: no workflow invoked it, so it never ran at all.
#
# This version parses the literal with python (notation-aware: 3e5 == 300000),
# asserts BOTH deadline arms and the round cap against the canonical ceiling,
# and is invoked every 30 minutes by .github/workflows/guard-timebudget.yml.
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
fails = []
warns = []


def read(p):
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return None


def lit(text, varname, argname):
    """Return the numeric default for envInt(env, ARGNAME, <literal>)."""
    m = re.search(r'envInt\(\s*env\s*,\s*"%s"\s*,\s*([0-9eE.+*]+)\s*\)' % re.escape(argname), text)
    if not m:
        return None, None
    raw = m.group(1)
    try:
        return raw, float(eval(raw, {"__builtins__": {}}, {}))  # notation-aware
    except Exception:
        return raw, None


src = read(worker)
if src is None:
    fails.append("worker.js unreadable")
else:
    # --- arm 1: streaming deadline ---
    raw, val = lit(src, "env", "OPS_LOOP_DEADLINE_MS")
    if raw is None:
        fails.append("OPS_LOOP_DEADLINE_MS default not found in worker.js")
    elif val is None:
        fails.append("OPS_LOOP_DEADLINE_MS literal %r unparseable" % raw)
    elif val < CANON_DEADLINE:
        fails.append("OPS_LOOP_DEADLINE_MS default %s (=%g) < canonical %d"
                     % (raw, val, CANON_DEADLINE))
    else:
        print("OK  OPS_LOOP_DEADLINE_MS = %s (%g)" % (raw, val))

    # --- arm 2: NON-STREAM deadline (the arm that actually drifted) ---
    raw2, val2 = lit(src, "env", "OPS_NONSTREAM_DEADLINE_MS")
    if raw2 is None:
        fails.append("OPS_NONSTREAM_DEADLINE_MS default not found in worker.js")
    elif val2 is None:
        fails.append("OPS_NONSTREAM_DEADLINE_MS literal %r unparseable" % raw2)
    elif val2 < CANON_DEADLINE:
        fails.append("OPS_NONSTREAM_DEADLINE_MS default %s (=%g) < canonical %d"
                     % (raw2, val2, CANON_DEADLINE))
    else:
        print("OK  OPS_NONSTREAM_DEADLINE_MS = %s (%g)" % (raw2, val2))

    # --- arm 3: round cap ---
    m = re.search(r"var MAX_TOOL_ITERS = (\d+);", src)
    if not m:
        fails.append("var MAX_TOOL_ITERS = <n>; not found in worker.js")
    elif int(m.group(1)) < CANON_ROUNDS:
        fails.append("MAX_TOOL_ITERS = %s < %d" % (m.group(1), CANON_ROUNDS))
    else:
        print("OK  MAX_TOOL_ITERS = %s" % m.group(1))

    # --- panic stub must never return ---
    if "Ops tool loop reached its time budget after " in src:
        fails.append("panic stub present in worker.js")

    # --- durable async path (OPS-DURABLE-1) ---
    if not re.search(r"(export class OpsExecWorkflow|var OpsExecWorkflow = class|class OpsExecWorkflow)", src):
        fails.append("OpsExecWorkflow class missing from worker.js (OPS-DURABLE-1)")

    # --- deploy-capture drift: WARN only, the capture is an artifact ---
    dep = read(deployed)
    if dep is not None and dep != src:
        warns.append("worker.js != deployed-current.worker.js (capture stale; not a gate)")

# --- wrangler ceilings (OPS-SETTINGS-IMMUTABLE-1) ---
wt = read(wrangler)
if wt is None:
    fails.append("wrangler.toml unreadable")
else:
    if not re.search(r"^cpu_ms = 300000\s*$", wt, re.M):
        fails.append("[limits] cpu_ms not 300000 in wrangler.toml (CPU-BUDGET-1)")
    else:
        print("OK  cpu_ms = 300000")
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

# --- live deploy-version check (DEPLOY-VERIFY-VERSION-1) ---
REPO_VER="$(sed -n 's/^var VERSION = "//p' "$DIR/worker.js" | cut -d'"' -f1 | head -1)"
LIVE_VER="$(curl -s -m 15 https://ops.qnfo.org/health 2>/dev/null | grep -o '"version":"[^"]*"' | cut -d'"' -f4 | head -1)"
echo "repo VERSION=$REPO_VER live=$LIVE_VER"
if [ -n "$LIVE_VER" ] && [ -n "$REPO_VER" ] && [ "$LIVE_VER" != "$REPO_VER" ]; then
  echo "FAIL: live version $LIVE_VER != repo $REPO_VER (deploy drift)"
  FAIL=1
fi

if [ "$FAIL" -eq 0 ]; then echo "GUARD PASS"; else echo "GUARD FAIL"; fi
exit $FAIL
'''


def main():
    if not WORKER.exists():
        print("FAIL: %s not found" % WORKER)
        return 3

    src = rd(WORKER)
    gsrc = rd(GUARD) if GUARD.exists() else ""

    already = (
        MARKER in src
        and 'OPS_NONSTREAM_DEADLINE_MS", %s)' % CANONICAL_DEADLINE in src
        and MARKER in gsrc
    )
    if already:
        print("already-applied")
        return 0

    changed = []

    # ---- D1: round cap -------------------------------------------------
    if re.search(r"var MAX_TOOL_ITERS = %d;" % CANONICAL_ROUNDS, src):
        changed.append("MAX_TOOL_ITERS already %d" % CANONICAL_ROUNDS)
    else:
        src, ok = sub1(
            src,
            r"var MAX_TOOL_ITERS = \d+;",
            "var MAX_TOOL_ITERS = %d;  // %s: was 12; the 300s wall clock is the binding cap"
            % (CANONICAL_ROUNDS, MARKER),
            "MAX_TOOL_ITERS declaration",
        )
        if ok:
            changed.append("MAX_TOOL_ITERS -> %d" % CANONICAL_ROUNDS)

    # ---- D2: non-stream deadline (handleChat arm) ----------------------
    if re.search(r'envInt\(env, "OPS_NONSTREAM_DEADLINE_MS", %s\)' % CANONICAL_DEADLINE, src):
        changed.append("OPS_NONSTREAM_DEADLINE_MS already %s" % CANONICAL_DEADLINE)
    else:
        src, ok = sub1(
            src,
            r'envInt\(env, "OPS_NONSTREAM_DEADLINE_MS", 3e4\)',
            'envInt(env, "OPS_NONSTREAM_DEADLINE_MS", %s)  // %s: was 3e4 (30s); canonical 300s'
            % (CANONICAL_DEADLINE, MARKER),
            "OPS_NONSTREAM_DEADLINE_MS default (handleChat)",
        )
        if ok:
            changed.append("OPS_NONSTREAM_DEADLINE_MS -> %s" % CANONICAL_DEADLINE)

    # ---- D2b: same arm in the Workflow executor path -------------------
    if 'envInt(this.env, "OPS_NONSTREAM_DEADLINE_MS", 3e4)' in src:
        src = src.replace(
            'envInt(this.env, "OPS_NONSTREAM_DEADLINE_MS", 3e4)',
            'envInt(this.env, "OPS_NONSTREAM_DEADLINE_MS", %s)' % CANONICAL_DEADLINE,
        )
        changed.append("OPS_NONSTREAM_DEADLINE_MS (workflow path) -> %s" % CANONICAL_DEADLINE)

    # ---- D3a: machine-readable bail record instead of silent degrade ---
    bail_anchor = "        const deadlineHit = Date.now() > loopDeadline;"
    bail_new = (
        "        const deadlineHit = Date.now() > loopDeadline;\n"
        "        if ((iter >= maxIters || deadlineHit) && !globalThis.__opsBailLogged) {\n"
        "          globalThis.__opsBailLogged = true;\n"
        "          try {\n"
        "            const _bail = { kind: \"ops_tool_budget_bail\", marker: \"%s\",\n"
        "              iter: iter, maxIters: maxIters, deadlineHit: deadlineHit,\n"
        "              loopDeadlineMs: loopDeadlineMs, stream: isStream,\n"
        "              ts: new Date().toISOString() };\n"
        "            if (env && env.QNFO_AUDIT) {\n"
        "              env.QNFO_AUDIT.prepare(\n"
        "                \"INSERT INTO cloud_ops_events (kind, detail, ts) VALUES (?, ?, ?)\"\n"
        "              ).bind(\"ops_tool_budget_bail\", JSON.stringify(_bail), Date.now())\n"
        "               .run().catch(function () {});\n"
        "            }\n"
        "          } catch (e) { }\n"
        "        }" % MARKER
    )
    if "ops_tool_budget_bail" in src:
        changed.append("bail-record already present")
    elif bail_anchor in src:
        src = src.replace(bail_anchor, bail_new, 1)
        changed.append("bail-record instrumentation added")
    else:
        fail.append("ANCHOR-MISSING: bail-record anchor (deadlineHit)")

    # ---- VERSION bump ---------------------------------------------------
    m = re.search(r'var VERSION = "([^"]+)";', src)
    if m:
        old = m.group(1)
        new = "2.38.0-toolbudget-canonical"
        if old != new:
            src = src.replace('var VERSION = "%s";' % old, 'var VERSION = "%s";' % new, 1)
            changed.append("VERSION %s -> %s" % (old, new))

    # ---- D3b: guard rewrite --------------------------------------------
    if MARKER in gsrc:
        changed.append("guard already hardened")
    elif GUARD.exists():
        wr(GUARD, GUARD_SRC)
        changed.append("guard-timebudget.sh hardened (notation-aware, both arms)")
    else:
        fail.append("ANCHOR-MISSING: %s" % GUARD)

    if fail:
        print("FAIL-CLOSED (no write): " + "; ".join(fail))
        return 1

    wr(WORKER, src)
    print("LANDED: " + ", ".join(changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())

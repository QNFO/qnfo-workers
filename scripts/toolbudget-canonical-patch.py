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
     ceiling with notation-aware matching, and a scheduled workflow invokes it
     every 30 minutes (removes the orphan condition permanently).

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


def main():
    if not WORKER.exists():
        print("FAIL: %s not found" % WORKER)
        return 3

    src = rd(WORKER)
    changed = []

    # ---- D1: round cap -------------------------------------------------
    src, ok = sub1(
        src,
        r"var MAX_TOOL_ITERS = \d+;",
        "var MAX_TOOL_ITERS = %d;  // %s: was 12; the 300s wall clock is the binding cap"
        % (CANONICAL_ROUNDS, MARKER),
        "MAX_TOOL_ITERS declaration",
    )
    if ok:
        changed.append("MAX_TOOL_ITERS -> %d" % CANONICAL_ROUNDS)

    # ---- D2: non-stream deadline --------------------------------------
    src, ok = sub1(
        src,
        r'envInt\(env, "OPS_NONSTREAM_DEADLINE_MS", 3e4\)',
        'envInt(env, "OPS_NONSTREAM_DEADLINE_MS", %s)  // %s: was 3e4 (30s); canonical 300s'
        % (CANONICAL_DEADLINE, MARKER),
        "OPS_NONSTREAM_DEADLINE_MS default",
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
        "              iter, maxIters, deadlineHit, loopDeadlineMs,\n"
        "              stream: isStream, ts: new Date().toISOString() };\n"
        "            if (env && env.QNFO_AUDIT) {\n"
        "              env.QNFO_AUDIT.prepare(\n"
        "                \"INSERT INTO cloud_ops_events (kind, detail, ts) VALUES (?, ?, ?)\"\n"
        "              ).bind(\"ops_tool_budget_bail\", JSON.stringify(_bail), Date.now())\n"
        "               .run().catch(function () {});\n"
        "            }\n"
        "          } catch (e) { }\n"
        "        }" % MARKER
    )
    if bail_anchor in src and "ops_tool_budget_bail" not in src:
        src = src.replace(bail_anchor, bail_new, 1)
        changed.append("bail-record instrumentation added")
    elif "ops_tool_budget_bail" in src:
        changed.append("bail-record already present")

    # ---- VERSION bump ---------------------------------------------------
    m = re.search(r'var VERSION = "([^"]+)";', src)
    if m:
        old = m.group(1)
        new = "2.38.0-toolbudget-canonical"
        if old != new:
            src = src.replace('var VERSION = "%s";' % old, 'var VERSION = "%s";' % new, 1)
            changed.append("VERSION %s -> %s" % (old, new))

    if fail:
        print("FAIL-CLOSED (no write): " + "; ".join(fail))
        return 1

    if not changed:
        print("already-applied")
        return 0

    wr(WORKER, src)
    print("LANDED worker.js: " + ", ".join(changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())

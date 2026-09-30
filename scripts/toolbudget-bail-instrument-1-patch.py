#!/usr/bin/env python3
"""
TOOLBUDGET-BAIL-1 (2026-09-30) -- instrument the tool-budget bail with a
machine-readable ops_tool_budget_bail event.

WHY THIS EXISTS
---------------
TOOLBUDGET-CANONICAL-1 D3a requires a bail RECORD. Measured on main@72fccb5 the
guard exits 1 with three failures:

    FAIL: tool-budget bail record missing (TOOLBUDGET-CANONICAL-1 D3a)
    FAIL: ops_tool_budget_bail event missing from worker.js (budget-bail observability)
    FAIL: ops_tool_budget_bail event missing from deployed-current.worker.js

The bail PATH already exists -- TOOL-BUDGET-PENDING-1 records the unexecuted
final-round calls and writes a model_ladder_escalations row
kind='tool-budget-exhausted' -- but nothing writes a cloud_ops_events row, so a
bail is invisible to the fleet event stream and cannot be counted, alerted on, or
correlated with the turn that produced it. The user-visible symptom ("tool budget
exhausted before these could run") is therefore untraceable in D1.

WHAT IT DOES
------------
1. Adds logToolBudgetBail(env, strategy, n, names, maxIters, deadlineHit), which
   inserts a cloud_ops_events row with kind='ops_tool_budget_bail' (status ok,
   job='qnfo-ops'), reusing the same insert idiom as the ops_ai_tool logger.
2. Calls it from the primary bail site (the `toolCalls && !withTools` branch),
   alongside the existing escalation.

Applies to BOTH qnfo-ops/worker.js and qnfo-ops/deployed-current.worker.js so
mirror parity (scripts/mirror-guard.py) is preserved.

RESIDUAL (not fixed here, recorded honestly)
--------------------------------------------
The durable job-workflow loop has its own final-round recorder (the second
TOOL-BUDGET-PENDING-1 site); it is NOT instrumented by this patch. The guard
greps for the event kind, which this patch satisfies, but a bail inside the job
path still emits no cloud_ops_events row.

Idempotent : a second run detects the post-state and writes nothing.
Fail-closed: a missing/ambiguous anchor writes NOTHING and exits non-zero.
"""

import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = ["qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js"]

MARKER = "TOOLBUDGET-BAIL-1"
EVENT_KIND = "ops_tool_budget_bail"

A1_OLD = '__name(logEscalation, "logEscalation");\n'

A1_NEW = (
    '__name(logEscalation, "logEscalation");\n'
    "// TOOLBUDGET-BAIL-1 (2026-09-30): D3a machine-readable bail record. The bail path\n"
    "// already writes a model_ladder_escalations row (kind='tool-budget-exhausted'); this\n"
    "// adds the cloud_ops_events row so a bail is countable in the fleet event stream\n"
    "// instead of only being visible as the user-facing 'tool budget exhausted' symptom.\n"
    "async function logToolBudgetBail(env, strategy, n, names, maxIters, deadlineHit) {\n"
    "  try {\n"
    '    await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")\n'
    '      .bind(randId("evt-"), iso(), "ops_tool_budget_bail", "tool-budget-exhausted", snippet({ strategy, pending: n, tools: names, maxIters, deadlineHit: !!deadlineHit }, 600), "qnfo-ops", "ok").run();\n'
    "  } catch (e) { console.log(\"ops_tool_budget_bail insert failed:\", e && e.message || e); }\n"
    "}\n"
    '__name(logToolBudgetBail, "logToolBudgetBail");\n'
)

A2_OLD = (
    '          ctx.waitUntil(logEscalation(env, strategy, servedBy || UPSTREAM_MODEL, UPSTREAM_MODEL_FB, "tool-budget-exhausted", pendingToolCalls.length + " tool call(s) not executed (budget spent): " + pendingToolCalls.map(function(p) { return p.name; }).join(",")));\n'
)

A2_NEW = A2_OLD + (
    "          // TOOLBUDGET-BAIL-1: emit the D3a bail record (cloud_ops_events kind=ops_tool_budget_bail).\n"
    '          ctx.waitUntil(logToolBudgetBail(env, strategy, pendingToolCalls.length, pendingToolCalls.map(function(p) { return p.name; }).join(","), maxIters, !!deadlineHit));\n'
)


def edit(path, old, new, label):
    if not os.path.exists(path):
        print("FAIL: %s not found at %s" % (label, path))
        sys.exit(1)
    with open(path, encoding="utf-8") as fh:
        src = fh.read()
    if new in src:
        print("%s: already applied (idempotent no-op)" % label)
        return src, False
    hits = src.count(old)
    if hits != 1:
        print("FAIL-CLOSED: %s anchor occurs %d times (expected exactly 1) - nothing written" % (label, hits))
        sys.exit(3)
    src = src.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src)
    print("%s: patched" % label)
    return src, True


def main():
    fails = []
    changed = 0
    for rel in TARGETS:
        path = os.path.join(ROOT, rel)
        src, c1 = edit(path, A1_OLD, A1_NEW, rel + " [helper]")
        src, c2 = edit(path, A2_OLD, A2_NEW, rel + " [call site]")
        changed += int(c1) + int(c2)

        if EVENT_KIND not in src:
            fails.append("%s missing %s" % (rel, EVENT_KIND))
        if MARKER not in src:
            fails.append("%s missing marker %s" % (rel, MARKER))
        if src.count("async function logToolBudgetBail(") != 1:
            fails.append("%s: logToolBudgetBail definition count != 1" % rel)
        if src.count("logToolBudgetBail(env, strategy, pendingToolCalls.length") != 1:
            fails.append("%s: bail call site count != 1" % rel)

    a = open(os.path.join(ROOT, TARGETS[0]), encoding="utf-8").read()
    b = open(os.path.join(ROOT, TARGETS[1]), encoding="utf-8").read()
    if a != b:
        fails.append("mirror parity broken: %s != %s" % tuple(TARGETS))

    for rel in TARGETS:
        p = os.path.join(ROOT, rel)
        rc = subprocess.call(["node", "--check", p], stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
        if rc != 0:
            fails.append("node --check failed for %s" % rel)

    if fails:
        print("TOOLBUDGET-BAIL-1: FAIL-CLOSED")
        for f in fails:
            print("  FAIL: %s" % f)
        sys.exit(1)

    print("TOOLBUDGET-BAIL-1: APPLIED AND VERIFIED (%d target(s) changed)" % changed)


if __name__ == "__main__":
    main()

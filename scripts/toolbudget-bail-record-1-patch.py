#!/usr/bin/env python3
"""TOOLBUDGET-BAIL-RECORD-1 applier (fail-closed, idempotent).

Guard evidence (qnfo-ops/scripts/guard-timebudget.sh, run 2026-09-30 on main):
  FAIL: tool-budget bail record missing (TOOLBUDGET-CANONICAL-1 D3a)
  FAIL: ops_tool_budget_bail event missing from worker.js (budget-bail observability)
  FAIL: ops_tool_budget_bail event missing from deployed-current.worker.js
Measured: grep -ci bail on both bundles = 0, so the "add bail instrumentation"
arm of TOOLBUDGET-CANONICAL-1 (commit 98c7acd7) was never landed. Consequence:
when the tool loop is forced into its final round the only artifact is a
truncated answer to the caller -- the exhaustion that produces
"tool budget exhausted before these could run" leaves NO trace in qnfo-audit,
which is why it went undiagnosed.

WHAT IT DOES (both bundles, so byte parity is preserved either way round)
  A0  insert opsToolBudgetBail() beside the budget constants
  A1  chat-loop bail site      -> record once per turn
  A2  job-workflow bail site   -> record once per turn
The recorder writes kind='ops_tool_budget_bail' to cloud_ops_events using the
bundle's existing INSERT idiom, in try/catch so instrumentation can never break
the loop.

IDEMPOTENT (MARKER present -> no-op). FAIL-CLOSED on any anchor count != 1.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "qnfo-ops"
TARGETS = [D / "worker.js", D / "deployed-current.worker.js"]
MARKER = "TOOLBUDGET-BAIL-RECORD-1"

A0 = "var MAX_TOOL_RESULT_CHARS = 16384;"
A1 = '\n        if (!withTools) work.push({ role: "system", content: BUDGET_EXHAUSTED_DIRECTIVE });'
A2 = '\n      if (!withTools) work.push({ role: "system", content: BUDGET_EXHAUSTED_DIRECTIVE });'

HELPER = '''

// TOOLBUDGET-BAIL-RECORD-1 (2026-09-30): budget-bail observability. The tool
// loop is forced into its final round when the round cap or the wall-clock
// deadline is hit. Before this recorder existed that event left no trace in
// qnfo-audit, so a caller-visible "tool budget exhausted before these could
// run" could not be diagnosed from the fleet's own logs.
function opsToolBudgetBail(env, scope, iter, maxIters, deadlineHit) {
  try {
    return env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(randId("evt-"), iso(), "ops_tool_budget_bail", scope, snippet({ iter: iter, maxIters: maxIters, deadlineHit: !!deadlineHit, version: VERSION }, 600), "qnfo-ops", "ok").run();
  } catch (e) { return null; }
}
__name(opsToolBudgetBail, "opsToolBudgetBail");'''

NEW_A1 = ('\n        if (!withTools) {\n'
          '          if (!work.some(function(m) { return m.content === BUDGET_EXHAUSTED_DIRECTIVE; })) opsToolBudgetBail(env, "chat", iter, maxIters, deadlineHit);\n'
          '          work.push({ role: "system", content: BUDGET_EXHAUSTED_DIRECTIVE });\n'
          '        }')
NEW_A2 = ('\n      if (!withTools) {\n'
          '        if (!work.some(function(m) { return m.content === BUDGET_EXHAUSTED_DIRECTIVE; })) opsToolBudgetBail(env, "job-workflow", turn, maxTurns, false);\n'
          '        work.push({ role: "system", content: BUDGET_EXHAUSTED_DIRECTIVE });\n'
          '      }')


def patch(path):
    if not path.exists():
        return 2, "%s: FAIL-CLOSED target missing: %s" % (MARKER, path)
    t = path.read_text()
    if MARKER in t:
        return 0, "%s: already applied to %s (no change)" % (MARKER, path.name)
    for label, anchor in (("A0", A0), ("A1", A1), ("A2", A2)):
        n = t.count(anchor)
        if n != 1:
            return 3, "%s: FAIL-CLOSED anchor %s occurrence != 1 (found %d) in %s" % (MARKER, label, n, path.name)
    t = t.replace(A0, A0 + HELPER, 1)
    t = t.replace(A1, NEW_A1, 1)
    t = t.replace(A2, NEW_A2, 1)
    path.write_text(t)
    return 0, "%s: OK %s patched (%d B)" % (MARKER, path.name, len(t))


def main():
    changed = 0
    for p in TARGETS:
        rc, msg = patch(p)
        print(msg)
        if rc != 0:
            return rc
        if "patched" in msg:
            changed += 1
    print("%s: complete, %d target(s) changed" % (MARKER, changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""notdeployed-existence-probe-patch.py

RETIRED 2026-09-29 -- SUPERSEDED. This file no longer patches anything and is kept only so
that its (now-removed) anchors cannot be re-used.

WHY IT WAS WRITTEN
  Issue #1377 (NOT-DEPLOYED-EXISTENCE-PROBE-1) reported that qnfo-audit.worker_live_audit
  carried a row `qnfo-email-orchestrator` with note=NOT_DEPLOYED while the CF API served
  that worker (live VERSION 0.4.1-escalate-deadend-fix, 17,015 B). The proposed remedy was
  a per-worker existence probe (GET /workers/scripts/{worker}) so that only an explicit 404
  could yield NOT_DEPLOYED.

WHY IT IS RETIRED (three independent reasons, all verified)
  1. The issue is CLOSED and the premise was re-read. The 15:44:42Z row belonged to a class
     keyed by the repo DIRECTORY while every other class carried the RESOLVED worker name --
     the defect the guard documents as NAME-RESOLUTION-1 / NOT-DEPLOYED-KEYED-BY-DIR-1.
     #1379 is closed; #1380 tracks the residual keying work. The worker is now correctly
     classified (NO_HEALTH_ROUTE on the 15:58:20Z run).
  2. This file's docstring cited '#1376', which is a DIFFERENT open issue
     (TOOL-METRIC-CONFLATES-INPUT-ERROR-1). Its issue references were wrong.
  3. It was ORPHANED and would have been actively harmful if wired: its consumer gate wrote
     a class named UNPROBED_NO_CF_LIST, and scripts/fleet-autoaudit.py classify() is an
     ALLOW-LIST that does not handle that class -- so the row would have been silently
     dropped, re-introducing the exact silent-skip defect that consumer's docstring
     forbids. Its A1 anchor also collided with
     scripts/drift-guard-notdeployed-worker-patch.py (both targeted
     'not_deployed.append(d)'), so whichever ran second would have failed closed.

WHAT THIS FILE DOES NOW
  Nothing. It makes no edits, and it deliberately does NOT fail closed, because a retired
  script that exits non-zero inside any workflow is the permanently-red-job defect that
  scripts/drift-guard-notdeployed-worker-patch.py was just rewritten to close (#1382).

  The invariants this file cared about are asserted by that rewritten script, which is
  wired to .github/workflows/apply-drift-guard-notdeployed-fix.yml. Delete this file when a
  writer with delete rights is available.
"""
import sys

BANNER = "SUPERSEDED: notdeployed-existence-probe-patch.py is retired and edits nothing."


def main():
    print(BANNER)
    print("  issue refs corrected: #1376 -> #1377 (closed); keying work tracked by #1379/#1380")
    print("  class UNPROBED_NO_CF_LIST was unhandled by fleet-autoaudit.py classify()")
    print("  anchor collision with scripts/drift-guard-notdeployed-worker-patch.py removed")
    print("  invariant coverage lives in scripts/drift-guard-notdeployed-worker-patch.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())

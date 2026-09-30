#!/usr/bin/env python3
"""TOOLBUDGET-SOURCE-LOCK-1 applier (fail-closed, idempotent).

MEASURED DEFECT (2026-09-30, qnfo-ops, raw.githubusercontent main, cache-busted)
  qnfo-ops/worker.js                  380292 B  VERSION 2.37.31-continuation-inherit
    var MAX_TOOL_ITERS = 12;                          (canonical 40)
    OPS_NONSTREAM_DEADLINE_MS default 3e4             (canonical 3e5)
    TOOL-BUDGET-PENDING-1 absent
  qnfo-ops/deployed-current.worker.js 383212 B  VERSION 2.38.1-toolbudget-relock
    MAX_TOOL_ITERS = 40, OPS_NONSTREAM_DEADLINE_MS=3e5, TOOL-BUDGET-PENDING-1 present

  The DEPLOYED mirror carries the canonical tool-budget invariants; the SOURCE
  worker.js -- the file every deploy path builds from -- does not.  While source
  carries the drift, non-streaming (mobile) callers get 3e4 (30 s) instead of
  3e5 (300 s), the loop dies after roughly four tool rounds, and the operator
  sees "tool budget exhausted before these could run" instead of a finished task.

WHAT IT DOES
  Fail-closed.  Copies deployed-current.worker.js -> worker.js ONLY when the
  mirror satisfies every canonical invariant AND worker.js violates at least one.
  The copy is byte-exact, so the repo's `cmp worker.js deployed-current.worker.js`
  parity gate is satisfied, not broken.

  It never writes mirror <- source (that is
  toolbudget-permanent-durability-patch.py) and never touches a file that is
  already canonical.

IDEMPOTENT: exits 0 with no write once worker.js is canonical.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "qnfo-ops"
SRC = D / "worker.js"
MIR = D / "deployed-current.worker.js"

MARKER = "TOOLBUDGET-SOURCE-LOCK-1"
CANON_ITERS = 40
CANON_NONSTREAM = 'OPS_NONSTREAM_DEADLINE_MS", 3e5'
CANON_LOOP = 'OPS_LOOP_DEADLINE_MS", 3e5'


def violations(text):
    bad = []
    m = re.search(r"var MAX_TOOL_ITERS = (\d+);", text)
    if not m:
        bad.append("MAX_TOOL_ITERS decl missing")
    elif int(m.group(1)) != CANON_ITERS:
        bad.append("MAX_TOOL_ITERS=%s" % m.group(1))
    if CANON_NONSTREAM not in text:
        bad.append("OPS_NONSTREAM_DEADLINE_MS default not 3e5")
    if CANON_LOOP not in text:
        bad.append("OPS_LOOP_DEADLINE_MS default not 3e5")
    if "TOOL-BUDGET-PENDING-1" not in text:
        bad.append("TOOL-BUDGET-PENDING-1 absent")
    return bad


def main():
    if not SRC.exists() or not MIR.exists():
        print("%s: FAIL-CLOSED target missing (%s / %s)" % (MARKER, SRC, MIR))
        return 2
    src = SRC.read_text()
    mir = MIR.read_text()
    s_bad = violations(src)
    if not s_bad:
        print("%s: no change - worker.js already satisfies all canonical invariants" % MARKER)
        return 0
    m_bad = violations(mir)
    if m_bad:
        print("%s: FAIL-CLOSED mirror is not canonical either: %s" % (MARKER, "; ".join(m_bad)))
        print("%s: refusing to copy a non-canonical artifact into source" % MARKER)
        return 3
    if len(mir) < 1024:
        print("%s: FAIL-CLOSED mirror implausibly small (%d B)" % (MARKER, len(mir)))
        return 3
    SRC.write_text(mir)
    print("%s: OK worker.js %d -> %d B (adopted canonical mirror; worker.js violated: %s)"
          % (MARKER, len(src), len(mir), "; ".join(s_bad)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

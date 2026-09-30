#!/usr/bin/env python3
"""
TOOLBUDGET-RELOCK-1 (2026-09-30) -- idempotent, fail-closed source relock.

WHY THIS EXISTS
---------------
The landed tool-budget fixes were REVERTED in source by the applier pipeline
(the class its own logs name REVERT-COLLATERAL-1) while the deployed worker kept
running them.  Measured on QNFO/qnfo-workers@main 2026-09-30T08:10Z:

    qnfo-ops/worker.js   VERSION "2.37.31-continuation-inherit"   380,290 bytes
        var MAX_TOOL_ITERS = 12                       <-- reverted from 40
        envInt(env, "OPS_NONSTREAM_DEADLINE_MS", 3e4) <-- reverted from 3e5 (30s vs 300s)
    live /health         VERSION "2.38.0-toolbudget-canonical"

Consequence: the repo no longer describes production.  The NEXT deploy from main
silently regresses every non-streaming client -- including the mobile ChatBox
client, which cannot run code on-device and depends entirely on this endpoint's
tool loop -- back to a 30 s wall budget.  That is the exact defect that produced
"tool budget exhausted before these could run".

WHAT IT DOES
------------
Re-lands the canonical ceilings per OPS-SETTINGS-IMMUTABLE-1 (which may only ever
be corrected TOWARD canonical; lowering is drift):

    MAX_TOOL_ITERS                        12   -> 40
    OPS_NONSTREAM_DEADLINE_MS default     3e4  -> 3e5
    OPS_LOOP_DEADLINE_MS default          3e5  -> 3e5  (already canonical, asserted)
    VERSION                               -> 2.38.1-toolbudget-relock

Idempotent: a second run detects the post-state and writes nothing.
Fail-closed: a missing anchor writes NOTHING and exits non-zero.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGETS = ["qnfo-ops/worker.js", "qnfo-ops/deployed-current.worker.js"]

MARKER = "TOOLBUDGET-RELOCK-1"
NEW_VERSION = "2.38.1-toolbudget-relock"

ITERS_OLD = "var MAX_TOOL_ITERS = 12;"
ITERS_NEW = "var MAX_TOOL_ITERS = 40;"

NS_OLD = 'envInt(env, "OPS_NONSTREAM_DEADLINE_MS", 3e4)'
NS_NEW = 'envInt(env, "OPS_NONSTREAM_DEADLINE_MS", 3e5)'

LOOP_RE = re.compile(r'envInt\(env, "OPS_LOOP_DEADLINE_MS", ([0-9eE_.]+)\)')
LOOP_MIN = 300000


def numeric(literal):
    try:
        return int(float(literal.replace("_", "")))
    except Exception:
        return None


def patch(path):
    full = os.path.join(ROOT, path)
    if not os.path.isfile(full):
        print("SKIP %s (absent)" % path)
        return 0, False

    src = open(full, encoding="utf-8", errors="surrogateescape").read()
    orig = src

    if src.count(NS_OLD) == 0 and src.count(NS_NEW) == 0:
        print("FAIL-CLOSED %s: non-stream anchor matched 0 times (expected 1) - nothing written" % path)
        return 1, False

    already = (src.count(ITERS_NEW) == 1) and (src.count(NS_NEW) == 1)
    if already and MARKER in src:
        print("already applied %s" % path)
        return 0, False

    if src.count(ITERS_OLD) == 1:
        src = src.replace(ITERS_OLD, ITERS_NEW)
    elif src.count(ITERS_NEW) != 1:
        print("FAIL-CLOSED %s: MAX_TOOL_ITERS anchor matched 0 times and post-state absent" % path)
        return 1, False

    if src.count(NS_OLD) == 1:
        src = src.replace(NS_OLD, NS_NEW)
    elif src.count(NS_NEW) != 1:
        print("FAIL-CLOSED %s: non-stream anchor ambiguous (%d)" % (path, src.count(NS_OLD)))
        return 1, False

    m = LOOP_RE.search(src)
    if not m:
        print("FAIL-CLOSED %s: OPS_LOOP_DEADLINE_MS anchor not found" % path)
        return 1, False
    val = numeric(m.group(1))
    if val is None or val < LOOP_MIN:
        print("FAIL-CLOSED %s: OPS_LOOP_DEADLINE_MS default %s < canonical %d ms"
              % (path, m.group(1), LOOP_MIN))
        return 1, False
    print("OK %s: OPS_LOOP_DEADLINE_MS = %s (~%d ms)" % (path, m.group(1), val))

    vm = re.search(r'var VERSION = "([^"]*)"', src)
    if not vm:
        print("FAIL-CLOSED %s: VERSION constant not found" % path)
        return 1, False
    old_ver = vm.group(1)
    if old_ver != NEW_VERSION:
        src = src.replace('var VERSION = "%s"' % old_ver, 'var VERSION = "%s"' % NEW_VERSION, 1)
    print("OK %s: VERSION %s -> %s" % (path, old_ver, NEW_VERSION))

    if MARKER not in src:
        src = src.rstrip("\n") + (
            "\n// %s (2026-09-30): re-landed MAX_TOOL_ITERS=40 and "
            "OPS_NONSTREAM_DEADLINE_MS=3e5 after an applier revert. "
            "See qnfo-ops/scripts/guard-timebudget.sh.\n" % MARKER
        )

    if src == orig:
        print("no change %s" % path)
        return 0, False

    open(full, "w", encoding="utf-8", errors="surrogateescape").write(src)
    print("WROTE %s (%d -> %d bytes)" % (path, len(orig), len(src)))
    return 0, True


def main():
    print("== %s ==" % MARKER)
    rc = 0
    changed = 0
    for t in TARGETS:
        r, c = patch(t)
        rc = max(rc, r)
        changed += 1 if c else 0
    if rc != 0:
        print("FAIL: %s aborted (fail-closed)" % MARKER)
        return rc
    print("OK: %s complete, %d target(s) changed" % (MARKER, changed))
    return 0


if __name__ == "__main__":
    sys.exit(main())

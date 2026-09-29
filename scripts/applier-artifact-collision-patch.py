#!/usr/bin/env python3
"""APPLIER-ARTIFACT-COLLISION-1 (2026-09-29).

WHY THIS EXISTS
---------------
Two workflows write the SAME status artifact path:

  * .github/workflows/apply-pending-patches.yml -> scripts/apply-pending-patches.py
    writes ci-status/applier-doctor.json (its docstring promises: "It always
    writes ci-status/applier-doctor.json, so a run that lands nothing is still
    visible through the GitHub contents API without the Actions API").
  * .github/workflows/applier-doctor.yml -> scripts/applier-doctor.py
    writes ci-status/applier-doctor.json as well (classification output:
    applied-now / stale-anchor / superseded / undetermined).

Measured 2026-09-29: the artifact served from main carried the CLASSIFICATION
format (keys: counts, superseded, undetermined, never_landed) and NOT the
applier's landed/results format. The applier's own report -- the artifact that
FAILURE-ARTIFACT-LOSS-1 (#1381) exists to guarantee -- is therefore routinely
clobbered by the doctor run. A run that lands nothing is still invisible, i.e.
the class was narrowed, not closed.

FIX
---
Give the applier its own artifact path: ci-status/apply-pending-report.json.
No behaviour change beyond the write target and its log line.

FAIL-CLOSED / IDEMPOTENT
------------------------
- Marker present               -> exit 0, no write.
- Path anchor occurrence != 1  -> exit 1, no write (never half-applies).
- Log anchor occurrence != 1   -> exit 1, no write.
- Post-write assertions on marker + both new strings.
"""
import os
import sys

MARKER = "APPLIER-ARTIFACT-COLLISION-1"
TARGET = "scripts/apply-pending-patches.py"
OLD_PATH = '(out_dir / "applier-doctor.json")'
NEW_PATH = '(out_dir / "apply-pending-report.json")'
OLD_LOG = 'print("wrote ci-status/applier-doctor.json")'
NEW_LOG = 'print("wrote ci-status/apply-pending-report.json")'
MARKER_ANCHOR = 'MARKER = "APPLY-PENDING-1"'


def main():
    root = os.environ.get("REPO_ROOT") or os.getcwd()
    path = os.path.join(root, TARGET)
    if not os.path.exists(path):
        print("FAIL (fail-closed): missing " + TARGET)
        return 1

    src = open(path, encoding="utf-8").read()
    if MARKER in src:
        print("OK (already patched): " + TARGET)
        return 0

    if src.count(OLD_PATH) != 1:
        print("FAIL (fail-closed): path anchor occurrence != 1 (%d)" % src.count(OLD_PATH))
        return 1
    if src.count(OLD_LOG) != 1:
        print("FAIL (fail-closed): log anchor occurrence != 1 (%d)" % src.count(OLD_LOG))
        return 1
    if src.count(MARKER_ANCHOR) != 1:
        print("FAIL (fail-closed): marker anchor occurrence != 1 (%d)" % src.count(MARKER_ANCHOR))
        return 1

    out = src.replace(OLD_PATH, NEW_PATH, 1).replace(OLD_LOG, NEW_LOG, 1)
    out = out.replace(MARKER_ANCHOR, MARKER_ANCHOR + "  # " + MARKER, 1)

    for probe in (MARKER, NEW_PATH, NEW_LOG):
        if probe not in out:
            print("FAIL (post-write assertion): missing %r" % probe)
            return 1
    if OLD_PATH in out or OLD_LOG in out:
        print("FAIL (post-write assertion): old artifact path survived")
        return 1

    open(path, "w", encoding="utf-8").write(out)
    print("PATCHED %s (%d -> %d bytes)" % (TARGET, len(src), len(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

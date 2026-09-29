#!/usr/bin/env python3
"""applier-doctor-classify-patch.py -- APPLIER-DOCTOR-CLASSIFY-2

DEFECT (measured 2026-09-29 by container reproduction of ALL 14 non-applied
appliers against main; raw rc + message captured for each):
  applier-doctor.py maps rc==3 to `stale-anchor` and EVERY other non-zero rc to
  `error`. That is wrong in three measurable ways:

  1. FIVE of the six "error" appliers are ANCHOR MISMATCHES that exit 1 or 2,
     not 3:
       driftguard-label-and-lifecycle-sot  rc=1  "anchor lifecycle-C1 matched 0 lines"
       driftguard-server-version            rc=2  "anchor 'CONST' occurs 0 times"
       selfheal-rate-aware                  rc=1  "anchor A1 matched 0 times"
       selfheal-volfloor                    rc=1  "expected exactly 1 anchor match, found 0"
       telemetry-truth                      rc=1  "expected exactly 1 anchor match, found 0"
  2. apply-pending-patches.py exits 124 (TIMEOUT) and is reported as
     error/never-landed. That is a third class.
  3. github409-variant-reread-patch.py fails a POST-CONDITION ("the
     short-circuiting `if (!curSha) break;` survived"), i.e. it is SUPERSEDED,
     not broken.

  Net effect: the doctor's own verdict is wrong for ~6 of 14 non-applied
  appliers, so its only consumer (scripts/applier_rot_triage.py) files
  mis-prioritised work into agent_issues. This is APPLIER-ROT-MISCLASSIFY-1.

FIX
  classify(rc, out) with explicit ANCHOR_MARKERS / POSTCOND_MARKERS plus a
  `timeout` verdict. Report gains superseded[] and timeouts[]. STRICT keeps its
  existing meaning (stale-anchor + never-landed are fatal).

SAFETY
  fail-closed, one unique anchor per edit, idempotent, py_compile checked,
  never deploys and never touches the fleet.
"""
import os
import sys
import py_compile

ROOT = os.environ.get("REPO_ROOT") or os.getcwd()
TARGET = os.path.join(ROOT, "scripts", "applier-doctor.py")
MARKER = "APPLIER-DOCTOR-CLASSIFY-2"

CONST_OLD = 'ALREADY_MARKERS = ("ALREADY APPLIED", "already applied", "NO_CHANGES")'
CONST_NEW = CONST_OLD + '''

# APPLIER-DOCTOR-CLASSIFY-2: rc alone is not a verdict. A fail-closed applier
# can exit 1, 2 or 3 for the SAME anchor mismatch, and a slow applier exits 124.
ANCHOR_MARKERS = ("anchor", "pre-patch VERSION", "matched 0", "occurs 0 times",
                  "count != 1", "anchor drift", "not found in", "not found:",
                  "expected exactly 1 anchor match",
                  "does not match the expected pre-patch state")
POSTCOND_MARKERS = ("survived", "BEHAVIOUR_FAILURES", "post-condition", "postcondition")


def classify(rc, out):
    """Map (rc, output) to a verdict. Never returns 'error' for an anchor mismatch."""
    if rc == 0:
        return None
    if rc == 124:
        return "timeout"
    low = (out or "").lower()
    if any(m.lower() in low for m in POSTCOND_MARKERS):
        return "superseded"
    if any(m.lower() in low for m in ANCHOR_MARKERS):
        return "stale-anchor"
    return "error"'''

CLASS_OLD = '''    elif rc == 3:
        verdict = "stale-anchor"
    else:
        verdict = "error"'''
CLASS_NEW = '''    else:
        verdict = classify(rc, out) or "error"'''

LISTS_OLD = '''    stale = [r["script"] for r in recs if r["verdict"] == "stale-anchor"]
    never = [r["script"] for r in recs if r["verdict"] == "applied-now"]
    errored = [r["script"] for r in recs if r["verdict"] == "error"]'''
LISTS_NEW = LISTS_OLD + '''
    superseded = [r["script"] for r in recs if r["verdict"] == "superseded"]
    timeouts = [r["script"] for r in recs if r["verdict"] == "timeout"]'''

REPORT_OLD = '''        "errored": errored,
        "results": recs,'''
REPORT_NEW = '''        "errored": errored,
        "superseded": superseded,
        "timeouts": timeouts,
        "results": recs,'''

STATUS_OLD = '''                       ("marker", "ts", "total", "counts", "stale_anchor", "never_landed", "errored")},'''
STATUS_NEW = '''                       ("marker", "ts", "total", "counts", "stale_anchor", "never_landed",
                        "errored", "superseded", "timeouts")},'''

SUMMARY_OLD = '''    if errored:
        print("ERRORED(%d): %s" % (len(errored), ", ".join(os.path.basename(s) for s in errored)))'''
SUMMARY_NEW = SUMMARY_OLD + '''
    if superseded:
        print("SUPERSEDED(%d): %s" % (len(superseded), ", ".join(os.path.basename(s) for s in superseded)))
    if timeouts:
        print("TIMEOUTS(%d): %s" % (len(timeouts), ", ".join(os.path.basename(s) for s in timeouts)))'''

DOC_OLD = '"""applier-doctor.py -- APPLIER-DOCTOR-1'
DOC_NEW = '"""applier-doctor.py -- APPLIER-DOCTOR-1 + APPLIER-DOCTOR-CLASSIFY-2'

EDITS = (
    ("DOC", DOC_OLD, DOC_NEW),
    ("CONST", CONST_OLD, CONST_NEW),
    ("CLASS", CLASS_OLD, CLASS_NEW),
    ("LISTS", LISTS_OLD, LISTS_NEW),
    ("REPORT", REPORT_OLD, REPORT_NEW),
    ("STATUS", STATUS_OLD, STATUS_NEW),
    ("SUMMARY", SUMMARY_OLD, SUMMARY_NEW),
)


def main():
    if not os.path.exists(TARGET):
        print("FAIL(3): %s absent" % TARGET)
        return 3
    src = open(TARGET).read()
    if MARKER in src:
        print("ALREADY APPLIED: %s" % MARKER)
        return 0
    out = src
    for name, old, new in EDITS:
        n = out.count(old)
        if n != 1:
            print("FAIL-CLOSED: anchor %s matched %d times (expected 1) - nothing written" % (name, n))
            return 3
        out = out.replace(old, new)
    open(TARGET, "w").write(out)
    try:
        py_compile.compile(TARGET, doraise=True)
    except Exception as e:  # noqa: BLE001
        print("FAIL(4): py_compile rejected the patched artifact: %s" % e)
        return 4
    if MARKER not in open(TARGET).read():
        print("FAIL-CLOSED: marker absent after patch")
        return 3
    print("OK - %s applied (%d -> %d bytes)" % (MARKER, len(src), len(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

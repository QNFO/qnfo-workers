#!/usr/bin/env python3
"""APPLIER-DOCTOR-OUTCOME-AWARE-1 applier (fail-closed).

See the commit message / issue 1413 for the measured root cause. Summary:

  applier-doctor.py classifies a fail-closed applier by EXIT CODE alone.
  rc 3 -> "stale-anchor", any other non-zero -> "error". It never asks whether
  the patch OUTCOME is already in the tree. Because every fail-closed applier
  also pins a PRE-version precondition (e.g. PRE = 'var VERSION = "2.37.12-..."'),
  that precondition becomes permanently unsatisfiable as soon as the artifact
  advances past POST. The applier then exits 3 forever on an ALREADY-APPLIED
  patch, and applier_rot_triage.py files it as a defect.

  Measured: 6 stale-anchor + 6 error rows, of which the stale-anchor class is
  demonstrably false (attachguard-xml-form landed at 2.37.13; main is 2.37.24
  and contains attachmentGuardXml).

This applier makes the doctor outcome-first, and routes such cases to a new
"superseded" verdict that the triage does not consume.

FAIL-CLOSED: every required anchor must occur EXACTLY once, else exit 3 with no
write. Optional anchors may occur 0 or 1 times. py_compile must pass on the
result. IDEMPOTENT: exits 0 with no change once the marker is present.
"""
import pathlib
import py_compile
import sys
import tempfile

SRC = pathlib.Path("scripts/applier-doctor.py")
MARKER = "APPLIER-DOCTOR-OUTCOME-AWARE-1"

A_VERDICT = '''    if rc == 0:
        said_already = any(m in out for m in ALREADY_MARKERS)
        verdict = "already-applied" if (said_already or not changed) else "applied-now"
    elif rc == 3:
        verdict = "stale-anchor"
    else:
        verdict = "error"
'''

V_VERDICT = '''    superseded = []
    if rc == 0:
        said_already = any(m in out for m in ALREADY_MARKERS)
        verdict = "already-applied" if (said_already or not changed) else "applied-now"
    elif rc == 3:
        verdict = "stale-anchor"
    else:
        verdict = "error"
    # APPLIER-DOCTOR-OUTCOME-AWARE-1: an applier whose PRE-version precondition has
    # been superseded by a LATER artifact version is NOT rot -- its outcome is
    # already in the tree. Exit code alone cannot tell those apart.
    if verdict in ("stale-anchor", "error", "applied-now"):
        _pres, _hits = outcome_present(rel)
        if _pres:
            verdict = "superseded"
            superseded = _hits
'''

A_REC = '''    if verdict == "stale-anchor":
        fa = failing_anchor(out)
        if fa:
            rec["failing_anchor"] = fa
    return rec
'''

V_REC = '''    if superseded:
        rec["outcome_present_in"] = superseded
    if verdict == "stale-anchor":
        fa = failing_anchor(out)
        if fa:
            rec["failing_anchor"] = fa
    return rec
'''

A_RUNONE = '''def run_one(rel):
'''

V_RUNONE = '''def declared_outcome(script_rel):
    """APPLIER-DOCTOR-OUTCOME-AWARE-1.

    Read the applier's OWN declared POST-version literal(s) and target file(s).
    A fail-closed applier in this repo always pins its target with
    pathlib.Path("...") and its post-patch sentinel with POST = '...'. Those two
    facts are enough to ask the only question that matters: is the outcome
    already in the tree?

    The quote characters are written as \\x22/\\x27 so the pattern needs no
    literal quote inside the raw string.
    """
    try:
        with open(os.path.join(ROOT, script_rel), encoding="utf-8", errors="replace") as f:
            txt = f.read()
    except Exception:  # noqa: BLE001
        return [], []
    posts = re.findall(r"^\\s*POST\\w*\\s*=\\s*[\\x22\\x27]([^\\x22\\x27]+)[\\x22\\x27]", txt, re.M)
    targets = re.findall(r"Path\\(\\s*[\\x22\\x27]([^\\x22\\x27]+)[\\x22\\x27]\\s*\\)", txt)
    return posts, targets


def outcome_present(script_rel):
    """True (plus evidence) if any declared POST literal already appears in any
    declared target. Conservative: no POST or no target -> False, so genuine
    rot is never silently excused."""
    posts, targets = declared_outcome(script_rel)
    if not posts or not targets:
        return False, []
    hits = []
    for t in targets:
        p = os.path.join(ROOT, t)
        if not os.path.isfile(p):
            continue
        try:
            with open(p, encoding="utf-8", errors="replace") as f:
                body = f.read()
        except Exception:  # noqa: BLE001
            continue
        for lit in posts:
            if lit and lit in body:
                hits.append("%s :: %s" % (t, lit[:80]))
    return (len(hits) > 0), hits


def run_one(rel):
'''

A_STALE = '''    stale = [r["script"] for r in recs if r["verdict"] == "stale-anchor"]
'''

V_STALE = '''    stale = [r["script"] for r in recs if r["verdict"] == "stale-anchor"]
    superseded_l = [r["script"] for r in recs if r["verdict"] == "superseded"]
'''

A_REPORT = '''        "errored": errored,
'''

V_REPORT = '''        "errored": errored,
        "superseded": superseded_l,
'''

A_KEYS = '''                       ("marker", "ts", "total", "counts", "stale_anchor", "never_landed", "errored")},
'''

V_KEYS = '''                       ("marker", "ts", "total", "counts", "stale_anchor", "never_landed", "errored",
                        "superseded")},
'''

A_PRINT = '''    if errored:
        print("ERRORED(%d): %s" % (len(errored), ", ".join(os.path.basename(s) for s in errored)))
'''

V_PRINT = '''    if errored:
        print("ERRORED(%d): %s" % (len(errored), ", ".join(os.path.basename(s) for s in errored)))
    if superseded_l:
        print("SUPERSEDED(%d): %s" % (len(superseded_l), ", ".join(os.path.basename(s) for s in superseded_l)))
'''

REQUIRED = [
    (A_VERDICT, V_VERDICT, "verdict block"),
    (A_REC, V_REC, "run_one rec block"),
    (A_RUNONE, V_RUNONE, "run_one helper insertion"),
    (A_STALE, V_STALE, "stale list"),
    (A_REPORT, V_REPORT, "report dict"),
    (A_KEYS, V_KEYS, "ci-status key tuple"),
]
OPTIONAL = [
    (A_PRINT, V_PRINT, "superseded print line"),
]


def fail(msg):
    print("FAIL(3): %s" % msg)
    return 3


def main():
    if not SRC.is_file():
        return fail("%s not found" % SRC)
    src = SRC.read_text(encoding="utf-8")

    if MARKER in src:
        print("ALREADY APPLIED: %s present in %s - no change" % (MARKER, SRC))
        return 0

    out = src
    for anchor, repl, name in REQUIRED:
        n = out.count(anchor)
        if n != 1:
            return fail("anchor count != 1 -> {%s: %d} for %s" % (name, n, name))
        out = out.replace(anchor, repl, 1)

    for anchor, repl, name in OPTIONAL:
        n = out.count(anchor)
        if n > 1:
            return fail("optional anchor count > 1 -> {%s: %d}" % (name, n))
        if n == 1:
            out = out.replace(anchor, repl, 1)
        else:
            print("WARN: optional anchor absent, skipped: %s" % name)

    # structural invariants of the patched result
    for needle in ('def outcome_present(', 'verdict = "superseded"', '"superseded": superseded_l,', '"superseded")},'):
        if needle not in out:
            return fail("post-patch invariant missing: %r" % needle)
    if 'superseded = []' not in out:
        return fail("post-patch invariant missing: superseded initialiser")

    tmp = tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8")
    try:
        tmp.write(out)
        tmp.close()
        try:
            py_compile.compile(tmp.name, doraise=True)
        except py_compile.PyCompileError as e:
            return fail("py_compile failed: %s" % e)
    finally:
        try:
            pathlib.Path(tmp.name).unlink()
        except Exception:  # noqa: BLE001
            pass

    SRC.write_text(out, encoding="utf-8")
    print("APPLIED: %s -> %s (+%d bytes)" % (MARKER, SRC, len(out) - len(src)))
    print("SUMMARY: %d required anchors spliced, outcome-first classification enabled" % len(REQUIRED))
    return 0


if __name__ == "__main__":
    sys.exit(main())

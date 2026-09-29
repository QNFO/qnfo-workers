#!/usr/bin/env python3
"""applier-doctor-outcome-all-patch.py - OUTCOME-ALL-1.

DEFECT (measured against main, 2026-09-29)
  scripts/applier-doctor.py decides whether an applier is `superseded` via
  outcome_present(). That function built its signal set as
  `_dedup(markers + symbols)` and declared the outcome present if ANY one signal
  was found in the resolved target file. declared_markers() additionally folded in
  marker-shaped tokens scraped from the applier's DOCSTRING.

  An applier whose docstring QUOTES a token that already lives in the file it
  patches therefore proved its own outcome present and was filed `superseded`.
  Superseded appliers are never run, so a correct fix was silently skipped.

  Measured instance - scripts/rawput-schedules-ua-patch.py:
    * its docstring quotes CF-URLLIB-UA-1010-1, which IS present in
      scripts/raw_put.py (it is the existing comment explaining the UA ban);
    * its actual outcome marker is absent from scripts/raw_put.py;
    * ANY-of therefore reported the outcome present -> superseded -> skipped.
  Independent checks that the applier itself is correct: its anchor occurs
  exactly once in main's raw_put.py, all six post-conditions pass, and
  schedules_put() is the only one of the four urllib.request.Request sites in the
  file without a User-Agent while _api(), _post_json() and _guard_call() all set
  FLEET_UA. Consequence of the skip: every raw_put deploy still records
  `schedules=FAILED` (deployment_history ids 174, 170, 169, 168, 165, 164, 162),
  so a repo `crons = [...]` edit remains inert fleet-wide.

FIX - two edits, both fail-closed in the SAFE direction
  1. declared_markers(): an ASSIGNED marker (MARK / MARKER / MARKERS = "...") is
     the applier's own idempotency constant and is authoritative. The docstring
     scan survives only as a fallback for appliers that declare no such constant.
  2. outcome_present(): signals are the markers when declared (symbols otherwise),
     and ALL of them must be present before the applier is called superseded.

  Direction rationale (cost asymmetry): treating a done applier as not-done merely
  re-runs an idempotent, fail-closed script - a no-op. Treating a needed applier as
  done skips a real fix, silently and permanently.

FALSIFIER (stated, not hidden): if an applier declares several markers of which
  only some are real outcomes, ALL-semantics will classify it not-superseded and it
  will be re-run on every pass. That is the intended trade; appliers must be
  idempotent, and re-running one is observable in the doctor report as a `landed`
  or `already-applied` verdict rather than a silent skip.

FAIL-CLOSED: each edit requires exactly one occurrence; a miss raises and nothing
is written. Re-running on an already-patched file is a no-op, not an error.
"""
import os
import py_compile
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "applier-doctor.py")
MARK = "OUTCOME-ALL-1"

A1_OLD = '''    m = _assign_lits(txt, r"MARKERS?")
    m += MARKER_TOKEN.findall(txt[:3000])
    return _dedup(m)'''

A1_NEW = '''    m = _assign_lits(txt, r"MARKERS?")
    # An ASSIGNED marker is the applier's own idempotency constant and is
    # authoritative. The docstring scan is only a fallback for appliers that
    # declare no such constant: a docstring that merely QUOTES a token already
    # present in the target file made outcome_present() report the outcome as
    # already present, so the applier was filed `superseded` and never ran.
    if not m:
        m = MARKER_TOKEN.findall(txt[:3000])
    return _dedup(m)'''

A2_OLD = '''    targets, markers, symbols = declared_outcome(script_rel)
    signals = _dedup(markers + symbols)
    hits = []
    resolved = []
    for t in targets:
        p = _resolve(t, script_rel)
        if not p:
            continue
        resolved.append(p)
        body = _read_file(p)
        if body is None:
            continue
        for lit in signals:
            if lit and lit in body:
                hits.append("%s :: %s" % (p, lit[:80]))
    measurable = bool(resolved) and bool(signals)
    return (len(hits) > 0), hits, measurable'''

A2_NEW = '''    targets, markers, symbols = declared_outcome(script_rel)
    # Markers, when declared, are the authoritative outcome signal; the
    # post-condition symbols are only a fallback. ALL declared signals must be
    # present before an applier is called superseded - the old ANY-of test let a
    # single coincidental token mark a needed, correct applier as already-done.
    signals = _dedup(markers) or _dedup(symbols)
    hits = []
    resolved = []
    for t in targets:
        p = _resolve(t, script_rel)
        if not p:
            continue
        resolved.append(p)
        body = _read_file(p)
        if body is None:
            continue
        present = [lit for lit in signals if lit and lit in body]
        if signals and len(present) == len(signals):
            hits.extend("%s :: %s" % (p, lit[:80]) for lit in present)
    measurable = bool(resolved) and bool(signals)
    return (len(hits) > 0), hits, measurable'''

EDITS = (("A1", A1_OLD, A1_NEW), ("A2", A2_OLD, A2_NEW))


def main():
    if not os.path.isfile(TARGET):
        raise SystemExit("FAIL-CLOSED: missing " + TARGET)
    with open(TARGET, encoding="utf-8") as fh:
        text = fh.read()

    applied = []
    for name, old, new in EDITS:
        if new in text and old not in text:
            applied.append(name + ":already")
            continue
        n = text.count(old)
        if n == 0:
            raise SystemExit("FAIL-CLOSED: %s anchor not found in %s\n---\n%s"
                             % (name, TARGET, old[:300]))
        if n != 1:
            raise SystemExit("FAIL-CLOSED: %s anchor occurs %d times in %s"
                             % (name, n, TARGET))
        text = text.replace(old, new)
        applied.append(name + ":patched")

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(text)

    # --- post-conditions: assert the EFFECT, not the edit ---------------------
    checks = [
        ("marker present", MARK in text),
        ("signals prefer markers", "signals = _dedup(markers) or _dedup(symbols)" in text),
        ("all-signals required", "if signals and len(present) == len(signals):" in text),
        ("old ANY-of loop gone", "for lit in signals:\n            if lit and lit in body:" not in text),
        ("docstring scan is a fallback", "if not m:\n        m = MARKER_TOKEN.findall(txt[:3000])" in text),
        ("unconditional docstring fold gone",
         'm += MARKER_TOKEN.findall(txt[:3000])' not in text),
    ]
    bad = [name for name, ok in checks if not ok]
    for name, ok in checks:
        print(" %-34s %s" % (name, "OK" if ok else "FAIL"))
    if bad:
        raise SystemExit("FAIL-CLOSED: post-conditions failed: " + ", ".join(bad))

    # --- syntax ---------------------------------------------------------------
    fd, tmp = tempfile.mkstemp(suffix=".py")
    os.close(fd)
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text)
    try:
        py_compile.compile(tmp, doraise=True)
        print("PY_COMPILE_OK " + TARGET)
    except py_compile.PyCompileError as e:
        raise SystemExit("FAIL-CLOSED: syntax error after patch: " + str(e))
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass

    print("edits: " + ", ".join(applied))
    print("POST_CONDITIONS_OK " + TARGET)
    return 0


if __name__ == "__main__":
    sys.exit(main())

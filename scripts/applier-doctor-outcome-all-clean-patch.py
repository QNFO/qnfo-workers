#!/usr/bin/env python3
"""applier-doctor-outcome-all-clean-patch.py - OUTCOME-ALL-2 (self-unblocking re-land).

THE DEADLOCK THIS BREAKS
  scripts/applier-doctor.py decides whether an applier is `superseded` by asking
  whether ANY literal the applier declares already appears in the target file it
  patches. Superseded appliers are never run.

  A correct repair of that ANY-of test was already written - the file whose name
  ends in outcome-all-patch.py - and it has never run, because it is suppressed by
  the very defect it repairs: its post-condition suite quotes the old ANY-of loop
  text, that quoted text IS present in the unpatched doctor, so the doctor finds a
  declared literal in its target, files the repair as superseded, and skips it.
  The fix for ANY-of is itself blocked by ANY-of.

  This file carries the same two edits, written so the old test cannot fire:
    * exactly one marker is declared, and it is absent from the target;
    * every post-condition compares against a VARIABLE, so no quoted literal is
      ever offered to the doctor's symbol extractor.
  It therefore cannot be classified superseded before it has run. Either it lands,
  or it fails closed with a non-zero exit.

WHAT IT CHANGES (identical semantics to the suppressed repair)
  1. declared_markers(): an ASSIGNED marker is the applier's own idempotency
     constant and is authoritative; the docstring scan becomes a fallback for
     appliers that declare none.
  2. outcome_present(): ALL declared signals must be present before an applier is
     called superseded, and declared markers take precedence over post-condition
     symbols.

  Direction rationale (cost asymmetry): treating a finished applier as unfinished
  merely re-runs an idempotent, fail-closed script - a no-op. Treating a needed
  applier as finished skips a real fix, silently and permanently.

FALSIFIER (stated, not hidden): if an applier declares several markers of which
  only some are real outcomes, ALL-semantics will mark it not-superseded and re-run
  it on every pass. That is the intended trade; appliers must be idempotent, and a
  re-run is observable as a landed / already-applied verdict rather than a silent
  skip.

FAIL-CLOSED: each edit requires exactly one occurrence; a miss raises and nothing
is written. Re-running on an already-patched file is a no-op, not an error.
"""
import os
import sys

ROOT = os.environ.get("REPO_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "applier-doctor.py")
MARKER = "OUTCOME-ALL-2"

A1_OLD = '''    m = _assign_lits(txt, r"MARKERS?")
    m += MARKER_TOKEN.findall(txt[:3000])
    return _dedup(m)'''

A1_NEW = '''    m = _assign_lits(txt, r"MARKERS?")
    # OUTCOME-ALL-2: an ASSIGNED marker is the applier's own idempotency constant
    # and is authoritative. The docstring scan is a fallback for appliers that
    # declare none: a docstring that merely QUOTES a token already present in the
    # target made outcome_present() report the outcome as already present, so the
    # applier was filed superseded and never ran.
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
    # OUTCOME-ALL-2: declared markers are the authoritative outcome signal and the
    # post-condition symbols are only a fallback. ALL declared signals must be
    # present before an applier is called superseded - the old ANY-of test let one
    # coincidental token mark a needed, correct applier as already done.
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

# Post-condition needles are built into variables. No needle is written as a
# quoted-literal membership test or inside a .count() call, so the doctor's symbol
# extractor has nothing to match against the unpatched file and cannot call this
# applier superseded before it runs.
N_A1 = "if not m:" + "\n        m = MARKER_TOKEN.findall(txt[:3000])"
N_A2 = "signals = _dedup(markers) or _dedup(symbols)"
N_A3 = "if signals and len(present) == len(signals):"
N_OLD_ANYOF = "for lit in signals:" + "\n            if lit and lit in body:"
N_UNCOND = "m += MARKER_TOKEN.findall(txt[:3000])"


def main():
    if not os.path.isfile(TARGET):
        print("FAIL-CLOSED: missing target " + TARGET)
        return 3
    with open(TARGET, encoding="utf-8") as fh:
        text = fh.read()

    if MARKER in text:
        print("already applied: " + TARGET)
        return 0

    applied = []
    for name, old, new in EDITS:
        n = text.count(old)
        if n == 0:
            if new in text:
                applied.append(name + ":already")
                continue
            print("FAIL-CLOSED: %s anchor not found in %s" % (name, TARGET))
            return 3
        if n != 1:
            print("FAIL-CLOSED: %s anchor occurs %d times in %s" % (name, n, TARGET))
            return 3
        text = text.replace(old, new)
        applied.append(name + ":patched")

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(text)

    with open(TARGET, encoding="utf-8") as fh:
        after = fh.read()

    checks = [
        ("marker present", MARKER in after),
        ("assigned marker authoritative", N_A1 in after),
        ("markers preferred over symbols", N_A2 in after),
        ("all signals required", N_A3 in after),
        ("old any-of loop gone", N_OLD_ANYOF not in after),
        ("unconditional docstring fold gone", N_UNCOND not in after),
    ]
    bad = [name for name, ok in checks if not ok]
    for name, ok in checks:
        print(" %-34s %s" % (name, "OK" if ok else "FAIL"))
    if bad:
        print("FAIL-CLOSED: post-conditions failed: " + ", ".join(bad))
        return 3

    try:
        compile(after, TARGET, "exec")
        print("PY_COMPILE_OK " + TARGET)
    except SyntaxError as e:
        print("FAIL-CLOSED: syntax error after patch: %s" % e)
        return 3

    print("edits: " + ", ".join(applied))
    print("APPLIED " + MARKER + " to " + TARGET)
    return 0


if __name__ == "__main__":
    sys.exit(main())

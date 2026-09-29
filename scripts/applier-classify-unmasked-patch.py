#!/usr/bin/env python3
"""APPLIER-CLASSIFY-MASKED-A-REAL-BUG-1 applier (issue #1466, 2026-09-29).

TWO DEFECTS, ONE MASKED FAILURE
-------------------------------
1. scripts/apply-pending-patches.py classify() treated ANY occurrence of the
   bare substring "anchor" in a failing script's output as `stale-anchor`.

   Measured 2026-09-29T19:01:45Z from ci-status/applier-doctor.json (head
   c6b4594b): total=51 {already-applied:31, stale-anchor:16, landed:3, error:1}.
   The single genuine `error` bucket held run-gate-internal-patch.py, while
   version-anchor-normalize-patch.py landed in `stale-anchor` carrying the tail
   `NameError: name 'Path' is not defined` -- purely because its own FILENAME
   contains the word "anchor".

   Consequence: the applier written to fix version-anchor rot was reported AS
   that rot. It never ran, and its failure was invisible.

2. scripts/version-anchor-normalize-patch.py calls Path() in main() but imports
   only `os` and `sys`. It cannot execute at all. That is the crash in (1).

THE FIX
-------
1. classify() gives a real Python traceback precedence over the anchor-drift
   heuristic, and requires the drift SIGNATURE (`anchor occurrence != 1` or
   `fail-closed`) instead of the bare word "anchor".
2. Add `from pathlib import Path` to the normalize applier.

IDEMPOTENCY (SELF-IDEMPOTENT-1, fixed after landing)
----------------------------------------------------
The first version of this applier keyed idempotency on a single MARKER string
that is written only into TARGET_A. TARGET_B therefore had no marker, so on the
SECOND run its anchor was already consumed -> count=0 -> exit 1 forever. That is
exactly the permanent-false-failure class this applier exists to remove, so it
is fixed here: every edit carries its OWN `probe` string, and an edit is skipped
as already-applied when its probe is present even if the anchor is gone.

   probe for TARGET_A : APPLIER-CLASSIFY-UNMASKED-1   (the marker it writes)
   probe for TARGET_B : "from pathlib import Path"    (absent before, present after)

FAIL-CLOSED / IDEMPOTENT
------------------------
- probe present in target                -> already applied, skip (exit 0).
- anchor absent AND probe absent         -> exit 1, no write (cannot apply safely).
- any anchor whose occurrence count != 1 -> exit 1, no write.
- compile() parse-check on every target before any write.

ORDER-INDEPENDENT with VERSION-ANCHOR-DRIFT-1: that applier's ANCHOR_CLASSIFY
touches only the classify TAIL (`already applied` / `ran`), this one touches only
the classify HEAD (`rc != 0` branch). The two regions do not overlap, so either
may land first.
"""
import os
import sys
from pathlib import Path

MARKER = "APPLIER-CLASSIFY-UNMASKED-1"

TARGET_A = "scripts/apply-pending-patches.py"
TARGET_B = "scripts/version-anchor-normalize-patch.py"

ANCHOR_A = '''def classify(text: str, rc: int) -> str:
    low = text.lower()
    if rc != 0:
        # Fail-closed patchers deliberately exit non-zero on anchor drift.
        if "fail-closed" in low or "anchor" in low or "does not match" in low:
            return "stale-anchor"
        return "error"
'''

NEW_A = '''def classify(text: str, rc: int) -> str:
    low = text.lower()
    if rc != 0:
        # APPLIER-CLASSIFY-UNMASKED-1 (issue #1466, 2026-09-29).
        # The old predicate was a BARE `"anchor" in low`, so a genuine crash
        # whose *filename* contains "anchor" was filed as `stale-anchor`. The
        # applier written to fix version-anchor rot was therefore reported AS
        # that rot (NameError: name 'Path' is not defined) and never ran.
        #
        # A real Python traceback now takes precedence over the heuristic, and
        # the heuristic requires the drift SIGNATURE, not the bare word.
        if "traceback (most recent call last)" in low:
            return "error"
        if "fail-closed" in low or "anchor occurrence != 1" in low:
            return "stale-anchor"
        if "does not match" in low:
            return "stale-anchor"
        return "error"
'''

ANCHOR_B = '''import os
import sys

MARKER = "normalize_version_anchors"
'''

NEW_B = '''import os
import sys
from pathlib import Path

MARKER = "normalize_version_anchors"
'''

# (relative path, anchor, replacement, probe proving the edit is already in)
EDITS = (
    (TARGET_A, ANCHOR_A, NEW_A, "APPLIER-CLASSIFY-UNMASKED-1"),
    (TARGET_B, ANCHOR_B, NEW_B, "from pathlib import Path"),
)


def main() -> int:
    root = Path(os.environ.get("REPO_ROOT") or ".").resolve()
    plan = []

    for rel, anchor, new, probe in EDITS:
        p = root / rel
        if not p.exists():
            print(f"FAIL: missing {rel}")
            return 1
        text = p.read_text()

        # SELF-IDEMPOTENT-1: per-edit probe, so an edit that is already in is
        # skipped even though its anchor has been consumed.
        if probe in text:
            print(f"already applied: {rel} carries {probe!r}")
            continue

        count = text.count(anchor)
        if count != 1:
            print(f"FAIL (fail-closed): anchor occurrence != 1 in {rel}")
            print(f"  count={count}  {anchor.splitlines()[0][:70]}")
            print(f"  probe {probe!r} absent too - cannot apply safely")
            return 1
        plan.append((p, text.replace(anchor, new, 1), rel))

    if not plan:
        print(f"{MARKER}: nothing to do (all edits already applied)")
        return 0

    for _, new_text, rel in plan:
        try:
            compile(new_text, rel, "exec")
        except SyntaxError as exc:
            print(f"FAIL (post-write): {rel} does not compile: {exc}")
            return 1

    for p, new_text, rel in plan:
        p.write_text(new_text)
        print(f"OK patched {rel} ({len(new_text)} bytes)")

    print(f"{MARKER} applied to {len(plan)} file(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""CLASSIFY-FAILCLOSED-DEFAULT-1 applier (issue #1466 residual, 2026-09-29).

RESIDUAL DEFECT
---------------
scripts/apply-pending-patches.py::classify() is the CI classifier that decides
whether a failing applier is BENIGN (`stale-anchor` = expected fail-closed anchor
drift) or REAL (`error` = crash / application failure).

APPLIER-CLASSIFY-UNMASKED-1 (#1466) removed the bare `"anchor" in low` predicate
and gave a real Python traceback precedence over the heuristic. ONE over-broad
branch survived that fix:

    if "does not match" in low:
        return "stale-anchor"

That predicate matches ANY message containing the phrase, not just anchor drift,
so a genuine application failure is still filed as the benign class. Measured
2026-09-29 against the classifier's own probe table:

    input : "FAIL: pattern does not match expected output"   rc 1
    want  : error
    got   : stale-anchor

That is the #1466 failure mode NARROWED, not eliminated. The recorded criterion
is "stale-anchor only for the drift signature".

THE FIX
-------
Require the drift SIGNATURE to co-occur on one line: the words `anchor` and
`does not match` within 60 characters of each other.

    r"anchor.{0,60}does not match|does not match.{0,60}anchor"

`.` does not match a newline without re.DOTALL, so the window cannot cross a
line boundary. Legitimate fail-closed messages ("FAIL: anchor does not match in
target") keep classifying as `stale-anchor`; everything else falls through to
`error`.

No new import is required: scripts/apply-pending-patches.py already imports `re`.

VERIFIED BEFORE SHIPPING (exec_python, real Python 3.12)
  8-case probe table -> OLD 1/8 wrong, NEW 0/8 wrong.
  Legit anchor-drift coverage preserved; the single OLD failure is the case above.

FAIL-CLOSED / IDEMPOTENT
  - probe present in target            -> already applied, exit 0
  - anchor absent AND probe absent     -> exit 1, no write
  - anchor occurrence count != 1       -> exit 1, no write
  - compile() parse-check before write
"""
import os
import sys
from pathlib import Path

MARKER = "CLASSIFY-FAILCLOSED-DEFAULT-1"

TARGET = "scripts/apply-pending-patches.py"

ANCHOR = '''        if "does not match" in low:
            return "stale-anchor"
'''

NEW = '''        # CLASSIFY-FAILCLOSED-DEFAULT-1 (issue #1466 residual, 2026-09-29).
        # The bare `"does not match" in low` predicate classified ANY message
        # carrying that phrase as benign anchor drift, so a genuine application
        # failure was still masked as `stale-anchor` - the #1466 class narrowed,
        # not removed. The drift SIGNATURE must now co-occur on one line:
        # `anchor` and `does not match` within 60 characters of each other.
        # `.` excludes newlines, so the window cannot span lines.
        if re.search(r"anchor.{0,60}does not match|does not match.{0,60}anchor", low):
            return "stale-anchor"
'''

# (relative path, anchor, replacement, probe proving the edit is already in)
EDITS = (
    (TARGET, ANCHOR, NEW, MARKER),
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

        # SELF-IDEMPOTENT-1: per-edit probe, so an edit already in is skipped
        # even though its anchor has been consumed.
        if probe in text:
            print(f"already applied: {rel} carries {probe!r}")
            continue

        count = text.count(anchor)
        if count != 1:
            print(f"FAIL (fail-closed): anchor occurrence != 1 in {rel}")
            print(f"  count={count}")
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

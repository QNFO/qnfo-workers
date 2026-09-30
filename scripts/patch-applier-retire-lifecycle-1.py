#!/usr/bin/env python3
"""APPLIER-RETIRE-2 + APPLIER-CLASSIFY-SIGNATURE-2 (2026-10-01, issue #1673).

WHY THIS EXISTS
---------------
`apply-pending-patches.py` classifies every applier, but nothing ever RETIRED
one. Measured on ci-status/applier-doctor.json at 2026-09-30T20:44:07Z:
    total=105  {already-applied: 77, error: 8, stale-anchor: 11, undetermined: 9}
and on ci-status/apply-pending-report.json at 2026-09-30T20:43:24Z:
    total=104  {already-applied: 77, stale-anchor: 18, error: 9}
with `superseded: []` in BOTH -- the supersession list is structurally unable to
populate, so the same dead appliers are re-filed on every run forever.

TWO DEFECTS, both fixed here.

DEFECT 1 -- THE RETIRE LIFECYCLE NEVER LANDED
  The lifecycle was written on 2026-09-29 by
  scripts/applier-classify-signature-and-retire-patch.py, which is a ONE-SHOT
  PRE-PATCH-STATE patcher: it pins the exact pre-2026-09-30 text of classify().
  That function was subsequently rewritten in place (APPLIER-CLASSIFY-UNMASKED-1
  + CLASSIFY-FAILCLOSED-DEFAULT-1), so the applier's anchor now matches 0 times
  and it exits 3 on every run. Verified on the live report:
      FAIL-CLOSED: anchor 'classify' occurs 0 times (expected exactly 1)
  The repair tool for applier rot is itself rotten -- and because it carries the
  RETIRED_APPLIERS list, the whole retire mechanism was lost with it. Read of
  scripts/apply-pending-patches.py on main confirms: no RETIRED_APPLIERS, no
  retired_seen, and the report JSON has no "retired" key.

DEFECT 2 -- ANCHOR DRIFT MASQUERADES AS A CRASH (mirror of #1466)
  classify()'s fail-closed signature list is too narrow. Five appliers emit an
  explicit fail-closed ANCHOR message that matches no signature and is filed as
  `error`, which is the exact inverse of the #1466 defect that predicate was
  written to fix:
      applier-doctor-outcome-aware-patch.py  FAIL(3): anchor count != 1 -> {...}
      d1guard-literal-aware-patch.py         ABORT: pre-patch VERSION anchor occurs 0 times
      driftguard-server-version-patch.py     FAIL: anchor 'CONST' occurs 0 times
      raw-put-schedules-patch.py             FAIL(3): anchor count != 1 -> {'A_TAIL': 0}
      run-gate-internal-patch.py             FAIL: pre-patch VERSION not found
  Drift is now recognised, but ONLY when the drift signature co-occurs with
  `anchor` or a VERSION literal, so a genuine application failure is not absorbed.

DESIGN DECISION -- RUNTIME-VERIFIED RETIREMENT, NOT A STATIC LIST
  A static retire list is unsafe in principle: the tree moves after the list is
  written, so a stale entry can silently drop a fix that was never applied. Each
  entry therefore carries `evidence = (file, token)` and an applier is skipped
  ONLY IF that token is found in that file AT RUN TIME. If the evidence is gone
  the applier runs normally. Retirement is fail-closed; execution is fail-open.
  Every token below was verified present on main at 2026-10-01 (head afb39e7).

  Deliberately NOT retired (evidence insufficient -- a generic hit proves
  nothing, and retiring on one would drop a real fix):
    * applier-classify-signature-and-retire-patch.py -- only its DEFECT-1 half is
      superseded; its DEFECT-2 half (this very mechanism) was never applied.
    * applier-doctor-outcome-all-clean-patch.py -- declares OUTCOME-ALL-2 but the
      target only carries OUTCOME-ALL-1, i.e. v2 is genuinely unlanded.
    * run-gate-internal-patch.py -- 1 of its 3 declared markers is present.
    * the remaining 8 stale/error appliers -- no superseding marker found.

FAIL-CLOSED / IDEMPOTENT
  Every anchor must occur exactly once or exit 3 and write nothing. Re-running on
  an already-patched file is a no-op (marker present -> exit 0).
"""
import os
import sys

ROOT = os.environ.get("REPO_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "apply-pending-patches.py")
MARKER = "APPLIER-RETIRE-2"

ANCHOR_CLASSIFY = '''        if "fail-closed" in low or "anchor occurrence != 1" in low:
            return "stale-anchor"
'''

NEW_CLASSIFY = '''        if "fail-closed" in low or "anchor occurrence != 1" in low:
            return "stale-anchor"
        # APPLIER-CLASSIFY-SIGNATURE-2 (issue #1673, 2026-10-01).
        # The v1 signature list above was too narrow: five appliers emitted an
        # explicit fail-closed ANCHOR message that matched no signature and were
        # therefore filed as `error`, so anchor drift masqueraded as a crash --
        # the mirror image of the #1466 defect this predicate replaced. The drift
        # signature must now co-occur with `anchor` or a VERSION literal, so a
        # genuine application failure cannot be absorbed by this branch.
        if ("anchor" in low or "version" in low) and re.search(
            r"(count != 1|matched 0 times|occurs 0 times|occurrences = 0|"
            r"expected exactly 1|anchor not found|pre-patch version|"
            r"anchor drift|anchor-invalid)",
            low,
        ):
            return "stale-anchor"
'''

ANCHOR_RETIRE = '''def main() -> int:
    root = repo_root()
    scripts_dir = root / "scripts"
'''

NEW_RETIRE = '''# APPLIER-RETIRE-2 (issue #1673, 2026-10-01): the retire lifecycle.
#
# WHY RUNTIME-VERIFIED AND NOT A STATIC LIST
#   The first attempt at this list (scripts/applier-classify-signature-and-retire-patch.py,
#   2026-09-29) never landed: it pins the pre-2026-09-30 classify() text, so it
#   exits 3 on every run, and the list was lost with it. A static list is also
#   unsafe in principle -- the tree moves after the list is written, so a stale
#   entry can silently drop a fix that was never applied. Each entry therefore
#   carries `evidence = (file, token)` and the applier is skipped ONLY IF that
#   token is found in that file AT RUN TIME. If the evidence is gone, the applier
#   runs normally. Retirement is fail-closed; execution is fail-open. A generic
#   token (a table name, whitespace) is never accepted as evidence.
RETIRED_APPLIERS = [
    {
        "script": "applier-doctor-classify-patch.py",
        "evidence": ("scripts/applier-doctor.py", "APPLIER-DOCTOR-2"),
        "reason": (
            "superseded: the doctor's classify outcome landed as APPLIER-DOCTOR-2 "
            "(with APPLIER-DOCTOR-FALSE-POSITIVE-CLASS-1); the rewrite RENAMED the "
            "marker the applier pins (APPLIER-DOCTOR-CLASSIFY-2), which is why "
            "supersession was structurally undetectable"
        ),
    },
    {
        "script": "applier-doctor-outcome-aware-patch.py",
        "evidence": ("scripts/applier-doctor.py", "OUTCOME-AWARE-2"),
        "reason": (
            "superseded: the outcome-aware doctor landed as OUTCOME-AWARE-2; the "
            "applier pins APPLIER-DOCTOR-OUTCOME-AWARE-1, the pre-rename marker"
        ),
    },
    {
        "script": "fleet-autoaudit-v4-envelope-patch.py",
        "evidence": ("scripts/fleet-autoaudit.py", "REST-ENVELOPE-OK-1"),
        "reason": (
            "superseded: two of its three declared outcome markers "
            "(REST-ENVELOPE-OK-1, AUDIT-STALE-ROWS-1) are present in the target; "
            "it now aborts with 'anchor drift ... expected (1,1,1,1), got (1,0,0,0)'"
        ),
    },
]


def _retire_evidence_ok(root: Path, entry: dict) -> bool:
    """APPLIER-RETIRE-2: skip an applier ONLY when its superseding evidence is
    present in the tree RIGHT NOW. Absent evidence -> do not retire (run it)."""
    try:
        rel, token = entry["evidence"]
    except Exception:  # noqa: BLE001
        return False
    if not rel or not token or len(str(token).strip()) < 8:
        return False
    fp = root / rel
    if not fp.is_file():
        return False
    try:
        return str(token) in fp.read_text(encoding="utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return False


def main() -> int:
    root = repo_root()
    scripts_dir = root / "scripts"
'''

ANCHOR_INIT = '''    print(f"{MARKER} scanning {len(pats)} patch script(s) under {scripts_dir}")
    results = []
    landed = []
    reverted_any = []
'''

NEW_INIT = '''    results = []
    landed = []
    reverted_any = []
    retired_seen = []

    # APPLIER-RETIRE-2: retire superseded one-shot appliers, but only on
    # evidence present in the tree at this moment (see RETIRED_APPLIERS).
    # Retirement is fail-closed (needs evidence); execution is fail-open.
    for _entry in RETIRED_APPLIERS:
        if _entry["script"] in {p.name for p in pats} and _retire_evidence_ok(root, _entry):
            retired_seen.append(_entry["script"])
    if retired_seen:
        pats = [p for p in pats if p.name not in set(retired_seen)]
        print(f"{MARKER} retired {len(retired_seen)} applier(s) whose outcome is already in the tree")
        for _n in retired_seen:
            print(f"  RETIRED {_n}")
    else:
        print(f"{MARKER} retired 0 applier(s) - no supersession evidence found")

    print(f"{MARKER} scanning {len(pats)} patch script(s) under {scripts_dir}")
'''

ANCHOR_JSON = '''                "landed": landed,
                "reverted": reverted_any,
'''

NEW_JSON = '''                "landed": landed,
                "retired": retired_seen,
                "reverted": reverted_any,
'''

ANCHOR_SUMMARY = '''    if landed:
        print("LANDED(" + str(len(landed)) + "): " + ", ".join(landed))
'''

NEW_SUMMARY = '''    if retired_seen:
        # Visibility is the fix for the silent half of APPLIER-ROT-1: a retired
        # applier must never look like an applier that simply did not run.
        print("RETIRED(" + str(len(retired_seen)) + "): " + ", ".join(retired_seen))
    if landed:
        print("LANDED(" + str(len(landed)) + "): " + ", ".join(landed))
'''

EDITS = (
    ("classify-signature-2", ANCHOR_CLASSIFY, NEW_CLASSIFY),
    ("retire-list-and-helper", ANCHOR_RETIRE, NEW_RETIRE),
    ("init-and-retire-filter", ANCHOR_INIT, NEW_INIT),
    ("json-retired-key", ANCHOR_JSON, NEW_JSON),
    ("summary-retired-line", ANCHOR_SUMMARY, NEW_SUMMARY),
)

PROBES = (
    "APPLIER-RETIRE-2",
    "RETIRED_APPLIERS",
    "_retire_evidence_ok",
    "retired_seen",
    '"retired": retired_seen',
    "RETIRED(",
    "APPLIER-CLASSIFY-SIGNATURE-2",
)


def main() -> int:
    if not os.path.isfile(TARGET):
        print("FAIL-CLOSED: missing " + TARGET)
        return 3
    with open(TARGET, encoding="utf-8") as fh:
        text = fh.read()

    if MARKER in text:
        print("already applied: scripts/apply-pending-patches.py carries " + MARKER)
        return 0

    for name, old, new in EDITS:
        n = text.count(old)
        if n != 1:
            print("FAIL-CLOSED: anchor '%s' occurs %d times (expected exactly 1) - nothing written"
                  % (name, n))
            return 3
        text = text.replace(old, new, 1)

    for probe in PROBES:
        if probe not in text:
            print("FAIL-CLOSED (post-write): missing %r" % probe)
            return 3

    try:
        compile(text, TARGET, "exec")
    except SyntaxError as exc:
        print("FAIL-CLOSED (post-write): does not compile: %s" % exc)
        return 3

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("OK patched scripts/apply-pending-patches.py (%d bytes)" % len(text))
    print("APPLIER-RETIRE-2 + APPLIER-CLASSIFY-SIGNATURE-2 applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())

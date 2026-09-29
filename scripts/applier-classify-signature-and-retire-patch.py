#!/usr/bin/env python3
"""APPLIER-CLASSIFY-SIGNATURE-1 + APPLIER-RETIRE-1 (2026-09-29).

THREE DEFECTS, all measured from ci-status/applier-doctor.json at
2026-09-29T19:01:45Z (head c6b4594b), which reported:
    total=51  {already-applied: 31, stale-anchor: 16, landed: 3, error: 1}

DEFECT 1 -- MISCLASSIFICATION HIDES REAL ERRORS (the load-bearing one)
  scripts/apply-pending-patches.py::classify() decided "stale-anchor" with
      if "fail-closed" in low or "anchor" in low or "does not match" in low
  The middle term is a BARE SUBSTRING. A Python traceback prints the failing
  file's path, and several appliers have "anchor" in their FILENAME, so

      scripts/version-anchor-normalize-patch.py
      NameError: name 'Path' is not defined

  was filed as ANCHOR ROT. It is not rot: it is a one-line ImportError in the
  applier that was written to FIX version-anchor rot. The substring test
  therefore reported the repair tool as the thing it repairs, and the tool
  never ran. Classification now requires a fail-closed SIGNATURE.

DEFECT 2 -- NO RETIREMENT LIFECYCLE (the recurring ticket source, issue #1444)
  These appliers are ONE-SHOT PRE-PATCH-STATE patchers: each pins the target's
  exact pre-patch text. Once the target advances past that state the anchor can
  never match again, so the applier exits 3 on every run forever -- even when
  its OUTCOME is already present in the tree (i.e. it was superseded, not
  rotted). Nothing retired them, so applier-doctor re-filed the same rot on
  every run. RETIRED_APPLIERS below is the missing lifecycle: an explicit,
  evidence-carrying list of appliers whose outcome is PROVEN present.

  Every entry's evidence is a distinctive marker token that the applier itself
  writes, found in its resolved target on main. Entries whose only "evidence"
  was a generic string (a table name such as `issue_ledger`, or whitespace) are
  deliberately NOT retired -- a generic hit proves nothing, and retiring on one
  would silently drop a real fix.

DEFECT 3 -- DEFERRED, NOT FIXED HERE (filed as a decision, not automated)
  version-anchor-normalize-patch.py would rewrite stale VERSION anchors across
  ~8 appliers and let them run in the SAME CI pass. That is a fleet-wide
  behavioural change with a blast radius this applier cannot verify, so it is
  RETIRED rather than activated. Activation is a deliberate decision; the
  ImportError is recorded in the retirement reason.

FAIL-CLOSED / IDEMPOTENT
  Every anchor must occur exactly once, else exit 3 and write nothing. Re-running
  on an already-patched file is a no-op (marker present -> exit 0).
"""
import os
import sys

ROOT = os.environ.get("REPO_ROOT") or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "apply-pending-patches.py")
MARKER = "APPLIER-CLASSIFY-SIGNATURE-1"

ANCHOR_CLASSIFY = '''def classify(text: str, rc: int) -> str:
    low = text.lower()
    if rc != 0:
        # Fail-closed patchers deliberately exit non-zero on anchor drift.
        if "fail-closed" in low or "anchor" in low or "does not match" in low:
            return "stale-anchor"
        return "error"
'''

NEW_CLASSIFY = '''FAILCLOSED_SIGNATURES = (
    "fail-closed",
    "does not match",
    "anchor count != 1",
    "anchor matched 0 times",
    "matched 0 times",
    "expected exactly 1",
    "occurrence != 1",
    "occurs 0 times",
    "abort: pre-patch version anchor",
    "pre-patch version",
    "anchor drift",
)


def classify(text: str, rc: int) -> str:
    """APPLIER-CLASSIFY-SIGNATURE-1 (2026-09-29).

    The previous predicate was `"anchor" in low`, which labelled ANY non-zero
    exit whose output merely CONTAINED the word "anchor" as `stale-anchor`. A
    traceback names the failing file, and appliers such as
    scripts/version-anchor-normalize-patch.py carry "anchor" in their FILENAME,
    so a one-line ImportError was reported as anchor rot for hours and the
    repair tool never ran. Classification now requires a fail-closed SIGNATURE,
    never a bare word.
    """
    low = text.lower()
    if rc != 0:
        if any(sig in low for sig in FAILCLOSED_SIGNATURES):
            return "stale-anchor"
        return "error"
'''

ANCHOR_MAIN = '''def main() -> int:
    root = repo_root()
'''

NEW_MAIN = '''# APPLIER-RETIRE-1 (issue #1444): one-shot pre-patch-state patchers whose OUTCOME
# is already present in the tree. They can never match again, so they are skipped
# instead of being re-filed as rot. `evidence` is a distinctive marker token the
# applier itself writes, observed in the named target on main at 2026-09-29.
# NOT retired, deliberately: entries whose only signal was generic (a table name
# such as `issue_ledger`) or whitespace -- a generic hit proves nothing.
RETIRED_APPLIERS = [
    {
        "script": "attachguard-xml-form-patch.py",
        "evidence": "qnfo-ops/worker.js :: attachmentGuardXml",
        "reason": "outcome present; pre-patch VERSION 2.37.12-fm-stream-reasoning no longer exists",
    },
    {
        "script": "fleet-autoaudit-v4-envelope-patch.py",
        "evidence": "scripts/fleet-autoaudit.py :: REST-ENVELOPE-OK-1, AUDIT-STALE-ROWS-1",
        "reason": "outcome present; anchor drift on scripts/fleet-autoaudit.py",
    },
    {
        "script": "raw-put-schedules-patch.py",
        "evidence": "scripts/raw_put.py :: AUTODEPLOY-SCHEDULES-NOT-APPLIED-1",
        "reason": "outcome present; A_TAIL anchor consumed by a later raw_put edit",
    },
    {
        "script": "selfheal-volfloor-patch.py",
        "evidence": "qnfo-ops/worker.js :: SELFHEAL-RATE-NOT-ABSENCE-1",
        "reason": "outcome present; superseded by the rate-aware self-heal rewrite",
    },
    {
        "script": "version-anchor-normalize-patch.py",
        "evidence": "none - retired as a DECISION, not as supersession",
        "reason": (
            "DEFECT-3: blocked by its own ImportError (`Path` is never imported) "
            "and, once fixed, it would rewrite stale VERSION anchors across ~8 "
            "appliers and let them run in the same CI pass - a fleet-wide "
            "behavioural change with an unverified blast radius. Activation is a "
            "deliberate decision, not an automatic one."
        ),
    },
]


def main() -> int:
    root = repo_root()
'''

ANCHOR_GLOB = '''    pats = sorted(
        p
        for p in scripts_dir.glob("*.py")
        if "patch" in p.name and p.name != Path(__file__).name
    )
'''

NEW_GLOB = '''    pats = sorted(
        p
        for p in scripts_dir.glob("*.py")
        if "patch" in p.name and p.name != Path(__file__).name
    )
    retired_names = {r["script"] for r in RETIRED_APPLIERS}
    retired_seen = sorted(p.name for p in pats if p.name in retired_names)
    pats = [p for p in pats if p.name not in retired_names]
    if retired_seen:
        print(f"{MARKER} retired {len(retired_seen)} applier(s) whose outcome is already in the tree")
        for _n in retired_seen:
            print(f"  RETIRED {_n}")
'''

ANCHOR_JSON = '''                "landed": landed,
                "results": results,
'''

NEW_JSON = '''                "landed": landed,
                "retired": retired_seen,
                "results": results,
'''

EDITS = (
    ("classify", ANCHOR_CLASSIFY, NEW_CLASSIFY),
    ("retire-list", ANCHOR_MAIN, NEW_MAIN),
    ("glob", ANCHOR_GLOB, NEW_GLOB),
    ("json", ANCHOR_JSON, NEW_JSON),
)

PROBES = (
    "APPLIER-CLASSIFY-SIGNATURE-1",
    "FAILCLOSED_SIGNATURES",
    "RETIRED_APPLIERS",
    "retired_seen",
    '"retired": retired_seen',
    'if "already applied" in low and "patched" not in low:',
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

    # The version-anchor-normalize applier anchors on this exact block; it must
    # survive this edit byte-for-byte or that applier would newly go stale.
    if text.count('    if "already applied" in low and "patched" not in low:') != 1:
        print("FAIL-CLOSED (post-write): ANCHOR_CLASSIFY tail no longer unique")
        return 3

    try:
        compile(text, TARGET, "exec")
    except SyntaxError as exc:
        print("FAIL-CLOSED (post-write): does not compile: %s" % exc)
        return 3

    with open(TARGET, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("OK patched scripts/apply-pending-patches.py (%d bytes)" % len(text))
    print("APPLIER-CLASSIFY-SIGNATURE-1 + APPLIER-RETIRE-1 applied")
    return 0


if __name__ == "__main__":
    sys.exit(main())

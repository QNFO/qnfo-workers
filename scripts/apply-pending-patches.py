#!/usr/bin/env python3
"""APPLY-PENDING-1 -- land every patch script whose anchors still match.

WHY THIS EXISTS
---------------
Two defects were measured on 2026-09-29 by scripts/applier-doctor.py over the
31 scripts/*patch*.py in this repo:

  * #1395 CI-APPLIER-NEVER-APPLIES-1 -- patch scripts sat in scripts/ for days
    with a matching applier workflow yet were never applied to main. The doctor
    classifies these as `applied-now` (the patch applies cleanly to the current
    tree, therefore it was never landed).
  * #1381 FAILURE-ARTIFACT-LOSS-1 -- appliers that only commit on success leave
    no trace when they fail, so a silently-dead applier is indistinguishable
    from one that never ran.
  * PARTIAL-APPLY-1 (new, measured 2026-09-29) -- a fail-closed patcher that
    edits several files and then aborts on a later anchor leaves the tree
    half-patched. driftguard-label-and-lifecycle-sot-patch.py rewrote
    scripts/deploy-drift-guard.py and reported raw_put.py already-applied, then
    FAIL-CLOSED on qnfo-lifecycle/worker.js -- two files mutated, one not.

WHAT THIS DOES
--------------
Runs every scripts/*patch*.py inside a transactional envelope:

  snapshot  -> git status --porcelain
  run       -> subprocess with REPO_ROOT + a hard per-script timeout
  rc != 0   -> git checkout -- .  (revert THAT script's partial writes)
  rc == 0 and tree unchanged -> already-applied
  rc == 0 and tree changed   -> landed

It never commits and never deploys; the calling workflow does that, so this
script stays safe to run anywhere. It always writes
ci-status/applier-doctor.json, so a run that lands nothing is still visible
through the GitHub contents API without the Actions API.

Exit codes
  0  ran to completion (however many scripts landed)
  3  no repo root, or no patch scripts found (nothing was classified)
"""

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

MARKER = "APPLY-PENDING-1"


def repo_root() -> Path:
    for cand in (os.environ.get("REPO_ROOT"), os.environ.get("GITHUB_WORKSPACE"), "."):
        if not cand:
            continue
        p = Path(cand).resolve()
        if (p / "scripts").is_dir():
            return p
    return Path(".").resolve()


def git(root: Path, *args: str) -> str:
    try:
        r = subprocess.run(
            ["git", *args], cwd=str(root), capture_output=True, text=True, timeout=60
        )
        return r.stdout or ""
    except Exception as exc:  # noqa: BLE001
        return f"<git error: {exc}>"


def snapshot(root: Path) -> str:
    return git(root, "status", "--porcelain")


def revert(root: Path) -> None:
    """Undo tracked-file edits made by the script that just failed."""
    git(root, "checkout", "--", ".")


def classify(text: str, rc: int) -> str:
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
    if "already applied" in low and "patched" not in low:
        return "already-applied"
    return "ran"


def main() -> int:
    root = repo_root()
    scripts_dir = root / "scripts"
    if not scripts_dir.is_dir():
        print(f"{MARKER}: no scripts/ under {root}")
        return 3

    timeout = int(os.environ.get("APPLIER_DOCTOR_TIMEOUT", "60") or "60")
    pats = sorted(
        p
        for p in scripts_dir.glob("*.py")
        if "patch" in p.name and p.name != Path(__file__).name
    )
    if not pats:
        print(f"{MARKER}: no patch scripts found under {scripts_dir}")
        return 3

    print(f"{MARKER} scanning {len(pats)} patch script(s) under {scripts_dir}")
    results = []
    landed = []

    for path in pats:
        before = snapshot(root)
        started = time.time()
        try:
            proc = subprocess.run(
                [sys.executable, str(path.relative_to(root))],
                cwd=str(root),
                capture_output=True,
                text=True,
                timeout=timeout,
                env={**os.environ, "REPO_ROOT": str(root)},
            )
            rc, out = proc.returncode, (proc.stdout or "") + (proc.stderr or "")
        except subprocess.TimeoutExpired:
            rc, out = 124, f"TIMEOUT after {timeout}s"
        except Exception as exc:  # noqa: BLE001
            rc, out = 1, f"EXEC-ERROR {exc}"

        after = snapshot(root)
        changed = before != after
        verdict = classify(out, rc)

        if rc != 0 and changed:
            # PARTIAL-APPLY-1: do not let a failed patcher leak half a patch.
            revert(root)
            verdict = "stale-anchor" if verdict == "stale-anchor" else "error-reverted"
        elif rc == 0 and not changed:
            verdict = "already-applied"
        elif rc == 0 and changed:
            verdict = "landed"
            landed.append(path.name)

        results.append(
            {
                "script": path.name,
                "rc": rc,
                "verdict": verdict,
                "changed": changed,
                "seconds": round(time.time() - started, 2),
                "tail": out.strip().splitlines()[-1][:200] if out.strip() else "",
            }
        )
        print(f"  {path.name:<52} rc={rc} {verdict}")

    summary = {}
    for r in results:
        summary[r["verdict"]] = summary.get(r["verdict"], 0) + 1

    print(f"SUMMARY total={len(results)} {summary}")
    if landed:
        print("LANDED(" + str(len(landed)) + "): " + ", ".join(landed))
    else:
        print("LANDED(0): nothing to apply - main is current")

    out_dir = root / "ci-status"
    out_dir.mkdir(exist_ok=True)
    (out_dir / "applier-doctor.json").write_text(
        json.dumps(
            {
                "workflow": "apply-pending-patches",
                "marker": MARKER,
                "head": git(root, "rev-parse", "HEAD").strip(),
                "total": len(results),
                "summary": summary,
                "landed": landed,
                "results": results,
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            indent=2,
        )
        + "\n"
    )
    print(f"wrote ci-status/applier-doctor.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())

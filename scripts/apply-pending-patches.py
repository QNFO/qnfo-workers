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
  * REVERT-COLLATERAL-1 (new, measured 2026-09-29) -- the envelope's own revert
    ran `git checkout -- .`, which reverts EVERY tracked file in the worktree.
    A single late fail-closed patcher therefore silently discarded every patch
    that had already landed earlier in the SAME run, while this script still
    recorded those earlier scripts as `landed`. That is the exact mechanism by
    which CI-APPLIER-NEVER-APPLIES-1 keeps recurring after being "fixed": the
    doctor sees a matching applier, the run reports success, and the work is
    gone. Revert is now path-scoped (see revert_paths).

WHAT THIS DOES
--------------
Runs every scripts/*patch*.py inside a transactional envelope:

  snapshot  -> git status --porcelain + per-path content hash
  run       -> subprocess with REPO_ROOT + a hard per-script timeout
  rc != 0   -> revert ONLY the paths this script changed
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

import hashlib
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


def _porcelain_paths(root: Path) -> dict:
    """Map path -> porcelain status code for every dirty path."""
    out = {}
    for line in git(root, "status", "--porcelain").splitlines():
        if len(line) < 4:
            continue
        code = line[:2].strip()
        p = line[3:].strip()
        if " -> " in p:  # rename/copy
            p = p.split(" -> ")[-1].strip()
        p = p.strip('"')
        if p:
            out[p] = code
    return out


def dirty_hashes(root: Path) -> dict:
    """path -> "<status-code>:<sha1|gone|err>" for every dirty path.

    REVERT-COLLATERAL-1: a porcelain-string comparison cannot tell whether a
    path that was ALREADY dirty before the script ran was changed again by that
    script. Hashing the dirty paths makes "did THIS script touch this file"
    decidable in that case too.
    """
    out = {}
    for p, code in _porcelain_paths(root).items():
        try:
            fp = root / p
            digest = hashlib.sha1(fp.read_bytes()).hexdigest() if fp.is_file() else "gone"
        except Exception:  # noqa: BLE001
            digest = "err"
        out[p] = f"{code}:{digest}"
    return out


def revert_paths(root: Path, codes: dict) -> list:
    """Undo ONLY the paths the failing script changed.

    REVERT-COLLATERAL-1 (2026-09-29): this replaced `git checkout -- .`, which
    reverted every tracked file and silently discarded patches that had already
    landed earlier in the same run.
    """
    untracked = sorted(p for p, c in codes.items() if c.strip() == "??")
    tracked = sorted(p for p, c in codes.items() if c.strip() != "??")
    for i in range(0, len(tracked), 100):
        chunk = tracked[i : i + 100]
        git(root, "checkout", "--", *chunk)
    for p in untracked:
        try:
            (root / p).unlink()
        except Exception:  # noqa: BLE001
            pass
    return sorted(codes)


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
        # CLASSIFY-FAILCLOSED-DEFAULT-1 (issue #1466 residual, 2026-09-29).
        # The bare `"does not match" in low` predicate classified ANY message
        # carrying that phrase as benign anchor drift, so a genuine application
        # failure was still masked as `stale-anchor` - the #1466 class narrowed,
        # not removed. The drift SIGNATURE must now co-occur on one line:
        # `anchor` and `does not match` within 60 characters of each other.
        # `.` excludes newlines, so the window cannot span lines.
        if re.search(r"anchor.{0,60}does not match|does not match.{0,60}anchor", low):
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
    reverted_any = []

    for path in pats:
        before = snapshot(root)
        before_h = dirty_hashes(root)
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
        after_h = dirty_hashes(root)
        changed = before != after
        # REVERT-COLLATERAL-1: the paths THIS script changed, not the whole tree.
        delta = {
            p: v.split(":", 1)[0]
            for p, v in after_h.items()
            if before_h.get(p) != v
        }
        verdict = classify(out, rc)
        reverted = []

        if rc != 0 and changed:
            # PARTIAL-APPLY-1: do not let a failed patcher leak half a patch.
            # REVERT-COLLATERAL-1: and do not let it leak into other patches.
            if not delta:
                # Defensive: a dirty-tree comparison said "changed" but hashing
                # could not name the paths. Fall back to the full dirty set so a
                # failed patcher can still never leave a half-write behind.
                delta = _porcelain_paths(root)
                print(f"  WARN {path.name}: delta unresolved, reverting {len(delta)} dirty path(s)")
            reverted = revert_paths(root, delta)
            reverted_any.append({"script": path.name, "paths": reverted})
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
                "reverted": reverted,
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
    if reverted_any:
        # Visibility is the fix for the silent half of REVERT-COLLATERAL-1.
        names = ", ".join(r["script"] for r in reverted_any)
        print(
            "::warning::REVERT-COLLATERAL-1 reverted path-scoped writes from: " + names
        )

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
                "reverted": reverted_any,
                "results": results,
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
            indent=2,
        )
        + "\n"
    )
    print("wrote ci-status/applier-doctor.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())

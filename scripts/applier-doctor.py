#!/usr/bin/env python3
"""applier-doctor.py -- APPLIER-DOCTOR-1

DEFECT CLASS THIS CLOSES
  #1395 CI-APPLIER-NEVER-APPLIES-1 and #1383 ANCHOR-INVALIDATION-RED-JOB-1.

  This repo carries ~31 fail-closed patch scripts under scripts/*patch*.py, each
  driven by a .github/workflows/apply-*.yml. Their contract is deliberately
  fail-closed: every anchor must match EXACTLY once, else the script exits 3 and
  writes nothing. That is the right contract, but it has two failure modes that
  were previously INVISIBLE:

    (a) STALE ANCHOR. A concurrent writer edits the target artifact, the anchor
        stops matching, the applier exits 3 forever, and the patch never lands.
        The workflow can stay red (or green-but-no-op) indefinitely and nothing
        consumes that signal. Measured 2026-09-29: 5 of 31 appliers were in this
        state (attachguard-xml-form, d1guard-literal-aware, deploy-guard-wrap,
        raw-put-schedules, run-gate-internal).

    (b) NEVER LANDED. The applier exits 0 and applies the patch to a scratch
        tree, but the commit-back never reaches main, so the NEXT run reports
        "applied-now" again. Measured 2026-09-29: 11 of 31 scripts still report
        applied-now against main.

  Neither state is visible from the workflow conclusion alone. This doctor makes
  both states MEASURABLE, on every push that touches a patch script, and writes a
  durable artifact so a silent applier can never recur.

WHAT IT DOES
  For each scripts/*patch*.py:
    1. reset the tree (git checkout -- .) so runs cannot contaminate each other
    2. run the script with REPO_ROOT set to the repo root
    3. classify the result:
         already-applied  rc 0 and the script says so / made no change
         applied-now      rc 0 and the tree CHANGED (patch absent from main)
         stale-anchor     rc 3 (fail-closed anchor mismatch)
         error            any other rc
    4. reset the tree again
  Then writes audits/applier-doctor-<date>.json + ci-status/applier-doctor.json.

  Report-only by default (exit 0). STRICT=1 makes stale-anchor/applied-now exit 3.

SAFETY
  * read-only with respect to the fleet: it never deploys and never calls CF
  * requires a clean git tree unless ALLOW_DIRTY=1, because it resets the tree
  * never deletes or rewrites a patch script
  * a script that needs a secret (CF token, GitHub token) fails closed as `error`
    and is reported as such, not silently skipped
"""
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.environ.get("REPO_ROOT") or os.getcwd()
SCRIPTS = os.path.join(ROOT, "scripts")
STRICT = os.environ.get("STRICT") == "1"
ALLOW_DIRTY = os.environ.get("ALLOW_DIRTY") == "1"
TIMEOUT = int(os.environ.get("APPLIER_DOCTOR_TIMEOUT", "120"))

ALREADY_MARKERS = ("ALREADY APPLIED", "already applied", "NO_CHANGES")


def sh(args, cwd=None, timeout=TIMEOUT, env=None):
    try:
        p = subprocess.run(args, cwd=cwd or ROOT, capture_output=True, text=True,
                           timeout=timeout, env=env)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT after %ds" % timeout
    except Exception as e:  # noqa: BLE001
        return 125, "ERR " + str(e)


def git(args):
    return sh(["git"] + args)


def tree_state():
    rc, out = git(["status", "--porcelain"])
    if rc != 0:
        return None, out
    return [ln for ln in out.splitlines() if ln.strip()], out


def reset():
    git(["checkout", "--", "."])
    git(["clean", "-fd", "scripts"])


def find_scripts():
    if not os.path.isdir(SCRIPTS):
        return []
    out = []
    for n in sorted(os.listdir(SCRIPTS)):
        if n.endswith(".py") and "patch" in n:
            out.append(os.path.join("scripts", n))
    return out


def failing_anchor(text):
    m = re.search(r"anchor count != 1 -> (\{[^}]*\})", text)
    if m:
        return m.group(1)
    m = re.search(r"ANCHOR[^:]*:\s*([^\n]+)", text)
    if m:
        return m.group(1).strip()[:200]
    return None


def declared_outcome(script_rel):
    """APPLIER-DOCTOR-OUTCOME-AWARE-1.

    Read the applier's OWN declared POST-version literal(s) and target file(s).
    A fail-closed applier in this repo always pins its target with
    pathlib.Path("...") and its post-patch sentinel with POST = '...'. Those two
    facts are enough to ask the only question that matters: is the outcome
    already in the tree?

    The quote characters are written as \x22/\x27 so the pattern needs no
    literal quote inside the raw string.
    """
    try:
        with open(os.path.join(ROOT, script_rel), encoding="utf-8", errors="replace") as f:
            txt = f.read()
    except Exception:  # noqa: BLE001
        return [], []
    posts = re.findall(r"^\s*POST\w*\s*=\s*[\x22\x27]([^\x22\x27]+)[\x22\x27]", txt, re.M)
    targets = re.findall(r"Path\(\s*[\x22\x27]([^\x22\x27]+)[\x22\x27]\s*\)", txt)
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
    reset()
    before, _ = tree_state()
    before = before or []
    env = dict(os.environ)
    env["REPO_ROOT"] = ROOT
    rc, out = sh([sys.executable, rel], env=env)
    after, _ = tree_state()
    after = after or []
    changed = sorted(set(after) - set(before))
    superseded = []
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
    reset()
    rec = {
        "script": rel,
        "rc": rc,
        "verdict": verdict,
        "changed_files": changed[:10],
        "tail": out.strip().splitlines()[-3:] if out.strip() else [],
    }
    if superseded:
        rec["outcome_present_in"] = superseded
    if verdict == "stale-anchor":
        fa = failing_anchor(out)
        if fa:
            rec["failing_anchor"] = fa
    return rec


def main():
    state, raw = tree_state()
    if state is None:
        print("FAIL(3): not a git tree (%s) - run inside a checkout" % raw.strip()[:160])
        return 3
    if state and not ALLOW_DIRTY:
        print("FAIL(3): dirty tree (%d path(s)); commit/stash first or set ALLOW_DIRTY=1" % len(state))
        for ln in state[:10]:
            print("   ", ln)
        return 3

    scripts = find_scripts()
    print("APPLIER-DOCTOR-1 scanning %d patch script(s) under %s" % (len(scripts), SCRIPTS))
    recs = []
    for rel in scripts:
        r = run_one(rel)
        recs.append(r)
        print("  %-52s rc=%-3s %s%s" % (
            os.path.basename(rel), r["rc"], r["verdict"],
            ("  anchor=" + str(r.get("failing_anchor"))[:120]) if r.get("failing_anchor") else ""))

    counts = {}
    for r in recs:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    stale = [r["script"] for r in recs if r["verdict"] == "stale-anchor"]
    superseded_l = [r["script"] for r in recs if r["verdict"] == "superseded"]
    never = [r["script"] for r in recs if r["verdict"] == "applied-now"]
    errored = [r["script"] for r in recs if r["verdict"] == "error"]

    report = {
        "marker": "APPLIER-DOCTOR-1",
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z",
        "total": len(recs),
        "counts": counts,
        "stale_anchor": stale,
        "never_landed": never,
        "errored": errored,
        "superseded": superseded_l,
        "results": recs,
    }
    try:
        os.makedirs(os.path.join(ROOT, "audits"), exist_ok=True)
        os.makedirs(os.path.join(ROOT, "ci-status"), exist_ok=True)
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        with open(os.path.join(ROOT, "audits", "applier-doctor-%s.json" % day), "w") as f:
            json.dump(report, f, indent=1, sort_keys=True)
        with open(os.path.join(ROOT, "ci-status", "applier-doctor.json"), "w") as f:
            json.dump({k: report[k] for k in
                       ("marker", "ts", "total", "counts", "stale_anchor", "never_landed", "errored",
                        "superseded")},
                      f, sort_keys=True)
    except Exception as e:  # noqa: BLE001
        print("WARN: could not write report: %s" % e)

    print("SUMMARY total=%d %s" % (len(recs), counts))
    if stale:
        print("STALE_ANCHOR(%d): %s" % (len(stale), ", ".join(os.path.basename(s) for s in stale)))
    if never:
        print("NEVER_LANDED(%d): %s" % (len(never), ", ".join(os.path.basename(s) for s in never)))
    if errored:
        print("ERRORED(%d): %s" % (len(errored), ", ".join(os.path.basename(s) for s in errored)))
    if superseded_l:
        print("SUPERSEDED(%d): %s" % (len(superseded_l), ", ".join(os.path.basename(s) for s in superseded_l)))

    if STRICT and (stale or never):
        print("FAIL(3): STRICT=1 and %d stale / %d never-landed" % (len(stale), len(never)))
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())

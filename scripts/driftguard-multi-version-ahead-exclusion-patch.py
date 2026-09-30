#!/usr/bin/env python3
"""driftguard-multi-version-ahead-exclusion-patch.py - issue 1457 (2026-09-29).

DEFECT (MULTI-VERSION-AHEAD-EXCLUSION-MISSING-1)
-------------------------------------------------
Issue #1388 (VERSION-PRECEDENCE-2-MULTI-DECLARATION-1) fixed only the RESOLUTION half
of the multi-declaration problem. A concatenated worker bundle can declare the plain
`VERSION` constant more than once in different scopes -- fleet-exec declares
"fleet-executor/0.3.2" (line 7, inside the wrapped exec module) AND "1.0.2" (line 186,
the value /health actually serves). #1388 made `_repo_version()` pick the LAST plain
declaration instead of the first, which resolved the false DRIFT.

But `plain[-1]` is a HEURISTIC about which declaration the worker serves on /health.
The load-bearing companion -- EXCLUDE a multi-declaration artifact from `--ahead` --
never reached scripts/deploy-drift-guard.py. Consequence: `--ahead` is the machine
contract consumed by .github/workflows/fleet-autodeploy.yml ("the only direction where
redeploying the repo is safe"). For a multi-declaration artifact the direction rests on
a guess. If the guess is wrong the guard reports the repo as STRICTLY AHEAD while the
deployed bundle is actually NEWER, and the autodeploy path performs a DOWNGRADE -- the
exact harm DIRECTION (issue #1229) exists to prevent.

THE FIX
-------
Count the DISTINCT plain VERSION declarations in the canonical repo artifact. When an
artifact declares more than one distinct plain version, the worker is reported as class
MULTI_VERSION and is NEVER appended to `ahead`, so no autodeploy can act on an
ambiguous direction.

WHY IT IS NOT FATAL (precedent, not convenience)
------------------------------------------------
NO_HEALTH_ROUTE and NOT_A_WORKER are already reported-but-not-counted: a private worker
with a disabled workers.dev route is not a repo<->live divergence, and a non-worker
directory is not a divergence at all. A multi-declaration artifact is likewise NOT a
divergence -- it is an AMBIGUITY in the monitor's own input. Counting it would turn a
monitoring limitation into a fleet-wide CI outage. It is therefore emitted in the JSON
(`multi_version` list + `multi_version_count`) and on stderr, so it can never be a
silent skip -- which is the property this tool exists to preserve.

FAIL-CLOSED: every edit requires exactly one occurrence. A miss raises SystemExit and
nothing is written. Re-running on an already-patched file is a no-op, not an error.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")

MARKER = "MULTI-VERSION-AHEAD-EXCLUSION-1"

HELPER = '''

def _plain_versions(text):
    """Distinct plain (non-QNFO_) VERSION declarations in one artifact.

    MULTI-VERSION-AHEAD-EXCLUSION-1 (issue 1457): a concatenated bundle may declare the
    plain constant several times in different scopes. `_repo_version()` resolves WHICH
    value to report (last-wins, #1388), but the NUMBER of distinct values is what
    decides whether the direction is trustworthy enough to auto-deploy on.
    """
    return sorted(set(val for prefix, val in CONST.findall(text) if not prefix))


def multi_version_reason(text):
    """Return the distinct plain versions when an artifact is ambiguous, else None.

    More than one distinct plain VERSION declaration means /health could be served from
    either binding and the repo<->live direction cannot be established from a heuristic.
    Such a worker is excluded from --ahead; the caller reports it as MULTI_VERSION.
    """
    vs = _plain_versions(text)
    return vs if len(vs) > 1 else None


'''

EDITS = [
    # E1 -- new class bucket
    (
        "    drift, content_drift, ahead, no_repo_ver, no_live_ver = [], [], [], [], []\n"
        "    not_deployed, sync_workers, live_err, no_health = [], [], [], []\n",
        "    drift, content_drift, ahead, no_repo_ver, no_live_ver = [], [], [], [], []\n"
        "    not_deployed, sync_workers, live_err, no_health = [], [], [], []\n"
        "    multi_version = []\n",
    ),
    # E2 -- the load-bearing exclusion at the --ahead append site
    (
        "        elif lv != rv:\n"
        "            drift.append((d, worker, rv, lv))\n"
        "            if cmp_ver(rv, lv) == 1:\n"
        "                ahead.append((d, worker, rv, lv, rpath))\n",
        "        elif lv != rv:\n"
        "            drift.append((d, worker, rv, lv))\n"
        "            if cmp_ver(rv, lv) == 1:\n"
        "                # MULTI-VERSION-AHEAD-EXCLUSION-1 (issue 1457): the repo artifact\n"
        "                # declares more than one distinct plain VERSION, so which value\n"
        "                # /health serves is a heuristic (see _repo_version, #1388). The\n"
        "                # DIRECTION is therefore not trustworthy and this worker must never\n"
        "                # reach --ahead, or fleet-autodeploy could DOWNGRADE live. Reported\n"
        "                # loudly instead -- never a silent skip.\n"
        "                mv = multi_version_reason(rtext or \"\")\n"
        "                if mv:\n"
        "                    multi_version.append((d, worker, rv, lv, rpath, \",\".join(mv)))\n"
        "                    sys.stderr.write(\n"
        "                        \"MULTI_VERSION %s (dir %s): repo=%s live=%s declarations=%s \"\n"
        "                        \"(excluded from --ahead: direction ambiguous)\\n\"\n"
        "                        % (worker, d, rv, lv, \",\".join(mv)))\n"
        "                else:\n"
        "                    ahead.append((d, worker, rv, lv, rpath))\n",
    ),
    # E3 -- JSON membership
    (
        '            "ahead": [{"worker": w, "dir": d, "repo": r, "live": l, "artifact": p}\n'
        "                      for d, w, r, l, p in ahead],\n",
        '            "ahead": [{"worker": w, "dir": d, "repo": r, "live": l, "artifact": p}\n'
        "                      for d, w, r, l, p in ahead],\n"
        '            "multi_version": [{"worker": w, "dir": d, "repo": r, "live": l,\n'
        '                               "artifact": p, "declarations": dec}\n'
        "                              for d, w, r, l, p, dec in multi_version],\n"
        '            "multi_version_count": len(multi_version),\n',
    ),
    # E4 -- summary visibility
    (
        '              f"content_drift={len(content_drift)} ahead={len(ahead)} "\n',
        '              f"content_drift={len(content_drift)} ahead={len(ahead)} "\n'
        '              f"multi_version={len(multi_version)} "\n',
    ),
    # E5 -- insert the helper before live_result
    (
        "def live_result(worker):\n",
        HELPER.lstrip("\n") + "def live_result(worker):\n",
    ),
    # E6 -- document the class
    (
        "This is the machine-readable contract used by\n.github/workflows/fleet-autodeploy.yml.\n",
        "This is the machine-readable contract used by\n"
        ".github/workflows/fleet-autodeploy.yml.\n"
        "MULTI-VERSION-AHEAD-EXCLUSION-1 (issue 1457): an artifact that declares MORE THAN\n"
        "ONE distinct plain VERSION cannot be direction-trusted at all -- `_repo_version()`\n"
        "picks the last declaration (#1388), which is a heuristic about which binding\n"
        "/health serves. Such a worker is reported as MULTI_VERSION and is NEVER emitted in\n"
        "`--ahead`, so an ambiguous artifact can never drive an autodeploy downgrade.\n"
        "MULTI_VERSION is reported but not counted in the exit code, on the same precedent\n"
        "as NO_HEALTH_ROUTE and NOT_A_WORKER: it is an ambiguity in the monitor's input, not\n"
        "a repo<->live divergence.\n",
    ),
]


def main():
    if not os.path.isfile(GUARD):
        raise SystemExit("FAIL-CLOSED: missing " + GUARD)
    with open(GUARD, encoding="utf-8") as fh:
        text = fh.read()

    if MARKER in text:
        print("already applied: " + GUARD)
        return 0

    for old, new in EDITS:
        n = text.count(old)
        if n != 1:
            raise SystemExit(
                "FAIL-CLOSED: anchor occurs %d times (expected 1) in %s\n---\n%s"
                % (n, GUARD, old[:200])
            )
        text = text.replace(old, new)

    with open(GUARD, "w", encoding="utf-8") as fh:
        fh.write(text)
    print("patched " + GUARD)
    return 0


if __name__ == "__main__":
    sys.exit(main())

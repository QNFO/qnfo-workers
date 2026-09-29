#!/usr/bin/env python3
"""driftguard-label-and-lifecycle-sot-patch.py - issue 1370 (2026-09-29).

Three verified defects, all reproduced from live output in one session.

A) scripts/deploy-drift-guard.py classified a worker as DRIFT on ANY inequality between
   the repo VERSION constant and the live /health version. qnfo-lifecycle carries repo
   constant "1.6.2" and live /health "1.6.2-cronconsolidate", so it reported DRIFT
   forever -- while qnfo-lifecycle/worker.js and qnfo-lifecycle/deployed-current.worker.js
   are the SAME sha (d3b76f91bea19cf5ad8acd802c993494d4de45d2) and the live bundle is
   2 bytes larger (30295 vs 30293, trailing whitespace only). The guard's own docstring
   filed that case under DEPLOY-UNLOGGED-MUTATION; that attribution is wrong and is
   corrected here.
   FIX: a LABEL_MISMATCH class -- repo != live but cmp_ver() == 0 (numeric prefixes
   equal). Emitted in text and JSON, never counted toward the exit code, because a
   redeploy cannot change a label and the --content sha check remains the authority on
   whether the bytes differ.

B) scripts/raw_put.py extracted the deployed version with r'var VERSION = "([^"]+)"'.
   A worker using `const QNFO_VERSION = "..."` therefore landed in
   qnfo-audit.deployment_history with version_id="unknown" -- a null version in the very
   ledger DEPLOY-LEDGER-1 exists to keep honest.
   FIX: widen to the alternation the guard already uses,
   (?:var|let|const)\s+(?:QNFO_)?VERSION\s*=\s*"([^"]+)", so the two tools cannot
   disagree about what version a worker is.

C) qnfo-lifecycle answered /health from a hardcoded tag while the bundle constant said
   something else -- two sources of truth for one fact, which is what made (A) fire.
   FIX: /health derives from QNFO_VERSION and the constant is bumped to the tag that
   describes this build. Applied identically to worker.js and deployed-current.worker.js;
   the calling workflow asserts byte parity afterwards because mirror-guard flags a
   divergent pair.

FAIL-CLOSED: every edit requires exactly one occurrence; a miss raises and nothing is
written. Re-running on an already-patched file is a no-op, not an error.
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUARD = os.path.join(ROOT, "scripts", "deploy-drift-guard.py")
RAWPUT = os.path.join(ROOT, "scripts", "raw_put.py")
LIFECYCLE = [
    os.path.join(ROOT, "qnfo-lifecycle", "worker.js"),
    os.path.join(ROOT, "qnfo-lifecycle", "deployed-current.worker.js"),
]

GUARD_EDITS = [
    (
        "  DRIFT            repo VERSION != live /health version  (reconcile required)\n",
        "  DRIFT            repo VERSION != live /health version, NUMERICALLY different\n"
        "                   (reconcile required)\n"
        "  LABEL_MISMATCH   repo VERSION != live /health version but the NUMERIC prefix\n"
        "                   is equal (repo 1.6.2 vs live 1.6.2-cronconsolidate). Reported\n"
        "                   in text and JSON, NEVER fatal: a redeploy cannot change a\n"
        "                   label, and the repo artifact can be byte-identical to live.\n"
        "                   The --content sha check stays the authority on the bytes\n"
        "                   (issue 1370).\n",
    ),
    (
        "the live bundle can be AHEAD of the repo (DEPLOY-UNLOGGED-MUTATION, issues\n"
        "#1340-#1343, and the qnfo-lifecycle 1.6.2-cronconsolidate case). `--ahead` therefore\n",
        "the live bundle can be AHEAD of the repo (DEPLOY-UNLOGGED-MUTATION, issues\n"
        "#1340-#1343). The qnfo-lifecycle 1.6.2 vs 1.6.2-cronconsolidate case was NOT a\n"
        "live mutation: both repo artifacts and the live bundle share sha d3b76f91 (30293\n"
        "vs 30295 bytes, trailing whitespace only), so it is a LABEL_MISMATCH (issue\n"
        "1370). `--ahead` therefore\n",
    ),
    (
        "Exit: 0 clean (scoped: SYNC only) | 1 any DRIFT / CONTENT_DRIFT / NO_*_VERSION / LIVE_ERR\n",
        "Exit: 0 clean (scoped: SYNC only) | 1 any DRIFT / CONTENT_DRIFT / NO_*_VERSION / LIVE_ERR\n"
        "      LABEL_MISMATCH is reported but NEVER fatal (issue 1370).\n",
    ),
    (
        "    drift, content_drift, ahead, no_repo_ver, no_live_ver = [], [], [], [], []\n"
        "    not_deployed, sync_workers, live_err = [], [], []\n",
        "    drift, content_drift, ahead, no_repo_ver, no_live_ver = [], [], [], [], []\n"
        "    not_deployed, sync_workers, live_err = [], [], []\n"
        "    label_mismatch = []\n",
    ),
    (
        "        elif lv != rv:\n"
        "            drift.append((d, rv, lv))\n"
        "            if cmp_ver(rv, lv) == 1:\n"
        "                ahead.append((d, rv, lv, rpath))\n",
        "        elif lv != rv and cmp_ver(rv, lv) == 0:\n"
        "            # LABEL_MISMATCH: identical numeric version, different build tag. Repo\n"
        "            # and live agree on the version; only the label string differs. Not\n"
        "            # drift: a redeploy cannot change a label, and --content is the\n"
        "            # authority on whether the bytes actually differ.\n"
        "            label_mismatch.append((d, rv, lv))\n"
        "        elif lv != rv:\n"
        "            drift.append((d, rv, lv))\n"
        "            if cmp_ver(rv, lv) == 1:\n"
        "                ahead.append((d, rv, lv, rpath))\n",
    ),
    (
        '            "ahead": [{"worker": d, "repo": r, "live": l, "artifact": p}\n'
        "                      for d, r, l, p in ahead],\n",
        '            "ahead": [{"worker": d, "repo": r, "live": l, "artifact": p}\n'
        "                      for d, r, l, p in ahead],\n"
        '            "label_mismatch": [{"worker": d, "repo": r, "live": l}\n'
        "                               for d, r, l in label_mismatch],\n"
        '            "label_mismatch_count": len(label_mismatch),\n',
    ),
    (
        "        for d, rv_, lv_ in drift:\n"
        '            print(f"DRIFT {d}: repo={rv_} live={lv_}")\n',
        "        for d, rv_, lv_ in drift:\n"
        '            print(f"DRIFT {d}: repo={rv_} live={lv_}")\n'
        "        for d, rv_, lv_ in label_mismatch:\n"
        '            print(f"LABEL_MISMATCH {d}: repo={rv_} live={lv_} (numeric prefix equal)")\n',
    ),
    (
        '        print(f"deploy-drift-guard[{tag}]: sync={len(sync_workers)} drift={len(drift)} "\n'
        '              f"content_drift={len(content_drift)} ahead={len(ahead)} "\n',
        '        print(f"deploy-drift-guard[{tag}]: sync={len(sync_workers)} drift={len(drift)} "\n'
        '              f"label_mismatch={len(label_mismatch)} "\n'
        '              f"content_drift={len(content_drift)} ahead={len(ahead)} "\n',
    ),
    (
        "    problems = len(drift) + len(content_drift) + len(no_repo_ver) + len(no_live_ver) + len(live_err)\n",
        "    # label_mismatch is deliberately NOT counted: it is a labelling defect, not a\n"
        "    # deploy defect, and failing on it kept the gate permanently red for a worker\n"
        "    # whose bytes are identical to live (issue 1370).\n"
        "    problems = len(drift) + len(content_drift) + len(no_repo_ver) + len(no_live_ver) + len(live_err)\n",
    ),
]

RAWPUT_EDITS = [
    (
        'VERSION_RE = re.compile(r\'var VERSION = "([^"]+)"\')\n',
        "# LEDGER-VERSION-EXTRACT-1 (issue 1370): the old regex matched ONLY\n"
        "# `var VERSION = \"...\"`. A worker using `const QNFO_VERSION = \"...\"`\n"
        "# (qnfo-lifecycle, qnfo-memory-mcp) was recorded in deployment_history as\n"
        "# version_id=\"unknown\", so the ledger DEPLOY-LEDGER-1 exists to keep honest\n"
        "# carried a null version for a whole class of workers. Same alternation as\n"
        "# scripts/deploy-drift-guard.py CONST, so the two tools cannot disagree.\n"
        "VERSION_RE = re.compile(r'(?:var|let|const)\\s+(?:QNFO_)?VERSION\\s*=\\s*\"([^\"]+)\"')\n",
    ),
]

LIFECYCLE_EDITS = [
    ('const QNFO_VERSION = "1.6.2";', 'const QNFO_VERSION = "1.6.3-version-sot";'),
    ('version: "1.6.2-cronconsolidate",', "version: QNFO_VERSION,"),
]


def patch(path, edits):
    if not os.path.isfile(path):
        raise SystemExit("FAIL-CLOSED: missing file " + path)
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    changed = False
    for old, new in edits:
        n = text.count(old)
        if n == 0:
            if new in text:
                continue
            raise SystemExit("FAIL-CLOSED: anchor not found in " + path + "\n---\n" + old[:220])
        if n != 1:
            raise SystemExit("FAIL-CLOSED: anchor occurs %d times in %s\n---\n%s"
                             % (n, path, old[:220]))
        text = text.replace(old, new)
        changed = True
    if changed:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(text)
        print("patched " + path)
    else:
        print("already applied: " + path)
    return changed


def main():
    patch(GUARD, GUARD_EDITS)
    patch(RAWPUT, RAWPUT_EDITS)
    for p in LIFECYCLE:
        patch(p, LIFECYCLE_EDITS)
    return 0


if __name__ == "__main__":
    sys.exit(main())

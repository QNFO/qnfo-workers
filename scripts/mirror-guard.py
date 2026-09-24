#!/usr/bin/env python3
"""mirror-guard.py - MIRROR-STALENESS-DEPLOY-FAIL-1 (issue 1077, MIRROR-AUTOMATION-1).

WHY: the canonical server-side deploy (qnfo-ops POST /ops/deploy) fetches the
CANONICAL artifact from qnfo-workers main at <dir>/deployed-current.worker.js, NOT
<dir>/worker.js. If the mirror lags the source, the route verifies a stale version
and fails closed with an OPAQUE ok=0. Canonical case: osf-integrity-check,
2026-09-24T11:49:27Z, where worker.js carried QNFO_VERSION="2.1.0" while
deployed-current.worker.js still carried the non-semver
"osf-integrity-check/fabric-20260910". A worker.js version bump is ALSO invisible to
the qnfo-fleet-control redeploy cron and the drift scanner unless the mirror moves.

WHAT: for every <dir>/worker.js with a sibling deployed-current.worker.js, extract
every version constant from each file and compare. Same constant NAMES but different
VALUES = a genuine lag (safe to regenerate with cp). Different NAME SETS = a
structural difference (probably a build artifact) = report only, never auto-copy.

Usage:
  python scripts/mirror-guard.py          # report; exit 1 if any drift
  python scripts/mirror-guard.py --fix    # regenerate lagging mirrors from source
Exit: 0 clean | 1 drift found
"""
import os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONST = re.compile(r'(?:var|let|const)\s+([A-Za-z0-9_]*VERSION[A-Za-z0-9_]*)\s*=\s*"([^"]*)"')


def versions(path):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            src = f.read()
    except OSError:
        return None
    return dict(CONST.findall(src))


def main(argv):
    fix = "--fix" in argv
    rows, drift, missing, fixed = [], [], [], []

    for name in sorted(os.listdir(ROOT)):
        d = os.path.join(ROOT, name)
        if not os.path.isdir(d) or name.startswith(".") or name in ("scripts", "docs"):
            continue
        src_p = os.path.join(d, "worker.js")
        mir_p = os.path.join(d, "deployed-current.worker.js")
        if not os.path.exists(src_p):
            continue
        s = versions(src_p)
        m = versions(mir_p) if os.path.exists(mir_p) else None

        if m is None:
            missing.append(name)
            rows.append((name, "MISSING", str(s), "-"))
            continue
        if s == m:
            continue

        same_names = set(s) == set(m)
        lag = sorted(k for k in s if k in m and s[k] != m[k])
        if same_names and lag:
            rows.append((name, "LAG", ",".join("%s=%s" % (k, s[k]) for k in lag),
                         ",".join("%s=%s" % (k, m[k]) for k in lag)))
            drift.append(name)
            if fix:
                shutil.copyfile(src_p, mir_p)
                fixed.append(name)
        else:
            rows.append((name, "NAMESET-DIFF", str(s), str(m)))

    if rows:
        print("%-34s %-14s %-40s %s" % ("worker", "verdict", "source", "mirror"))
        for r in rows:
            print("%-34s %-14s %-40s %s" % r)
    print("\nsummary: lagging=%d fixed=%d missing_mirror=%d" % (len(drift), len(fixed), len(missing)))
    if missing:
        print("missing mirror: " + ", ".join(missing))
    if drift and not fix:
        print("\nDRIFT GATE FAILED - run with --fix to regenerate from source, then commit BOTH files")
    return 1 if (drift and not fix) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

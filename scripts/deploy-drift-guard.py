#!/usr/bin/env python3
"""deploy-drift-guard.py - repo<->live VERSION drift (DRIFT-ZERO).

Closes the gap left by the other guards:
  - scripts/mirror-guard.py   : repo-INTERNAL (worker.js vs deployed-current.worker.js)
  - scripts/cron_rate_guard.py: cron cadence
  - THIS                      : repo(canonical) VERSION vs LIVE /health

CANONICAL ARTIFACT: the server-side deploy (qnfo-ops POST /ops/deploy) and the
qnfo-fleet-control redeploy fetch <dir>/deployed-current.worker.js, NOT <dir>/worker.js
(see mirror-guard.py). So this monitor reads the canonical artifact first, falling back
to worker.js, and accepts VERSION or QNFO_VERSION.

Default scope = the narrative-generation surfaces we own. `--all` scans every repo
worker that is LIVE (HTTP 404 = not deployed = skipped, NOT drift).

Canonical case 2026-09-26: a concurrent session deployed a worker live and committed
locally without pushing (origin/main lagged live) until reconciled.

Exit: 0 in sync | 1 drift found (repo VERSION != live VERSION for a live worker)
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONST = re.compile(r'(?:var|let|const)\s+(?:QNFO_)?VERSION\s*=\s*"([^"]+)"')
CANON = ("deployed-current.worker.js", "worker.js")
TIMEOUT = 12
NARRATIVE = ["qnfo-ai", "qnfo-research-exec", "qnfo-ipatent", "qnfo-gateway"]


def repo_version(d):
    for fn in CANON:
        p = os.path.join(ROOT, d, fn)
        if os.path.isfile(p):
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    m = CONST.search(fh.read())
            except OSError:
                m = None
            if m:
                return m.group(1)
    return None


def live_version(worker):
    url = "https://" + worker + ".q08.workers.dev/health"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "qnfo-deploy-drift-guard"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            j = json.load(r)
        return j.get("version") or j.get("VERSION")
    except urllib.error.HTTPError as e:
        return None if e.code == 404 else "ERR:" + str(e)[:50]
    except Exception as e:
        return "ERR:" + str(e)[:50]


def main():
    scan_all = "--all" in sys.argv
    wanted = set(a for a in sys.argv[1:] if not a.startswith("-"))
    if not wanted and not scan_all:
        wanted = set(NARRATIVE)
    drift, notlive, checked = [], 0, 0
    for d in sorted(os.listdir(ROOT)):
        if wanted and d not in wanted:
            continue
        if not os.path.isdir(os.path.join(ROOT, d)):
            continue
        rv = repo_version(d)
        if not rv:
            continue
        lv = live_version(d)
        if lv is None:
            notlive += 1
            continue
        checked += 1
        if lv != rv:
            drift.append((d, rv, lv))
    for d, rv, lv in drift:
        print(f"DRIFT {d}: repo={rv} live={lv}")
    tag = "all-live" if scan_all else "narrative"
    if drift:
        print(f"deploy-drift-guard[{tag}]: {len(drift)}/{checked} drifted ({notlive} not-deployed skipped)")
        return 1
    print(f"deploy-drift-guard[{tag}]: {checked}/{checked} in sync ({notlive} not-deployed skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

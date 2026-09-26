#!/usr/bin/env python3
"""deploy-drift-guard.py - repo<->live VERSION drift (DRIFT-ZERO).

Closes the gap left by the other guards:
  - scripts/mirror-guard.py   : repo-INTERNAL  (worker.js vs deployed-current.worker.js)
  - scripts/cron_rate_guard.py: cron cadence
  - THIS                      : repo(worker.js) VERSION vs LIVE /health

Default scope = the NARRATIVE-generation workers we own (the shared surface whose
source must track live). `--all` scans every repo worker that is LIVE (404 = not
deployed = skipped, NOT drift).

Canonical case 2026-09-26: a concurrent session deployed qnfo-ai v5.28.8-rag live and
committed locally but did not push; origin/main lagged live until reconciled.

Exit: 0 in sync | 1 drift found (repo VERSION != live VERSION for a live worker)
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONST = re.compile(r'(?:var|let|const)\s+VERSION\s*=\s*"([^"]+)"')
TIMEOUT = 12
NARRATIVE = ["qnfo-ai", "qnfo-research-exec", "qnfo-ipatent", "qnfo-gateway"]


def repo_version(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            m = CONST.search(fh.read())
        return m.group(1) if m else None
    except OSError:
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
        wp = os.path.join(ROOT, d, "worker.js")
        if not os.path.isfile(wp):
            continue
        rv = repo_version(wp)
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
    if drift:
        print(f"deploy-drift-guard: {len(drift)}/{checked} live drifted ({notlive} not-deployed skipped)")
        return 1
    print(f"deploy-drift-guard: {checked}/{checked} in sync; {notlive} not-deployed skipped")
    return 0


if __name__ == "__main__":
    sys.exit(main())

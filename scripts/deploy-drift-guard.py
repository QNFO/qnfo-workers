#!/usr/bin/env python3
"""deploy-drift-guard.py - repo<->live VERSION drift + version-gap monitor.

ROOT CAUSE (why this exists):
  1. The canonical deploy (qnfo-ops POST /ops/deploy + the qnfo-fleet-control redeploy)
     fetches <dir>/deployed-current.worker.js -- NOT <dir>/worker.js (see mirror-guard.py).
     A monitor that reads worker.js measures the wrong artifact and false-reports.
  2. A worker with NO version constant is INVISIBLE to any version-based drift check
     (silent skip) -> the drift can never be seen or reconciled. Silent skips are the
     defect this tool refuses to allow.

CLASSES (no class is ever silently dropped):
  DRIFT            repo VERSION != live /health version  (reconcile required)
  NO_REPO_VERSION  worker is live but the repo has no version constant (source gap)
  NO_LIVE_VERSION  worker answers /health but omits a version field (live gap)
  NOT_DEPLOYED     HTTP 404 (retired/never-deployed) -- reported, not drift
  SYNC             repo == live

Default scope = the narrative-generation surfaces we own. `--all` = all workers.
Exit: 0 clean (scoped: SYNC only) | 1 any DRIFT / NO_*_VERSION
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


def live_result(worker):
    url = "https://" + worker + ".q08.workers.dev/health"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "qnfo-deploy-drift-guard"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = json.load(r)
        return True, (data.get("version") or data.get("VERSION"))
    except urllib.error.HTTPError as e:
        return (False, None) if e.code == 404 else (False, "ERR:" + str(e)[:50])
    except Exception as e:
        return (False, "ERR:" + str(e)[:50])


def main():
    scan_all = "--all" in sys.argv
    wanted = set(a for a in sys.argv[1:] if not a.startswith("-"))
    if not wanted and not scan_all:
        wanted = set(NARRATIVE)
    drift, no_repo_ver, no_live_ver, not_deployed, sync, live_err = [], [], [], 0, 0, []
    for d in sorted(os.listdir(ROOT)):
        if wanted and d not in wanted:
            continue
        if not os.path.isdir(os.path.join(ROOT, d)):
            continue
        # ROOT-CAUSE FIX: .git/.github/.wrangler/_shared are infra dirs, not workers --
        # probing them produced bogus LIVE_ERR (invalid worker hostnames).
        if d.startswith(".") or d.startswith("_"):
            continue
        rv = repo_version(d)
        live, lv = live_result(d)
        if not live and lv is None:
            not_deployed += 1
            continue
        if not live:  # ERR (not 404)
            live_err.append((d, lv))
            continue
        if rv is None:
            no_repo_ver.append((d, lv))
        elif not lv:
            no_live_ver.append((d, rv))
        elif lv != rv:
            drift.append((d, rv, lv))
        else:
            sync += 1
    for d, rv, lv in drift:
        print(f"DRIFT {d}: repo={rv} live={lv}")
    for d, lv in no_repo_ver:
        print(f"NO_REPO_VERSION {d}: live={lv}")
    for d, rv in no_live_ver:
        print(f"NO_LIVE_VERSION {d}: repo={rv}")
    for d, e in live_err:
        print(f"LIVE_ERR {d}: {e}")
    tag = "all" if scan_all else "narrative"
    problems = len(drift) + len(no_repo_ver) + len(no_live_ver) + len(live_err)
    print(f"deploy-drift-guard[{tag}]: sync={sync} drift={len(drift)} no_repo_version={len(no_repo_ver)} "
          f"no_live_version={len(no_live_ver)} live_err={len(live_err)} not_deployed_notdrift={not_deployed}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())

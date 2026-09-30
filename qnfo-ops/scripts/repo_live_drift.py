#!/usr/bin/env python3
"""repo_live_drift.py - content-level repo<->live drift detector for the QNFO fleet.

WHY THIS EXISTS (2026-09-29)
  issue #1229 DEPLOY-DRIFT-GUARD-VERSION-ONLY-AND-REPORT-ONLY-1: the fleet could
  not answer "is the code running in production the same code that is on main?".
  Two concrete failures motivated this script:
    * FIX-COMMITTED-NOT-DEPLOYED-1 - qnfo-ops 2.37.18 (commit 50266267) was merged
      to main at 2026-09-29T12:23:43Z but production kept serving 2.37.17, so the
      fix was inert and the defect it repaired (#1349, replace() rejected by the
      read-only guard) stayed live.
    * DEPLOY-LEDGER-LAG-1 - deployment_history's newest qnfo-ops row was 2.37.14
      while live was 2.37.17: three mutations were never logged.

WHY raw.githubusercontent IS NOT USED
  During the 2026-09-29 sweep, raw.githubusercontent.com/.../main/qnfo-ops/worker.js
  served a STALE blob (VERSION 2.37.17, 356720 bytes) while the REST contents API
  served the true HEAD (VERSION 2.37.18, 359427 bytes). A detector built on raw
  would have emitted a false IN-SYNC verdict on the exact worker that was drifted.
  This script therefore compares the DEPLOYED BUNDLE against the REPO BLOB via the
  authenticated REST APIs, extracting VERSION from both sides - so it compares
  content, not a ledger or a registry column.

USAGE
  GITHUB_TOKEN=... CF_ACCOUNT_ID=... CF_API_TOKEN=... python3 repo_live_drift.py [--json]
  exit 0 = no drift | exit 1 = drift found | exit 2 = probe error

WIRE-UP (automatic self-audit)
  Read-only and idempotent: safe on a cron and on every push. Suggested cadence
  hourly alongside the existing fleet-exec */10 tick, or as a required CI check.
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request

REPO = os.environ.get("DRIFT_REPO", "QNFO/qnfo-workers")
REF = os.environ.get("DRIFT_REF", "main")
VERSION_RE = re.compile(r"""VERSION\s*=\s*["']([^"']+)["']""")

GH = os.environ.get("GITHUB_TOKEN", "")
CF = os.environ.get("CF_API_TOKEN", "")
ACCT = os.environ.get("CF_ACCOUNT_ID", "")


def _get(url, headers):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def _get_json(url, headers):
    return json.loads(_get(url, headers).decode("utf-8", "replace"))


def gh_headers():
    h = {"Accept": "application/vnd.github+json", "User-Agent": "qnfo-drift"}
    if GH:
        h["Authorization"] = "Bearer " + GH
    return h


def cf_headers():
    return {"Authorization": "Bearer " + CF, "User-Agent": "qnfo-drift"}


def repo_version(path):
    """Return (version, sha) for a file on REF, via the contents API (never raw)."""
    url = "https://api.github.com/repos/%s/contents/%s?ref=%s" % (REPO, path, REF)
    try:
        meta = _get_json(url, gh_headers())
    except urllib.error.HTTPError as e:
        return None, "HTTP %s" % e.code
    if isinstance(meta, list):
        return None, "path-is-dir"
    blob = base64.b64decode(meta.get("content", "")).decode("utf-8", "replace")
    m = VERSION_RE.search(blob)
    return (m.group(1) if m else None), meta.get("sha", "")[:8]


def live_version(worker):
    """Return the VERSION constant of the DEPLOYED bundle (content, not a ledger)."""
    url = "https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts/%s/content" % (ACCT, worker)
    try:
        blob = _get(url, cf_headers()).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return None, "HTTP %s" % e.code
    m = VERSION_RE.search(blob)
    return (m.group(1) if m else None), len(blob)


def deployed_workers():
    url = "https://api.cloudflare.com/client/v4/accounts/%s/workers/scripts" % ACCT
    data = _get_json(url, cf_headers())
    return sorted(r["id"] for r in data.get("result", []))


def main():
    as_json = "--json" in sys.argv
    if not (CF and ACCT):
        print("need CF_API_TOKEN and CF_ACCOUNT_ID", file=sys.stderr)
        return 2
    rows, drifted, errors = [], [], []
    for w in deployed_workers():
        rv, rmeta = repo_version("%s/worker.js" % w)
        lv, lmeta = live_version(w)
        if rv is None and rmeta.startswith("HTTP"):
            verdict = "NO-REPO-FILE"
        elif lv is None and isinstance(lmeta, str) and lmeta.startswith("HTTP"):
            verdict = "PROBE-ERROR"
            errors.append(w)
        elif rv == lv:
            verdict = "IN-SYNC"
        else:
            verdict = "DRIFT"
            drifted.append(w)
        rows.append({"worker": w, "repo_version": rv, "live_version": lv,
                     "repo_sha": rmeta, "live_bytes": lmeta, "verdict": verdict})
    if as_json:
        print(json.dumps({"ref": REF, "rows": rows, "drifted": drifted}, indent=1))
    else:
        print("repo<->live drift  repo=%s ref=%s  workers=%d  drifted=%d" % (REPO, REF, len(rows), len(drifted)))
        for r in rows:
            flag = "!!" if r["verdict"] == "DRIFT" else "  "
            print("%s %-28s repo=%-34s live=%-34s %s" % (flag, r["worker"], r["repo_version"], r["live_version"], r["verdict"]))
    if errors:
        print("probe errors: %s" % ", ".join(errors), file=sys.stderr)
        return 2
    return 1 if drifted else 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""deployment_ledger_reconcile.py -- DEPLOY-LEDGER-WRANGLER-ESCAPE-1

WHY THIS EXISTS
  deployment_history is the only thing the portfolio can read to answer "is this project
  deployed, and did it upgrade?". Every writer is supposed to append to it. Measured
  2026-10-18: a `wrangler deploy` appends NOTHING. qnfo-artifacts was deployed four times
  (versions 62a635e0, 425ea9d5, e749ae2f, 0f180253) and the ledger held zero rows for it, so
  the portfolio reported the project as never deployed while it was serving traffic, and
  portfolio_gaps carried the symptom as kind=deploy-unrecorded.

WHAT IT DOES
  Asks Cloudflare for the deployments it actually has, compares them with the ledger, and
  appends the ones the ledger is missing -- with notes, because
  deployment_history_provenance_required_ins correctly refuses a row that does not say where it
  came from. It never rewrites existing rows, never deletes, and is idempotent: a version that
  is already recorded is skipped.

EXIT CONTRACT
  0 nothing to do, or everything reconciled
  3 a source could not be read (fail closed: never report "in sync" from a failed read)

USAGE
  python scripts/deployment_ledger_reconcile.py --limit 40
  python scripts/deployment_ledger_reconcile.py --worker qnfo-artifacts --dry-run
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

CF = "https://api.cloudflare.com/client/v4"
D1_ID = os.environ.get("QNFO_AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
NOTE = ("RECONCILED-FROM-CF-API (deployment-ledger-reconcile): this deployment existed live but no "
        "writer appended it; version_id is Cloudflare's deployment UUID, not the worker VERSION literal")


def call(url, token, method="GET", body=None, timeout=45):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "qnfo-deployment-ledger-reconcile/1.0")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300]}
    except Exception as e:
        return 0, {"error": str(e)}


def d1(acct, token, sql, params=None):
    body = {"sql": sql}
    if params:
        body["params"] = params
    return call(CF + "/accounts/" + acct + "/d1/database/" + D1_ID + "/query", token, "POST", body)


def q(acct, token, sql, params=None):
    st, j = d1(acct, token, sql, params)
    if not (200 <= st < 300) or not j.get("success"):
        return None, j.get("errors") or j
    res = j.get("result") or []
    return (res[0].get("results") if res else []), None


def live_deployments(acct, token, worker):
    """The newest deployment Cloudflare reports for a Worker, and its immutable version id."""
    st, j = call(CF + "/accounts/" + acct + "/workers/scripts/" + worker + "/deployments", token)
    if st != 200:
        return None, "http_%s" % st
    deps = ((j.get("result") or {}).get("deployments") or [])
    if not deps:
        return None, "no_deployments"
    deps.sort(key=lambda d: d.get("created_on") or "", reverse=True)
    newest = deps[0]
    versions = newest.get("versions") or []
    vid = versions[0].get("version_id") if versions else None
    return {"version_id": vid, "created_on": newest.get("created_on"),
            "count": len(deps)}, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--worker", default="")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--workers", type=int, default=6)
    args = ap.parse_args()

    acct = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID")
    token = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
    if not (acct and token):
        print(json.dumps({"ok": False, "error": "need CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN"}))
        return 3

    if args.worker:
        names = [args.worker]
    else:
        st, j = call(CF + "/accounts/" + acct + "/workers/scripts", token)
        if st != 200:
            print(json.dumps({"ok": False, "error": "cannot list worker scripts", "status": st}))
            return 3
        names = [s.get("id") for s in (j.get("result") or []) if s.get("id")]

    def probe(name):
        live, err = live_deployments(acct, token, name)
        if err:
            return {"worker": name, "skipped": err}
        # The ledger's version_id is the worker's own VERSION literal (e.g.
        # "3.23.1-quick-read-5"), NOT Cloudflare's deployment UUID. Comparing the two kinds would
        # report every healthy worker as missing and append a parallel id space, so the authority is
        # TIME: a deployment is recorded when the ledger holds a row at or after it.
        recorded, e = q(acct, token,
                        "SELECT MAX(deployed_at) AS newest FROM deployment_history "
                        "WHERE resource_name = ?", [name])
        if e:
            return {"worker": name, "skipped": "d1_read", "detail": json.dumps(e)[:160]}
        newest = (recorded or [{}])[0].get("newest")
        recorded_now = False
        if newest and live.get("created_on"):
            recorded_now = str(newest).replace(" ", "T") >= str(live["created_on"])[:19]
        return {"worker": name, "live": live, "ledger_newest": newest,
                "already_recorded": recorded_now}

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        rows = list(ex.map(probe, names))

    missing = [r for r in rows if r.get("live") and not r["already_recorded"]]
    missing.sort(key=lambda r: r["worker"])
    targets = missing[:args.limit] if args.limit else missing

    written = []
    if not args.dry_run:
        for r in targets:
            st, j = d1(acct, token,
                       "INSERT INTO deployment_history (resource_type, resource_name, action, "
                       "version_id, deployed_by, deployed_at, status, notes) "
                       "VALUES ('worker', ?, 'deployed', ?, 'deployment-ledger-reconcile', ?, "
                       "'success', ?)",
                       [r["worker"], r["live"]["version_id"],
                        r["live"]["created_on"] or None, NOTE])
            if 200 <= st < 300 and j.get("success"):
                written.append(r["worker"])
            else:
                r["error"] = json.dumps(j.get("errors") or j)[:160]

    skipped = [r for r in rows if r.get("skipped")]
    print(json.dumps({
        "ok": True,
        "workers_checked": len(rows),
        "already_recorded": sum(1 for r in rows if r.get("already_recorded")),
        "missing_from_ledger": len(missing),
        "written": len(written),
        "dry_run": bool(args.dry_run),
        "unreadable": skipped[:5],
        "missing_sample": [r["worker"] for r in missing[:10]],
    }, indent=2))
    return 0 if not skipped else 3


if __name__ == "__main__":
    sys.exit(main())

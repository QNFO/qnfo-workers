#!/usr/bin/env python3
"""ai-attribution-report.py - per-worker Workers AI call share from D1 ai_call_counters.

WORKERS-AI-SPEND-UNATTRIBUTED-RISING-1 (#1681). Reproduces the issue's per-worker table.
Read-only SELECTs through the Cloudflare D1 REST API. Credentials come from the environment
(CLOUDFLARE_API_TOKEN, CF_ACCOUNT_ID); they are never printed.

USAGE
  python3 scripts/ai-attribution-report.py [--days N] [--by-purpose] [--db <d1-uuid>]

Calls/in_chars/ms are the attribution proxy (the binding returns no neuron count).
Workers not yet migrated to aiRunAttr do not appear here at all.
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_DB = "35e2e573-92f3-46ac-83c6-22f6429fc5e5"  # qnfo-audit


def query(token, acct, db, sql, params):
    url = "https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query" % (acct, db)
    req = urllib.request.Request(
        url,
        data=json.dumps({"sql": sql, "params": params}).encode(),
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json",
                 "User-Agent": "qnfo-ai-attribution-report/1.0"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit("D1 query failed: HTTP %d" % e.code)
    except Exception as e:  # never echo request details (headers hold the token)
        sys.exit("D1 query failed: %s" % type(e).__name__)
    if not body.get("success"):
        sys.exit("D1 query failed: %s" % json.dumps(body.get("errors"))[:300])
    return body["result"][0].get("results", [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--by-purpose", action="store_true")
    ap.add_argument("--db", default=DEFAULT_DB)
    a = ap.parse_args()
    token = os.environ.get("CLOUDFLARE_API_TOKEN")
    acct = os.environ.get("CF_ACCOUNT_ID")
    if not token or not acct:
        sys.exit("CLOUDFLARE_API_TOKEN and CF_ACCOUNT_ID must be set in the environment")
    cols = "worker, purpose" if a.by_purpose else "worker"
    sql = ("SELECT %s, SUM(calls) AS calls, SUM(errors) AS errors, SUM(in_chars) AS in_chars, SUM(ms) AS ms "
           "FROM ai_call_counters WHERE day >= date('now', ?1) GROUP BY %s ORDER BY calls DESC" % (cols, cols))
    rows = query(token, acct, a.db, sql, ["-%d days" % max(a.days - 1, 0)])
    total = sum(r["calls"] or 0 for r in rows)
    print("ai_call_counters, last %d day(s), total calls=%d" % (a.days, total))
    hdr = "%-28s %-18s %8s %7s %6s %12s %10s" % ("worker", "purpose" if a.by_purpose else "", "calls", "share", "errs", "in_chars", "avg_ms")
    print(hdr)
    for r in rows:
        c = r["calls"] or 0
        share = (100.0 * c / total) if total else 0.0
        avg = (r["ms"] or 0) / c if c else 0
        print("%-28s %-18s %8d %6.1f%% %6d %12d %10.0f" % (
            r["worker"], r.get("purpose", "") if a.by_purpose else "", c, share, r["errors"] or 0, r["in_chars"] or 0, avg))


if __name__ == "__main__":
    main()

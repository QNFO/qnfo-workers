#!/usr/bin/env python3
"""ATTACH-LIFECYCLE-CUSTOM-DOMAIN-1 (agent_issues #1517), 2026-09-30.

WHY THIS EXISTS
---------------
agent_issues #1517 reports https://lifecycle.qnfo.org/run/metrics-refresh -> HTTP 530
"error code: 1016" while the workers.dev origin answers 200.

Measured state 2026-09-30T19:5xZ, from an EXTERNAL host (deliberately NOT a same-zone
worker fetch -- a Worker cannot reliably probe a hostname in its own zone, which is what
produced the misleading 530 in the first place):

    DoH  A/AAAA/CNAME lifecycle.qnfo.org -> NODATA (no Answer section, qnfo.org SOA)
    curl https://lifecycle.qnfo.org/health          -> exit 000 (no DNS at all)
    curl https://qnfo-lifecycle.q08.workers.dev/health -> 200
         {"status":"ok","worker":"qnfo-lifecycle","version":"1.6.5-metric-undefined-class"}

Control hostnames in the same zone resolve to the Cloudflare proxy:
    fleet.qnfo.org 188.114.97.6 / 188.114.96.6 ; ops / ai / ideas / www -> 188.114.9x.x

So the worker is HEALTHY and the public hostname has NO DNS RECORD AT ALL. The 530/1016
is the transport artifact of a same-zone fetch against a hostname absent from the zone --
not an origin fault. The defect is a missing custom-domain attachment.

WHAT IT DOES
------------
Attaches a Workers custom domain lifecycle.qnfo.org -> qnfo-lifecycle. Cloudflare creates
the proxied DNS record as part of the custom-domain attach, which is why this is the right
primitive here rather than a hand-written A/AAAA record (a hand-written record would not
route to the Worker).

REVERSIBILITY
-------------
Additive and reversible: DELETE /accounts/{acct}/workers/domains/{id} removes both the
attachment and the record it created. No existing hostname is touched.

FAIL-CLOSED / IDEMPOTENT
------------------------
  * already attached        -> exit 0, no write
  * token lacks Zone:Read / Zone:Workers Routes, or the zone is not in this account
                            -> exit 1 printing the exact Cloudflare error body; no partial
                               state is left behind
  * post-attach verification (external 200 on /health containing "status":"ok") must pass
    within 120s or the job fails. The script never reports success for an attach it could
    not observe.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ACCT = (os.environ.get("CF_ACCOUNT_ID")
        or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
        or "edb167b78c9fb901ea5bca3ce58ccc4b")
TOK = os.environ.get("CLOUDFLARE_API_TOKEN")
ZONE_NAME = "qnfo.org"
HOSTNAME = "lifecycle.qnfo.org"
SERVICE = "qnfo-lifecycle"
ENVIRONMENT = "production"
UA = "qnfo-ops-attach-domain/1.0"
API = "https://api.cloudflare.com/client/v4"


def req(method, path, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method)
    r.add_header("Authorization", "Bearer " + TOK)
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", UA)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:800]}
    except Exception as e:
        return 0, {"raw": "%s: %s" % (type(e).__name__, e)}


def main():
    if not TOK:
        print("FAIL: CLOUDFLARE_API_TOKEN is not set")
        return 1

    # 1. idempotence -- never re-attach what is already attached
    st, j = req("GET", "/accounts/%s/workers/domains" % ACCT)
    if st != 200 or not j.get("success"):
        print("FAIL: cannot list workers/domains http=%s body=%s" % (st, json.dumps(j)[:800]))
        return 1
    for d in (j.get("result") or []):
        if d.get("hostname") == HOSTNAME:
            print("ALREADY ATTACHED: %s -> %s (id=%s)"
                  % (HOSTNAME, d.get("service"), d.get("id")))
            return verify()

    # 2. zone lookup (needs Zone:Read on the token)
    st, j = req("GET", "/zones?name=%s" % ZONE_NAME)
    if st != 200 or not j.get("success") or not j.get("result"):
        print("FAIL: zone lookup http=%s body=%s -- token likely lacks Zone:Read"
              % (st, json.dumps(j)[:800]))
        return 1
    zone_id = j["result"][0]["id"]
    print("zone %s = %s" % (ZONE_NAME, zone_id))

    # 3. attach
    st, j = req("POST", "/accounts/%s/workers/domains" % ACCT, {
        "zone_id": zone_id,
        "hostname": HOSTNAME,
        "service": SERVICE,
        "environment": ENVIRONMENT,
    })
    if st not in (200, 201) or not j.get("success"):
        print("FAIL: attach http=%s body=%s" % (st, json.dumps(j)[:800]))
        return 1
    print("ATTACHED: %s" % json.dumps(j.get("result"))[:500])
    return verify()


def verify():
    for i in range(1, 13):
        try:
            r = urllib.request.Request("https://%s/health" % HOSTNAME,
                                       headers={"User-Agent": UA})
            with urllib.request.urlopen(r, timeout=20) as resp:
                body = resp.read().decode(errors="replace")
                if resp.status == 200 and '"status":"ok"' in body:
                    print("VERIFIED: %s/health -> 200 %s" % (HOSTNAME, body[:260]))
                    ledger(body)
                    return 0
                print("verify attempt %d: http=%s body=%s" % (i, resp.status, body[:160]))
        except Exception as e:
            print("verify attempt %d: %s %s" % (i, type(e).__name__, e))
        time.sleep(10)
    print("FAIL: attach reported success but external /health never returned 200 in 120s")
    return 1


def ledger(body):
    """Best-effort audit row. Never gates the fix."""
    dbid = os.environ.get("CF_AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
    sql = ("INSERT INTO deployment_history "
           "(resource_type,resource_name,action,version_id,deployed_by,deployed_at,status,notes) "
           "VALUES ('custom_domain',?, 'attach','workers/domains',"
           "'scripts/attach-lifecycle-custom-domain.py',datetime('now'),'success',?)")
    st, j = req("POST", "/accounts/%s/d1/database/%s/query" % (ACCT, dbid),
                {"sql": sql, "params": [HOSTNAME,
                                        "ATTACH-LIFECYCLE-CUSTOM-DOMAIN-1 (#1517); verified %s"
                                        % body[:160]]})
    print("ledger http=%s ok=%s" % (st, j.get("success")))


if __name__ == "__main__":
    sys.exit(main())

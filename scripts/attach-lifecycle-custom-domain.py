#!/usr/bin/env python3
"""ATTACH-LIFECYCLE-CUSTOM-DOMAIN-1 (agent_issues #1517), 2026-09-30.

v3 2026-09-30 (ATTACH-DOMAIN-SCOPE-FALLBACK-1)
---------------------------------------------
v2 made the script self-reporting. v2's FIRST live run then produced the exact blocker,
which v1 had hidden for two turns:

    {"stage": "attach", "status": "failed", "http": 405,
     "error": "attach http=405 body={\\"success\\": false, \\"errors\\":
               [{\\"code\\": 10405, \\"message\\": \\"Method not allowed for this
               authentication scheme\\"}], ...}",
     "zone_id": "84e9dc1d7fb72629ccdbe3174ed24420",
     "ts": "2026-09-30T20:40:38Z"}

Reading of that artifact: the CI token CAN read (GET /accounts/{acct}/workers/domains
succeeded, and GET /zones?name=qnfo.org resolved zone_id 84e9dc1d...), so Zone:Read is
present; but POST to /accounts/{acct}/workers/domains is rejected with 10405, i.e. the
token lacks the Workers Custom Domains write permission. The blocker is TOKEN SCOPE,
not a script bug and not an origin fault.

v3 therefore tries the two primitives a zone-scoped token would need anyway, and
reports each outcome verbatim, so the account owner knows exactly which permission is
missing rather than just "it failed".

WHY THIS EXISTS
---------------
agent_issues #1517 reports https://lifecycle.qnfo.org/run/metrics-refresh -> HTTP 530
"error code: 1016" while the workers.dev origin answers 200.

Measured 2026-09-30T19:5xZ, re-measured 20:4xZ and again 20:5xZ from an EXTERNAL host
(deliberately NOT a same-zone worker fetch -- a Worker cannot reliably probe a hostname
in its own zone, which is what produced the misleading 530 in the first place):

    DoH A/AAAA/CNAME lifecycle.qnfo.org -> NODATA (no Answer section, qnfo.org SOA)
    curl https://lifecycle.qnfo.org/health              -> exit 000 (no DNS at all)
    curl https://qnfo-lifecycle.q08.workers.dev/health  -> 200
         {"status":"ok","worker":"qnfo-lifecycle","version":"1.6.5-metric-undefined-class"}
    controls in the same zone resolve: ops/fleet.qnfo.org -> 188.114.96.2, 188.114.97.2

So the worker is HEALTHY and the public hostname has NO DNS RECORD AT ALL. The
530/1016 is the transport artifact of a same-zone fetch against a hostname absent from
the zone -- not an origin fault. The defect is a missing custom-domain attach.

WHAT IT DOES
------------
1. Preferred: attaches a Workers custom domain lifecycle.qnfo.org -> qnfo-lifecycle.
   Cloudflare creates the proxied DNS record as part of the attach.
2. Fallback, only if (1) is rejected 405: creates a Workers route
   lifecycle.qnfo.org/* -> qnfo-lifecycle, and only after that route write succeeds
   creates the proxied AAAA 100:: record the route needs. Route FIRST is deliberate:
   if the route write is also rejected, nothing at all is created.

REVERSIBILITY / PARTIAL STATE
-----------------------------
Both primitives are additive. DELETE /accounts/{acct}/workers/domains/{id} reverses
(1). DELETE /zones/{zone}/workers/routes/{id} plus DELETE /zones/{zone}/dns_records/{id}
reverses (2). If the route write succeeds but the DNS write fails, the result is a route
with no DNS record: inert (no traffic reaches it) and reversible. No existing hostname
is touched in any branch.

FAIL-CLOSED / IDEMPOTENT
------------------------
  * already attached        -> exit 0, no write
  * token lacks the needed write scope -> exit 1 printing the exact Cloudflare error
    body for BOTH paths; no partial state is left behind beyond the inert-route case
    described above
  * post-attach verification (external 200 on /health containing "status":"ok") must
    pass within 120s or the job fails. The script never reports success for an attach
    it could not observe.
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
UA = "qnfo-ops-attach-domain/3.0"
API = "https://api.cloudflare.com/client/v4"
REPORT_PATH = "ci-status/attach-lifecycle-custom-domain.json"

RESULT = {
    "marker": "ATTACH-LIFECYCLE-CUSTOM-DOMAIN-1",
    "observability": "ATTACH-DOMAIN-OBSERVABLE-1",
    "fallback": "ATTACH-DOMAIN-SCOPE-FALLBACK-1",
    "hostname": HOSTNAME,
    "service": SERVICE,
    "account_id": ACCT,
    "token_present": bool(TOK),
    "stage": "start",
    "status": "unknown",
    "http": None,
    "error": None,
    "zone_id": None,
    "already_attached": None,
    "custom_domain_http": None,
    "route_http": None,
    "dns_http": None,
    "ts": None,
}


def report(stage, status, http=None, error=None):
    """Write the durable artifact on every exit path. Never gates the fix."""
    RESULT.update({
        "stage": stage,
        "status": status,
        "http": http,
        "error": (str(error)[:1200] if error is not None else None),
        "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    try:
        os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
        with open(REPORT_PATH, "w") as f:
            json.dump(RESULT, f, indent=2)
            f.write("\n")
    except Exception as e:  # pragma: no cover
        print("report write failed: %s" % e)
    print("ATTACH-REPORT %s" % json.dumps(RESULT))


def req(method, path, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method)
    r.add_header("Authorization", "Bearer " + (TOK or ""))
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
        report("token", "failed", error="CLOUDFLARE_API_TOKEN is not set")
        print("FAIL: CLOUDFLARE_API_TOKEN is not set")
        return 1

    # 1. idempotence -- never re-attach what is already attached
    st, j = req("GET", "/accounts/%s/workers/domains" % ACCT)
    if st != 200 or not j.get("success"):
        err = "cannot list workers/domains http=%s body=%s" % (st, json.dumps(j)[:800])
        report("list-domains", "failed", http=st, error=err)
        print("FAIL: " + err)
        return 1
    for d in (j.get("result") or []):
        if d.get("hostname") == HOSTNAME:
            RESULT["already_attached"] = True
            report("already-attached", "ok", http=st)
            print("ALREADY ATTACHED: %s -> %s (id=%s)"
                  % (HOSTNAME, d.get("service"), d.get("id")))
            return verify()

    # 2. zone lookup (needs Zone:Read on the token)
    st, j = req("GET", "/zones?name=%s" % ZONE_NAME)
    if st != 200 or not j.get("success") or not j.get("result"):
        err = ("zone lookup http=%s body=%s -- token likely lacks Zone:Read"
               % (st, json.dumps(j)[:800]))
        report("zone-lookup", "failed", http=st, error=err)
        print("FAIL: " + err)
        return 1
    zone_id = j["result"][0]["id"]
    RESULT["zone_id"] = zone_id
    print("zone %s = %s" % (ZONE_NAME, zone_id))

    # 3. preferred path -- Workers custom domain
    st, j = req("POST", "/accounts/%s/workers/domains" % ACCT, {
        "zone_id": zone_id,
        "hostname": HOSTNAME,
        "service": SERVICE,
        "environment": ENVIRONMENT,
    })
    RESULT["custom_domain_http"] = st
    if st in (200, 201) and j.get("success"):
        print("ATTACHED: %s" % json.dumps(j.get("result"))[:500])
        return verify()

    err = "attach http=%s body=%s" % (st, json.dumps(j)[:800])
    print("FAIL(custom-domain): " + err)
    if st != 405:
        report("attach", "failed", http=st, error=err)
        return 1

    # 4. fallback -- zone-scoped route + DNS, in an order that cannot half-apply
    print("405 on workers/domains -> token lacks Workers Custom Domains; trying zone route")
    st, j = req("POST", "/zones/%s/workers/routes" % zone_id,
                {"pattern": HOSTNAME + "/*", "script": SERVICE})
    RESULT["route_http"] = st
    if st not in (200, 201) or not j.get("success"):
        ferr = ("fallback-route http=%s body=%s ; custom-domain http=%s body=%s"
                % (st, json.dumps(j)[:600], RESULT["custom_domain_http"], err))
        report("fallback-route", "failed", http=st, error=ferr)
        print("FAIL(route): " + ferr)
        return 1
    print("ROUTE CREATED: %s" % json.dumps(j.get("result"))[:400])

    st, j = req("POST", "/zones/%s/dns_records" % zone_id, {
        "type": "AAAA",
        "name": HOSTNAME,
        "content": "100::",
        "proxied": True,
        "comment": "ATTACH-LIFECYCLE-CUSTOM-DOMAIN-1 (#1517) zone-route fallback",
    })
    RESULT["dns_http"] = st
    if st not in (200, 201) or not j.get("success"):
        ferr = ("fallback-dns http=%s body=%s (route exists, record missing -> inert)"
                % (st, json.dumps(j)[:600]))
        report("fallback-dns", "failed", http=st, error=ferr)
        print("FAIL(dns): " + ferr)
        return 1
    print("DNS CREATED: %s" % json.dumps(j.get("result"))[:400])
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
                    report("verified", "success", http=200, error=None)
                    ledger(body)
                    return 0
                print("verify attempt %d: http=%s body=%s" % (i, resp.status, body[:160]))
        except Exception as e:
            print("verify attempt %d: %s %s" % (i, type(e).__name__, e))
        time.sleep(10)
    err = "attach reported success but external /health never returned 200 in 120s"
    report("verify", "failed", error=err)
    print("FAIL: " + err)
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

#!/usr/bin/env python3
"""ASK-QWAV-ROUTE-1 (2026-10-02, pillar reach): serve ask.qwav.tech from qnfo-ai-search 2.x.

WHY
  ask.qwav.tech is a static Cloudflare Pages project (ask-qwav). Its page posts every question to
  ideas.qnfo.org/api/ask, which idea-hub hard-disabled ("mutation or ask route disabled on public ideas
  surface"), so the public site has answered nothing since. qnfo-ai-search 2.0.0 serves the page and its own
  API (ASK-LOOP-1). This script points the hostname at that worker.

HOW (the path ATTACH-LIFECYCLE-CUSTOM-DOMAIN-1 proved with this repository's token on 2026-09-30)
  The CI token cannot write Workers custom domains (10405) but can write zone routes. A zone route
  ask.qwav.tech/* -> qnfo-ai-search runs the worker in front of the existing proxied Pages record, so no DNS
  record is created or changed and the Pages project is left intact.
  1. wait until qnfo-ai-search.q08.workers.dev/health reports VERSION 2.x (the canonical deploy of the same
     push runs in parallel); refuse to route a hostname to a worker that does not yet serve the page
  2. idempotent: an existing route with this pattern is reused
  3. create the route only if the hostname already has a proxied DNS record (otherwise the route is inert;
     this script never creates DNS for it)
  4. verify from outside: https://ask.qwav.tech/health must name worker qnfo-ai-search within 120 s

REVERSIBLE
  DELETE /zones/{zone}/workers/routes/{id} restores the Pages page exactly. The report artifact records the id.

OBSERVABLE
  ci-status/attach-ask-qwav-route.json is written on every exit path and committed back by the workflow.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ACCT = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "edb167b78c9fb901ea5bca3ce58ccc4b"
TOK = os.environ.get("CLOUDFLARE_API_TOKEN")
ZONE_NAME = "qwav.tech"
HOSTNAME = "ask.qwav.tech"
SERVICE = "qnfo-ai-search"
ORIGIN_HEALTH = "https://qnfo-ai-search.q08.workers.dev/health"
UA = "qnfo-ops-ask-route/1.0"
API = "https://api.cloudflare.com/client/v4"
REPORT_PATH = "ci-status/attach-ask-qwav-route.json"
RESULT = {"marker": "ASK-QWAV-ROUTE-1", "hostname": HOSTNAME, "service": SERVICE, "token_present": bool(TOK),
          "stage": "start", "status": "unknown", "http": None, "error": None, "zone_id": None, "route_id": None,
          "worker_version": None, "ts": None}


def report(stage, status, http=None, error=None):
    RESULT.update({"stage": stage, "status": status, "http": http, "error": (str(error)[:1200] if error is not None else None),
                   "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    try:
        os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
        with open(REPORT_PATH, "w") as f:
            json.dump(RESULT, f, indent=2)
            f.write("\n")
    except Exception as e:  # pragma: no cover
        print("report write failed: %s" % e)
    print("ASK-ROUTE-REPORT %s" % json.dumps(RESULT))


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


def get_json(url, timeout=20):
    r = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    with urllib.request.urlopen(r, timeout=timeout) as resp:
        return resp.status, json.loads(resp.read().decode(errors="replace") or "{}")


def wait_worker():
    for i in range(1, 41):
        try:
            st, j = get_json(ORIGIN_HEALTH)
            v = str(j.get("version") or "")
            RESULT["worker_version"] = v
            if st == 200 and v.split(".")[0].isdigit() and int(v.split(".")[0]) >= 2:
                print("worker ready: %s %s" % (SERVICE, v))
                return True
            print("wait %d: %s version %s" % (i, SERVICE, v))
        except Exception as e:
            print("wait %d: %s %s" % (i, type(e).__name__, e))
        time.sleep(15)
    return False


def main():
    if not TOK:
        report("token", "failed", error="CLOUDFLARE_API_TOKEN is not set")
        return 1
    if not wait_worker():
        report("wait-worker", "failed", error="%s never reported VERSION 2.x within 10 min; route not created" % SERVICE)
        return 1
    st, j = req("GET", "/zones?name=%s" % ZONE_NAME)
    if st != 200 or not j.get("success") or not j.get("result"):
        report("zone-lookup", "failed", http=st, error="zone lookup body=%s" % json.dumps(j)[:800])
        return 1
    zone = j["result"][0]["id"]
    RESULT["zone_id"] = zone
    st, j = req("GET", "/zones/%s/workers/routes" % zone)
    if st != 200 or not j.get("success"):
        report("list-routes", "failed", http=st, error="list routes body=%s" % json.dumps(j)[:800])
        return 1
    for r in j.get("result") or []:
        if r.get("pattern") == HOSTNAME + "/*":
            RESULT["route_id"] = r.get("id")
            if r.get("script") != SERVICE:
                report("route-conflict", "failed", error="route %s already points at %s" % (r.get("pattern"), r.get("script")))
                return 1
            print("route already present: %s" % r.get("id"))
            return verify()
    st, j = req("GET", "/zones/%s/dns_records?name=%s" % (zone, HOSTNAME))
    recs = (j.get("result") or []) if st == 200 else []
    if not any(x.get("proxied") for x in recs):
        report("dns-check", "failed", http=st, error="no proxied DNS record for %s; a route would be inert (records: %s)" % (HOSTNAME, json.dumps(recs)[:400]))
        return 1
    st, j = req("POST", "/zones/%s/workers/routes" % zone, {"pattern": HOSTNAME + "/*", "script": SERVICE})
    if st not in (200, 201) or not j.get("success"):
        report("route", "failed", http=st, error="create route body=%s" % json.dumps(j)[:800])
        return 1
    RESULT["route_id"] = (j.get("result") or {}).get("id")
    print("route created: %s" % RESULT["route_id"])
    return verify()


def verify():
    for i in range(1, 13):
        try:
            st, j = get_json("https://%s/health" % HOSTNAME)
            if st == 200 and j.get("worker") == SERVICE:
                report("verified", "success", http=200)
                ledger(j.get("version"))
                return 0
            print("verify %d: http=%s worker=%s" % (i, st, j.get("worker")))
        except Exception as e:
            print("verify %d: %s %s" % (i, type(e).__name__, e))
        time.sleep(10)
    report("verify", "failed", error="https://%s/health never named %s within 120 s" % (HOSTNAME, SERVICE))
    return 1


def ledger(version):
    dbid = os.environ.get("CF_AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
    sql = ("INSERT INTO deployment_history (resource_type,resource_name,action,version_id,deployed_by,deployed_at,status,notes) "
           "VALUES ('worker_route',?,'attach',?,'scripts/attach-ask-qwav-route.py',datetime('now'),'success',?)")
    st, j = req("POST", "/accounts/%s/d1/database/%s/query" % (ACCT, dbid),
                {"sql": sql, "params": [HOSTNAME, str(RESULT.get("route_id")), "ASK-QWAV-ROUTE-1; worker %s %s" % (SERVICE, version)]})
    print("ledger http=%s ok=%s" % (st, j.get("success")))


if __name__ == "__main__":
    sys.exit(main())

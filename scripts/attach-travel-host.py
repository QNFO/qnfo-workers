#!/usr/bin/env python3
"""TRAVEL-HOST-1 (2026-10-19, pillar personal): serve the travel planner at travel.q08.org.

WHY
  Owner directive 2026-10-19: personal services live on an easy q08.org subdomain (research on qnfo.org, quantum computing
  on qwav.org). personal-companion 1.33.0 (TRAVEL-CHAT-1) serves the travel chat at /travel and sends the bare
  travel.q08.org front page there.

HOW (the zone-route path of SURFACE-ROUTES-1, which this repository's token is proven to write)
  1. wait until personal-companion /health reports VERSION >= 1.33 (the canonical deploy of the same push runs in parallel)
  2. idempotent: a route travel.q08.org/* -> personal-companion is reused; one pointing at another script is a conflict
  3. no address record: create a proxied AAAA 100:: (originless; the route answers every request)
  4. verify from outside: https://travel.q08.org/health names VERSION >= 1.33 and /travel answers the sign-in page;
     a route or record created by this run that fails verification is deleted again

REVERSIBLE
  DELETE /zones/{zone}/workers/routes/{route_id} and DELETE /zones/{zone}/dns_records/{dns_created} from the report.

OBSERVABLE
  ci-status/attach-travel-host.json is written on every exit path and committed back by the workflow.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

TOK = os.environ.get("CLOUDFLARE_API_TOKEN")
ZONE_NAME = "q08.org"
HOST = "travel.q08.org"
SERVICE = "personal-companion"
ORIGIN_HEALTH = "https://personal-companion.q08.workers.dev/health"
MIN_VERSION = (1, 33)
API = "https://api.cloudflare.com/client/v4"
UA = "qnfo-travel-host/1.0"
REPORT_PATH = "ci-status/attach-travel-host.json"
RESULT = {"marker": "TRAVEL-HOST-1", "host": HOST, "service": SERVICE, "token_present": bool(TOK), "route_id": None,
          "dns_created": None, "status": "unknown", "detail": None, "version": None, "ts": None}


def report(status, detail=None):
    RESULT.update({"status": status, "detail": (str(detail)[:1200] if detail is not None else None),
                   "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w") as f:
        json.dump(RESULT, f, indent=2)
        f.write("\n")
    print("TRAVEL-HOST-REPORT %s" % json.dumps(RESULT))


def req(method, path, body=None):
    r = urllib.request.Request(API + path, data=json.dumps(body).encode() if body is not None else None, method=method)
    r.add_header("Authorization", "Bearer " + (TOK or ""))
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", UA)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300]}


def get(url):
    r = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, resp.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode(errors="replace")
    except (urllib.error.URLError, OSError) as e:
        return 0, str(e)[:160]


def version_ok(v):
    try:
        parts = tuple(int(x) for x in str(v).split("-")[0].split(".")[:2])
        return parts >= MIN_VERSION
    except Exception:
        return False


def health_version(url):
    st, body = get(url)
    try:
        return json.loads(body).get("version") if st == 200 else None
    except Exception:
        return None


def wait_deploy():
    for i in range(50):
        v = health_version(ORIGIN_HEALTH)
        RESULT["version"] = v
        if version_ok(v):
            print("personal-companion ready: %s" % v)
            return True
        print("wait %d: %s" % (i, v))
        time.sleep(30)
    return False


def verify():
    for i in range(30):
        v = health_version("https://%s/health" % HOST)
        st, body = get("https://%s/travel" % HOST)
        if version_ok(v) and st == 401 and "Email me a code" in body:
            print("verified: %s /health %s, /travel sign-in page" % (HOST, v))
            return True
        print("verify %d: health=%s travel_http=%s" % (i, v, st))
        time.sleep(20)
    return False


def rollback(zone):
    if RESULT.get("route_created"):
        print("rollback route", req("DELETE", "/zones/%s/workers/routes/%s" % (zone, RESULT["route_id"]))[0])
    if RESULT.get("dns_created"):
        print("rollback dns", req("DELETE", "/zones/%s/dns_records/%s" % (zone, RESULT["dns_created"]))[0])


def main():
    if not TOK:
        report("failed", "CLOUDFLARE_API_TOKEN missing")
        return 1
    if not wait_deploy():
        report("failed", "personal-companion did not reach %s.%s" % MIN_VERSION)
        return 1
    st, j = req("GET", "/zones?name=%s" % ZONE_NAME)
    if st != 200 or not j.get("result"):
        report("failed", "zone lookup http=%s body=%s" % (st, json.dumps(j)[:300]))
        return 1
    zone = j["result"][0]["id"]
    st, j = req("GET", "/zones/%s/workers/routes" % zone)
    if st != 200:
        report("failed", "list routes http=%s body=%s" % (st, json.dumps(j)[:300]))
        return 1
    for r in j.get("result") or []:
        if r.get("pattern") == HOST + "/*":
            RESULT["route_id"] = r.get("id")
            if r.get("script") != SERVICE:
                report("conflict", "route already points at %s" % r.get("script"))
                return 1
    st, j = req("GET", "/zones/%s/dns_records?name=%s" % (zone, HOST))
    addr = [x for x in (j.get("result") or []) if x.get("type") in ("CNAME", "A", "AAAA")] if st == 200 else []
    if addr and not any(x.get("proxied") for x in addr):
        report("failed", "an unproxied address record exists for %s; left alone: %s" % (HOST, json.dumps(addr)[:300]))
        return 1
    if not addr:
        st, cj = req("POST", "/zones/%s/dns_records" % zone, {"type": "AAAA", "name": HOST, "content": "100::", "proxied": True, "ttl": 1,
                                                          "comment": "TRAVEL-HOST-1: originless record; route to personal-companion"})
        if st not in (200, 201) or not cj.get("success"):
            report("failed", "create DNS record http=%s body=%s" % (st, json.dumps(cj)[:300]))
            return 1
        RESULT["dns_created"] = (cj.get("result") or {}).get("id")
        print("dns created %s" % RESULT["dns_created"])
    if not RESULT["route_id"]:
        st, rj = req("POST", "/zones/%s/workers/routes" % zone, {"pattern": HOST + "/*", "script": SERVICE})
        if st not in (200, 201) or not rj.get("success"):
            rollback(zone)
            report("failed", "create route http=%s body=%s" % (st, json.dumps(rj)[:300]))
            return 1
        RESULT["route_id"] = (rj.get("result") or {}).get("id")
        RESULT["route_created"] = True
        print("route created %s" % RESULT["route_id"])
    if not verify():
        rollback(zone)
        report("failed", "https://%s did not serve personal-companion's travel page; created items rolled back" % HOST)
        return 1
    report("ok")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # the report is written on every exit path
        report("failed", "%s: %s" % (type(e).__name__, e))
        sys.exit(1)

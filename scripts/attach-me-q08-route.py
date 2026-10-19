#!/usr/bin/env python3
"""COMPANION-DOMAIN-1 (2026-10-19, pillar personal): serve the companion at me.q08.org from personal-api.

Owner, 2026-10-19: "for personal shit, use q08.org ... Make it friendly and easy for me to remember." personal-api 4.14.0
redirects https://me.q08.org/ to /companion; this script gives the host its zone route (the path SURFACE-ROUTES-1 proved
with the repository token):
  1. wait until https://personal-api.q08.workers.dev/health reports VERSION >= 4.14 (the canonical deploy of the same push);
  2. if no address record exists for me.q08.org, create a proxied originless AAAA 100:: record;
  3. create the zone route me.q08.org/* -> personal-api (idempotent: an existing route to personal-api is kept);
  4. verify from outside the account that https://me.q08.org/health names personal-api.
A failed verification deletes the route and the record this run created, so the host is never left half-built.
Reversible by hand: DELETE /zones/{zone}/workers/routes/{route_id} and /dns_records/{dns_created} from the report.
Writes ci-status/attach-me-q08-route.json.
"""
import json, os, sys, time, urllib.error, urllib.request

ZONE, HOST, SERVICE, MIN_VERSION = "q08.org", "me.q08.org", "personal-api", (4, 14)
TOK = os.environ.get("CLOUDFLARE_API_TOKEN")
API = "https://api.cloudflare.com/client/v4"
UA = "qnfo-ci-attach-me-q08-route/1.0"
REPORT_PATH = "ci-status/attach-me-q08-route.json"
R = {"marker": "COMPANION-DOMAIN-1", "host": HOST, "service": SERVICE, "token_present": bool(TOK), "stage": "start",
     "status": "unknown", "error": None, "worker_version": None, "route_id": None, "dns_created": None, "verified": False, "ts": None}


def report(stage, status, error=None):
    R.update(stage=stage, status=status, error=(str(error)[:1200] if error is not None else None), ts=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w") as f:
        json.dump(R, f, indent=2)
        f.write("\n")
    print("ME-Q08-ROUTE-REPORT %s" % json.dumps(R))


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
            return e.code, {"raw": raw[:800]}
    except Exception as e:
        return 0, {"raw": "%s: %s" % (type(e).__name__, e)}


def health(url):
    try:
        r = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode(errors="replace") or "{}")
    except urllib.error.HTTPError as e:
        return e.code, {}
    except Exception as e:
        return 0, {"error": str(e)[:200]}


def version_ok(v):
    try:
        return tuple(int(x) for x in str(v).split("-")[0].split(".")[:2]) >= MIN_VERSION
    except Exception:
        return False


def main():
    if not TOK:
        report("token", "failed", "CLOUDFLARE_API_TOKEN is not set")
        return 1
    for _ in range(60):
        st, j = health("https://%s.q08.workers.dev/health" % SERVICE)
        R["worker_version"] = j.get("version")
        if st == 200 and version_ok(j.get("version")):
            break
        time.sleep(10)
    else:
        report("wait-worker", "failed", "%s never reported VERSION >= %s within 10 min; nothing created" % (SERVICE, ".".join(map(str, MIN_VERSION))))
        return 1
    st, j = req("GET", "/zones?name=" + ZONE)
    if st != 200 or not j.get("result"):
        report("zone", "failed", "zone lookup http=%s body=%s" % (st, json.dumps(j)[:400]))
        return 1
    zone = j["result"][0]["id"]
    st, j = req("GET", "/zones/%s/workers/routes" % zone)
    if st != 200:
        report("routes", "failed", "list routes http=%s body=%s" % (st, json.dumps(j)[:400]))
        return 1
    for r in j.get("result") or []:
        if r.get("pattern") == HOST + "/*":
            if r.get("script") != SERVICE:
                report("routes", "conflict", "route already points at %s" % r.get("script"))
                return 1
            R["route_id"] = r.get("id")
    st, j = req("GET", "/zones/%s/dns_records?name=%s" % (zone, HOST))
    addr = [x for x in (j.get("result") or []) if x.get("type") in ("A", "AAAA", "CNAME")] if st == 200 else []
    if addr and not any(x.get("proxied") for x in addr):
        report("dns", "failed", "an unproxied address record exists for %s; a route would be inert, nothing changed" % HOST)
        return 1
    if not addr:
        st, cj = req("POST", "/zones/%s/dns_records" % zone, {"type": "AAAA", "name": HOST, "content": "100::", "proxied": True, "ttl": 1,
                                                               "comment": "COMPANION-DOMAIN-1: originless record for the personal-api route"})
        if st not in (200, 201) or not cj.get("success"):
            report("dns", "failed", "create record http=%s body=%s" % (st, json.dumps(cj)[:400]))
            return 1
        R["dns_created"] = (cj.get("result") or {}).get("id")
    created_route = False
    if not R["route_id"]:
        st, rj = req("POST", "/zones/%s/workers/routes" % zone, {"pattern": HOST + "/*", "script": SERVICE})
        if st not in (200, 201) or not rj.get("success"):
            if R["dns_created"]:
                req("DELETE", "/zones/%s/dns_records/%s" % (zone, R["dns_created"]))
            report("route", "failed", "create route http=%s body=%s" % (st, json.dumps(rj)[:400]))
            return 1
        R["route_id"] = (rj.get("result") or {}).get("id")
        created_route = True
    for i in range(42):
        st, j = health("https://%s/health" % HOST)
        if st == 200 and j.get("worker") == SERVICE:
            R["verified"] = True
            report("verify", "ok")
            return 0
        print("verify %d: http=%s worker=%s" % (i + 1, st, j.get("worker")))
        time.sleep(10)
    if created_route:
        req("DELETE", "/zones/%s/workers/routes/%s" % (zone, R["route_id"]))
    if R["dns_created"]:
        req("DELETE", "/zones/%s/dns_records/%s" % (zone, R["dns_created"]))
    report("verify", "failed", "https://%s/health never named %s within 7 min; this run's route and record were removed" % (HOST, SERVICE))
    return 1


if __name__ == "__main__":
    sys.exit(main())

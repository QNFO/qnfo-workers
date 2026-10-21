#!/usr/bin/env python3
"""MIND-Q08-1 (2026-10-21): serve the inside reading surface at mind.q08.org from q08-mind.

Same fail-closed, self-triggering shape as scripts/attach-me-q08-route.py (COMPANION-DOMAIN-1), which is the proven
path for a q08.org host in this repository:
  1. wait until https://q08-mind.q08.workers.dev/health reports the worker and VERSION >= 1.0 (the canonical deploy
     of the same push);
  2. if no address record exists for mind.q08.org, create a proxied originless AAAA 100:: record;
  3. create the zone route mind.q08.org/* -> q08-mind (idempotent: an existing route to q08-mind is kept);
  4. verify from outside the account that https://mind.q08.org/health names q08-mind.
A failed verification deletes the route and the record this run created, so the host is never left half-built.
Reversible by hand: DELETE /zones/{zone}/workers/routes/{route_id} and /dns_records/{dns_created} from the report.
Writes ci-status/attach-mind-q08-route.json.
"""
import json, os, sys, time, urllib.error, urllib.request

ZONE, HOST, SERVICE, MIN_VERSION = "q08.org", "mind.q08.org", "q08-mind", (1, 0)
TOK = os.environ.get("CLOUDFLARE_API_TOKEN")
API = "https://api.cloudflare.com/client/v4"
UA = "qnfo-ci-attach-mind-q08-route/1.0"
REPORT_PATH = "ci-status/attach-mind-q08-route.json"
R = {"marker": "MIND-Q08-1", "host": HOST, "service": SERVICE, "token_present": bool(TOK), "stage": "start",
     "status": "unknown", "error": None, "worker_version": None, "route_id": None, "dns_created": None, "verified": False, "ts": None}


def report(stage, status, error=None):
    R.update(stage=stage, status=status, error=(str(error)[:1200] if error is not None else None), ts=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w") as f:
        json.dump(R, f, indent=2)
        f.write("\n")
    print("MIND-Q08-ROUTE-REPORT %s" % json.dumps(R))


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
    # PATH 1: the canonical deploy of the same push. 20 min covers a queued deploy-gate lock.
    for _ in range(120):
        st, j = health("https://%s.q08.workers.dev/health" % SERVICE)
        R["worker_version"] = j.get("version")
        if st == 200 and version_ok(j.get("version")):
            break
        time.sleep(10)
    else:
        report("deploy", "failed", "https://%s.q08.workers.dev/health never reported version >= %s (last http=%s version=%s body=%s)"
               % (SERVICE, ".".join(str(x) for x in MIN_VERSION), st, R["worker_version"], json.dumps(j)[:300]))
        return 1

    st, zj = req("GET", "/zones?name=%s" % ZONE)
    zones = (zj.get("result") or []) if zj.get("success") else []
    if not zones:
        report("zone", "failed", "zone lookup http=%s body=%s" % (st, json.dumps(zj)[:400]))
        return 1
    zone = zones[0]["id"]

    st, rj = req("GET", "/zones/%s/workers/routes" % zone)
    for rt in (rj.get("result") or []) if rj.get("success") else []:
        if rt.get("pattern") == HOST + "/*" and rt.get("script") == SERVICE:
            R["route_id"] = rt.get("id")

    st, dj = req("GET", "/zones/%s/dns_records?name=%s" % (zone, HOST))
    existing = (dj.get("result") or []) if dj.get("success") else []
    if not existing:
        st, cj = req("POST", "/zones/%s/dns_records" % zone, {"type": "AAAA", "name": HOST, "content": "100::",
                                                               "proxied": True, "ttl": 1,
                                                               "comment": "MIND-Q08-1: originless record for the q08-mind route"})
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
    # PATH 2: verify from outside the account that the host serves this worker, with real content.
    for i in range(42):
        st, j = health("https://%s/health" % HOST)
        if st == 200 and j.get("worker") == SERVICE:
            st2, _ = health("https://%s/api/entries.json" % HOST)
            if st2 != 200:
                print("verify %d: host health ok but api http=%s" % (i + 1, st2))
                time.sleep(10)
                continue
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

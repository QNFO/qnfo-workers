#!/usr/bin/env python3
"""MIND-Q08-2 (2026-10-21): serve the inside reading surface at mind.q08.org from q08-mind.

Fail-closed, idempotent, self-triggering (the attach-mind-q08-route workflow runs this file on push).

MIND-Q08-2 changes PATH 1. MIND-Q08-1 waited for https://q08-mind.q08.workers.dev/health, but workers_dev is not
enabled on q08-mind, so that URL returns 404 forever and the run always died at stage "deploy" after 20 minutes: the
zone route was never created and mind.q08.org answered 530 (origin DNS error, record present, no worker bound).
PATH 1 now asks the Cloudflare API whether the script exists (authoritative, independent of any hostname), and this
run additionally enables the workers.dev subdomain when it can, so the worker has two independent URLs.

Steps:
  1. confirm the script q08-mind exists (CF API); best effort: enable its workers.dev subdomain;
  2. if no address record exists for mind.q08.org, create a proxied originless AAAA 100:: record;
  3. create the zone route mind.q08.org/* -> q08-mind (idempotent: an existing route to q08-mind is kept);
  4. verify from outside the account that https://mind.q08.org/health serves this worker with real content.
A failed verification deletes the route and the record this run created, so the host is never left half-built.
Reversible by hand: DELETE /zones/{zone}/workers/routes/{route_id} and /dns_records/{dns_created} from the report.
Writes ci-status/attach-mind-q08-route.json.
"""
import json, os, sys, time, urllib.error, urllib.request

ZONE, HOST, SERVICE = "q08.org", "mind.q08.org", "q08-mind"
TOK = os.environ.get("CLOUDFLARE_API_TOKEN")
ACCT = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID")
API = "https://api.cloudflare.com/client/v4"
UA = "qnfo-ci-attach-mind-q08-route/2.0"
REPORT_PATH = "ci-status/attach-mind-q08-route.json"
R = {"marker": "MIND-Q08-2", "host": HOST, "service": SERVICE, "token_present": bool(TOK), "account_present": bool(ACCT),
     "stage": "start", "status": "unknown", "error": None, "script_exists": False, "subdomain": None,
     "route_id": None, "dns_created": None, "verified": False, "ts": None}


def report(stage, status, error=None):
    R.update(stage=stage, status=status, error=(str(error)[:1200] if error is not None else None),
             ts=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
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


def get_json(url):
    try:
        r = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, resp.read().decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, str(e)[:200]


def serves_worker():
    """True when the host answers with this worker and real content (not a fallback page)."""
    st, body = get_json("https://%s/health" % HOST)
    if st != 200:
        return False, "health http=%s" % st
    try:
        j = json.loads(body)
    except Exception:
        return False, "health not json"
    named = j.get("worker") == SERVICE or j.get("service") == SERVICE
    alive = j.get("ok") is True or named
    if not alive:
        return False, "health not ok: %s" % body[:200]
    st2, body2 = get_json("https://%s/api/entries.json" % HOST)
    if st2 != 200:
        return False, "api http=%s" % st2
    try:
        n = len((json.loads(body2) or {}).get("entries") or [])
    except Exception:
        return False, "api not json"
    if n <= 0:
        return False, "api entries empty"
    return True, "health ok, api entries=%d" % n


def main():
    if not TOK or not ACCT:
        report("credentials", "failed", "CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID not set")
        return 1

    # PATH 1: does the script exist? Authoritative and hostname-independent. The deploy of the same push normally
    # lands within a minute; 10 min covers a queued deploy-gate lock.
    for i in range(60):
        st, j = req("GET", "/accounts/%s/workers/scripts/%s" % (ACCT, SERVICE))
        if st == 200:
            R["script_exists"] = True
            break
        print("script check %d: http=%s" % (i + 1, st))
        time.sleep(10)
    else:
        report("deploy", "failed", "%s is not deployed in account %s after 10 min (last http=%s)" % (SERVICE, ACCT, st))
        return 1

    # Best effort: give the worker a workers.dev URL too, so the surface has two independent addresses.
    st, j = req("POST", "/accounts/%s/workers/scripts/%s/subdomain" % (ACCT, SERVICE),
                {"enabled": True, "previews_enabled": False})
    if st in (200, 201) and (j or {}).get("success"):
        R["subdomain"] = "enabled"
    else:
        R["subdomain"] = "http=%s %s" % (st, json.dumps(j)[:200])

    # Zone
    st, j = req("GET", "/zones?name=%s" % ZONE)
    res = (j or {}).get("result") or []
    if st != 200 or not res:
        report("zone", "failed", "zone %s not readable http=%s body=%s" % (ZONE, st, json.dumps(j)[:400]))
        return 1
    zone = res[0]["id"]

    # Existing route for this host pointing at this worker is reused; a route pointing elsewhere is an error.
    st, j = req("GET", "/zones/%s/workers/routes" % zone)
    for rt in ((j or {}).get("result") or []):
        if rt.get("pattern") == HOST + "/*":
            if rt.get("script") == SERVICE:
                R["route_id"] = rt.get("id")
            else:
                report("route", "failed", "pattern %s/* already routed to %s" % (HOST, rt.get("script")))
                return 1

    # Address record: create a proxied originless AAAA only when the name has no record at all.
    st, j = req("GET", "/zones/%s/dns_records?name=%s" % (zone, HOST))
    if not ((j or {}).get("result") or []):
        st, cj = req("POST", "/zones/%s/dns_records" % zone,
                     {"type": "AAAA", "name": HOST, "content": "100::", "proxied": True, "ttl": 1,
                      "comment": "MIND-Q08-2 originless placeholder for the q08-mind worker route"})
        if st not in (200, 201) or not (cj or {}).get("success"):
            report("dns", "failed", "create dns http=%s body=%s" % (st, json.dumps(cj)[:400]))
            return 1
        R["dns_created"] = (cj.get("result") or {}).get("id")

    created_route = False
    if not R["route_id"]:
        st, rj = req("POST", "/zones/%s/workers/routes" % zone, {"pattern": HOST + "/*", "script": SERVICE})
        if st not in (200, 201) or not (rj or {}).get("success"):
            if R["dns_created"]:
                req("DELETE", "/zones/%s/dns_records/%s" % (zone, R["dns_created"]))
            report("route", "failed", "create route http=%s body=%s" % (st, json.dumps(rj)[:400]))
            return 1
        R["route_id"] = (rj.get("result") or {}).get("id")
        created_route = True

    # PATH 2: verify from outside the account.
    last = ""
    for i in range(30):
        ok, why = serves_worker()
        if ok:
            R["verified"] = True
            report("verify", "ok", None)
            print("MIND-Q08-2 verified: %s" % why)
            return 0
        last = why
        print("verify %d: %s" % (i + 1, why))
        time.sleep(10)

    if created_route:
        req("DELETE", "/zones/%s/workers/routes/%s" % (zone, R["route_id"]))
    if R["dns_created"]:
        req("DELETE", "/zones/%s/dns_records/%s" % (zone, R["dns_created"]))
    report("verify", "failed", "https://%s never served %s within 5 min (%s); this run's route and record were removed"
           % (HOST, SERVICE, last))
    return 1


if __name__ == "__main__":
    sys.exit(main())

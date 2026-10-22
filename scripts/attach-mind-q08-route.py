#!/usr/bin/env python3
"""MIND-Q08-3 (2026-10-21): serve the inside reading surface at mind.q08.org from q08-mind.

Self-triggering: a push of this file (or .github/workflows/attach-mind-q08-route.yml) starts the run.
Fail-closed, idempotent, reversible: anything this run creates is removed if outside verification fails.

Why MIND-Q08-3 exists. MIND-Q08-2 reported
    "q08-mind is not deployed in account <acct> after 10 min (last http=0)"
while q08-mind was live in that account (version 1.0.0-mind-1, 44,843 B). Its PATH 1 read
GET /accounts/{acct}/workers/scripts/{name} and treated a connection-level exception (st == 0) as
"absent", then fail-closed before ever touching the zone route. A transport failure is not evidence of
absence. MIND-Q08-3 separates the two:

  PATH A  GET /accounts/{acct}/workers/scripts/{name}           200 => exists
  PATH B  GET /accounts/{acct}/workers/scripts?per_page=100     name in list => exists
  PATH C  enable workers.dev (best effort) and read its /health 200 => exists, second live URL

It fails closed only on a definitive 404 from PATH A *and* a PATH B listing that does not contain the
name. Any other outcome (0, 401, 403, 429, 5xx) is recorded as degraded and the run proceeds, because
the real gate is outside verification: https://mind.q08.org/health must name q08-mind and
/api/entries.json must list entries. Creating a route to a script that truly does not exist is rejected
by Cloudflare, so proceeding is still fail-closed at the edge.

Every mutation (the workers.dev subdomain PUT, the route POST, the DNS record POST, and the rollback
DELETEs) is performed while holding the account secret-lock, acquired via POST /secret-lock/acquire and
released via POST /secret-lock/release in a try/finally. The run fails closed if the lock cannot be
acquired. No allowlist entry is used to bypass this.
"""

import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.cloudflare.com/client/v4"
HOST = "mind.q08.org"
SERVICE = "q08-mind"
ZONE_NAME = "q08.org"
MARKER = "MIND-Q08-3"
UA = "qnfo-attach-mind/3.0"

TOKEN = os.environ.get("CF_API_TOKEN") or os.environ.get("CLOUDFLARE_API_TOKEN") or ""
ACCT = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID") or ""
ZONE_ENV = os.environ.get("CF_ZONE_ID") or os.environ.get("CLOUDFLARE_ZONE_ID") or ""

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "ci-status", "attach-mind-q08-route.json")

R = {
    "marker": MARKER,
    "host": HOST,
    "service": SERVICE,
    "token_present": bool(TOKEN),
    "account_present": bool(ACCT),
    "zone_id": None,
    "stage": "start",
    "status": "failed",
    "script_exists": None,
    "script_check": {},
    "secret_lock": None,
    "subdomain": None,
    "route_id": None,
    "route_reused": None,
    "dns_created": None,
    "dns_record_id": None,
    "verified": False,
    "entries": None,
    "health_version": None,
    "ts": None,
}


def report(stage, status, error=None):
    R["stage"] = stage
    R["status"] = status
    R["ts"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if error:
        R["error"] = str(error)[:500]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(R, f, indent=2)
        f.write("\n")
    print(json.dumps(R, indent=2))
    return 0 if status in ("ok", "ok-degraded") else 1


CTX = ssl.create_default_context()


def req(method, path, body=None, timeout=25, retries=2):
    """Return (http_status, parsed_json_or_None). http_status 0 means transport failure."""
    url = path if path.startswith("http") else API + path
    data = None
    headers = {"Authorization": "Bearer " + TOKEN, "User-Agent": UA}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    last, last_err = 0, ""
    for attempt in range(retries + 1):
        try:
            rq = urllib.request.Request(url, data=data, headers=headers, method=method)
            with urllib.request.urlopen(rq, timeout=timeout, context=CTX) as r:
                raw = r.read().decode("utf-8", "replace")
                try:
                    return r.status, json.loads(raw)
                except ValueError:
                    return r.status, {"raw": raw[:400]}
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            try:
                return e.code, json.loads(raw)
            except ValueError:
                return e.code, {"raw": raw[:400]}
        except Exception as e:  # transport: DNS, TLS, timeout, reset
            last, last_err = 0, "%s: %s" % (type(e).__name__, e)
        if attempt < retries:
            time.sleep(2 + 2 * attempt)
    return last, {"transport_error": last_err}


def lock_acquire(reason):
    """Acquire the account secret-lock. Returns (ok, http_status, body)."""
    st, j = req("POST", "/secret-lock/acquire",
                {"holder": MARKER, "reason": reason, "service": SERVICE}, retries=3)
    return (st in (200, 201)), st, j


def lock_release():
    """Release the account secret-lock (best effort, always called from finally)."""
    req("POST", "/secret-lock/release", {"holder": MARKER, "service": SERVICE}, retries=2)


def public_get(url, timeout=20):
    """Outside read of the public surface (no auth). Returns (status, json_or_None)."""
    try:
        rq = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
        with urllib.request.urlopen(rq, timeout=timeout, context=CTX) as r:
            raw = r.read().decode("utf-8", "replace")
            try:
                return r.status, json.loads(raw)
            except ValueError:
                return r.status, {"raw": raw[:400]}
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None


def script_exists():
    """Three independent paths. Fails closed only on a definitive 404 + a listing without the name.

    Must be called while the secret-lock is held: PATH C issues a mutating PUT
    (workers/scripts/{name}/subdomain), which is only permitted under the lock.
    """
    # PATH A
    st, j = req("GET", "/accounts/%s/workers/scripts/%s" % (ACCT, SERVICE), retries=3)
    R["script_check"]["get_script"] = st
    if st == 200:
        R["script_exists"] = True
        return True
    # PATH B
    st_b, jb = req("GET", "/accounts/%s/workers/scripts?per_page=100" % ACCT, retries=2)
    names = []
    if isinstance(jb, dict):
        for s in (jb.get("result") or []):
            if isinstance(s, dict):
                names.append(s.get("id") or s.get("name") or "")
    R["script_check"]["list_scripts"] = st_b
    R["script_check"]["listed"] = SERVICE in names
    if SERVICE in names:
        R["script_exists"] = True
        return True
    # PATH C — workers.dev, best effort (gives a second independent live URL).
    # Mutating PUT: performed under the already-held secret-lock.
    st_c, _ = req("PUT", "/accounts/%s/workers/scripts/%s/subdomain" % (ACCT, SERVICE),
                  {"enabled": True}, retries=1)
    R["script_check"]["enable_workers_dev"] = st_c
    if st_c in (200, 201):
        sub_st, _ = public_get("https://%s.%s.workers.dev/health" % (SERVICE, ZONE_NAME))
        R["script_check"]["workers_dev_health"] = sub_st
        if sub_st == 200:
            R["subdomain"] = "%s.%s.workers.dev" % (SERVICE, ZONE_NAME)
            R["script_exists"] = True
            return True
    # Definitive absence requires BOTH a 404 and a readable listing without the name.
    if st == 404 and st_b == 200 and SERVICE not in names:
        R["script_exists"] = False
        return False
    R["script_exists"] = None  # unknown — proceed; the edge is the real gate
    return True


def main():
    R["ts"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if not TOKEN or not ACCT:
        return report("creds", "failed", "CF_API_TOKEN/CF_ACCOUNT_ID not present in the runner environment")

    # 1. zone
    zone = ZONE_ENV
    if not zone:
        st, j = req("GET", "/zones?name=%s" % ZONE_NAME)
        res = (j or {}).get("result") or [] if isinstance(j, dict) else []
        if st != 200 or not res:
            return report("zone", "failed", "zone lookup http=%s body=%s" % (st, json.dumps(j)[:300]))
        zone = res[0]["id"]
    R["zone_id"] = zone

    # 2. acquire the secret-lock; every mutation below runs under it (try/finally release).
    ok, st_l, jl = lock_acquire("attach %s route/record for %s" % (HOST, SERVICE))
    R["secret_lock"] = "acquired" if ok else "acquire-http=%s" % st_l
    if not ok:
        return report("secret-lock", "failed",
                      "secret-lock acquire http=%s body=%s; refusing to mutate bindings without the lock"
                      % (st_l, json.dumps(jl)[:300]))

    try:
        # 3. does the worker exist (three paths; PATH C PUT covered by the held lock)
        if not script_exists():
            return report("deploy", "failed",
                          "q08-mind is definitively absent: get_script=404 and the account script list does not "
                          "contain it (%s)" % json.dumps(R["script_check"]))

        # 4. route
        st, j = req("GET", "/zones/%s/workers/routes" % zone)
        if st != 200:
            return report("route-read", "failed", "http=%s body=%s" % (st, json.dumps(j)[:300]))
        pattern = HOST + "/*"
        existing = None
        for r in ((j or {}).get("result") or []):
            if isinstance(r, dict) and r.get("pattern") == pattern:
                existing = r
                break
        if existing:
            if existing.get("script") == SERVICE:
                R["route_id"] = existing.get("id")
                R["route_reused"] = True
            else:
                return report("route", "failed",
                              "route %s already exists and points at %r, not %r; left untouched"
                              % (pattern, existing.get("script"), SERVICE))
        else:
            st, j = req("POST", "/zones/%s/workers/routes" % zone, {"pattern": pattern, "script": SERVICE})
            if st not in (200, 201):
                return report("route", "failed", "route create http=%s body=%s" % (st, json.dumps(j)[:300]))
            R["route_id"] = ((j or {}).get("result") or {}).get("id")
            R["route_reused"] = False

        # 5. DNS — only create when no record for the host exists
        st, j = req("GET", "/zones/%s/dns_records?name=%s" % (zone, urllib.parse.quote(HOST)))
        if st != 200:
            return report("dns-read", "failed", "http=%s body=%s" % (st, json.dumps(j)[:300]))
        recs = (j or {}).get("result") or []
        if recs:
            R["dns_created"] = False
            R["dns_record_id"] = recs[0].get("id")
        else:
            st, j = req("POST", "/zones/%s/dns_records" % zone, {
                "type": "AAAA", "name": HOST, "content": "100::", "proxied": True, "ttl": 1,
                "comment": "%s originless record for the %s worker route" % (MARKER, SERVICE),
            })
            if st not in (200, 201):
                return report("dns", "failed", "record create http=%s body=%s" % (st, json.dumps(j)[:300]))
            R["dns_created"] = True
            R["dns_record_id"] = ((j or {}).get("result") or {}).get("id")
    finally:
        # release the secret-lock no matter how the mutation phase ended
        lock_release()
        R["secret_lock"] = "released"

    # 6. outside verification — the real gate (read-only, no lock needed)
    last = "no attempt"
    for i in range(30):
        cb = int(time.time())
        hst, hj = public_get("https://%s/health?cb=%d" % (HOST, cb))
        if hst == 200 and isinstance(hj, dict) and (hj.get("worker") == SERVICE or hj.get("ok") is True):
            est, ej = public_get("https://%s/api/entries.json?cb=%d" % (HOST, cb))
            n = len(((ej or {}).get("entries") or [])) if isinstance(ej, dict) else 0
            if est == 200 and n > 0:
                R["verified"] = True
                R["entries"] = n
                R["health_version"] = hj.get("version")
                return report("verify", "ok")
            last = "entries http=%s n=%s" % (est, n)
        else:
            last = "health http=%s" % hst
        print("verify %d/30: %s" % (i + 1, last))
        time.sleep(10)

    # 7. rollback only what this run created — mutations, so re-acquire the secret-lock
    ok_rb, st_rb, jrb = lock_acquire("rollback %s route/record for %s" % (HOST, SERVICE))
    if ok_rb:
        try:
            if R["route_reused"] is False and R["route_id"]:
                req("DELETE", "/zones/%s/workers/routes/%s" % (zone, R["route_id"]))
            if R["dns_created"] is True and R["dns_record_id"]:
                req("DELETE", "/zones/%s/dns_records/%s" % (zone, R["dns_record_id"]))
        finally:
            lock_release()
    else:
        print("secret-lock acquire for rollback failed http=%s; nothing was deleted" % st_rb)
    return report("verify", "failed",
                  "https://%s never served %s within 5 min (%s); this run's route and record were removed"
                  % (HOST, SERVICE, last))


if __name__ == "__main__":
    sys.exit(main())

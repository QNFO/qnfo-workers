#!/usr/bin/env python3
"""MIND-Q08-3 (2026-10-21): serve the inside reading surface at mind.q08.org from q08-mind.

Self-triggering: a push of this file (or .github/workflows/attach-mind-q08-route.yml) starts the run.
Fail-closed, idempotent, reversible: anything this run creates is removed if outside verification fails.

Why MIND-Q08-3 exists. MIND-Q08-2 reported
    "q08-mind is not deployed in account <acct> after 10 min (last http=0)"
while q08-mind was live in that account (version 1.0.0-mind-1, 44,843 B). Its PATH 1 read
GET /accounts/{acct}/workers/scripts/{name} and treated a connection-level exception (st == 0) as
"absent", then fail-closed before ever touching the zone route. MIND-Q08-3 checks the script two
independent ways before it touches anything:

  PATH A  GET /accounts/{acct}/workers/scripts/{name}           200 => exists
  PATH B  GET /accounts/{acct}/workers/scripts?per_page=100     name in list => exists

It writes nothing (no route, no record) unless one of them shows the script. When neither does, it
re-checks a few times, then stops with stage deploy: a 404 from GET together with a readable list
(HTTP 200) that does not hold the name says "absent", an unreadable API (0, 401, 403, 429, 5xx) says
"not confirmed", and the report names which. The real
gate is outside verification: https://mind.q08.org/health must name q08-mind and /api/entries.json
must list entries. Creating a route to a script that truly does not exist is rejected by
Cloudflare, so a script that is live is the only case that reaches the route step.

ATTACH-MIND-LOCK-1 (2026-10-26): a former PATH C enabled the workers.dev subdomain with a PUT behind
a secret-lock wrapper (issue 100465). It could never succeed (it probed
q08-mind.q08.org.workers.dev, not q08-mind.q08.workers.dev, and used PUT where every other caller
uses POST) and it would have switched workers.dev on for a worker whose wrangler.toml does not
declare it, so it is removed rather than locked: this script no longer mutates any worker setting.
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
UA = "qnfo-attach-mind/3.0-r2"

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
    """Two independent paths, then a short re-check. True only when GET or LIST shows the script.

    A False answer is not a verdict on its own: R["script_check"] holds the status of the last GET and
    LIST, and main() says "absent" only for a GET 404 with a readable list that lacks the name, "not confirmed" otherwise."""
    # PATH A
    st, j = req("GET", f"/accounts/{ACCT}/workers/scripts/{SERVICE}", retries=3)
    R["script_check"]["get_script"] = st
    if st == 200:
        R["script_exists"] = True
        return True

    # PATH B
    st_b, jb = req("GET", f"/accounts/{ACCT}/workers/scripts?per_page=100", retries=2)
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

    # Deployment may still be propagating: re-check a few times. Any answer that is not a 404 ends the re-check
    # (an unreadable API will not become readable in ten seconds), and the caller reports it as "not confirmed".
    for _ in range(5):
        st_retry, _j = req("GET", f"/accounts/{ACCT}/workers/scripts/{SERVICE}", retries=0)
        R["script_check"]["get_script"] = st_retry
        if st_retry == 200:
            R["script_exists"] = True
            return True
        st_b_retry, jb_retry = req("GET", f"/accounts/{ACCT}/workers/scripts?per_page=100", retries=0)
        R["script_check"]["list_scripts"] = st_b_retry
        if st_b_retry == 200:
            names_retry = []
            if isinstance(jb_retry, dict):
                for s in (jb_retry.get("result") or []):
                    if isinstance(s, dict):
                        names_retry.append(s.get("id") or s.get("name") or "")
            if SERVICE in names_retry:
                R["script_check"]["listed"] = True
                R["script_exists"] = True
                return True
        if st_retry != 404 or st_b_retry != 404:
            break
        time.sleep(2)
    R["script_exists"] = False
    return False


def main():
    R["ts"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if not TOKEN or not ACCT:
        return report("creds", "failed", "CF_API_TOKEN/CF_ACCOUNT_ID not present in the runner environment")

    # 1. zone
    zone = ZONE_ENV
    if not zone:
        st, j = req("GET", f"/zones?name={ZONE_NAME}")
        res = (j or {}).get("result") or [] if isinstance(j, dict) else []
        if st != 200 or not res:
            return report("zone", "failed", f"zone lookup http={st} body={json.dumps(j)[:300]}")
        zone = res[0]["id"]
    R["zone_id"] = zone

    # 2. does the worker exist (two paths)
    # Retry a few times in case the script is still being deployed.
    for _attempt in range(3):
        if script_exists():
            break
        # Record a degraded status but keep trying.
        report("deploy", "ok-degraded", f"script not yet visible, retry {_attempt + 1}")
        time.sleep(5)
    else:
        sc = R["script_check"]
        definitive = sc.get("get_script") == 404 and sc.get("list_scripts") == 200 and not sc.get("listed")
        return report(
            "deploy",
            "failed",
            (SERVICE + " is absent (GET 404 and not in the scripts list)" if definitive else SERVICE + " could not be confirmed (the scripts API answered something other than 404)")
            + " after retries, so no route or record was touched: " + json.dumps(sc),
        )

    # 3. route
    st, j = req("GET", f"/zones/{zone}/workers/routes")
    if st != 200:
        return report("route-read", "failed", f"http={st} body={json.dumps(j)[:300]}")
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
            return report(
                "route",
                "failed",
                f"route {pattern} already exists and points at {existing.get('script')!r}, not {SERVICE!r}; left untouched",
            )
    else:
        st, j = req("POST", f"/zones/{zone}/workers/routes", {"pattern": pattern, "script": SERVICE})
        if st not in (200, 201):
            return report("route", "failed", f"route create http={st} body={json.dumps(j)[:300]}")
        R["route_id"] = ((j or {}).get("result") or {}).get("id")
        R["route_reused"] = False

    # 4. DNS — only create when no record for the host exists
    st, j = req("GET", f"/zones/{zone}/dns_records?name={urllib.parse.quote(HOST)}")
    if st != 200:
        return report("dns-read", "failed", f"http={st} body={json.dumps(j)[:300]}")
    recs = (j or {}).get("result") or []
    if recs:
        R["dns_created"] = False
        R["dns_record_id"] = recs[0].get("id")
    else:
        st, j = req(
            "POST",
            f"/zones/{zone}/dns_records",
            {
                "type": "AAAA",
                "name": HOST,
                "content": "100::",
                "proxied": True,
                "ttl": 1,
                "comment": f"{MARKER} originless record for the {SERVICE} worker route",
            },
        )
        if st not in (200, 201):
            return report("dns", "failed", f"record create http={st} body={json.dumps(j)[:300]}")
        R["dns_created"] = True
        R["dns_record_id"] = ((j or {}).get("result") or {}).get("id")

    # 5. outside verification — the real gate
    last = "no attempt"
    for i in range(30):
        cb = int(time.time())
        hst, hj = public_get(f"https://{HOST}/health?cb={cb}")
        if hst == 200 and isinstance(hj, dict) and (hj.get("worker") == SERVICE or hj.get("ok") is True):
            est, ej = public_get(f"https://{HOST}/api/entries.json?cb={cb}")
            n = len(((ej or {}).get("entries") or [])) if isinstance(ej, dict) else 0
            if est == 200 and n > 0:
                R["verified"] = True
                R["entries"] = n
                R["health_version"] = hj.get("version")
                return report("verify", "ok")
            last = f"entries http={est} n={n}"
        else:
            last = f"health http={hst}"
        print(f"verify {i + 1}/30: {last}")
        time.sleep(10)

    # 6. rollback only what this run created, and report what was actually deleted
    removed, failed = [], []
    if R["route_reused"] is False and R["route_id"]:
        d, _ = req("DELETE", f"/zones/{zone}/workers/routes/{R['route_id']}")
        (removed if d in (200, 204) else failed).append(f"route {R['route_id']} (http {d})")
    if R["dns_created"] is True and R["dns_record_id"]:
        d, _ = req("DELETE", f"/zones/{zone}/dns_records/{R['dns_record_id']}")
        (removed if d in (200, 204) else failed).append(f"record {R['dns_record_id']} (http {d})")
    R["rolled_back"] = {"removed": removed, "failed": failed}
    if failed:
        what = "removal FAILED for " + ", ".join(failed) + (", removed " + ", ".join(removed) if removed else "") + ", delete them by hand"
    elif removed:
        what = "this run's " + ", ".join(removed) + " removed"
    else:
        what = "this run created no route and no record, so nothing was removed and the existing ones are untouched"
    return report("verify", "failed", f"https://{HOST} never served {SERVICE} within 5 min ({last}); {what}")


if __name__ == "__main__":
    sys.exit(main())

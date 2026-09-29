#!/usr/bin/env python3
"""raw_put.py - binding-preserving AND settings-preserving module deploy via CF API /content.

WHY /content AND NOT wrangler: `wrangler deploy` sets bindings FROM wrangler.toml. Where the
toml cannot reproduce the live bindings, a wrangler deploy SILENTLY DROPS them
(BINDING-PRESERVATION-1). Canonical: qnfo-fleet-control's wrangler.toml declares 17 bindings
while live has 24 -- it omits the FleetAdvisor Durable Object and 6 secrets -- so a wrangler
deploy of that worker would break it. The CF API `/content` endpoint updates ONLY the code,
preserving every live binding. This is the same method qnfo-fleet-control uses to redeploy the
fleet.

COMPAT-PRESERVE-1 (2026-09-29, issue 1358): this deployer used to send multipart metadata of
`{"main_module": "worker.js"}` ONLY -- it omitted compatibility_date and compatibility_flags.
Ledger entry 2.36.46 records the identical defect in cfWorkerDeploy: omitting the date CLEARED
it on every deploy, which turned off streams_enable_constructors, made `new ReadableStream()`
throw at all 5 call sites, and broke EVERY streaming response while non-streaming kept working
(silent, half-broken worker). A deploy through this script could therefore re-break streaming
across the fleet. Now:
  * the live /settings are read FIRST and compatibility_date + compatibility_flags are carried
    into the metadata, so the PUT can never clear them;
  * a brand-new worker gets a compatibility_date FLOOR instead of an empty date;
  * if the settings cannot be read for an existing worker the script FAILS CLOSED (exit 3) and
    deploys nothing -- it never guesses;
  * after the PUT the settings are re-read and the date/flags are asserted to have survived;
    a cleared date is a hard failure, not a silent regression.

Usage:  CLOUDFLARE_API_TOKEN=... python scripts/raw_put.py <worker> <path/to/worker.js>
Exit:   0 ok | 3 fail-closed (nothing is deployed on error)
"""
import json
import os
import sys
import urllib.error
import urllib.request
import uuid

ACCT = os.environ.get("CF_ACCOUNT_ID", "edb167b78c9fb901ea5bca3ce58ccc4b")
DATE_FLOOR = "2026-08-01"


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN")
    if t:
        return t.strip()
    p = r"C:\Users\LENOVO\tokens\cloudflare"
    if os.path.exists(p):
        return open(p).read().strip()
    raise SystemExit("no CF token (set CLOUDFLARE_API_TOKEN)")


def _api(url, tok, data=None, ctype=None):
    headers = {"Authorization": "Bearer " + tok}
    if ctype:
        headers["Content-Type"] = ctype
    req = urllib.request.Request(url, data=data, method="PUT" if data else "GET", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = r.read().decode()
            try:
                return r.status, json.loads(raw)
            except ValueError:
                return r.status, raw
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except ValueError:
            return e.code, body
    except Exception as e:
        return 0, "ERR " + str(e)


def _settings(worker, tok):
    st, body = _api(f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/workers/scripts/{worker}/settings", tok)
    if st == 200 and isinstance(body, dict) and body.get("success"):
        return st, (body.get("result") or {})
    return st, None


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 3
    worker, path = argv[1], argv[2]
    tok = token()
    code = open(path, encoding="utf-8").read()
    if not code.strip():
        print("REFUSING: artifact is empty")
        return 3

    st, live = _settings(worker, tok)
    if st == 200 and live is not None:
        compat_date = live.get("compatibility_date")
        compat_flags = live.get("compatibility_flags") or []
        print(f"live settings read: compatibility_date={compat_date!r} compatibility_flags={compat_flags}")
    elif st == 404:
        compat_date, compat_flags = None, []
        print(f"note: {worker} does not exist yet; will apply compatibility_date floor {DATE_FLOOR}")
    else:
        print(f"FAIL-CLOSED: could not read live /settings for {worker} (HTTP {st}).")
        print("Refusing to PUT: an unread date would be cleared by the deploy (COMPAT-PRESERVE-1).")
        return 3
    if not compat_date:
        compat_date = DATE_FLOOR

    meta = {"main_module": "worker.js", "compatibility_date": compat_date}
    if compat_flags:
        meta["compatibility_flags"] = compat_flags
    meta_json = json.dumps(meta)

    b = "----cfgate" + uuid.uuid4().hex
    body = "".join([
        f"--{b}\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n{meta_json}\r\n",
        f"--{b}\r\nContent-Disposition: form-data; name=\"worker.js\"; filename=\"worker.js\"\r\nContent-Type: application/javascript+module\r\n\r\n{code}\r\n",
        f"--{b}--\r\n",
    ]).encode("utf-8")
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/workers/scripts/{worker}/content"
    print(f"PUT {url} metadata={meta_json}")
    st, out = _api(url, tok, data=body, ctype="multipart/form-data; boundary=" + b)
    print("HTTP", st, str(out)[:200])
    if st != 200:
        return 3

    st2, after = _settings(worker, tok)
    if st2 != 200 or after is None:
        print(f"FAIL: deployed but could not re-read /settings (HTTP {st2}) - verify compatibility_date manually")
        return 3
    got_date = after.get("compatibility_date")
    got_flags = after.get("compatibility_flags") or []
    print(f"post-deploy settings: compatibility_date={got_date!r} compatibility_flags={got_flags}")
    if got_date != compat_date:
        print(f"FAIL: compatibility_date changed across the deploy ({compat_date!r} -> {got_date!r}) - COMPAT-PRESERVE-1 violated")
        return 3
    if got_flags != compat_flags:
        print(f"FAIL: compatibility_flags changed across the deploy ({compat_flags} -> {got_flags}) - COMPAT-PRESERVE-1 violated")
        return 3
    print(f"OK: {worker} deployed with compatibility_date={got_date} and {len(got_flags)} flag(s) preserved")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

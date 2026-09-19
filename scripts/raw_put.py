#!/usr/bin/env python3
"""raw_put.py - binding-preserving module deploy via the CF API /content endpoint.

WHY: `wrangler deploy` sets bindings FROM wrangler.toml. Where the toml cannot reproduce the
live bindings, a wrangler deploy SILENTLY DROPS them (BINDING-PRESERVATION-1). Canonical:
qnfo-fleet-control's wrangler.toml declares 17 bindings while live has 24 -- it omits the
FleetAdvisor Durable Object and 6 secrets -- so a wrangler deploy of that worker would break it.

The CF API `/content` endpoint updates ONLY the code, preserving every live binding. This is the
same method qnfo-fleet-control itself uses to redeploy the fleet.

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


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN")
    if t:
        return t.strip()
    p = r"C:\Users\LENOVO\tokens\cloudflare"
    if os.path.exists(p):
        return open(p).read().strip()
    raise SystemExit("no CF token (set CLOUDFLARE_API_TOKEN)")


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 3
    worker, path = argv[1], argv[2]
    code = open(path, encoding="utf-8").read()
    b = "----cfgate" + uuid.uuid4().hex
    meta = json.dumps({"main_module": "worker.js"})
    body = "".join([
        f"--{b}\r\nContent-Disposition: form-data; name=\"metadata\"\r\nContent-Type: application/json\r\n\r\n{meta}\r\n",
        f"--{b}\r\nContent-Disposition: form-data; name=\"worker.js\"; filename=\"worker.js\"\r\nContent-Type: application/javascript+module\r\n\r\n{code}\r\n",
        f"--{b}--\r\n",
    ]).encode("utf-8")
    url = f"https://api.cloudflare.com/client/v4/accounts/{ACCT}/workers/scripts/{worker}/content"
    req = urllib.request.Request(url, data=body, method="PUT", headers={
        "Authorization": "Bearer " + token(),
        "Content-Type": "multipart/form-data; boundary=" + b,
    })
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            out = r.read().decode()
            print("HTTP", r.status, out[:200])
            return 0 if r.status == 200 else 3
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read().decode()[:400])
        return 3
    except Exception as e:
        print("ERR", e)
        return 3


if __name__ == "__main__":
    sys.exit(main(sys.argv))

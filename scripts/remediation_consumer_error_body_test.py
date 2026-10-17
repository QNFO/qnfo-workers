#!/usr/bin/env python3
"""CONSUMER-ERROR-BODY-1 offline test (2026-10-17, pillar autonomy).

Every failing contract reported "HTTP Error 400: Bad Request" because urllib raised with the response body unread, and
D1 puts the real SQLite message there (7500 triggers nested too deep, no such column, ...). 529 of 973 contracts sat at
last_verdict='probe-error' with nothing to attribute it to. Proves the body reaches the raised error.

Run: python scripts/remediation_consumer_error_body_test.py
"""
import io
import json
import os
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("CLOUDFLARE_ACCOUNT_ID", "acct")
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "tok")
os.environ.setdefault("CF_API_TOKEN", "tok")

import remediation_consumer as rc  # noqa: E402

fails = 0


def check(cond, msg, extra=None):
    global fails
    if cond:
        print("ok   " + msg)
    else:
        fails += 1
        print("FAIL " + msg + ("" if extra is None else " -- " + repr(extra)))


def raising(body, code=400):
    def _fake(req, timeout=45):
        raise urllib.error.HTTPError(req.full_url, code, "Bad Request", {}, io.BytesIO(body.encode("utf-8")))
    return _fake


real_urlopen = rc.urllib.request.urlopen

body = json.dumps({"success": False, "errors": [{"code": 7500, "message": "triggers nested too deep: SQLITE_ERROR"}]})
rc.urllib.request.urlopen = raising(body)
try:
    rc._req("POST", "https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db/query", {"sql": "SELECT 1", "params": []})
    check(False, "an HTTP 400 raises")
except RuntimeError as e:
    text = str(e)
    check("7500" in text and "triggers nested too deep" in text, "the body message reaches the caller", text[:160])
    check("HTTP 400" in text, "the status is kept, so a transport fault is still distinguishable", text[:80])
except Exception as e:  # noqa: BLE001
    check(False, "the failure is a RuntimeError the per-contract catch records", repr(e))

# a 200 still parses, and a body-less failure still raises rather than returning None
rc.urllib.request.urlopen = raising("", 500)
try:
    rc._req("GET", "https://api.cloudflare.com/client/v4/accounts")
    check(False, "a 500 with no body raises")
except RuntimeError as e:
    check("HTTP 500" in str(e), "a body-less failure still names its status", str(e)[:80])

rc.urllib.request.urlopen = real_urlopen
print("%d failure(s)" % fails)
sys.exit(1 if fails else 0)

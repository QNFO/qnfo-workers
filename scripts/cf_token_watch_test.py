#!/usr/bin/env python3
"""CF-TOKEN-WATCH-1 offline test (2026-10-19, agent_issues 2581, pillar autonomy).

Proves the consumer turns Cloudflare's tokens/verify answer into cloudflare_token_ok and cloudflare_token_expires_in_min,
falls back from the account path to the user path, and writes both metrics without the token in any statement.

Run: python3 scripts/cf_token_watch_test.py
"""
import calendar
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["CLOUDFLARE_ACCOUNT_ID"] = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or "acct"
os.environ["CLOUDFLARE_API_TOKEN"] = os.environ.get("CLOUDFLARE_API_TOKEN") or "tok-secret-value"

import remediation_consumer as rc  # noqa: E402

fails = 0


def check(cond, msg, extra=None):
    global fails
    if cond:
        print("ok   " + msg)
    else:
        fails += 1
        print("FAIL " + msg + ("" if extra is None else " -- " + repr(extra)))


now = calendar.timegm(time.strptime("2026-10-19T00:00:00", "%Y-%m-%dT%H:%M:%S"))
check(rc.cf_token_watch_values({"status": "active"}, now) == (1, 999999), "active, no expiry -> (1, 999999)")
check(rc.cf_token_watch_values({"status": "active", "expires_on": "2026-10-20T00:00:00Z"}, now) == (1, 1440),
      "active, expires in a day -> 1440 minutes", rc.cf_token_watch_values({"status": "active", "expires_on": "2026-10-20T00:00:00Z"}, now))
check(rc.cf_token_watch_values({"status": "active", "expires_on": "2026-10-18T00:00:00Z"}, now) == (0, 0), "expired -> (0, 0)")
check(rc.cf_token_watch_values({"status": "disabled"}, now)[0] == 0, "disabled -> ok 0")
check(rc.cf_token_watch_values(None, now) == (0, 0), "no answer -> (0, 0)")

writes = []
rc.d1 = lambda sql, params=None: writes.append((sql, params)) or []
calls = []


def fake_req(method, url, body=None):
    calls.append(url)
    if "/accounts/" in url:
        raise RuntimeError("HTTP 401 from %s: invalid" % url)
    return {"success": True, "result": {"id": "x", "status": "active"}}


out = {}
res = rc.cf_token_watch(out, req=fake_req)
check(len(calls) == 2 and "/user/tokens/verify" in calls[1], "falls back to the user path", calls)
check(res == {"ok": 1, "expires_in_min": 999999, "path": "user"}, "result recorded", res)
check(sorted(p[2] for _, p in writes) == ["cloudflare_token_expires_in_min", "cloudflare_token_ok"], "writes both metrics", writes)
check(all(os.environ["CLOUDFLARE_API_TOKEN"] not in repr(w) for w in writes) and os.environ["CLOUDFLARE_API_TOKEN"] not in repr(out), "never carries the token")


def run(req):
    writes.clear()
    out = {}
    rc.cf_token_watch(out, req=req)
    return out["cf_token_watch"], [(p[2], p[0]) for _, p in writes]


def raiser(*msgs):
    it = iter(msgs)

    def req(method, url, body=None):
        raise RuntimeError(next(it))
    return req


# CF-TOKEN-WATCH-2: 0 is written only for a definite verdict; a missing answer keeps the last value.
res, w = run(raiser("down", "timed out"))
check(w == [] and "skipped" in res and len(res["errors"]) == 2, "both paths unanswered (network error) -> nothing written, errors recorded", (res, w))
res, w = run(raiser("HTTP 503 from https://api.cloudflare.com/x: upstream", "HTTP 502 from https://api.cloudflare.com/y: bad gateway"))
check(w == [] and "skipped" in res, "both paths 5xx -> nothing written", (res, w))
res, w = run(raiser("HTTP 429 from https://api.cloudflare.com/x: slow down", "HTTP 401 from https://api.cloudflare.com/y: invalid"))
check(w == [] and "skipped" in res, "one path rate limited, the other 401 -> no verdict, nothing written", (res, w))
res, w = run(raiser("HTTP 401 from https://api.cloudflare.com/x: invalid", "timed out"))
check(w == [] and "skipped" in res, "a 401 on the account path and a timeout on the user path -> no verdict (the user path may be the token's own)", (res, w))
res, w = run(raiser("HTTP 401 from https://api.cloudflare.com/x: invalid", "HTTP 403 from https://api.cloudflare.com/y: forbidden"))
check(sorted(w) == [("cloudflare_token_expires_in_min", "0"), ("cloudflare_token_ok", "0")] and res["ok"] == 0, "both paths refused (401, 403) -> ok 0, expires 0", (res, w))
res, w = run(lambda m, u, b=None: {"success": False, "errors": [{"code": 1000}]})
check(sorted(w) == [("cloudflare_token_expires_in_min", "0"), ("cloudflare_token_ok", "0")], "both paths answer success=false -> ok 0", (res, w))
res, w = run(lambda m, u, b=None: {"success": True, "result": {"status": "disabled"}})
check(("cloudflare_token_ok", "0") in w and res["ok"] == 0, "an answered status other than active -> ok 0", (res, w))
res, w = run(lambda m, u, b=None: {"unexpected": True})
check(w == [] and "skipped" in res, "an unreadable answer -> nothing written", (res, w))
res, w = run(raiser("down", "HTTP 401 from https://api.cloudflare.com/y: " + os.environ["CLOUDFLARE_API_TOKEN"]))
check(os.environ["CLOUDFLARE_API_TOKEN"] not in repr(res) and "***" in repr(res), "recorded errors never carry the token", res)

print("FAILS=%d" % fails)
sys.exit(1 if fails else 0)

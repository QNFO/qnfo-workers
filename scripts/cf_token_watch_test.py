#!/usr/bin/env python3
"""CF-TOKEN-WATCH-1 offline test (2026-10-19, agent_issues 2581, pillar autonomy).

Proves the consumer turns Cloudflare's tokens/verify answer into cloudflare_token_ok and cloudflare_token_expires_in_min,
falls back from the account path to the user path, and writes both metrics without the token in any statement.

Run: python3 scripts/cf_token_watch_test.py
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("CLOUDFLARE_ACCOUNT_ID", "acct")
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "tok-secret-value")

import remediation_consumer as rc  # noqa: E402

fails = 0


def check(cond, msg, extra=None):
    global fails
    if cond:
        print("ok   " + msg)
    else:
        fails += 1
        print("FAIL " + msg + ("" if extra is None else " -- " + repr(extra)))


now = time.mktime(time.strptime("2026-10-19T00:00:00", "%Y-%m-%dT%H:%M:%S")) - time.timezone
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
check(all("tok-secret-value" not in repr(w) for w in writes) and "tok-secret-value" not in repr(out), "never carries the token")

writes.clear()
rc.cf_token_watch({}, req=lambda m, u, b=None: (_ for _ in ()).throw(RuntimeError("down")))
check([p[0] for _, p in writes] == ["0", "0"], "both paths refused -> ok 0, expires 0", writes)

print("FAILS=%d" % fails)
sys.exit(1 if fails else 0)

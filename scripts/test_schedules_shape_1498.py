#!/usr/bin/env python3
"""test_schedules_shape_1498.py - functional proof for issue 1498 (RAWPUT-SCHEDULES-FAILED-1).

Loads the PATCHED scripts/raw_put.py and drives its real schedules_get/schedules_put against a
stub Cloudflare endpoint that enforces the official schema:

  PUT  body  -> array of {"cron": "..."}   (object form -> HTTP 400 / code 10026)
  GET  result-> {"schedules": [{"cron": "..."}]}

Exit 0 only when ALL of the following hold:
  1. the ARRAY body is accepted (HTTP 200)
  2. the OBJECT body is rejected with 400 / code 10026 (the production failure, reproduced)
  3. schedules_get returns the real cron strings from the object-shaped result
  4. schedules_get does NOT return ['schedules'] (the sorted-dict-keys bug)
  5. schedules_apply short-circuits when live already equals declared (idempotency)
"""
import importlib.util
import json
import os
import sys
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

REPO = os.environ.get("REPO_ROOT", ".")
SEEN = []
LIVE = ["30 5 * * 1"]


class Stub(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_PUT(self):
        n = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(n).decode() if n else ""
        try:
            body = json.loads(raw or "null")
        except ValueError:
            body = None
        SEEN.append(body)
        ok = (isinstance(body, list) and bool(body)
              and all(isinstance(x, dict) and isinstance(x.get("cron"), str) and x["cron"] for x in body))
        if ok:
            self._send(200, {"result": {"schedules": [{"cron": x["cron"]} for x in body]},
                             "success": True})
        else:
            self._send(400, {"result": None, "success": False, "errors": [
                {"code": 10026,
                 "message": "Could not parse request body. Please ensure the request is valid JSON."}]})

    def do_GET(self):
        self._send(200, {"result": {"schedules": [{"cron": c} for c in LIVE]}, "success": True})

    def log_message(self, *a):
        pass


def load_raw_put():
    path = os.path.join(REPO, "scripts", "raw_put.py")
    spec = importlib.util.spec_from_file_location("raw_put_under_test", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    fails = []
    srv = HTTPServer(("127.0.0.1", 8788), Stub)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    stub = "http://127.0.0.1:8788/schedules?w={worker}&a={acct}"

    mod = load_raw_put()
    mod.SCHEDULES_API = stub
    mod.ACCT = "stubacct"

    # (2) the object form must still be rejected - i.e. the production failure is reproducible
    req = urllib.request.Request(stub.format(worker="w", acct="a"),
                                data=json.dumps({"crons": LIVE}).encode(), method="PUT",
                                headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            st_obj = r.status
    except urllib.error.HTTPError as e:
        st_obj = e.code
    if st_obj != 400:
        fails.append("object body was NOT rejected (HTTP %s) - stub is not reproducing 1498" % st_obj)
    else:
        print("OK  object body {'crons':[...]} -> HTTP 400 (issue 1498 reproduced)")

    # (1) the array body must be accepted
    st, out = mod.schedules_put("w", LIVE, "stubtoken")
    if st == 200 and isinstance(SEEN[-1], list) and SEEN[-1] == [{"cron": c} for c in LIVE]:
        print("OK  array body [{'cron':...}] -> HTTP 200; sent=%s" % json.dumps(SEEN[-1]))
    else:
        fails.append("schedules_put did not send the array shape (HTTP %s, sent=%s)" % (st, SEEN[-1]))

    # (3)+(4) the GET parser
    st, have = mod.schedules_get("w", "stubtoken")
    if have == sorted(LIVE):
        print("OK  schedules_get -> %s" % have)
    else:
        fails.append("schedules_get returned %r (want %r)" % (have, sorted(LIVE)))
    if have == ["schedules"]:
        fails.append("schedules_get returned the sorted-dict-keys bug value ['schedules']")

    # (5) idempotency: live == declared must short-circuit with no PUT
    before = len(SEEN)
    ok = mod.schedules_apply("w", _write_toml(), "stubtoken")
    if ok and len(SEEN) == before:
        print("OK  schedules_apply short-circuited (in sync, no PUT)")
    else:
        fails.append("schedules_apply did not short-circuit (ok=%s, puts=%d)" % (ok, len(SEEN) - before))

    srv.shutdown()
    if fails:
        for f in fails:
            print("FAIL: " + f)
        return 1
    print("TEST-1498: PASS - array body accepted, object body rejected, GET parsed, in-sync idempotent")
    return 0


def _write_toml():
    """Write a throwaway artifact + wrangler.toml declaring the live cron set."""
    d = os.path.join(REPO, ".tmp-1498")
    os.makedirs(d, exist_ok=True)
    art = os.path.join(d, "worker.js")
    with open(art, "w", encoding="utf-8") as fh:
        fh.write('var VERSION = "0.0.1-test";\n')
    with open(os.path.join(d, "wrangler.toml"), "w", encoding="utf-8") as fh:
        fh.write('name = "stub"\n[triggers]\ncrons = ["30 5 * * 1"]\n')
    return art


if __name__ == "__main__":
    sys.exit(main())

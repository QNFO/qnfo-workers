#!/usr/bin/env python3
"""Offline tests for d1-restore-drill in cf_ops_actions.py (BP26-D1-DISCIPLINE-1). Run: python3 scripts/cf_ops_d1_drill_test.py"""
import contextlib, io, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cf_ops_actions as C

passed = failed = 0
def ok(c, l):
    global passed, failed
    if c: passed += 1
    else: failed += 1; print("FAIL", l)

def fake(restore_works=True, bookmark=True):
    state = {"n": 0, "deleted": False, "ledger": None}
    def call(method, path, token, body=None, timeout=60):
        if method == "POST" and path.endswith("/d1/database"):
            return 200, {"success": True, "result": {"uuid": "scratch-1"}}
        if "/time_travel/bookmark" in path:
            return 200, {"success": True, "result": {"bookmark": "bm1"} if bookmark else {}}
        if "/time_travel/restore" in path:
            if restore_works: state["n"] = 3
            return 200, {"success": restore_works}
        if method == "DELETE":
            state["deleted"] = True
            return 200, {"success": True}
        if path.endswith("/query"):
            sql = body["sql"]
            if "COUNT" in sql:
                return 200, {"success": True, "result": [{"results": [{"n": state["n"]}]}]}
            if "VALUES ('a')" in sql: state["n"] = 3
            if "VALUES ('d')" in sql: state["n"] = 5
            if "d1_restore_drills" in sql: state["ledger"] = body["params"]
            return 200, {"success": True, "result": [{"results": []}]}
        return 404, {}
    return call, state

def run(**kw):
    call, st = fake(**kw)
    C.call = call
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = C.d1_restore_drill("a", "t", caller=call, sleep=lambda s: None)
    return rc, st, buf.getvalue()

rc, st, out = run()
ok(rc == 0 and st["ledger"][3] == "pass" and st["deleted"] and st["ledger"][2] == 3, "pass path writes a pass row, deletes the scratch db")
rc, st, out = run(restore_works=False)
ok(rc == 1 and st["ledger"][3] == "fail" and st["deleted"], "a restore that does not restore fails the drill and still cleans up")
rc, st, out = run(bookmark=False)
ok(rc == 1 and st["ledger"][3] == "fail" and st["deleted"], "no bookmark fails and cleans up")
print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

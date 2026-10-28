#!/usr/bin/env python3
"""Offline tests for kill-switch-drill in cf_ops_actions.py (BP26-LEASES-KILLSWITCH-1). Run: python3 scripts/cf_ops_killswitch_test.py"""
import contextlib
import io
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cf_ops_actions as C

passed = failed = 0


def ok(c, label):
    global passed, failed
    if c:
        passed += 1
    else:
        failed += 1
        print("FAIL", label)


def world(honours_switch=True, observes=True, live_lock=False, restore_fails=False):
    st = {"flag": "off", "ledger": None, "writes": []}

    def db(sql, params=None):
        if "FROM deploy_locks" in sql:
            return True, [{"n": 1 if live_lock else 0}]
        if "SELECT value FROM ops_config" in sql:
            return True, [{"value": st["flag"]}]
        if "INSERT INTO ops_config" in sql:
            val = "on" if "'on'" in sql else (params or ["off"])[0]
            if val != "on" and restore_fails:
                return False, ["boom"]
            st["flag"] = val
            st["writes"].append(val)
            return True, []
        if "FROM cloud_ops_events" in sql:
            return True, [{"n": 1 if observes else 0}]
        if "INSERT INTO kill_switch_tests" in sql:
            st["ledger"] = params
            return True, []
        return True, []

    def guard(path, body=None, timeout=30):
        on = st["flag"] == "on" and honours_switch
        if path.endswith("/release"):
            return 200, {"released": True}
        if on:
            return 503, {"acquired": False, "reason": "kill-switch"}
        return 200, {"acquired": True, "token": "tkn"}
    return st, db, guard


def run(**kw):
    st, db, guard = world(**kw)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = C.kill_switch_drill("a", "t", guard=guard, db=db, sleep=lambda s: None)
    return rc, st, buf.getvalue()


rc, st, out = run()
ok(rc == 0 and st["ledger"][3] == "pass" and st["ledger"][1] == 1 and st["ledger"][2] == 1, "good path: pass row with 1 of 1 stopped and resumed")
ok(st["flag"] == "off" and st["writes"] == ["on", "off"], "the switch ends off: %r" % st["writes"])
rc, st, out = run(honours_switch=False)
ok(rc == 1 and st["ledger"][3] == "fail" and st["flag"] == "off", "a reader that ignores the switch fails the drill and the switch is still restored")
rc, st, out = run(observes=False)
ok(rc == 1 and st["ledger"][3] == "fail", "no observed event fails the drill")
rc, st, out = run(live_lock=True)
ok(rc == 1 and st["ledger"] is None and not st["writes"], "a live deploy lock refuses the drill before touching the flag")
rc, st, out = run(restore_fails=True)
ok(rc == 1 and st["ledger"][3] == "fail", "a failed restore write is a fail")
print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)

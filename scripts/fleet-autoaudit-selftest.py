#!/usr/bin/env python3
"""fleet-autoaudit-selftest.py - DRIFT-CONFIRM-1 acceptance gate. Offline: the guard and git are faked.

Proves run_guard() (a) does NOT re-run when the first pass is clean, (b) re-runs ONCE against a refreshed checkout when it
sees drift and reports the CONFIRMED result (a race that vanished is not reported), (c) still reports a drift that survives
the refresh, (d) keeps the first result when the checkout cannot be refreshed (no silent success, no crash), and
(e) preserves the guard return code and persists state. Exit 0 = all passed.
"""
import importlib.util, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("fa", os.path.join(HERE, "fleet-autoaudit.py"))
fa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fa)
fa.STATE = os.path.join(tempfile.mkdtemp(), "state.json")

fails = []
def check(label, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + label + ((" -- %r" % (extra,)) if extra != "" else ""))
    if not cond:
        fails.append(label)

def scenario(passes, refresh_result):
    calls = {"guard": 0, "refresh": 0}
    seq = list(passes)
    def fake_guard():
        calls["guard"] += 1
        return dict(seq.pop(0), _guard_rc=0)
    def fake_refresh():
        calls["refresh"] += 1
        return refresh_result
    fa._run_guard_once, fa._refresh_repo = fake_guard, fake_refresh
    return fa.run_guard(), calls

CLEAN = {"drift": [], "content_drift": [], "sync_workers": [{"worker": "a", "version": "1"}]}
DRIFT = {"drift": [{"worker": "qnfo-cloud-ops", "repo": "1.15.5", "live": "1.15.6"}], "content_drift": [], "sync_workers": []}

d, c = scenario([CLEAN], True)
check("clean first pass: guard runs once, no refresh attempted", c == {"guard": 1, "refresh": 0}, c)

d, c = scenario([DRIFT, CLEAN], True)
check("drift that vanishes on a fresh checkout is NOT reported", not d["drift"] and c == {"guard": 2, "refresh": 1}, (d.get("drift"), c))
check("the confirm step records what the first pass saw", d.get("_drift_confirm", {}).get("first_pass") == ["qnfo-cloud-ops"] and d["_drift_confirm"]["second_pass"] == [], d.get("_drift_confirm"))

d, c = scenario([DRIFT, DRIFT], True)
check("drift that SURVIVES the refresh is still reported", [i["worker"] for i in d["drift"]] == ["qnfo-cloud-ops"] and c["guard"] == 2, c)

d, c = scenario([DRIFT], False)
check("checkout could not be refreshed: first result stands, no second pass", [i["worker"] for i in d["drift"]] == ["qnfo-cloud-ops"] and c == {"guard": 1, "refresh": 1}, c)

CD = {"drift": [], "content_drift": [{"worker": "w", "repo_sha": "x"}], "sync_workers": []}
d, c = scenario([CD, CLEAN], True)
check("content drift is confirmed the same way", not d["content_drift"] and c["guard"] == 2, c)

d, c = scenario([DRIFT, CLEAN], True)
check("guard return code is preserved and state is persisted", d.get("_guard_rc") == 0 and os.path.getsize(fa.STATE) > 0)

print("\n%d failure(s)" % len(fails))
sys.exit(1 if fails else 0)

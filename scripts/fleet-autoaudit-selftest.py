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

# ---------------------------------------------------------------- DEPLOY-SETTLE-1
class FakeTime:
    """Virtual clock: sleep() advances time, so the budget logic is exercised instantly and deterministically."""
    def __init__(self): self.t = 1_000_000.0
    def time(self): return self.t
    def sleep(self, x): self.t += x

def settle_case(ahead, probes, age_s):
    """probes: {worker: [version, ...]} consumed one per probe (last value repeats)."""
    clock, calls = FakeTime(), {"probe": 0}
    seq = {w: list(v) for w, v in probes.items()}
    def fake_probe(w):
        calls["probe"] += 1
        v = seq[w]
        return v.pop(0) if len(v) > 1 else v[0]
    real = (fa.time, fa.probe_version, fa._commit_age_s)
    fa.time, fa.probe_version, fa._commit_age_s = clock, fake_probe, (lambda d: age_s)
    try:
        data = {"drift": [{"worker": a["worker"], "repo": a["repo"], "live": a["live"]} for a in ahead],
                "ahead": [dict(a, dir=a["worker"], artifact=a["worker"] + "/worker.js") for a in ahead], "sync_workers": []}
        out = fa._settle_inflight(data)
    finally:
        fa.time, fa.probe_version, fa._commit_age_s = real
    return out, calls, clock.t - 1_000_000.0

ERR = {"worker": "errata-hub", "repo": "1.1.4", "live": "1.1.3"}
RAD = {"worker": "radar-hub", "repo": "1.0.9", "live": "1.0.8"}

out, calls, waited = settle_case([ERR], {"errata-hub": ["1.1.3", "1.1.3", "1.1.4"]}, 60)
check("deploy landing inside the window -> SYNC, removed from drift AND ahead (so --apply cannot redeploy it)",
      not out["drift"] and not out["ahead"] and out["sync_workers"] == [{"worker": "errata-hub", "version": "1.1.4"}] and calls["probe"] == 3, (out, calls))
check("it only waited as long as needed", waited == 30, waited)

out, calls, waited = settle_case([ERR], {"errata-hub": ["1.1.3"]}, 60)
check("deploy that never lands stays DRIFT and ahead", [i["worker"] for i in out["drift"]] == ["errata-hub"] and len(out["ahead"]) == 1 and not out["sync_workers"], out)
check("the wait is bounded by the budget", waited <= fa.SETTLE_BUDGET_S and calls["probe"] <= 8, (waited, calls))

out, calls, waited = settle_case([ERR], {"errata-hub": ["1.1.3"]}, 5000)
check("an old commit cannot be mid-deploy: no probing, no waiting", calls["probe"] == 0 and waited == 0 and len(out["drift"]) == 1, (calls, waited))

out, calls, waited = settle_case([ERR], {"errata-hub": ["1.1.3"]}, None)
check("unknown commit age: no waiting (never guess)", calls["probe"] == 0 and waited == 0, (calls, waited))

out, calls, waited = settle_case([ERR, RAD], {"errata-hub": ["1.1.3", "1.1.4"], "radar-hub": ["1.0.8"]}, 60)
check("mixed: the one that landed is SYNC, the one that did not stays DRIFT",
      [i["worker"] for i in out["drift"]] == ["radar-hub"] and [i["worker"] for i in out["ahead"]] == ["radar-hub"] and [i["worker"] for i in out["sync_workers"]] == ["errata-hub"], out)

# a drift row that is NOT repo-ahead (live ahead of repo) is never touched or waited on
calls2 = {"probe": 0}
real = fa.probe_version
fa.probe_version = lambda w: calls2.__setitem__("probe", calls2["probe"] + 1) or "x"
try:
    live_ahead = fa._settle_inflight({"drift": [{"worker": "w", "repo": "1.0", "live": "2.0"}], "ahead": [], "sync_workers": []})
finally:
    fa.probe_version = real
check("drift that is not repo-ahead is never waited on", calls2["probe"] == 0 and len(live_ahead["drift"]) == 1, calls2)

# end to end: run_guard settles after the confirm step and persists the settled result
real_guard, real_ref, real_settle_deps = fa._run_guard_once, fa._refresh_repo, (fa.time, fa.probe_version, fa._commit_age_s)
fa._run_guard_once = lambda: dict({"drift": [{"worker": "errata-hub", "repo": "1.1.4", "live": "1.1.3"}], "content_drift": [],
    "ahead": [{"worker": "errata-hub", "dir": "errata-hub", "repo": "1.1.4", "live": "1.1.3", "artifact": "errata-hub/worker.js"}], "sync_workers": []}, _guard_rc=0)
fa._refresh_repo = lambda: False
fa.time, fa.probe_version, fa._commit_age_s = FakeTime(), (lambda w: "1.1.4"), (lambda d: 30)
try:
    d = fa.run_guard()
finally:
    fa._run_guard_once, fa._refresh_repo = real_guard, real_ref
    fa.time, fa.probe_version, fa._commit_age_s = real_settle_deps
check("run_guard end to end: in-flight deploy reported SYNC, state persisted without drift",
      not d["drift"] and not d["ahead"] and d.get("_deploy_settle", {}).get("settled") == ["errata-hub"], d.get("_deploy_settle"))

print("\n%d failure(s)" % len(fails))
sys.exit(1 if fails else 0)

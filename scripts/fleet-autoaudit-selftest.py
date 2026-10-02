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


# _commit_age_s against REAL git: full clone answers per-path, a shallow clone must answer None (never a misleading HEAD age)
import subprocess as _sp
_tmp = tempfile.mkdtemp()
_o = os.path.join(_tmp, "o"); os.makedirs(_o)
def _g(cwd, *a): return _sp.run(["git", *a], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()
_g(_o, "init", "-q", "-b", "main"); _g(_o, "config", "user.email", "a@b"); _g(_o, "config", "user.name", "t")
os.makedirs(os.path.join(_o, "old")); os.makedirs(os.path.join(_o, "new"))
open(os.path.join(_o, "old", "f"), "w").write("1"); _g(_o, "add", "."); _sp.run(["git", "commit", "-qm", "old", "--date", "2020-01-01T00:00:00"], cwd=_o, env=dict(os.environ, GIT_COMMITTER_DATE="2020-01-01T00:00:00"), check=True)
open(os.path.join(_o, "new", "f"), "w").write("2"); _g(_o, "add", "."); _g(_o, "commit", "-qm", "new")
_full = os.path.join(_tmp, "full"); _sh = os.path.join(_tmp, "shallow")
_sp.run(["git", "clone", "-q", _o, _full], check=True); _sp.run(["git", "clone", "-q", "--depth", "1", "file://" + _o, _sh], check=True)
_real_root = fa.ROOT
try:
    fa.ROOT = _full
    a_old, a_new = fa._commit_age_s("old"), fa._commit_age_s("new")
    check("full clone: per-directory age (old dir is old, new dir is fresh)", a_old is not None and a_new is not None and a_old > 86400 * 365 and a_new < 120, (a_old, a_new))
    fa.ROOT = _sh
    check("shallow clone: age is UNKNOWN (None) for every directory, never HEAD's age", fa._commit_age_s("old") is None and fa._commit_age_s("new") is None, (fa._commit_age_s("old"), fa._commit_age_s("new")))
finally:
    fa.ROOT = _real_root

# DRIFT-CONFIRM-DIRTY-1: the refresh still fast-forwards when this run's audit artifact is modified in the working tree and
# main carries a newer copy of the same file; this run's copy is kept (the artifact step writes it from this run's data).
_r = os.path.join(_tmp, "remote"); _sp.run(["git", "clone", "-q", "--bare", _o, _r], check=True)
_c = os.path.join(_tmp, "ci"); _sp.run(["git", "clone", "-q", _r, _c], check=True)
_p = os.path.join(_tmp, "pusher"); _sp.run(["git", "clone", "-q", _r, _p], check=True)
for _d in (_c, _p):
    _g(_d, "config", "user.email", "a@b"); _g(_d, "config", "user.name", "t")
os.makedirs(os.path.join(_p, "audits")); open(os.path.join(_p, "audits", "a.json"), "w").write("v1")
_g(_p, "add", "."); _g(_p, "commit", "-qm", "artifact v1"); _g(_p, "push", "-q", "origin", "HEAD:main")
_g(_c, "pull", "-q", "--ff-only", "origin", "main")
open(os.path.join(_p, "audits", "a.json"), "w").write("v2-other-run"); open(os.path.join(_p, "new", "f"), "w").write("worker 0.4.99")
_g(_p, "add", "."); _g(_p, "commit", "-qm", "newer artifact and a worker bump"); _g(_p, "push", "-q", "origin", "HEAD:main")
open(os.path.join(_c, "audits", "a.json"), "w").write("this-run")
# a fresh module: the scenario tests above replace fa._refresh_repo with a stub and never put the real one back
_fa2 = importlib.util.module_from_spec(spec); spec.loader.exec_module(_fa2)
_fa2.ROOT = _c
moved = _fa2._refresh_repo()
check("refresh fast-forwards past a newer audit artifact on main while this run's artifact is modified",
      moved and open(os.path.join(_c, "new", "f")).read() == "worker 0.4.99", moved)
check("this run's artifact is kept after the refresh", open(os.path.join(_c, "audits", "a.json")).read() == "this-run")
check("a refresh with nothing new returns False and keeps the artifact",
      _fa2._refresh_repo() is False and open(os.path.join(_c, "audits", "a.json")).read() == "this-run")


# ---------------------------------------------------------------- RATELIMIT-RETRY-1
import io, json as _json, urllib.error as _ue, urllib.request as _ur
class _H(dict):
    def get(self, k, d=None): return super().get(k, d)
def _wait(code, headers=None, body=b"", attempt=0):
    return fa._rate_limit_wait(code, _H(headers or {}), body, attempt)

RL = b'{"message":"API rate limit exceeded for installation. If you reach out to GitHub Support..."}'
check("the exact message from run 36836230221 is retried, with backoff", _wait(403, {}, RL, 0) == 15 and _wait(403, {}, RL, 1) == 30 and _wait(403, {}, RL, 2) == 60, [_wait(403, {}, RL, i) for i in range(3)])
check("backoff is capped", _wait(403, {}, RL, 9) == fa.GH_RETRY_CAP_S, _wait(403, {}, RL, 9))
check("Retry-After is honoured", _wait(403, {"Retry-After": "20"}, RL, 0) == 20)
check("Retry-After is capped too", _wait(429, {"Retry-After": "9999"}, b"", 0) == fa.GH_RETRY_CAP_S)
import time as _t
check("x-ratelimit-reset is honoured when the quota is 0", 40 <= _wait(403, {"x-ratelimit-remaining": "0", "x-ratelimit-reset": str(int(_t.time()) + 45)}, b"forbidden", 0) <= 50)
check("429 is always a rate limit", _wait(429, {}, b"", 0) == 15)
check("secondary rate limit text is retried", _wait(403, {}, b'{"message":"You have exceeded a secondary rate limit."}', 0) == 15)
check("a 403 that is NOT a rate limit fails immediately (no retry)", _wait(403, {}, b'{"message":"Resource not accessible by integration"}', 0) is None)
check("404 / 422 / 500 are never retried as rate limits", all(_wait(c, {}, RL, 0) is None for c in (404, 422, 500)))

def run_gh(responses):
    """responses: list of ('ok', obj) | ('err', code, headers, body). Returns (result, attempts, slept)."""
    os.environ["GITHUB_TOKEN"], os.environ["GITHUB_REPOSITORY"] = "t", "o/r"
    seq, calls, slept = list(responses), {"n": 0}, []
    def fake_urlopen(req, timeout=30):
        calls["n"] += 1
        r = seq.pop(0)
        if r[0] == "ok":
            return io.BytesIO(_json.dumps(r[1]).encode())
        raise _ue.HTTPError(req.full_url, r[1], "x", _H(r[2]), io.BytesIO(r[3]))
    class _T:
        time = staticmethod(_t.time)
        @staticmethod
        def sleep(x): slept.append(x)
    real = (_ur.urlopen, fa.time)
    _ur.urlopen, fa.time = fake_urlopen, _T
    try:
        res = fa.gh_api("PATCH", "/issues/52", {"body": "x"})
    finally:
        _ur.urlopen, fa.time = real
    return res, calls["n"], slept

res, n, slept = run_gh([("err", 403, {}, RL), ("err", 403, {}, RL), ("ok", {"number": 52})])
check("rate-limited twice then recovers: the call succeeds, with backoff sleeps", res == {"number": 52} and n == 3 and slept == [15, 30], (res, n, slept))
res, n, slept = run_gh([("err", 403, {}, RL)] * 5)
check("never recovers: gives up with a clear, honest error after bounded attempts", "_error" in res and "rate-limited; gave up" in res["_error"] and n <= fa.GH_RETRY_MAX and sum(slept) <= fa.GH_RETRY_BUDGET_S, (res, n, slept))
res, n, slept = run_gh([("err", 403, {}, b'{"message":"Resource not accessible by integration"}')])
check("a non-rate-limit 403 is NOT retried (one attempt, no sleep)", "_error" in res and n == 1 and slept == [], (n, slept))
res, n, slept = run_gh([("ok", [1, 2])])
check("a normal success makes exactly one call", res == [1, 2] and n == 1 and slept == [], (n, slept))

# RATELIMIT-FAILFAST-1: a quota that GitHub says resets after the retry budget is not slept on (was: 240 s, then fail)
_far = {"x-ratelimit-remaining": "0", "x-ratelimit-reset": str(int(_t.time()) + 2400)}
res, n, slept = run_gh([("err", 403, _far, RL)] * 5)
check("quota resets beyond the budget: one attempt, no sleep, an honest error naming the reset", "_error" in res and n == 1 and slept == [] and "quota resets in" in res["_error"] and "not waiting" in res["_error"], (res, n, slept))
res, n, slept = run_gh([("err", 403, {"Retry-After": "9999"}, RL)] * 5)
check("a Retry-After beyond the budget is not slept on either", "_error" in res and n == 1 and slept == [], (n, slept))
_near = {"x-ratelimit-remaining": "0", "x-ratelimit-reset": str(int(_t.time()) + 20)}
res, n, slept = run_gh([("err", 403, _near, RL), ("ok", {"number": 52})])
check("a reset inside the budget is still waited out and the call recovers", res == {"number": 52} and n == 2 and len(slept) == 1 and 15 <= slept[0] <= 30, (res, n, slept))
res, n, slept = run_gh([("err", 403, {"x-ratelimit-remaining": "12", "x-ratelimit-reset": _far["x-ratelimit-reset"]}, b'{"message":"Resource not accessible by integration"}')])
check("a non-rate-limit 403 (quota left) still fails as itself, with no quota message", "_error" in res and n == 1 and slept == [] and "quota resets" not in res["_error"] and "rate-limited" not in res["_error"], res)

# APPLY-NO-REPUBLISH-1: in one fleet-autodeploy job only the --audit step refreshes the tracking issue
check("--audit publishes the report", fa.should_publish("--audit") is True)
check("--apply does not publish it again", fa.should_publish("--apply") is False)

def run_main(argv):
    calls = {"publish": 0, "apply": 0, "failure_events": 0}
    saved = {k: getattr(fa, k) for k in ("run_guard", "classify", "write_audit_rows", "purge_stale", "publish_issue", "apply_ahead", "_record_publish_failure", "ROOT")}
    saved_argv = sys.argv
    fa.run_guard = lambda: {"scope": "subset", "ahead": [], "_guard_rc": 0}
    fa.classify = lambda d: {"w": {"note": "SYNC"}}
    fa.write_audit_rows = lambda rows: (1, [], "2026-10-02 09:00:00")
    fa.purge_stale = lambda now: (0, None)
    def _pub(body):
        calls["publish"] += 1
        return "updated", 52, "HTTP 403: rate limit"
    def _apply(d):
        calls["apply"] += 1
        return []
    def _rec(*a):
        calls["failure_events"] += 1
    fa.publish_issue, fa.apply_ahead, fa._record_publish_failure = _pub, _apply, _rec
    fa.ROOT = tempfile.mkdtemp()
    sys.argv = ["fleet-autoaudit.py", argv]
    rc = None
    try:
        fa.main()
    except SystemExit as e:
        rc = e.code
    finally:
        for k, v in saved.items():
            setattr(fa, k, v)
        sys.argv = saved_argv
    return rc, calls

rc, calls = run_main("--audit")
check("main --audit: publishes once and records the failed publish as an event", calls == {"publish": 1, "apply": 0, "failure_events": 1} and rc == 0, (rc, calls))
rc, calls = run_main("--apply")
check("main --apply: deploys, makes no GitHub issue call and writes no publish-failed row", calls == {"publish": 0, "apply": 1, "failure_events": 0} and rc == 0, (rc, calls))


# a publish that fails after retries leaves a fleet-visible event, and a broken D1 can never break the audit
seen = []
real_d1 = fa.d1
fa.d1 = lambda sql, params: seen.append((sql, params)) or {"success": True}
try:
    fa._record_publish_failure("updated", 52, "HTTP 403: rate limit", "2026-10-01 08:26:46")
finally:
    fa.d1 = real_d1
ok_ev = len(seen) == 1 and "cloud_ops_events" in seen[0][0] and seen[0][1][2] == "autoaudit.publish-failed" and seen[0][1][5] == "fleet-autoaudit" and seen[0][1][6] == "error" and len(seen[0][1]) == 7
check("publish failure writes one cloud_ops_events row (7 columns, kind autoaudit.publish-failed)", ok_ev, seen and seen[0][1])
check("the event says D1 is current and the report is stale", "stale" in seen[0][1][3] and "2026-10-01 08:26:46" in seen[0][1][3], seen[0][1][3])
def boom(sql, params): raise RuntimeError("d1 down")
fa.d1 = boom
try:
    fa._record_publish_failure("updated", 52, "x", "t"); survived = True
except Exception:
    survived = False
finally:
    fa.d1 = real_d1
check("a failing D1 write never breaks the audit", survived)

print("\n%d failure(s)" % len(fails))
sys.exit(1 if fails else 0)

"""ATTACH-MIND-LOCK-1 offline check: the workers.dev subdomain PUT in attach-mind-q08-route.py holds a real
qnfo-deploy-guard lease through scripts/secret_lock.py. The first wrapper (issue 100465's fix) posted
{"resource", "account_id"} to the Cloudflare API host, so the lease was never granted and the PUT never ran; this
suite fails on that shape. No network: the lock client and req() are replaced."""
import importlib.util, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "x")
sys.path.insert(0, HERE)
import secret_lock as sl  # noqa: E402

spec = importlib.util.spec_from_file_location("amq", os.path.join(HERE, "attach-mind-q08-route.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

fail = 0
def ok(c, msg):
    global fail
    if not c:
        fail += 1
        print("FAIL", msg)

events = []
real_call, real_req = sl._call, m.req

def fake_req(method, path, body=None, timeout=25, retries=2):
    events.append(("req", method, path))
    return 200, {"success": True}

def run(answer, req=fake_req):
    events.clear()
    sl._call = lambda path, payload: (events.append(("guard", path, dict(payload))), answer(path))[1]
    m.req = req
    try:
        return m.req_with_secret_lock("PUT", "/accounts/a/workers/scripts/q08-mind/subdomain", {"enabled": True})
    finally:
        sl._call, m.req = real_call, real_req

granted = lambda p: (200, {"acquired": True, "token": "tok-1"}) if p.endswith("acquire") else (200, {"released": True})
r = run(granted)
ok(r == (200, {"success": True}), "a granted lease runs the PUT and returns its answer: %r" % (r,))
kinds = [("guard " + e[1]) if e[0] == "guard" else ("req " + e[1]) for e in events]
ok(kinds == ["guard /secret-lock/acquire", "req PUT", "guard /secret-lock/release"], "acquire, then the PUT, then release: %r" % kinds)
guard = [e for e in events if e[0] == "guard"]
acq = guard[0][2] if guard else {}
ok(acq.get("worker") == "q08-mind" and acq.get("ttl_sec") == 300 and acq.get("owner") == "ci/attach-mind-q08-route", "the lease names the worker, a 300 s ttl and an owner: %r" % (acq,))
ok(len(guard) == 2 and guard[1][2] == {"worker": "q08-mind", "token": "tok-1"}, "release carries the worker and the token: %r" % (guard,))
ok(not any(e[0] == "req" and "secret-lock" in e[2] for e in events), "the lease is never requested through req() (the Cloudflare API host)")

r = run(lambda p: (200, {"acquired": False, "holder": "other-session"}))
ok(r[0] == 0 and r[1].get("secret_lock") == "denied", "a lease held by another session returns (0, denied): %r" % (r,))
ok([e[0] for e in events] == ["guard"], "a denied lease never reaches the PUT and has nothing to release: %r" % events)

r = run(lambda p: (503, None))
ok(r == (200, {"success": True}), "an unreachable lock service degrades and the PUT still runs (secret_lock.py contract): %r" % (r,))
ok([e[0] for e in events] == ["guard", "req"], "no token means no release call: %r" % events)

def boom(*a, **k):
    events.append(("req", "PUT", "boom"))
    raise RuntimeError("transport")
try:
    run(granted, req=boom)
    ok(False, "an exception in the PUT propagates")
except RuntimeError:
    ok(events[-1][:2] == ("guard", "/secret-lock/release"), "the lease is released when the PUT raises: %r" % events)

src = open(os.path.join(HERE, "attach-mind-q08-route.py"), encoding="utf-8").read()
ok('"resource": "workers/scripts"' not in src and "_acquire_secret_lock" not in src, "the broken req()-based lock helpers are gone")
ok('req_with_secret_lock(\n        "PUT",\n        f"/accounts/{ACCT}/workers/scripts/{SERVICE}/subdomain"' in src, "the subdomain PUT goes through req_with_secret_lock")
print("%d failed" % fail if fail else "all passed")
sys.exit(1 if fail else 0)

#!/usr/bin/env python3
"""Offline tests for ACTIVITYPUB-WEBFINGER-1 (cf_ops_actions.py gen-activitypub-key).
Proves: refuses a worker outside AP_WORKERS; never rotates when a secret already exists; writes both secrets under the lock
when absent; never emits the private key; reports failure when a PUT or the verification read fails.
Run: python3 scripts/cf_ops_gen_ap_key_test.py   (prints "N passed, 0 failed")"""
import contextlib, io, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cf_ops_actions as C  # noqa: E402

passed = failed = 0
def ok(c, l, x=None):
    global passed, failed
    if c: passed += 1
    else:
        failed += 1; print("FAIL " + l + ("" if x is None else " :: " + str(x)[:300]))

PRIV = "-----BEGIN PRIVATE KEY-----\nSECRETMATERIAL\n-----END PRIVATE KEY-----\n"
PUB = "-----BEGIN PUBLIC KEY-----\nPUBMATERIAL\n-----END PUBLIC KEY-----\n"
calls, locks = [], []

@contextlib.contextmanager
def fake_lock(worker, ttl_sec=300, owner=""):
    locks.append(worker); yield

def run(existing, put_code=200, list_code=200, worker="qnfo-gateway"):
    calls.clear(); locks.clear(); state = {"names": list(existing)}
    def fake_call(method, path, token, body=None, timeout=60):
        calls.append((method, body["name"] if body else None))
        if method == "GET": return list_code, {"result": [{"name": n} for n in state["names"]]}
        if put_code == 200: state["names"].append(body["name"])
        return put_code, {}
    C.call = fake_call
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = C.gen_activitypub_key(worker, "acct", "tok", keygen=lambda: (PRIV, PUB), lock=fake_lock)
    out = buf.getvalue()
    return rc, json.loads(out.split("RESULT_JSON=")[1]), out

rc, r, out = run([], worker="qnfo-ops")
ok(rc == 3 and r["ok"] is False, "worker outside the allowlist is refused", r)
rc, r, out = run(["AP_PRIVATE_KEY", "AP_PUBLIC_KEY"])
ok(rc == 0 and r["rotated"] is False and not any(m == "PUT" for m, _ in calls), "existing secrets are never rotated", (r, calls))
rc, r, out = run(["AP_PRIVATE_KEY"])
ok(rc == 1 and not any(m == "PUT" for m, _ in calls), "a half-present pair is reported, not overwritten", r)
rc, r, out = run([])
ok(rc == 0 and r["ok"] and sorted(r["verified_present"]) == ["AP_PRIVATE_KEY", "AP_PUBLIC_KEY"] and locks == ["qnfo-gateway"], "absent pair is written under the lock and verified", (r, locks))
ok("SECRETMATERIAL" not in out, "the private key is never printed")
rc, r, out = run([], put_code=500)
ok(rc == 1 and r["ok"] is False, "a failed PUT fails the action", r)
rc, r, out = run([], list_code=403)
ok(rc == 1 and not any(m == "PUT" for m, _ in calls), "an unreadable secrets list writes nothing", r)
print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

#!/usr/bin/env python3
"""Offline tests for DANGLING-SERVICE-UNBIND-1 (cf_ops_actions.py unbind-service, #1756).

After the wave-2 deletes, qnfo-ops (KAIZEN, SKILLSYNC) and qnfo-fleet-dashboard (SVC_QNFO_KAIZEN) kept live service bindings
to deleted workers, and every canonical deploy of them failed with Cloudflare 10143. Proves: unbind-service removes only a
DANGLING service binding (target absent from the account, target repo directory RETIRED/FOLDED) that the worker's
wrangler.toml no longer declares; it refuses a binding to a live worker, to an unmarked directory, a non-service binding and
a binding still declared in wrangler.toml; it is allowed on a protected worker (it only removes a dead reference); it sends
only {type: inherit} entries plus the worker's Durable Object exports (DO-EXPORTS-PASSTHROUGH-1, else Cloudflare 100402) under
the secret-lock and verifies, and refuses when the namespaces cannot be read; a second run is a no-op.
Run: python3 scripts/cf_ops_unbind_service_test.py   (prints "N passed, 0 failed")
"""
import contextlib
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cf_ops_actions as C  # noqa: E402
import secret_lock  # noqa: E402

passed = failed = 0


def ok(cond, label, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + str(extra)[:300]))


root = tempfile.mkdtemp()


def mk(d, name, toml_extra="", js="", marker=None):
    os.makedirs(os.path.join(root, d), exist_ok=True)
    open(os.path.join(root, d, "wrangler.toml"), "w").write('name = "' + name + '"\n' + toml_extra)
    open(os.path.join(root, d, "worker.js"), "w").write(js)
    if marker:
        open(os.path.join(root, d, marker), "w").write("x")


mk("qnfo-ops", "qnfo-ops", '[[services]]\nbinding = "GATEWAY"\nservice = "qnfo-gateway"\n', 'var BINDING_KEYS = ["GATEWAY"];')
mk("qnfo-kaizen", "qnfo-kaizen", marker="RETIRED")
mk("qnfo-gone-unmarked", "qnfo-gone-unmarked")
mk("qnfo-gateway", "qnfo-gateway")

LIVE = {"qnfo-ops", "qnfo-gateway"}  # scripts that exist in the account
SETTINGS = {"qnfo-ops": {"bindings": [
    {"type": "service", "name": "GATEWAY", "service": "qnfo-gateway"},
    {"type": "service", "name": "KAIZEN", "service": "qnfo-kaizen"},
    {"type": "service", "name": "UNMARKED", "service": "qnfo-gone-unmarked"},
    {"type": "service", "name": "NONAME", "service": ""},
    {"type": "d1", "name": "AUDIT", "id": "35e2e573"},
    {"type": "secret_text", "name": "CF_API_TOKEN"}]}}
NS = {"status": 200, "rows": [{"script": "qnfo-ops", "class": "AgenticOpsExec", "use_sqlite": True},
                              {"script": "qnfo-ops", "class": "OldKv", "use_sqlite": False},
                              {"script": "other-worker", "class": "Elsewhere", "use_sqlite": True}]}
emitted, patched, locks = [], [], []
C.emit = lambda o: emitted.append(o)


def fake_call(method, path, token, body=None, timeout=60):
    if "/workers/durable_objects/namespaces" in path:
        return NS["status"], {"success": NS["status"] == 200, "result": NS["rows"], "result_info": {"total_pages": 1}}
    if path.endswith("/settings") and method == "GET":
        w = path.split("/workers/scripts/")[1].split("/")[0]
        if w not in LIVE:
            return 404, {}
        return 200, {"success": True, "result": SETTINGS.get(w, {"bindings": []})}
    return 404, {}


class FakeResp:
    status = 200
    def __init__(self, data): self.data = data
    def read(self): return self.data
    def __enter__(self): return self
    def __exit__(self, *a): return False


def fake_urlopen(req, timeout=60):
    body = req.data.decode()
    patched.append({"method": req.get_method(), "url": req.full_url, "body": body})
    part = body.split("\r\n\r\n", 1)[1].rsplit("\r\n--", 1)[0]
    w = req.full_url.split("/workers/scripts/")[1].split("/")[0]
    names = {x["name"] for x in json.loads(part)["bindings"]}
    SETTINGS[w]["bindings"] = [b for b in SETTINGS[w]["bindings"] if b["name"] in names]
    return FakeResp(json.dumps({"success": True}).encode())


@contextlib.contextmanager
def fake_lock(worker, ttl_sec=900, owner="x", call=None):
    locks.append(worker)
    yield "tok"


secret_lock.secret_lock = fake_lock
C.call = fake_call
C.urllib.request.urlopen = fake_urlopen
cwd = os.getcwd()
os.chdir(root)
try:
    ok(C.unbind_service("qnfo-ops", "a", "t") == 2, "a target without :BINDING is rejected")
    ok(C.unbind_service("qnfo-ops:GATEWAY", "a", "t") == 3 and "still exists" in emitted[-1]["refused"] and not patched, "a binding to a live worker is refused")
    ok(C.unbind_service("qnfo-ops:UNMARKED", "a", "t") == 3 and "RETIRED/FOLDED" in emitted[-1]["refused"] and not patched, "a binding to an unmarked directory is refused")
    ok(C.unbind_service("qnfo-ops:AUDIT", "a", "t") == 3 and emitted[-1]["refused"] == "not a service binding" and not patched, "a non-service binding is refused")
    open(os.path.join(root, "qnfo-ops", "wrangler.toml"), "a").write('[[services]]\nbinding = "KAIZEN"\nservice = "qnfo-kaizen"\n')
    ok(C.unbind_service("qnfo-ops:KAIZEN", "a", "t") == 3 and "still declares" in emitted[-1]["refused"] and not patched, "refused while wrangler.toml still declares the binding")
    open(os.path.join(root, "qnfo-ops", "wrangler.toml"), "w").write('name = "qnfo-ops"\n[[services]]\nbinding = "GATEWAY"\nservice = "qnfo-gateway"\n# KAIZEN removed\n')
    ok("qnfo-ops" in C.PROTECTED, "qnfo-ops is a protected worker")
    NS["status"] = 500
    ok(C.unbind_service("qnfo-ops:KAIZEN", "a", "t") == 1 and "Durable Object" in emitted[-1]["refused"] and not patched, "unreadable Durable Object namespaces: no PATCH (Cloudflare 100402 would follow)")
    NS["status"] = 200
    rc = C.unbind_service("qnfo-ops:KAIZEN", "a", "t")
    sent = json.loads(patched[-1]["body"].split("\r\n\r\n", 1)[1].rsplit("\r\n--", 1)[0])
    ok(rc == 0 and emitted[-1]["ok"] and emitted[-1]["protected_repair"] and emitted[-1]["bindings_after"] == 5, "a dangling binding is removed from a protected worker and verified", emitted[-1])
    ok(patched[-1]["method"] == "PATCH" and all(b["type"] == "inherit" for b in sent["bindings"]) and [b["name"] for b in sent["bindings"]] == ["GATEWAY", "UNMARKED", "NONAME", "AUDIT", "CF_API_TOKEN"], "only inherit entries are sent, no values", sent)
    ok(sent.get("exports") == {"AgenticOpsExec": {"type": "durable-object", "storage": "sqlite"}, "OldKv": {"type": "durable-object", "storage": "legacy-kv"}}, "every Durable Object class the worker owns is declared in exports with its own storage, and no other worker's", sent.get("exports"))
    ok(locks == ["qnfo-ops"], "the mutation ran under the secret-lock for the worker", locks)
    rc2 = C.unbind_service("qnfo-ops:NONAME", "a", "t")
    ok(rc2 == 0 and emitted[-1]["ok"] and emitted[-1]["service"] == "", "a service binding with no target name is dangling and removable", emitted[-1])
    ok(C.unbind_service("qnfo-ops:KAIZEN", "a", "t") == 0 and emitted[-1].get("already_absent"), "a second run is a no-op")
    ok(C.unbind_service("qnfo-missing:X", "a", "t") == 1 and "settings HTTP 404" in emitted[-1]["error"], "a worker absent from the account is an error, not a write")
finally:
    os.chdir(cwd)

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

#!/usr/bin/env python3
"""Offline tests for UNBIND-UNUSED-1, D2C-CF-ACTIONS-1 (set-worker-var, gateway-set-retries) and mcp-portals in cf_ops_actions.py.

Run: python3 scripts/cf_ops_infra_actions_test.py   (prints "N passed, 0 failed")
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


def mk(d, toml="", js=""):
    os.makedirs(os.path.join(root, d), exist_ok=True)
    open(os.path.join(root, d, "wrangler.toml"), "w").write('name = "' + d + '"\n' + toml)
    open(os.path.join(root, d, "worker.js"), "w").write(js)


mk("qnfo-research-exec", '[[services]]\nbinding = "KEEP_SVC"\nservice = "x"\n', "KEEP_SVC")
mk("qnfo-ai", "", "")
os.makedirs(os.path.join(root, "scripts"), exist_ok=True)
json.dump({"allowed": [{"id": "glm-5.3-flash", "wa": "@cf/zai/glm-5.3-flash"}]}, open(os.path.join(root, "scripts", "model-policy.json"), "w"))

SETTINGS = {"qnfo-research-exec": {"bindings": [
    {"type": "service", "name": "PDF_SVC", "service": "qnfo-pdf"},
    {"type": "service", "name": "KEEP_SVC", "service": "x"},
    {"type": "vectorize", "name": "DECLARED_VZ", "index_name": "i"},
    {"type": "d1", "name": "AUDIT", "id": "1"}]},
    "qnfo-fleet-lee": {"bindings": [{"type": "plain_text", "name": "AI_MODEL", "text": "old"}, {"type": "secret_text", "name": "K"}]}}
GATEWAY = {"id": "default", "retry_max_attempts": 1, "retry_delay": 500, "retry_backoff": "constant", "spend_limits": {"daily": 5},
           "created_at": "t", "modified_at": "t", "collect_logs": True}
PORTALS = {"status": 200}
emitted, patched, task_count = [], [], [0]
C.emit = lambda o: emitted.append(o)


def fake_call(method, path, token, body=None, timeout=60):
    if "/workers/durable_objects/namespaces" in path:
        return 200, {"success": True, "result": [], "result_info": {"total_pages": 1}}
    if "/d1/database/" in path and method == "POST":
        return 200, {"success": True, "result": [{"results": [{"n": task_count[0]}]}]}
    if path.endswith("/settings") and method == "GET":
        w = path.split("/workers/scripts/")[1].split("/")[0]
        return (200, {"success": True, "result": SETTINGS[w]}) if w in SETTINGS else (404, {})
    if "/ai-gateway/gateways/default" in path:
        global GATEWAY
        if method == "PUT":
            GATEWAY = dict(body)
            return 200, {"success": True}
        return 200, {"success": True, "result": GATEWAY}
    if "/access/ai-controls/mcp/portals" in path:
        if PORTALS["status"] != 200:
            return PORTALS["status"], {"success": False, "errors": [{"message": "Authentication error"}]}
        return 200, {"success": True, "result": [{"name": "front-door"}]}
    if "/access/ai-controls/mcp/servers" in path or path.endswith("/access/apps"):
        return 200, {"success": True, "result": []}
    return 404, {}


class FakeResp:
    status = 200

    def __init__(self, data):
        self.data = data

    def read(self):
        return self.data

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def fake_urlopen(req, timeout=60):
    body = req.data.decode()
    patched.append(body)
    part = body.split("\r\n\r\n", 1)[1].rsplit("\r\n--", 1)[0]
    w = req.full_url.split("/workers/scripts/")[1].split("/")[0]
    new = json.loads(part)["bindings"]
    old = {b["name"]: b for b in SETTINGS[w]["bindings"]}
    SETTINGS[w]["bindings"] = [old.get(b["name"]) if b["type"] == "inherit" else b for b in new]
    return FakeResp(json.dumps({"success": True}).encode())


@contextlib.contextmanager
def fake_lock(worker, ttl_sec=900, owner="x", call=None):
    yield "tok"


secret_lock.secret_lock = fake_lock
C.call = fake_call
C.urllib.request.urlopen = fake_urlopen
cwd = os.getcwd()
os.chdir(root)
try:
    # unbind-unused
    ok(C.unbind_unused("nocolon", "a", "t") == 2, "unbind-unused needs WORKER:BINDING")
    ok(C.unbind_unused("qnfo-research-exec:AUDIT", "a", "t") == 3 and not patched, "a D1 binding is refused")
    mk("qnfo-research-exec", "", "KEEP_SVC")
    ok(C.unbind_unused("qnfo-research-exec:KEEP_SVC", "a", "t") == 3 and "names the binding" in emitted[-1]["refused"] and not patched, "a binding worker.js names is refused")
    mk("qnfo-research-exec", '[[vectorize]]\nbinding = "DECLARED_VZ"\nindex_name = "i"\n', "")
    ok(C.unbind_unused("qnfo-research-exec:DECLARED_VZ", "a", "t") == 3 and "still declares" in emitted[-1]["refused"] and not patched, "a binding wrangler.toml declares is refused")
    mk("qnfo-research-exec", "", "")
    task_count[0] = 1
    ok(C.unbind_unused("qnfo-research-exec:PDF_SVC", "a", "t") == 3 and "fleet_tasks" in emitted[-1]["refused"] and not patched, "a binding a fleet_tasks definition names is refused")
    task_count[0] = 0
    rc = C.unbind_unused("qnfo-research-exec:PDF_SVC", "a", "t")
    ok(rc == 0 and emitted[-1]["ok"] and emitted[-1]["bindings_before"] == 4 and emitted[-1]["bindings_after"] == 3 and len(patched) == 1, "an unused service binding is removed on a protected worker, exactly one fewer", emitted[-1])
    ok(C.unbind_unused("qnfo-research-exec:PDF_SVC", "a", "t") == 0 and emitted[-1].get("already_absent") and len(patched) == 1, "a second run is a no-op")

    # set-worker-var
    ok(C.set_worker_var("qnfo-fleet-lee", "a", "t", root) == 2, "set-worker-var needs WORKER:NAME=VALUE")
    ok(C.set_worker_var("qnfo-ai:AI_MODEL=glm-5.3-flash", "a", "t", root) == 3 and "SET_VAR_ALLOWLIST" in emitted[-1]["refused"], "an unlisted worker is refused")
    ok(C.set_worker_var("qnfo-fleet-lee:AI_MODEL=gpt-9", "a", "t", root) == 3 and "model-policy" in emitted[-1]["refused"], "an AI_MODEL outside model-policy.json is refused")
    n = len(patched)
    ok(C.set_worker_var("qnfo-fleet-lee:AI_MODEL=glm-5.3-flash", "a", "t", root) == 0 and emitted[-1]["after"] == "glm-5.3-flash" and len(patched) == n + 1, "AI_MODEL is set and read back", emitted[-1])
    ok(C.set_worker_var("qnfo-fleet-lee:AI_MODEL=glm-5.3-flash", "a", "t", root) == 0 and emitted[-1].get("already_applied") and len(patched) == n + 1, "a rerun reports already_applied")
    ok(any(b["name"] == "K" for b in SETTINGS["qnfo-fleet-lee"]["bindings"]) and "secret" not in patched[-1].replace("secret_text", ""), "other bindings are inherited, never resent")

    # gateway-set-retries
    ok(C.gateway_set_retries("default", "a", "t") == 0 and GATEWAY["retry_max_attempts"] == 2 and GATEWAY["retry_backoff"] == "exponential" and emitted[-1]["spend_limits_unchanged"], "retries are set and spend limits read back unchanged", emitted[-1])
    ok("created_at" not in GATEWAY and GATEWAY["collect_logs"] is True, "read-only fields are dropped, other fields kept")
    ok(C.gateway_set_retries("default", "a", "t") == 0 and emitted[-1].get("already_applied"), "a rerun reports already_applied")

    # mcp-portals
    ok(C.mcp_portals("a", "t") == 0 and emitted[-1]["mcp_portals"]["names"] == ["front-door"] and emitted[-1]["read_only"], "mcp-portals lists portal names read-only")
    PORTALS["status"] = 403
    ok(C.mcp_portals("a", "t") == 1 and emitted[-1]["mcp_portals"]["refusal"] == "Authentication error" and emitted[-1]["mcp_portals"]["http"] == 403, "a refusal is reported with its text")
finally:
    os.chdir(cwd)

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

"""Offline self-test for scripts/cf_ops_actions.py delete-vectorize guards (no network)."""
import importlib.util, io, json, os, sys, contextlib
spec = importlib.util.spec_from_file_location("cfo", os.path.join(os.path.dirname(__file__), "cf_ops_actions.py"))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
os.chdir(os.path.join(os.path.dirname(__file__), ".."))
fails = 0
def run(name, calls):
    seen = []
    def fake(method, path, token, body=None, timeout=60):
        seen.append(method + " " + path.split("/accounts/A/")[-1])
        return calls(method, path)
    m.call = fake
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = m.delete_vectorize(name, "A", "T")
    return rc, json.loads(buf.getvalue().split("RESULT_JSON=")[-1]) if "RESULT_JSON=" in buf.getvalue() else {}, seen
def check(label, cond):
    global fails
    print(("PASS " if cond else "FAIL ") + label); fails += 0 if cond else 1
rc, out, seen = run("qnfo-ops-cache", lambda mt, p: (200, {}))
check("non-allowlisted index refused, no API call", rc == 3 and out.get("refused") == "not allowlisted" and not seen)
rc, out, seen = run("qnfo-calibration", lambda mt, p: (200, {"result": {}}))
check("owning worker still present -> refused, no DELETE", rc == 3 and "still exists" in out.get("refused", "") and not any(s.startswith("DELETE") for s in seen))
def nonempty(mt, p):
    if "workers/scripts" in p: return 404, {}
    return 200, {"result": {"vectorCount": 5}}
rc, out, seen = run("qnfo-calibration", nonempty)
check("non-empty index -> refused, no DELETE", rc == 3 and "not provably empty" in out.get("refused", "") and not any(s.startswith("DELETE") for s in seen))
state = {"deleted": False}
def happy(mt, p):
    if "workers/scripts" in p: return 404, {}
    if mt == "DELETE": state["deleted"] = True; return 200, {"success": True}
    return (404, {}) if state["deleted"] else (200, {"result": {"vectorCount": 0}})
rc, out, seen = run("qnfo-calibration", happy)
check("empty index, worker absent -> deleted and verified 404", rc == 0 and out.get("ok") and out.get("verify_info_http") == 404)
sys.exit(1 if fails else 0)

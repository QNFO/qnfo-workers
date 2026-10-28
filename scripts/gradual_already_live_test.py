"""GRADUAL-ALREADY-LIVE-1: re-deploying a VERSION that is already live is a no-op success, not a rolled-back smoke failure."""
import os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gradual_deploy as G

calls = []


def api(m, p, b=None, files=None):
    calls.append((m, p))
    if p.endswith("/deployments") and m == "GET":
        return 200, {"result": {"deployments": [{"versions": [{"version_id": "prev0000"}]}]}}
    if p.endswith("/settings"):
        return 200, {"result": {}}
    return 500, {}


with tempfile.TemporaryDirectory() as d:
    src = os.path.join(d, "worker.js")
    open(src, "w", encoding="utf-8").write('var VERSION = "9.9.9-x";\nexport default {};\n')
    out = []
    rc = G.run("w", "acct", "tok", path=src, api=api, fetch=lambda u, h=None: (200, '{"version":"9.9.9-x"}'), emit=out.append)
    assert rc == 0, out
    assert not any(m == "POST" for m, _ in calls), calls
    assert "already live" in out[-1], out
print("ok")

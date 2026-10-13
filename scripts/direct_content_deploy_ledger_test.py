#!/usr/bin/env python3
"""DEPLOY-SECOND-PATH-LEDGER-1 (agent_issues 2451, pillar core): offline suite for the deployment_history row that
scripts/direct_content_deploy.py writes per deploy attempt. A stubbed Cloudflare API, no network, no secret.
Runs in SUITE-RUNNER-1 through scripts/direct-content-deploy-ledger.test.mjs.
Proves: a success writes one row (action deploy-direct, status success, VERSION, deployed_by, ISO-8601 Z time, reason);
a failed deploy writes status failed; an exception while deploying is a failed row and the next target still runs; a
ledger write that raises or is refused leaves the deploy's exit result as it was and prints one stderr line; skips
write nothing; the qnfo-audit id is the fallback when the lookup is empty; the token never appears in any output.
"""
import contextlib
import importlib.util
import io
import json
import os
import re
import sys
import tempfile
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("direct_content_deploy", os.path.join(HERE, "direct_content_deploy.py"))
dcd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dcd)

TOKEN = "tok-SECRET-9f2c71"
FILES = {"w/wrangler.toml": 'name = "w"', "w/worker.js": 'var VERSION = "1.8.1";\nexport default { fetch() {} };\n',
         "v/wrangler.toml": 'name = "v"', "v/worker.js": 'const VERSION = "2.0.4";\naddEventListener("fetch", e => {});\n',
         "c/wrangler.toml": "[[containers]]\n", "c/worker.js": "x"}
fails = 0


def ok(cond, msg):
    global fails
    if not cond:
        fails += 1
    print(("PASS " if cond else "FAIL ") + msg)


def read(p):
    if p not in FILES:
        raise OSError(p)
    return FILES[p]


def stub(put=None, query=None, lookup=None):
    """A fake Cloudflare API. put/query/lookup override the answer (a tuple) or raise (an exception)."""
    log = []

    def call(method, path, token, body=None, headers=None, timeout=60):
        assert token == TOKEN
        entry = {"method": method, "path": path, "body": json.loads(body) if body and "/query" in path else None}
        log.append(entry)
        if path.endswith("/absent/settings"):
            return 404, {}
        if "d1/database?name" in path:
            return lookup if lookup is not None else (200, {"result": [{"name": "qnfo-audit", "uuid": "db-by-name"}]})
        if path.endswith("/query"):
            if isinstance(query, Exception):
                raise query
            return query or (200, {"success": True})
        if method == "PUT":
            if isinstance(put, Exception):
                raise put
            if put and callable(put):
                return put(path)
            return put or (200, {"success": True})
        return 200, {"success": True}
    return call, log


def run(argv, call):
    out, err = io.StringIO(), io.StringIO()
    os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"] = "acct", TOKEN
    os.environ["GITHUB_RUN_ID"] = "4242"
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        rc = dcd.main(argv, call, read)
    return rc, out.getvalue(), err.getvalue()


def ledger_rows(log):
    return [e["body"] for e in log if e["body"] and "INTO deployment_history" in e["body"]["sql"]]


COLS = ["resource_type", "resource_name", "action", "version_id", "deployed_by", "deployed_at", "status", "notes"]
ISO_Z = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
seen = []

# 1. a success through the fallback file writes one row, status success, with the reason the fallback ran
tf = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False)
tf.write("w w/worker.js\n")
tf.close()
call, log = stub()
rc, out, err = run(["--targets", tf.name], call)
seen.append(out + err)
rows = ledger_rows(log)
ok(rc == 0 and len(rows) == 1, "a successful fallback deploy exits 0 and writes exactly one deployment_history row (%d)" % len(rows))
row = dict(zip(COLS, rows[0]["params"])) if rows else {}
ok(re.search(r"\?1.*\?8", rows[0]["sql"] if rows else "") is not None and len(rows[0]["params"]) == 8 if rows else False,
   "the row is a parameterised statement (?1..?8) with eight params")
ok(row.get("resource_type") == "worker" and row.get("resource_name") == "w" and row.get("action") == "deploy-direct",
   "resource_type worker, resource_name w, action deploy-direct: %s" % {k: row.get(k) for k in COLS[:3]})
ok(row.get("status") == "success" and row.get("version_id") == "1.8.1" and row.get("deployed_by") == "canonical-deploy/direct_content_deploy",
   "status success, version_id 1.8.1, deployed_by canonical-deploy/direct_content_deploy")
ok(bool(ISO_Z.match(row.get("deployed_at") or "")), "deployed_at is ISO-8601 UTC with Z: %s" % row.get("deployed_at"))
notes = row.get("notes") or ""
ok("1.8.1" in notes and "unreachable" in notes and "run 4242" in notes and len(notes) <= 500,
   "notes carry the version, the run and why the fallback ran: %s" % notes[:160])
ok(any("/d1/database/db-by-name/query" in e["path"] for e in log), "the row goes to the database the by-name lookup returned")
ok(sum(1 for e in log if e["body"] and "cloud_ops_events" in e["body"]["sql"]) == 1, "the cloud_ops_events deploy-fallback row is still written")
os.unlink(tf.name)

# 2. a drill writes status success with the drill reason, and the spof_registry stamp still follows
call, log = stub()
rc, out, err = run(["--worker", "w", "--path", "w/worker.js", "--drill"], call)
seen.append(out + err)
rows = ledger_rows(log)
ok(rc == 0 and len(rows) == 1 and rows[0]["params"][6] == "success" and "drill" in rows[0]["params"][7],
   "a drill writes one success row whose notes name the drill")
ok(any(e["body"] and "UPDATE spof_registry" in e["body"]["sql"] for e in log), "the drill still stamps spof_registry")

# 3. a failed deploy (HTTP 500 from the upload) writes status failed and exits 1; no cloud_ops_events ok row
call, log = stub(put=(500, {"success": False, "errors": [{"code": 10000, "message": "internal"}]}))
rc, out, err = run(["--worker", "w", "--path", "w/worker.js"], call)
seen.append(out + err)
rows = ledger_rows(log)
ok(rc == 1 and len(rows) == 1 and rows[0]["params"][6] == "failed" and rows[0]["params"][2] == "deploy-direct",
   "a failed deploy exits 1 and writes one row with status failed, action deploy-direct")
ok("HTTP 500" in rows[0]["params"][7] if rows else False, "the failed row's notes carry the HTTP status")
ok(not any(e["body"] and "cloud_ops_events" in e["body"]["sql"] for e in log), "a failed deploy writes no deploy-fallback ok event")

# 4. an exception while uploading one worker is a failed row, and the next target still deploys
def put_times_out_for_w(path):
    if path.endswith("/w/content"):
        raise urllib.error.URLError("timed out")
    return 200, {"success": True}


call, log = stub(put=put_times_out_for_w)
tf = tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False)
tf.write("w w/worker.js\nv v/worker.js\n")
tf.close()
rc, out, err = run(["--targets", tf.name], call)
seen.append(out + err)
rows = ledger_rows(log)
by = {r["params"][1]: r["params"] for r in rows}
ok(rc == 1 and by.get("w", [None] * 8)[6] == "failed" and by.get("w", [None] * 8)[3] == "1.8.1",
   "an upload exception is a failed row that still carries the VERSION read from worker.js")
ok(by.get("v", [None] * 8)[6] == "success" and by.get("v", [None] * 8)[3] == "2.0.4",
   "the next target still deploys after an exception and writes its own success row")
os.unlink(tf.name)

# 5. a ledger write that raises (with the token in its text) never changes the exit result and never prints the token
call, log = stub(query=RuntimeError("D1 down; header Bearer %s" % TOKEN))
rc, out, err = run(["--worker", "w", "--path", "w/worker.js"], call)
seen.append(out + err)
ok(rc == 0, "a successful deploy still exits 0 when every ledger write raises")
lines = [l for l in err.splitlines() if "deployment_history write failed" in l]
ok(len(lines) == 1, "the failed ledger write is one stderr line: %r" % err[:300])
ok(TOKEN not in out and TOKEN not in err and "***" in err, "the token is redacted from the warning")
call, log = stub(put=(500, {"success": False}), query=RuntimeError("D1 down"))
rc, out, err = run(["--worker", "w", "--path", "w/worker.js"], call)
seen.append(out + err)
ok(rc == 1, "a failed deploy still exits 1 when the ledger write raises")

# 6. a ledger write D1 refuses (success false, e.g. a guard trigger) is one stderr line and the deploy result stands
call, log = stub(query=(400, {"success": False, "errors": [{"message": "VERSION-MONOTONIC-1: version regresses"}]}))
rc, out, err = run(["--worker", "w", "--path", "w/worker.js"], call)
seen.append(out + err)
ok(rc == 0 and "deployment_history write failed" in err and "VERSION-MONOTONIC-1" in err,
   "a refused ledger insert leaves exit 0 and names the refusal on stderr")

# 7. an empty by-name lookup falls back to the qnfo-audit id
call, log = stub(lookup=(403, {"success": False, "result": None}))
rc, out, err = run(["--worker", "w", "--path", "w/worker.js"], call)
seen.append(out + err)
ok(rc == 0 and any("/d1/database/35e2e573-92f3-46ac-83c6-22f6429fc5e5/query" in e["path"] for e in log),
   "an empty database lookup writes to the known qnfo-audit id")

# 8. a skip (absent worker, container worker) is no deploy attempt and writes no row
call, log = stub()
rc, out, err = run(["--worker", "absent", "--path", "w/worker.js"], call)
rc2, out2, err2 = run(["--worker", "c", "--path", "c/worker.js"], call)
seen.append(out + err + out2 + err2)
ok(rc == 0 and rc2 == 0 and not ledger_rows(log), "skipped workers write no deployment_history row")

# 9. the token never appears in any captured output
ok(all(TOKEN not in s for s in seen), "the token appears in no output of any case")

# 10. the code-read probe of agent_issues 2451 passes on this checkout
src = open(os.path.join(HERE, "direct_content_deploy.py"), encoding="utf-8").read()
ok("deployment_history" in src, "scripts/direct_content_deploy.py contains deployment_history (the issue's code-probe)")

print("direct_content_deploy_ledger_test: %s (%d failed)" % ("ok" if not fails else "FAILED", fails))
sys.exit(1 if fails else 0)

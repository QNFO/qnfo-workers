#!/usr/bin/env python3
"""Offline tests for delete-pages-project (cf_ops_actions.py, QNFO.INFRA.PAGE #1, agent_issues 1001933).

Proves with a fake API: the verdict gate (active and custom-domain projects are refused before any backup or DELETE), a name that is
not plain is refused, an absent project is a no-op, the backup is written and read back BEFORE the DELETE, an unverified backup stops the
delete, and a retire-candidate with a verified backup is deleted and verified absent. No DELETE is sent on any refusal.
Run: python3 scripts/cf_ops_pages_retire_test.py   (prints "N passed, 0 failed")
"""
import contextlib
import io
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cf_ops_actions as C  # noqa: E402

passed = failed = 0


def ok(cond, label, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + str(extra)[:300]))


def iso_ago(days):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - days * 86400))


root = tempfile.mkdtemp()  # an empty repo tree: no workflow and no code names any project
PROJECTS = {
    "old-dead": {"name": "old-dead", "domains": ["old-dead.pages.dev"], "created_on": iso_ago(90),
                 "latest_deployment": {"created_on": iso_ago(60), "id": "d1", "url": "https://x.invalid/"}},
    "fresh": {"name": "fresh", "domains": ["fresh.pages.dev"], "created_on": iso_ago(5),
              "latest_deployment": {"created_on": iso_ago(1), "id": "d2", "url": "https://x.invalid/"}},
    "has-domain": {"name": "has-domain", "domains": ["has-domain.pages.dev", "site.example.org"], "created_on": iso_ago(90),
                   "latest_deployment": {"created_on": iso_ago(60)}},
}
LOG = []
STATE = {"deleted": set(), "put": 200, "corrupt": False, "store": {}}


def fake_call(method, path, token, body=None, timeout=60):
    LOG.append((method, path))
    if method == "GET" and "/pages/projects?" in path:
        return 200, {"success": True, "result": [v for k, v in PROJECTS.items() if k not in STATE["deleted"]]}
    name = path.rsplit("/", 1)[-1]
    if method == "DELETE":
        STATE["deleted"].add(name)
        return 200, {"success": True}
    if method == "GET":
        return (404, {}) if name in STATE["deleted"] else (200, {"success": True, "result": PROJECTS.get(name)})
    return 500, {}


def fake_put(acct, token, bucket, key, text):
    LOG.append(("PUT", bucket + "/" + key))
    if STATE["put"] in (200, 201):
        STATE["store"][key] = text + ("x" if STATE["corrupt"] else "")
    return STATE["put"]


def fake_get(acct, token, bucket, key):
    LOG.append(("R2GET", bucket + "/" + key))
    return (200, STATE["store"][key]) if key in STATE["store"] else (404, "")


C.call, C.r2_put_text, C.r2_get_text = fake_call, fake_put, fake_get


def run(name):
    LOG.clear()
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        rc = C.delete_pages_project(name, "acct", "tok", root)
    return rc, buf.getvalue(), [m for m, _ in LOG]


rc, out, ms = run("../etc")
ok(rc == 3 and "DELETE" not in ms and "not a plain project name" in out, "a non-plain name is refused", out)
rc, out, ms = run("fresh")
ok(rc == 3 and "DELETE" not in ms and "PUT" not in ms and "verdict is active" in out, "an active project is refused before any backup", out)
rc, out, ms = run("has-domain")
ok(rc == 3 and "DELETE" not in ms and "PUT" not in ms and "custom domain" in out, "a project with a custom domain is refused", out)
rc, out, ms = run("missing")
ok(rc == 0 and "already_absent" in out and "DELETE" not in ms, "an absent project is a no-op", out)

STATE["put"] = 500
rc, out, ms = run("old-dead")
ok(rc == 1 and "DELETE" not in ms and "backup not verified" in out, "a failed backup write stops the delete", out)
STATE["put"], STATE["corrupt"] = 200, True
rc, out, ms = run("old-dead")
ok(rc == 1 and "DELETE" not in ms and "backup not verified" in out, "a backup that reads back different stops the delete", out)

STATE["corrupt"] = False
rc, out, ms = run("old-dead")
ok(rc == 0 and '"deleted": true' in out and "old-dead" in STATE["deleted"], "a retire-candidate with a verified backup is deleted", out)
ok(ms.index("PUT") < ms.index("R2GET") < ms.index("DELETE"), "the backup is written and read back before the DELETE", ms)
ok("pages-retired/old-dead.json" in STATE["store"] and '"verdict"' in STATE["store"]["pages-retired/old-dead.json"],
   "the backup holds the verdict and sits under pages-retired/", list(STATE["store"]))

src = open(os.path.join(HERE, "cf_ops_actions.py"), encoding="utf-8").read()
wf = open(os.path.join(HERE, "..", ".github", "workflows", "cf-ops-actions.yml"), encoding="utf-8").read()
ok("- delete-pages-project" in wf, "the workflow offers delete-pages-project")
ok('"delete-pages-project"' in src.split('ap.add_argument("action"')[1].split("]")[0], "the CLI accepts the action")
print("%d passed, %d failed" % (passed, failed))
sys.exit(1 if failed else 0)

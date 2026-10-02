#!/usr/bin/env python3
"""ci-watchdog-selftest.py -- CI-WATCHDOG-LOGFETCH-1 acceptance gate.

Runs against a LOCAL http server, so it needs no token and no network. It proves
the two properties the patch exists to guarantee:

  1. `_raw_log()` hop 1 sends `Authorization: Bearer <token>` and does NOT
     auto-follow the 302; hop 2 fetches the pre-signed Location with NO
     Authorization header and returns the body. A 403 on hop 1 yields "" without
     raising -- a watchdog must degrade, never crash.
  2. `classify_structural()` names a workflow GitHub could not parse (run display
     name == the file path) as `invalid-workflow` WITHOUT downloading a log. That
     class is exactly the deploy-qnfo-ops.yml defect of 2026-09-29, whose runs
     carry ZERO jobs and therefore no log a fetch could ever retrieve.

Observed live before the patch: `curl -sSL .../runs/<id>/logs` -> http=403 size=180,
so every finding the structural classifier could not name degraded to `unknown`.

Exit 0 = every assertion passed. Exit 1 = at least one failed (the gate is red).
"""
from __future__ import annotations

import http.server
import importlib.util
import os
import socketserver
import sys
import threading

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "ci_watchdog.py")

spec = importlib.util.spec_from_file_location("ci_watchdog", TARGET)
cw = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cw)

seen: dict = {}
fails: list = []


def check(label: str, cond: bool, extra= "") -> None:
    print(("PASS " if cond else "FAIL ") + label + ((" -- %r" % (extra,)) if extra != "" else ""))
    if not cond:
        fails.append(label)


def _serve(handler_cls):
    socketserver.TCPServer.allow_reuse_address = True
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler_cls)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


class Redirector(http.server.BaseHTTPRequestHandler):
    """302s the job-log path to a 'pre-signed' URL, recording both hops' headers."""

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/repos/") and self.path.endswith("/logs"):
            seen["hop1_auth"] = self.headers.get("Authorization")
            seen["hop1_path"] = self.path
            self.send_response(302)
            self.send_header(
                "Location", "http://127.0.0.1:%d/blob?sig=abc" % self.server.server_address[1]
            )
            self.end_headers()
            return
        if self.path.startswith("/blob"):
            seen["hop2_auth"] = self.headers.get("Authorization")
            body = b"LOG-BODY-CONTENT-OK\n"
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()


class Forbidden(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        self.send_response(403)
        self.end_headers()
        self.wfile.write(b"nope")


def main() -> int:
    srv = _serve(Redirector)
    cw.API = "http://127.0.0.1:%d" % srv.server_address[1]
    cw.TOKEN = "test-token"

    txt = cw._raw_log(1)
    check("hop1 carried Authorization", seen.get("hop1_auth") == "Bearer test-token", seen.get("hop1_auth"))
    check("hop2 carried NO Authorization", seen.get("hop2_auth") is None, seen.get("hop2_auth"))
    check("hop2 actually ran (redirect was followed)", "hop2_auth" in seen)
    check("log body returned intact", txt == "LOG-BODY-CONTENT-OK\n", txt)
    srv.shutdown()

    srv2 = _serve(Forbidden)
    cw.API = "http://127.0.0.1:%d" % srv2.server_address[1]
    check("403 on hop1 -> empty string, no crash", cw._raw_log(1) == "")
    srv2.shutdown()

    k, h = cw.classify_structural(".github/workflows/deploy-qnfo-ops.yml", {"head_branch": "main"})
    check("unparseable workflow named structurally", k == "invalid-workflow", (k, h))
    k2, _ = cw.classify_structural("mirror-guard", {})
    check("mirror-guard still classified mirror-lag", k2 == "mirror-lag", k2)
    k3, _ = cw.classify_structural("ci-watchdog", {})
    check("self-workflow never self-files", k3 == "self", k3)
    k4, _ = cw.classify_structural("version-compare", {"head_branch": "main"})
    check("version-compare reaches the comparator branch", k4 in ("missing-module", "comparator-regression"), k4)

    # DEPLOY-AUTH-CLASS-1 (issue 212): log shapes taken from canonical-deploy runs 36831942233 / 36832200123.
    auth_log = (
        "    FAIL in 0.1s  status=401\n"
        '    error: "{\\"error\\":\\"Unauthorized - set ***\\"}"\n'
        "##[error]canonical deploy failed for qnfo-ops\n"
        "# ARTIFACT-PUSH-CONFLICT-1: snapshot re-apply, never a rebase conflict (was: run 1)\n"
        " ! [rejected]        HEAD -> main (fetch first)\n"
        "error: failed to push some refs to 'https://github.com/x/y'\n"
        "push rejected on attempt 1; re-applying the snapshot onto origin/main\n"
        "artifact pushed on attempt 2\n"
    )
    check("401 deploy failure is deploy-unauthorized, not push-race", cw.classify(auth_log, "canonical-deploy")[0] == "deploy-unauthorized")
    unrecovered = "# never a rebase conflict\nerror: failed to push some refs to 'x'\npush failed after 3 attempts\n"
    check("an unrecovered push race is still push-race", cw.classify(unrecovered, "canonical-deploy")[0] == "push-race")
    recovered = "error: failed to push some refs to 'x'\nhint: git pull --rebase\nstatus pushed on attempt 2\n"
    check("a recovered push is not a finding", cw.classify(recovered, "canonical-deploy")[0] == "unknown")
    check("git CONFLICT is still push-race", cw.classify("CONFLICT (content): Merge conflict in a.json", "w")[0] == "push-race")

    # SUPERSEDED-FAILURE-SKIP-1 (issues #332/#333): shapes taken from the live 2026-10-01 12:10-12:13Z ping-pong.
    failed = {"id": 36860029746, "workflow_id": 370301307, "name": "version-bump-guard", "head_branch": "claude/ecstatic-davinci-dnfa45",
              "conclusion": "failure", "created_at": "2026-10-01T12:10:39Z"}
    green_later = {"id": 36860215928, "workflow_id": 370301307, "name": "version-bump-guard", "head_branch": "claude/ecstatic-davinci-dnfa45",
                   "conclusion": "success", "created_at": "2026-10-01T12:12:22Z"}
    green_earlier = dict(green_later, id=1, created_at="2026-10-01T11:48:00Z")
    green_other_branch = dict(green_later, id=2, head_branch="main")
    green_other_wf = dict(green_later, id=3, workflow_id=1, name="mirror-guard")
    failed_later = dict(failed, id=4, created_at="2026-10-01T12:14:00Z")
    g = cw.superseded_by_green(failed, [failed_later, green_later, failed, green_earlier])
    check("later green run on the same branch supersedes the failure", bool(g) and g["id"] == 36860215928, g and g.get("id"))
    check("an earlier green run does not", cw.superseded_by_green(failed, [failed, green_earlier]) is None)
    check("a green run on another branch does not", cw.superseded_by_green(failed, [failed, green_other_branch]) is None)
    check("a green run of another workflow does not", cw.superseded_by_green(failed, [failed, green_other_wf]) is None)
    check("a later FAILED run does not", cw.superseded_by_green(failed, [failed, failed_later]) is None)
    check("the run never supersedes itself", cw.superseded_by_green(failed, [failed, dict(failed, conclusion="success")]) is None)
    ids = cw.run_ids_in_bodies([{"number": 332, "body": "2026-10-01T12:10:38 version-bump-guard [push/x] run=36860029746 retired=False"},
                                {"number": 7, "body": "no run here"}, {"number": 8, "body": None}])
    check("closed finding bodies yield run id -> issue number", ids == {36860029746: 332}, ids)
    check("branch_runs without a workflow id makes no call", cw.branch_runs(None, "main") == [])

    # API-BUDGET-1: the per-workflow history and contents calls are made only for workflows that declare a schedule.
    import tempfile
    ws = tempfile.mkdtemp(prefix="wd-")
    os.makedirs(os.path.join(ws, ".github", "workflows"))
    wf_list = []
    for i in range(1, 41):
        rel = ".github/workflows/w%d.yml" % i
        with open(os.path.join(ws, rel), "w", encoding="utf-8") as fh:
            fh.write("on:\n  push:\n" + ("  schedule:\n    - cron: '0 6 * * *'\n" if i <= 3 else ""))
        wf_list.append({"id": i, "name": "w%d" % i, "path": rel, "state": "active"})
    wf_list.append({"id": 99, "name": "gone", "path": ".github/workflows/gone.yml", "state": "active"})
    calls: list = []

    def fake_gh(path, method="GET", body=None):
        calls.append((method, path))
        if "/actions/workflows?" in path:
            return 200, {"workflows": wf_list}
        if "/actions/workflows/" in path and "/runs" in path:
            return 200, {"workflow_runs": [{"id": 1, "event": "push", "created_at": "2026-10-01T00:00:00Z"}]}
        return 200, {}

    old_ws, old_gh, old_tok = os.environ.get("GITHUB_WORKSPACE"), cw.gh, cw.TOKEN
    os.environ["GITHUB_WORKSPACE"] = ws
    cw.gh, cw.TOKEN = fake_gh, "t"
    try:
        check("a workflow file with a schedule is read from the checkout", cw.declares_schedule(".github/workflows/w1.yml") is True)
        check("a workflow file without one is read from the checkout", cw.declares_schedule(".github/workflows/w9.yml") is False)
        check("a file missing from the checkout is unknown, not False", cw.declares_schedule(".github/workflows/gone.yml") is None)
        import contextlib, io
        with contextlib.redirect_stdout(io.StringIO()):
            try:
                cw.main()
            except SystemExit:
                pass
        hist = [c for c in calls if "/actions/workflows/" in c[1] and "/runs" in c[1] and "branch=" not in c[1]]
        cont = [c for c in calls if "/contents/" in c[1]]
        check("history is fetched only for the 3 scheduled workflows and the 1 unknown file", len(hist) == 4, len(hist))
        check("contents is asked only for the file missing from the checkout", len(cont) == 1 and "gone.yml" in cont[0][1], cont)
        check("41 workflows cost under 30 API calls in total (was about 2 per workflow)", len(calls) < 30, len(calls))
    finally:
        cw.gh, cw.TOKEN = old_gh, old_tok
        if old_ws is None:
            os.environ.pop("GITHUB_WORKSPACE", None)
        else:
            os.environ["GITHUB_WORKSPACE"] = old_ws

    print("\n%d failure(s)" % len(fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

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


hits: dict = {}


class RateLimited(http.server.BaseHTTPRequestHandler):
    """GitHub's primary-limit answer: 403, x-ratelimit-remaining 0, 'API rate limit exceeded for installation'."""

    def log_message(self, *a):
        pass

    def do_GET(self):
        hits["rl"] = hits.get("rl", 0) + 1
        body = b'{"message":"API rate limit exceeded for installation ID 1."}'
        self.send_response(403)
        self.send_header("x-ratelimit-remaining", "0")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class IssuesApi(http.server.BaseHTTPRequestHandler):
    """Just enough of the issues API for file_or_refresh: an empty open list, then a created issue."""

    def log_message(self, *a):
        pass

    def _reply(self, code, obj):
        import json as _j
        body = _j.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        hits["GET " + self.path.split("?")[0]] = hits.get("GET " + self.path.split("?")[0], 0) + 1
        self._reply(200, [])

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(n)
        hits["POST " + self.path] = hits.get("POST " + self.path, 0) + 1
        self._reply(201, {"number": 9} if self.path.endswith("/issues") else {"name": "ci-watchdog"})


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

    # ACTIONS-QUOTA-1 (2026-10-02): the schedule declaration is read from the file, ignoring comments.
    check("a comment that says schedule: is not a schedule",
          cw.declares_schedule("# WHY push AND NOT schedule: on this repository\non:\n  push:\n    branches: [main]\n") is False)
    check("an on.schedule key is a schedule",
          cw.declares_schedule("on:\n  schedule:\n    - cron: '17 * * * *'\n  workflow_dispatch:\n") is True)
    check("a trailing comment after the key still counts",
          cw.declares_schedule("on:\n  schedule:   # opportunistic\n    - cron: '1 * * * *'\n") is True)
    check("a trailing comment mentioning schedule: does not",
          cw.declares_schedule("on:\n  push:  # not a schedule: trigger\n") is False)
    check("no text -> no schedule", cw.declares_schedule("") is False)
    check("a dynamic workflow path has no file -> None", cw.workflow_text("dynamic/github-code-scanning/codeql") is None)
    check("the watchdog's own file is read from the checkout",
          "workflow_run" in (cw.workflow_text(".github/workflows/ci-watchdog.yml") or ""))
    try:
        import yaml  # parity with a real YAML parse over every workflow in the repository
        import glob
        wf_dir = os.path.join(cw.ROOT, ".github", "workflows")
        disagree = []
        for p in sorted(glob.glob(os.path.join(wf_dir, "*.yml"))):
            with open(p, encoding="utf-8") as fh:
                txt = fh.read()
            doc = yaml.safe_load(txt) or {}
            on = doc.get(True, doc.get("on")) if isinstance(doc, dict) else None
            real = isinstance(on, dict) and "schedule" in on
            if cw.declares_schedule(txt) != real:
                disagree.append(os.path.basename(p))
        check("declares_schedule agrees with YAML on every workflow", not disagree, disagree)
    except ImportError:
        print("SKIP YAML parity check (PyYAML not installed)")

    # file_or_refresh lists the open findings once per sweep, files once, and a second finding with the same
    # title is 'already reported', not a duplicate issue.
    hits.clear()
    srv3 = _serve(IssuesApi)
    cw.API = "http://127.0.0.1:%d" % srv3.server_address[1]
    calls0 = cw.CALLS
    r1 = cw.file_or_refresh("unknown", "selftest-wf", "evidence run=1")
    r2 = cw.file_or_refresh("unknown", "selftest-wf", "evidence run=2")
    r3 = cw.file_or_refresh("unknown", "other-wf", "evidence run=3")
    srv3.shutdown()
    check("first finding files an issue", r1 == "filed #9", r1)
    check("same title in the same sweep is already reported", r2.startswith("already reported #9"), r2)
    check("open findings listed once for three findings", hits.get("GET /repos/%s/issues" % cw.REPO) == 1, hits)
    check("label created once, only because an issue was filed", hits.get("POST /repos/%s/labels" % cw.REPO) == 1, hits)
    check("two distinct titles -> two issue POSTs", hits.get("POST /repos/%s/issues" % cw.REPO) == 2, (r3, hits))
    check("calls are counted", cw.CALLS - calls0 == 4, cw.CALLS - calls0)

    # A plain 403 is not the budget; GitHub's rate-limit answer is, and it stops the sweep sending more.
    check("a plain 403 does not mark the sweep rate-limited", cw.RATE_LIMITED is False)
    hits.clear()
    srv4 = _serve(RateLimited)
    cw.API = "http://127.0.0.1:%d" % srv4.server_address[1]
    st, _ = cw.gh("/repos/x/y/actions/workflows?per_page=100")
    check("rate-limit answer -> 403 and RATE_LIMITED", st == 403 and cw.RATE_LIMITED is True, (st, cw.RATE_LIMITED))
    st2, d2 = cw.gh("/repos/x/y/actions/runs?per_page=60")
    check("later calls are answered locally, not sent", st2 == 403 and hits.get("rl") == 1 and d2.get("rate_limited"), (st2, hits))
    check("log fetch is skipped once rate-limited", cw._raw_log(1) == "" and hits.get("rl") == 1, hits)
    check("workflows() degrades to [] without raising", cw.workflows() == [])
    srv4.shutdown()
    cw.RATE_LIMITED = False

    print("\n%d failure(s)" % len(fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

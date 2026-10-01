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

    # DEPLOY-AUTH-CLASS-1 (#212): lines taken from run 36831942233. The deploy 401 must outrank a push that was
    # rejected once and then recovered; a recovered push is not a push-race; a real unrecovered one still is.
    real = (
        "canonical deploy: 1 target(s) -> https://ops.qnfo.org/ops/deploy (ref=main)\n"
        "failed workers: qnfo-ops\n    FAIL in 0.3s  status=401\n"
        "# ARTIFACT-PUSH-CONFLICT-1: snapshot re-apply, never a rebase conflict\n"
        "error: failed to push some refs to 'https://github.com/QNFO/qnfo-workers'\n"
        "push rejected on attempt 1; re-applying the snapshot onto origin/main\n"
        "artifact pushed on attempt 2\n"
    )
    k5, _ = cw.classify(real, "canonical-deploy")
    check("deploy 401 + recovered push -> deploy-auth (not push-race)", k5 == "deploy-auth", k5)
    k6, _ = cw.classify("error: failed to push some refs\nCONFLICT (content): Merge conflict in x\n", "mirror-sync")
    check("unrecovered push conflict still -> push-race", k6 == "push-race", k6)
    k7, _ = cw.classify("error: failed to push some refs ... rebase\nartifact pushed on attempt 2\n", "x")
    check("recovered push alone is not a push-race", k7 != "push-race", k7)

    print("\n%d failure(s)" % len(fails))
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())

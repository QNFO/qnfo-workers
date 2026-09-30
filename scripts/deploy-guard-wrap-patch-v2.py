#!/usr/bin/env python3
"""deploy-guard-wrap-patch-v2.py - wire scripts/raw_put.py into the deploy-guard
deploy_locks lease + the fleet_deploys ledger.

ROOT CAUSE (verified 2026-09-29, issues 1361-1364):
  raw_put.py ledger_write() INSERTs into qnfo-audit.deployment_history, but
  qnfo-deploy-guard/worker.js computes
      logged = ms(latest fleet_deploys.ts) >= ms(modified_on) - 180000
  i.e. it reads fleet_deploys, NOT deployment_history. The table mismatch means
  every raw_put.py deploy is reported as unlogged-mutation (high); with no
  deploy_locks row held it is also reported as uncoordinated-deploy (high).
  deployment_history is NOT a substitute: the guard never reads it.

FIX: acquire a deploy_locks lease across the PUT, then POST the guard /ledger
(fleet_deploys) after the deploy is verified. Lock failure is non-fatal (it only
closes uncoordinated-deploy); ledger failure is loud.
Idempotent (marker scan) and fail-closed (exit 3 on anchor mismatch / syntax error).

Behaviorally verified 2026-09-29 against the live guard before commit:
  POST /lock/acquire -> {"acquired":true,"token":"..."}
  POST /ledger       -> {"logged":true,"ok":true}
  POST /lock/release -> {"released":true}
"""
import ast
import sys

TARGET = "scripts/raw_put.py"
MARKER = "DEPLOY-GUARD-WRAP-2"

A_IMPORT = "import uuid\nfrom datetime import datetime, timezone\n"
N_IMPORT = "import uuid\nimport atexit\nfrom datetime import datetime, timezone\n"

A_HELPERS = "def artifact_version(code):"
N_HELPERS = '''GUARD = os.environ.get("DEPLOY_GUARD_URL", "https://qnfo-deploy-guard.q08.workers.dev")
_LOCK = {"worker": None, "token": None}  # DEPLOY-GUARD-WRAP-2


def _guard_call(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(GUARD + path, data=data, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except ValueError:
            return e.code, None
    except Exception as e:
        return 0, {"error": str(e)}


def guard_lock(worker):
    """Acquire a deploy_locks lease. Non-fatal: the fleet_deploys row is the rule
    that closes unlogged-mutation; the lease only closes uncoordinated-deploy."""
    st, j = _guard_call("/lock/acquire", {"worker": worker, "owner": "ci/raw_put",
                                          "actor": "scripts/raw_put.py",
                                          "session_id": uuid.uuid4().hex, "ttl_sec": 900})
    if st == 200 and j and j.get("acquired"):
        _LOCK["worker"], _LOCK["token"] = worker, j.get("token")
        print("DEPLOY-LOCK: acquired ttl=900")
        return True
    print("DEPLOY-LOCK: NOT acquired (HTTP %s) %s - deploying anyway; uncoordinated-deploy may fire"
          % (st, str(j)[:160]))
    return False


def guard_unlock():
    if _LOCK["worker"] and _LOCK["token"]:
        st, j = _guard_call("/lock/release", {"worker": _LOCK["worker"], "token": _LOCK["token"]})
        print("DEPLOY-LOCK: release HTTP %s %s" % (st, str(j)[:120]))
        _LOCK["worker"], _LOCK["token"] = None, None


def guard_ledger(worker, frm, to, ok, note):
    """POST /ledger so fleet_deploys advances - the table the guard actually reads."""
    st, j = _guard_call("/ledger", {"worker": worker, "actor": "scripts/raw_put.py",
                                    "from": frm, "to": to, "source_path": "scripts/raw_put.py",
                                    "ok": bool(ok), "note": note})
    good = st == 200 and bool(j and j.get("logged"))
    print("DEPLOY-GUARD-LEDGER: HTTP %s %s %s" % (st, "OK" if good else "FAILED", str(j)[:160]))
    return good


def artifact_version(code):'''

A_MAIN = "    tok = token()\n"
N_MAIN = "    tok = token()\n    guard_lock(worker)\n    atexit.register(guard_unlock)\n"

A_OK = '    print(f"OK: {worker} {ver} deployed with compatibility_date={got_date}'
N_OK = '''    guard_ledger(worker, None, ver, True, notes)
    guard_unlock()
    print(f"OK: {worker} {ver} deployed with compatibility_date={got_date}'''


def main():
    src = open(TARGET, encoding="utf-8").read()
    if MARKER in src:
        print("ALREADY APPLIED (%s) - nothing to do" % MARKER)
        return 0
    for name, a, n in (("imports", A_IMPORT, N_IMPORT), ("helpers", A_HELPERS, N_HELPERS),
                       ("main-lock", A_MAIN, N_MAIN), ("ok-print", A_OK, N_OK)):
        c = src.count(a)
        if c != 1:
            print("FAIL-CLOSED: anchor '%s' matched %d times (expected 1) - nothing written" % (name, c))
            return 3
        src = src.replace(a, n, 1)
    try:
        ast.parse(src)
    except SyntaxError as e:
        print("FAIL-CLOSED: patched source does not parse: %s" % e)
        return 3
    for need in ("guard_lock(worker)", "guard_ledger(worker", "import atexit", MARKER):
        if need not in src:
            print("FAIL-CLOSED: post-check missing %r" % need)
            return 3
    open(TARGET, "w", encoding="utf-8", newline="\n").write(src)
    print("PATCHED %s (%d bytes)" % (TARGET, len(src)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

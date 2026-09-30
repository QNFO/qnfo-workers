#!/usr/bin/env python3
"""deploy-guard-wrap-patch.py - make raw_put.py a COORDINATED, LOGGED deployer.

See the commit message for the root-cause evidence. Idempotent + fail-closed.
"""
import ast
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "raw_put.py")

A_IMPORTS = ("import json\nimport os\nimport sys\nimport urllib.error\n"
             "import urllib.request\nimport uuid\n")
N_IMPORTS = ("import atexit\nimport json\nimport os\nimport re\nimport sys\n"
             "import urllib.error\nimport urllib.request\nimport uuid\n")

A_CONST = 'DATE_FLOOR = "2026-08-01"\n'
N_CONST = A_CONST + '''
# --- deploy-guard coordination (issues 1361-1364) ------------------------------
GUARD = os.environ.get("DEPLOY_GUARD_URL", "https://qnfo-deploy-guard.q08.workers.dev")
_SESSION = os.environ.get("DEPLOY_GUARD_SESSION") or "ci/raw_put"
_STATE = {"lock": None, "worker": None, "frm": None, "to": None, "posted": False}


def _guard(method, path, body=None, timeout=20):
    url = GUARD.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"Content-Type": "application/json",
                                          "User-Agent": "raw_put/guarded"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except ValueError:
            return e.code, None
    except Exception as e:
        return 0, {"error": str(e)}


def _live_version(worker):
    for base in ("https://" + worker + ".q08.workers.dev", "https://" + worker + ".qnfo.org"):
        try:
            req = urllib.request.Request(base + "/health",
                                         headers={"accept": "application/json"})
            with urllib.request.urlopen(req, timeout=10) as r:
                j = json.loads(r.read().decode())
                if j.get("version"):
                    return str(j["version"])
        except Exception:
            continue
    return None


def _guard_acquire(worker):
    st, j = _guard("POST", "/lock/acquire",
                   {"worker": worker, "owner": "ci/raw_put", "actor": "raw_put.py",
                    "session_id": _SESSION, "ttl_sec": 900})
    if st != 200 or not (j or {}).get("acquired"):
        print("FAIL-CLOSED: deploy lock NOT acquired for %s (HTTP %s %s)" % (worker, st, j))
        print("An uncoordinated deploy would be filed as DEPLOY-UNCOORDINATED-DEPLOY; refusing.")
        return False
    _STATE["lock"] = {"worker": worker, "token": (j or {}).get("token")}
    return True


def _guard_finish():
    """atexit: post the ledger (ok=0 if the success path was never reached), then release."""
    w = _STATE.get("worker")
    if w and not _STATE.get("posted"):
        _guard("POST", "/ledger",
               {"worker": w, "actor": "raw_put.py", "session_id": _SESSION,
                "from": _STATE.get("frm"), "to": _STATE.get("to"), "ok": 0,
                "note": "raw_put.py exited before the success ledger post"})
        _STATE["posted"] = True
    lk = _STATE.get("lock")
    if lk:
        _STATE["lock"] = None
        _guard("POST", "/lock/release", {"worker": lk["worker"], "token": lk["token"]})


def _guard_ledger_ok(worker, frm, to):
    st, j = _guard("POST", "/ledger",
                   {"worker": worker, "actor": "raw_put.py", "session_id": _SESSION,
                    "from": frm, "to": to, "ok": 1,
                    "note": "raw_put.py guarded deploy (lock + ledger)"})
    _STATE["posted"] = True
    print("ledger posted: HTTP %s %s" % (st, j))
# ------------------------------------------------------------------------------
'''

A_MAIN = '    tok = token()\n    code = open(path, encoding="utf-8").read()\n'
N_MAIN = A_MAIN + '''    _m = re.search(r'var VERSION = "([^"]+)"', code)
    to_ver = _m.group(1) if _m else None
    from_ver = _live_version(worker)
    if not _guard_acquire(worker):
        return 3
    _STATE.update({"worker": worker, "frm": from_ver, "to": to_ver})
    atexit.register(_guard_finish)
'''

A_OK = ('    print(f"OK: {worker} deployed with compatibility_date={got_date} '
        'and {len(got_flags)} flag(s) preserved")\n')
N_OK = A_OK + '    _guard_ledger_ok(worker, from_ver, to_ver)\n'


def main():
    if not os.path.exists(TARGET):
        print("FAIL: %s not found" % TARGET)
        return 3
    src = open(TARGET, encoding="utf-8").read()
    if "_guard_acquire" in src:
        print("ALREADY APPLIED: raw_put.py is already guarded")
        return 0
    edits = [("imports", A_IMPORTS, N_IMPORTS),
             ("const", A_CONST, N_CONST),
             ("main", A_MAIN, N_MAIN),
             ("ok", A_OK, N_OK)]
    out = src
    for name, old, new in edits:
        n = out.count(old)
        if n != 1:
            print("FAIL-CLOSED: anchor '%s' matched %d times (expected 1) - nothing written"
                  % (name, n))
            return 3
        out = out.replace(old, new, 1)
    try:
        ast.parse(out)
    except SyntaxError as e:
        print("FAIL-CLOSED: patched file does not parse: %s" % e)
        return 3
    for marker in ("_guard_acquire", "_guard_ledger_ok", "_guard_finish",
                   "atexit.register", "/lock/release"):
        if marker not in out:
            print("FAIL-CLOSED: marker %s missing after patch" % marker)
            return 3
    open(TARGET, "w", encoding="utf-8").write(out)
    print("APPLIED: raw_put.py now acquires the deploy lock and posts the ledger")
    return 0


if __name__ == "__main__":
    sys.exit(main())

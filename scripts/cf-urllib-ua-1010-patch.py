#!/usr/bin/env python3
"""CF-URLLIB-UA-1010-1 (2026-09-29) -- permanent fix for the split-brain deploy ledger.

DEFECT
------
scripts/raw_put.py is the canonical binding-preserving deployer used by every
apply-*/deploy-* workflow. Its guard client `_guard_call()` built the request with
only a Content-Type header and NO User-Agent, so Python's urllib default
(`Python-urllib/3.x`) was sent. Cloudflare's edge rejects that UA with

    HTTP 403
    error code: 1010

(`1010` = "the owner of this website has banned your browser"). Reproduced from an
external egress path on 2026-09-29T16:52Z:

    urllib default UA          -> (403, 'error code: 1010')
    urllib UA=QNFO-raw-put/1.0 -> (200, '{"acquired":true,...}')
    curl                       -> reaches the guard (409 lock-held)

IMPACT (why the ledger froze)
-----------------------------
`guard_lock()` and `guard_ledger()` are deliberately NON-FATAL: on failure they
print a line and the deploy proceeds. Because the UA was rejected, EVERY CI deploy
silently:

  * acquired no lease  -> deploy_locks gained zero ci/raw_put rows
  * posted no ledger   -> fleet_deploys gained zero CI rows

so the guard kept reading a frozen fleet_deploys (last CI row 2026-09-29T09:08Z)
and classified every subsequent CI deploy as `unlogged-mutation` +
`uncoordinated-deploy` (issues #1361-#1364, #1371, #1373). Meanwhile the same script's
direct-D1 `ledger_write()` -- which needs no HTTP call and therefore no UA -- kept
succeeding, writing deployment_history. Two tables, one writer, split brain.

Sibling client scripts/deploy_guard.py already sent
`"User-Agent": "qnfo-deploy-guard-client/1.0"`, which is why the guard client worked
and raw_put.py did not.

FIX
---
1. module constant FLEET_UA (marker CF-URLLIB-UA-1010-1)
2. explicit User-Agent on the guard client (_guard_call)
3. explicit User-Agent on the CF API clients (_api, _post_json) as defence in depth
4. a loud 1010 diagnostic on the two silent-failure paths so a recurrence is
   attributable from the job log instead of being inferred from a missing row

Verified: patched client from an external egress path returns
  DEPLOY-LOCK: acquired ttl=900
  DEPLOY-GUARD-LEDGER: HTTP 200 OK {'logged': True, 'ok': True}
  DEPLOY-LOCK: release HTTP 200 {'released': True}

Fail-closed (exits 3 on any anchor mismatch), idempotent (marker short-circuit).
"""
import sys, pathlib

MARKER = "CF-URLLIB-UA-1010-1"
UA = "QNFO-fleet-ci/1.0 (+https://qnfo.org; raw_put.py)"

A_CONST = 'GUARD = os.environ.get("DEPLOY_GUARD_URL", "https://qnfo-deploy-guard.q08.workers.dev")'
A_API = '    headers = {"Authorization": "Bearer " + tok}'
A_POST = '        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"},'
A_GUARD = '                                 headers={"Content-Type": "application/json"})'
A_GLOCK = '    print("DEPLOY-LOCK: NOT acquired (HTTP %s) %s - deploying anyway; uncoordinated-deploy may fire"'
A_GLED = '    print("DEPLOY-GUARD-LEDGER: HTTP %s %s %s" % (st, "OK" if good else "FAILED", str(j)[:160]))'

R_CONST = A_CONST + "\n\n# " + MARKER + " - explicit UA; Cloudflare 403/1010 bans the urllib default UA.\nFLEET_UA = \"" + UA + "\""
R_API = '    headers = {"Authorization": "Bearer " + tok, "User-Agent": FLEET_UA}'
R_POST = ('        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json",\n'
          '                 "User-Agent": FLEET_UA},')
R_GUARD = ('                                 headers={"Content-Type": "application/json",\n'
           '                                          "User-Agent": FLEET_UA})')
R_GLOCK = (A_GLOCK + '\n          " | ' + MARKER + ': HTTP 403 code 1010 means the User-Agent was rejected"')
R_GLED = (A_GLED + '\n    if st == 403:\n        print("  ^ ' + MARKER +
          ': guard rejected this client (Cloudflare 1010). The ledger did NOT advance.")')


def main():
    p = pathlib.Path("scripts/raw_put.py")
    if not p.exists():
        print("FAIL-CLOSED: scripts/raw_put.py not found (run from repo root)"); return 3
    s = p.read_text(encoding="utf-8")
    if MARKER in s:
        print("ALREADY APPLIED - no change"); return 0
    for name, a in [("CONST", A_CONST), ("API", A_API), ("POST", A_POST),
                    ("GUARD", A_GUARD), ("GLOCK", A_GLOCK), ("GLED", A_GLED)]:
        c = s.count(a)
        if c != 1:
            print("FAIL-CLOSED: anchor %s matched %d times (want 1)" % (name, c)); return 3
    s = s.replace(A_CONST, R_CONST).replace(A_API, R_API).replace(A_POST, R_POST)
    s = s.replace(A_GUARD, R_GUARD).replace(A_GLOCK, R_GLOCK).replace(A_GLED, R_GLED)
    if s.count("User-Agent") != 4:
        print("FAIL-CLOSED: expected 4 User-Agent insertions, got %d" % s.count("User-Agent")); return 3
    import ast
    ast.parse(s)
    p.write_text(s, encoding="utf-8")
    print("APPLIED: %s now %d bytes, 4 User-Agent insertions, AST OK" % (p, len(s)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

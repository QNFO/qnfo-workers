#!/usr/bin/env python3
"""D1-REST-ENVELOPE-OK-1 (#1403): fleet-autoaudit.py tested res.get("ok") on a CF v4 envelope.

WHY THIS EXISTS (measured 2026-09-29, not inferred):
  * scripts/fleet-autoaudit.py gates its D1 writes on `res.get("ok")` at exactly two sites
    (write_audit_rows and purge_stale). The Cloudflare v4 REST envelope is
    {"success": bool, "errors": [...], "result": [...]} and NEVER carries an "ok" key, so
    `res.get("ok")` is deterministically None -> every SUCCEEDED write was scored as a
    failure.
  * The evidence is inside the repo's own audit artifact for the 16:18:54 run:
    "d1_writes_ok": 0 alongside 110 entries in "d1_write_failures" whose error string is
    the literal "None" (that is str(res.get("error")) where "error" is absent) -- while
    qnfo-audit.worker_live_audit simultaneously held 110 rows stamped 16:18:54. Every one of
    those writes had in fact succeeded.
  * main() computes `rc = 1 if (failed or purge_err) else 0`. So the audit step exited
    non-zero and the NEXT step -- "auto-deploy repo-ahead workers" -- was skipped by the
    default `if: success()` rule. The automatic worker-update half of FLEET-AUTODEPLOY-1
    could therefore never run on ANY trigger, no matter how often the audit fired. The
    same wrong key also made AUDIT-STALE-ROWS-1's purge report FAILED unconditionally.
  * Independent corroboration that `success` is the right key: scripts/raw_put.py talks to
    the identical endpoint (/client/v4/accounts/{acct}/d1/database/{db}/query) and gates on
    parsed.get("success").

WHAT IT CHANGES (one helper + two call sites + one message):
  * adds _v4_ok(res): True only for a clean v4 envelope; still honours a transport-level
    {"ok": False, ...} from d1()'s own error branches, so this is more permissive only
    where the v4 API actually replied.
  * write_audit_rows:  `if res.get("ok"):`      -> `if _v4_ok(res):`
  * purge_stale:       `if not res.get("ok"):`  -> `if not _v4_ok(res):`
  * the write-failure message surfaces v4 `errors` when `error` is absent, so a genuine
    failure can no longer be logged as the string "None".

FAIL-CLOSED: every anchor must match exactly once; the patched source must compile and must
contain _v4_ok exactly 3 times (1 def + 2 call sites) with the bare literal `res.get("ok")`
surviving only inside the helper. Any violation exits 3 BEFORE the file is written.

IDEMPOTENT: a second run detects the helper and exits 0 without touching the file, so this
script is safe to leave wired to a push-triggered workflow.

ADVERSARIAL: this fixes the PROBE, not the fleet. A green run proves the patched file
compiles and the anchors were unique. It does NOT prove the next audit classifies
correctly, does not prove any worker is healthy, and does not prove the auto-deploy step
will then find candidates -- the strictly-ahead rule in apply_ahead() still decides that,
and on the last observed run it found none.
"""
import hashlib
import io
import os
import sys

TARGET = os.path.join("scripts", "fleet-autoaudit.py")

HELPER = '''def _v4_ok(res):
    """D1-REST-ENVELOPE-OK-1 (#1403): a Cloudflare v4 envelope carries success/errors.

    The v4 REST envelope is {"success": bool, "errors": [...], "result": ...}. It never
    carries an "ok" key, so every probe that tested res.get("ok") scored a SUCCEEDED write
    as a failure. Measured consequence: d1_writes_ok=0 while worker_live_audit
    simultaneously held 110 rows stamped 16:18:54, the write-failure list carried the
    literal string "None", the audit step exited rc=1, and the auto-deploy step was
    therefore SKIPPED -- so the automatic worker-update half of FLEET-AUTODEPLOY-1 could
    never run on any trigger.
    A transport-level failure ({"ok": False, ...} from d1()'s own error branches) is still
    honoured, so this is strictly more permissive only where the v4 API actually replied.
    """
    if res.get("ok") is False:
        return False
    return res.get("success") is True and not res.get("errors")


'''

ANCHOR_DEF = "def write_audit_rows(rows):"
OLD_A = '        if res.get("ok"):'
NEW_A = "        if _v4_ok(res):"
OLD_B = '    if not res.get("ok"):'
NEW_B = "    if not _v4_ok(res):"
OLD_MSG = '            failed.append((w, str(res.get("error"))[:120]))'
NEW_MSG = '            failed.append((w, str(res.get("error") or res.get("errors"))[:120]))'

HELPER_DEF = "def _v4_ok(res):"
CALL = "_v4_ok(res)"


def die(msg, code=3):
    print("::error::" + msg, file=sys.stderr)
    sys.exit(code)


def main():
    if not os.path.isfile(TARGET):
        die("target not found: %s" % TARGET)
    src = io.open(TARGET, encoding="utf-8").read()

    if HELPER_DEF in src:
        n = src.count(CALL)
        bare = src.count('res.get("ok")')
        if n == 3 and bare == 1:
            print("already patched (idempotent no-op): %s sites=%d bare_ok_literal=%d"
                  % (TARGET, n, bare))
            return 0
        die("partial patch detected: helper=%d sites=%d bare_ok_literal=%d"
            % (src.count(HELPER_DEF), n, bare))

    counts = (src.count(ANCHOR_DEF), src.count(OLD_A), src.count(OLD_B), src.count(OLD_MSG))
    if counts != (1, 1, 1, 1):
        die("anchor drift on %s: expected (def,site_a,site_b,msg)=(1,1,1,1), got %r"
            % (TARGET, counts))

    out = src.replace(ANCHOR_DEF, HELPER + ANCHOR_DEF, 1)
    out = out.replace(OLD_A, NEW_A, 1)
    out = out.replace(OLD_B, NEW_B, 1)
    out = out.replace(OLD_MSG, NEW_MSG, 1)

    if out.count('res.get("ok")') != 1:
        die("post-check failed: bare ok-literal must survive only inside the helper")
    if out.count(HELPER_DEF) != 1:
        die("post-check failed: helper definition count != 1")
    if out.count(CALL) != 3:
        die("post-check failed: _v4_ok occurrences != 3 (1 def + 2 call sites)")
    try:
        compile(out, TARGET, "exec")
    except SyntaxError as e:
        die("post-check failed: patched source does not compile: %s" % e)

    io.open(TARGET, "w", encoding="utf-8").write(out)
    b = out.encode("utf-8")
    print("patched %s: %d -> %d bytes" % (TARGET, len(src.encode("utf-8")), len(b)))
    print("patched blob sha1 %s"
          % hashlib.sha1(b"blob %d\x00" % len(b) + b).hexdigest())
    return 0


if __name__ == "__main__":
    sys.exit(main())

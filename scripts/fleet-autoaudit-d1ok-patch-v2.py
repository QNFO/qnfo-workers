#!/usr/bin/env python3
"""D1-REST-ENVELOPE-OK-1 v2 - fleet-autoaudit.py classified EVERY successful D1 write as a failure.

ROOT CAUSE (verified 2026-09-29 against main):
  * d1() (line ~106) returns the raw Cloudflare REST envelope on success:
        {"result":[{"success":true,"results":[...],"meta":{...}}],"success":true,
         "errors":[],"messages":[]}
    It only ever sets the "ok" key inside its OWN transport-exception paths
    (urllib HTTPError / generic Exception). A successful call therefore has NO "ok" key.
  * write_audit_rows() (line ~200) and purge_stale() (line ~214) test that missing key. On a
    successful call the lookup is None -> falsy -> the success branch is never taken and the
    failure branch is taken instead.
  * Measured consequence in audits/fleet-autoaudit-2026-09-29.json:
        d1_writes_ok        = 0
        d1_write_failures   = 110            (every scanned worker)
        distinct error text = "None"         (str(None) from the missing "error" key)
    while qnfo-audit.worker_live_audit simultaneously held 110 freshly written rows --
    i.e. every one of those writes had in fact SUCCEEDED.
  * main() then does `rc = 1 if (failed or purge_err) else 0`, so the fleet self-audit job
    exited non-zero on EVERY run. The auto-deploy step in fleet-autodeploy.yml carries a
    CUSTOM if:, and GitHub implicitly ANDs a custom if: with success() -- so the phantom
    failure ALSO SKIPPED `fleet-autoaudit.py --apply`. One mis-read envelope therefore
    disabled automatic worker updates fleet-wide.

FIX: introduce d1_ok()/d1_err(), which read the real envelope shape, and route both call
sites through them. d1() itself is left untouched so the transport-exception behaviour
({"ok": False, "error": ...}) keeps working unchanged.

WHY v2 (v1 = scripts/fleet-autoaudit-d1ok-patch.py, run 36597615732):
  v1 applied all four anchors (1/1 each) and then ABORTED in its own post-condition, because
  that check counted the BARE literal res.get("ok") across the whole file -- which includes
  the helper text the patch itself inserts (3 matches). v1's workflow assert step repeats the
  same naive scan with grep. A bare-literal scan cannot tell a legacy CALL SITE from a mention
  in prose. v2 asserts on call-site patterns only.

FAIL-CLOSED CONTRACT: every anchor below must match EXACTLY ONCE, the two legacy call sites
must be gone afterwards, and each new call site must appear exactly once. Any deviation aborts
non-zero WITHOUT writing the file.
Idempotent: a re-run on an already-patched file reports ALREADY-PATCHED and exits 0; a partial
run (helpers present, call sites still legacy) skips only anchor 1 and completes the rest.
"""
import pathlib
import sys

TARGET = pathlib.Path(__file__).resolve().parent / "fleet-autoaudit.py"
MARKER = "D1-REST-ENVELOPE-OK-1"

# Call-site patterns only. These are what the post-condition must count -- never the bare
# literal, which also occurs in the helper text this patch inserts.
LEGACY_WRITE = 'if res.get("ok"):'
LEGACY_PURGE = 'if not res.get("ok"):'

HELPER = '''def d1_ok(res):
    """D1-REST-ENVELOPE-OK-1: true success test for a D1 REST reply.

    d1() returns the raw Cloudflare envelope on success -- the shape carrying the keys
    success, errors, messages and result -- and only sets its own "ok" key on a transport
    exception. A truthiness test on that key is therefore None (falsy) for EVERY successful
    call, which is what made every successful write look like a failure.
    """
    if res.get("ok") is False:
        return False
    if res.get("ok") is True:
        return True
    if res.get("success") is not True:
        return False
    blocks = res.get("result") or []
    if blocks and isinstance(blocks[0], dict) and blocks[0].get("success") is False:
        return False
    return True


def d1_err(res):
    """Human-readable failure reason for a d1() reply (never the string None)."""
    if res.get("error") is not None:
        return str(res.get("error"))
    errs = res.get("errors") or []
    if errs:
        return json.dumps(errs)[:200]
    blocks = res.get("result") or []
    if blocks and isinstance(blocks[0], dict):
        blk = blocks[0]
        if blk.get("results") and isinstance(blk["results"], dict):
            return json.dumps(blk["results"])[:200]
        return json.dumps(blk)[:200]
    return "unknown D1 failure (no error, no errors, no result block)"


'''

REPLACEMENTS = [
    # 1. insert the helpers immediately before the first consumer
    ("def write_audit_rows(rows):", HELPER + "def write_audit_rows(rows):"),
    # 2. write_audit_rows success test
    ('        if res.get("ok"):\n            ok += 1',
     '        if d1_ok(res):\n            ok += 1'),
    # 3. write_audit_rows failure reason
    ('            failed.append((w, str(res.get("error"))[:120]))',
     '            failed.append((w, d1_err(res)[:120]))'),
    # 4. purge_stale success test + failure reason
    ('    if not res.get("ok"):\n        return None, str(res.get("error"))[:160]',
     '    if not d1_ok(res):\n        return None, d1_err(res)[:160]'),
]


def main():
    if not TARGET.exists():
        print("::error::target not found: %s" % TARGET, file=sys.stderr)
        return 3
    src = TARGET.read_text(encoding="utf-8")

    helpers_present = "def d1_ok(res):" in src and "def d1_err(res):" in src
    legacy_present = LEGACY_WRITE in src or LEGACY_PURGE in src

    if helpers_present and not legacy_present:
        print("ALREADY-PATCHED: %s already carries d1_ok/d1_err (%s)" % (TARGET, MARKER))
        return 0

    out = src
    applied = 0
    for i, (old, new) in enumerate(REPLACEMENTS, 1):
        if i == 1 and helpers_present:
            print("anchor 1: skipped (helpers already present)")
            continue
        n = out.count(old)
        if n != 1:
            print("::error::ANCHOR-INVALIDATION-RED-JOB-1: anchor %d matches %d times, "
                  "expected exactly 1 -- aborting WITHOUT writing. anchor=%r"
                  % (i, n, old[:120]), file=sys.stderr)
            return 4
        out = out.replace(old, new, 1)
        applied += 1
        print("anchor %d: applied (1/1)" % i)

    # post-conditions -- CALL-SITE patterns only (a bare-literal scan is what broke v1)
    leftovers = out.count(LEGACY_WRITE) + out.count(LEGACY_PURGE)
    if leftovers != 0:
        print("::error::post-condition failed: %d legacy call site(s) remain "
              "-- aborting WITHOUT writing." % leftovers, file=sys.stderr)
        return 5
    if out.count("def d1_ok(res):") != 1 or out.count("def d1_err(res):") != 1:
        print("::error::post-condition failed: helpers absent or duplicated after patch",
              file=sys.stderr)
        return 6
    if out.count("if d1_ok(res):") != 1 or out.count("if not d1_ok(res):") != 1:
        print("::error::post-condition failed: new call sites not exactly once",
              file=sys.stderr)
        return 7
    if out.count("d1_err(res)") != 2:
        print("::error::post-condition failed: d1_err call sites != 2", file=sys.stderr)
        return 8

    TARGET.write_text(out, encoding="utf-8")
    print("APPLIED: %s patched (%s); %d anchors; bytes %d -> %d"
          % (TARGET, MARKER, applied, len(src), len(out)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

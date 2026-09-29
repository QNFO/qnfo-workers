#!/usr/bin/env python3
"""D1-REST-ENVELOPE-OK-1 - fleet-autoaudit.py classified EVERY successful D1 write as a failure.

ROOT CAUSE (verified 2026-09-29 against main, sha of the target read live):
  * d1() (line ~106) returns the raw Cloudflare REST envelope on success:
        {"result":[{"success":true,"results":[...],"meta":{...}}],"success":true,
         "errors":[],"messages":[]}
    It only ever sets the key "ok" inside its OWN transport-exception paths
    (urllib HTTPError / generic Exception). A successful call therefore has NO "ok" key.
  * write_audit_rows() (line ~200) tests `res.get("ok")` and purge_stale() (line ~214) tests
    `not res.get("ok")`. On a successful call res.get("ok") is None -> falsy -> the success
    branch is never taken and the failure branch is taken instead.
  * Measured consequence in audits/fleet-autoaudit-2026-09-29.json:
        d1_writes_ok        = 0
        d1_write_failures   = 110            (every scanned worker)
        distinct error text = "None"         (str(None) from the missing "error" key)
    while qnfo-audit.worker_live_audit simultaneously held 110 freshly written rows --
    i.e. every one of those writes had in fact SUCCEEDED.
  * main() then does `rc = 1 if (failed or purge_err) else 0`, so the fleet self-audit job
    exited non-zero on EVERY run. A permanently red job masks real failures and would make
    any future success-gated step unreachable.

FIX: introduce d1_ok()/d1_err(), which read the real envelope shape, and route both call
sites through them. This is a two-call-site fix; d1() itself is left untouched so the
transport-exception behaviour ({"ok": False, "error": ...}) keeps working unchanged.

FAIL-CLOSED CONTRACT: every anchor below must match EXACTLY ONCE, and the two legacy call
sites must be gone afterwards. Any deviation aborts non-zero WITHOUT writing the file.
Idempotent: a re-run on an already-patched file reports ALREADY-PATCHED and exits 0.
"""
import pathlib
import sys

TARGET = pathlib.Path(__file__).resolve().parent / "fleet-autoaudit.py"
MARKER = "D1-REST-ENVELOPE-OK-1"

HELPER = '''def d1_ok(res):
    """D1-REST-ENVELOPE-OK-1: true success test for a D1 REST reply.

    d1() returns the raw Cloudflare envelope on success -- {"success": true, "errors": [],
    "result": [{"success": true, "results": [...]}]} -- and only sets "ok" on its own
    transport exceptions. Testing res.get("ok") therefore treated EVERY successful write as
    a failure (d1_writes_ok=0, one phantom failure per worker, error string "None").
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
    """Human-readable failure reason for a d1() reply (never the string "None")."""
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
    # 4. purge_stale success test
    ('    if not res.get("ok"):\n        return None, str(res.get("error"))[:160]',
     '    if not d1_ok(res):\n        return None, d1_err(res)[:160]'),
]


def main():
    if not TARGET.exists():
        print(f"::error::target not found: {TARGET}", file=sys.stderr)
        return 3
    src = TARGET.read_text(encoding="utf-8")

    if "def d1_ok(res):" in src and "def d1_err(res):" in src:
        print(f"ALREADY-PATCHED: {TARGET} already carries d1_ok/d1_err ({MARKER})")
        return 0

    out = src
    for i, (old, new) in enumerate(REPLACEMENTS, 1):
        n = out.count(old)
        if n != 1:
            print(f"::error::ANCHOR-INVALIDATION-RED-JOB-1: anchor {i} matches {n} times, "
                  f"expected exactly 1 -- aborting WITHOUT writing.\n"
                  f"anchor={old[:120]!r}", file=sys.stderr)
            return 4
        out = out.replace(old, new, 1)
        print(f"anchor {i}: applied (1/1)")

    # post-conditions
    leftovers = out.count('res.get("ok")')
    if leftovers != 0:
        print(f"::error::post-condition failed: {leftovers} legacy res.get(\"ok\") call "
              f"site(s) remain -- aborting WITHOUT writing.", file=sys.stderr)
        return 5
    if "def d1_ok(res):" not in out or "def d1_err(res):" not in out:
        print("::error::post-condition failed: helpers absent after patch", file=sys.stderr)
        return 6
    if out.count("def d1_ok(res):") != 1 or out.count("def d1_err(res):") != 1:
        print("::error::post-condition failed: helper defined more than once", file=sys.stderr)
        return 7

    TARGET.write_text(out, encoding="utf-8")
    print(f"APPLIED: {TARGET} patched ({MARKER}); bytes {len(src)} -> {len(out)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""rawput-schedules-ua-patch.py - CF-SCHEDULES-UA-1010-1 (issue 1469 root cause).

ROOT CAUSE (code-level, single function)
  scripts/raw_put.py PUTs a worker's cron trigger set to
  PUT /accounts/<acct>/workers/scripts/<name>/schedules. EVERY ledger row this deployer
  writes records `schedules=FAILED` -- confirmed on qnfo-fleet-dashboard, deployment_history
  ids 152 (17:27:07Z) and 169 (19:23:19Z), both `status=success` with
  `notes=... schedules=FAILED; DEPLOY-LEDGER-1`. So a repo `crons = [...]` edit is INERT
  fleet-wide, and 60 wrangler.toml files in this repo declare crons.

  The script already documents the cause of exactly this failure class for its other calls:
    "CF-URLLIB-UA-1010-1 - explicit UA; Cloudflare 403/1010 bans the urllib default UA."
  _api(), _post_json() and _guard_call() all set FLEET_UA. schedules_put() -- the one
  function added later by AUTODEPLOY-SCHEDULES-NOT-APPLIED-1 -- does NOT. It is the only CF
  API call in the file without a User-Agent, and the only one that fails.

  Class impact (why one missing header matters):
    * issue 1390 / #1193 / #1337: the fleet-exec cadence fix (hourly -> */10) was committed
      AND deployed and still never fired, because /content PUTs never touch triggers and the
      /schedules PUT meant to apply the change returned non-200.
    * issue 1469: qnfo-cloud-ops email-triage and gmail-triage have not fired since
      2026-09-24.
  Both are one defect: the declared trigger set is never applied.

FIX
  Add "User-Agent": FLEET_UA to schedules_put's headers, so the only un-UA'd call in the
  file matches every other call in it.

FALSIFIER (stated, not hidden): if the PUT fails for a TOKEN-SCOPE reason rather than the UA
  ban, this patch will not turn `SCHEDULES: FAILED` green. schedules_apply() already prints
  the HTTP status and response body, so the next autodeploy run distinguishes the two:
    403 + code 1010                     -> UA ban  (fixed here)
    403 + "not authorized"/code 10000   -> token scope (needs a CF dashboard change)

FAIL-CLOSED: the edit requires exactly one occurrence; a miss raises and nothing is written.
Re-running on an already-patched file is a no-op, not an error.
"""
import os
import py_compile
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, "scripts", "raw_put.py")
MARK = "CF-SCHEDULES-UA-1010-1"

OLD = '''    req = urllib.request.Request(url, data=data, method="PUT", headers={
        "Authorization": "Bearer " + tok, "Content-Type": "application/json"})'''

NEW = '''    # CF-SCHEDULES-UA-1010-1 (issue 1469): this was the ONLY CF API call in this file
    # without a User-Agent, and the only one that fails. _api() sets FLEET_UA because
    # Cloudflare answers the urllib default UA with 403/1010 (CF-URLLIB-UA-1010-1).
    req = urllib.request.Request(url, data=data, method="PUT", headers={
        "Authorization": "Bearer " + tok, "Content-Type": "application/json",
        "User-Agent": FLEET_UA})'''


def schedules_put_body(text):
    """The schedules_put function only, so the post-condition cannot be satisfied by the
    User-Agent lines that already exist in _api/_post_json/_guard_call."""
    a = text.find("def schedules_put(")
    if a < 0:
        return ""
    b = text.find("def schedules_apply(", a)
    return text[a:b if b > 0 else len(text)]


def main():
    if not os.path.isfile(TARGET):
        raise SystemExit("FAIL-CLOSED: missing " + TARGET)
    with open(TARGET, encoding="utf-8") as fh:
        text = fh.read()

    if MARK in text:
        print("already applied: " + TARGET)
    else:
        n = text.count(OLD)
        if n == 0:
            raise SystemExit("FAIL-CLOSED: anchor not found in " + TARGET + "\n---\n" + OLD)
        if n != 1:
            raise SystemExit("FAIL-CLOSED: anchor occurs %d times in %s" % (n, TARGET))
        text = text.replace(OLD, NEW)
        with open(TARGET, "w", encoding="utf-8") as fh:
            fh.write(text)
        print("patched " + TARGET)

    # --- post-conditions: assert the EFFECT, not the edit -------------------------------
    body = schedules_put_body(text)
    checks = [
        ("marker present", MARK in text),
        ("schedules_put exists", "def schedules_put(" in text),
        ("schedules_put carries FLEET_UA", '"User-Agent": FLEET_UA' in body),
        ("schedules_put still PUTs", 'method="PUT"' in body),
        ("crons payload unchanged", '"crons": list(crons)' in body),
        ("no bare-urllib header block left",
         '"Content-Type": "application/json"})\n' not in body),
    ]
    bad = [name for name, ok in checks if not ok]
    for name, ok in checks:
        print(" %-34s %s" % (name, "OK" if ok else "FAIL"))
    if bad:
        raise SystemExit("FAIL-CLOSED: post-conditions failed: " + ", ".join(bad))

    # --- syntax ------------------------------------------------------------------------
    fd, tmp = tempfile.mkstemp(suffix=".py")
    os.close(fd)
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text)
    try:
        py_compile.compile(tmp, doraise=True)
        print("PY_COMPILE_OK " + TARGET)
    except py_compile.PyCompileError as e:
        raise SystemExit("FAIL-CLOSED: syntax error after patch: " + str(e))
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass

    print("POST_CONDITIONS_OK " + TARGET)
    return 0


if __name__ == "__main__":
    sys.exit(main())

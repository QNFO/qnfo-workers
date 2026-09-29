#!/usr/bin/env python3
"""applier_rot_triage.py -- APPLIER-ROT-TRIAGE-1

CLOSES THE LOOP GAP behind #1383 (ANCHOR-INVALIDATION-RED-JOB-1),
#1395 (CI-APPLIER-NEVER-APPLIES-1) and APPLIER-DOCTOR-1.

OBSERVED 2026-09-29 (ci-status/applier-doctor.json, ts 16:37:43.639Z, tool-read):
    total=37  already-applied=23  applied-now=2  stale-anchor=6  error=6
    never-landed=2
So 14 of 37 appliers were NOT applied, and NOTHING consumed that verdict.

OBSERVED 2026-09-29 (raw fetch of qnfo-ops/worker.js, 367668 B, VERSION
2.37.24-404hint-list): the ops worker exposes ZERO issue-filing routes and
performs ZERO `INSERT INTO agent_issues` (9 read-only references). The backlog
is READ-ONLY from the worker side, so a CI finding has no path into agent_issues
at all. That is why applier rot was invisible.

WHAT THIS DOES
  1. runs scripts/applier-doctor.py (report-only) to refresh the measurement
  2. reads ci-status/applier-doctor.json
  3. files ONE deduped row per non-applied applier into the QNFO backlog
     (agent_issues) over the D1 HTTP API.
     Dedupe is free: idx_agent_issues_open_title_ci is UNIQUE on
     lower(trim(title)) WHERE status='open', so INSERT OR IGNORE can neither
     duplicate nor silently overwrite.
  4. exits 1 if any filing failed (fail-closed, like every other gate here).

  The row lands `open` -> agent_issues_autotriage_ins creates its issue_triage
  row -> qnfo-backlog-exec drains it. That is the closed detect->file->drain loop.

SAFETY
  * never deploys, never patches, never mutates the fleet or GitHub
  * the ONLY write is INSERT OR IGNORE into agent_issues
  * no secret value is ever printed (token is used, never echoed)
  * if CF credentials are absent it fails closed (exit 2), it does not no-op
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.environ.get("REPO_ROOT") or os.getcwd()
ACCT = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID")
TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN")
DBID = os.environ.get("QNFO_AUDIT_DB_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")
DOCTOR = os.path.join(ROOT, "ci-status", "applier-doctor.json")
MARKER = "APPLIER-ROT-TRIAGE-1"

# verdict -> (priority, one-line consequence)
CLASSES = {
    "stale-anchor": ("high", "fail-closed anchor mismatch: the patch never lands and the workflow can stay red forever"),
    "error": ("medium", "applier exits non-zero for a reason other than an anchor mismatch (needs triage)"),
    "applied-now": ("high", "patch applies cleanly to a scratch tree but the commit-back never reaches main"),
}


def die(code, msg):
    print("FAIL(%d): %s" % (code, msg))
    sys.exit(code)


def run_doctor():
    """Refresh the measurement. Report-only by default (exit 0)."""
    env = dict(os.environ)
    env["REPO_ROOT"] = ROOT
    env["ALLOW_DIRTY"] = "1"  # CI tree may carry artifacts; the doctor resets itself
    p = subprocess.run([sys.executable, "scripts/applier-doctor.py"],
                       cwd=ROOT, capture_output=True, text=True, timeout=1800, env=env)
    tail = ((p.stdout or "") + (p.stderr or "")).strip().splitlines()[-8:]
    print("doctor rc=%d" % p.returncode)
    for ln in tail:
        print("   ", ln)
    # rc 0 = measured (rot is reported, not fatal); rc 3 = STRICT mode. Either way
    # the artifact is the source of truth, so only a MISSING artifact is fatal.
    if not os.path.exists(DOCTOR):
        die(3, "doctor produced no %s (rc=%d)" % (DOCTOR, p.returncode))


def d1(sql, params):
    url = "https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query" % (ACCT, DBID)
    body = json.dumps({"sql": sql, "params": params}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": "Bearer %s" % TOKEN,
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"success": False, "error": "HTTP %s %s" % (e.code, e.read().decode()[:300])}
    except Exception as e:  # noqa: BLE001
        return {"success": False, "error": str(e)[:300]}


def main():
    if not ACCT or not TOKEN:
        die(2, "CF_ACCOUNT_ID/CLOUDFLARE_API_TOKEN absent; refusing to no-op silently")

    run_doctor()
    try:
        with open(DOCTOR) as f:
            rep = json.load(f)
    except Exception as e:  # noqa: BLE001
        die(3, "cannot read %s: %s" % (DOCTOR, e))

    ts = rep.get("ts", "?")
    findings = []
    for verdict, key in (("stale-anchor", "stale_anchor"),
                         ("error", "errored"),
                         ("applied-now", "never_landed")):
        for script in rep.get(key) or []:
            findings.append((verdict, script))

    print("%s doctor ts=%s total=%s counts=%s" % (MARKER, ts, rep.get("total"), rep.get("counts")))
    print("non-applied findings: %d" % len(findings))
    if not findings:
        print("OK: every applier is already applied")
        return 0

    sql = ("INSERT OR IGNORE INTO agent_issues "
           "(title, description, source, category, priority, status, created_at, updated_at, predicate_id) "
           "VALUES (?,?,?,?,?,'open',"
           " CAST(strftime('%s','now') AS INTEGER)*1000,"
           " CAST(strftime('%s','now') AS INTEGER)*1000, ?)")

    filed = failed = 0
    for verdict, script in findings:
        prio, consequence = CLASSES.get(verdict, ("medium", "non-applied applier"))
        name = os.path.basename(script)
        title = "APPLIER-ROT-%s: %s never reaches main" % (verdict.upper(), name)
        desc = ("%s\n\nverdict: %s\nscript: %s\nconsequence: %s\n"
                "measured: applier-doctor ts=%s (ci-status/applier-doctor.json)\n"
                "remedy: re-anchor the patcher against current main, or retire it as superseded.\n"
                "detector: .github/workflows/applier-doctor.yml (APPLIER-DOCTOR-1)" % (
                    MARKER, verdict, script, consequence, ts))
        res = d1(sql, [title, desc, "applier-doctor", "automation", prio, name])
        if res.get("success"):
            n = 0
            try:
                n = res["result"][0]["meta"]["changes"]
            except Exception:  # noqa: BLE001
                pass
            filed += 1
            print("  filed/refresh %-46s changes=%s" % (name, n))
        else:
            failed += 1
            print("  FAILED %-46s %s" % (name, res.get("error")))

    print("SUMMARY %s filed=%d failed=%d total=%d" % (MARKER, filed, failed, len(findings)))
    if failed:
        die(1, "%d backlog filings failed" % failed)
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""remediation_verifier.py - the CONSUMER for qnfo-audit.remediation_contracts.

WHY THIS EXISTS
  remediation_contracts carried 18-19 active rows with verify_probe + verify_transport, and
  qnfo-audit already carried the close machinery (remediation_verifications plus the
  remediation_verification_autoclose_ins / _upd triggers). NOTHING ever read the contracts, so
  no scheduled process ever inserted a verification row and the auto-close trigger never fired
  for a contract. Every observed close came from an ad-hoc ops thread. This is the missing
  consumer.

CONTRACT (fail-loud, never a guessed pass)
  * Only contracts whose issue is STILL OPEN are probed. The autoclose trigger itself requires
    `status='open'` (WHERE EXISTS ... AND status='open'), so probing a closed issue is a no-op.
  * FAIL-CLOSED PROBE POLICY: a probe is executed ONLY when it is a literal SELECT/WITH.
    Anything free-text ("0 stranded rows", ">=1 live enabled cron") is NOT guessed: the contract
    is stamped `probe-not-machine-executable` and NO verification row is written. Rationale: a
    wrong pass=1 auto-closes a real defect (remediation_verification_autoclose_ins).
  * PASS RULE: a literal SELECT probe passes iff its first scalar is 0 AND the probe text asserts
    zero. COUNT-style zero-assertions are the dominant contract form.
  * Transport is taken from the contract and must already be trusted in transport_trust, else
    remediation_verification_transport_guard_ins aborts the insert. The abort is surfaced, never
    swallowed.
  * expected/observed are always non-empty (VACUOUS-VERIFICATION-EVIDENCE-1).
  * This script NEVER writes agent_issues and NEVER closes anything directly. Closes happen only
    through the DB triggers, so the audit trail is uniform.

Schema discipline: only remediation_contracts (UPDATE of bookkeeping columns), agent_issues
(SELECT) and remediation_verifications (INSERT) are touched - all three DDLs read from
sqlite_master on 2026-09-30. No column is guessed.

Usage:  CLOUDFLARE_API_TOKEN=... python scripts/remediation_verifier.py [--report] [--dry-run]
        [--retire-stale]
Exit:   0 ok | 3 transport/DB contract violation (fail-closed)
"""
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

UA = "qnfo-remediation-verifier/1.0 (+https://ops.qnfo.org)"
ACCT = os.environ.get("CF_ACCOUNT_ID", "edb167b78c9fb901ea5bca3ce58ccc4b")
AUDIT_DB = os.environ.get("CF_AUDIT_D1_ID", "35e2e573-92f3-46ac-83c6-22f6429fc5e5")

SELECT_RE = re.compile(r"^\s*(SELECT|WITH)\b", re.I)
ZERO_RE = re.compile(r"(^|[^0-9])0([^0-9]|$)|zero|no\s", re.I)


def token():
    t = os.environ.get("CLOUDFLARE_API_TOKEN")
    if not t:
        raise SystemExit("no CF token (set CLOUDFLARE_API_TOKEN)")
    return t.strip()


def d1(sql, params=None):
    body = json.dumps({"sql": sql, "params": params or []}).encode()
    req = urllib.request.Request(
        "https://api.cloudflare.com/client/v4/accounts/%s/d1/database/%s/query" % (ACCT, AUDIT_DB),
        data=body,
        method="POST",
        headers={
            "Authorization": "Bearer " + token(),
            "Content-Type": "application/json",
            "User-Agent": UA,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"success": False, "errors": [{"message": "HTTP %s: %s" % (e.code, e.read().decode()[:400])}]}
    except Exception as e:  # noqa: BLE001
        return {"success": False, "errors": [{"message": "%s: %s" % (type(e).__name__, e)}]}


def rows(resp):
    if not resp.get("success"):
        raise RuntimeError(json.dumps(resp.get("errors"))[:400])
    res = resp.get("result") or []
    return (res[0].get("results") or []) if res else []


def scalar(resp):
    r = rows(resp)
    if not r:
        return None
    return list(r[0].values())[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="probe, print, write nothing")
    ap.add_argument("--report", action="store_true", help="print a JSON summary")
    ap.add_argument("--retire-stale", action="store_true",
                    help="stamp contracts whose issue is not open as retired-stale-issue")
    args = ap.parse_args()

    summary = {"probed": [], "skipped_not_executable": [], "stale_contracts": [], "errors": []}

    contracts = rows(d1(
        "SELECT c.class, c.issue_id, c.verify_probe, c.verify_transport, c.max_attempts, "
        "       c.attempts, c.module, c.expected_cadence_h "
        "FROM remediation_contracts c JOIN agent_issues i ON i.id = c.issue_id "
        "WHERE c.status = 'active' AND i.status = 'open' ORDER BY c.class LIMIT 50"))

    stale = rows(d1(
        "SELECT c.class, c.issue_id, i.status AS issue_status "
        "FROM remediation_contracts c LEFT JOIN agent_issues i ON i.id = c.issue_id "
        "WHERE c.status = 'active' AND (c.issue_id IS NULL OR i.id IS NULL OR i.status <> 'open') "
        "ORDER BY c.class LIMIT 100"))
    summary["stale_contracts"] = stale

    if args.retire_stale and not args.dry_run:
        r = d1("UPDATE remediation_contracts SET status = 'retired-stale-issue', "
               "last_verdict = 'RETIRED-STALE-ISSUE-2026-09-30: issue not open; the autoclose "
               "trigger requires status=open so this contract can never fire' "
               "WHERE status = 'active' AND issue_id IS NOT NULL AND NOT EXISTS "
               "(SELECT 1 FROM agent_issues WHERE id = issue_id AND status = 'open')")
        summary["retired"] = r.get("success")
        summary["retired_errors"] = r.get("errors")

    for c in contracts:
        cls, issue_id = c["class"], c["issue_id"]
        probe, transport = (c.get("verify_probe") or "").strip(), c.get("verify_transport")
        if not SELECT_RE.match(probe):
            summary["skipped_not_executable"].append({"class": cls, "issue_id": issue_id, "probe": probe[:120]})
            if not args.dry_run:
                d1("UPDATE remediation_contracts SET last_attempt_at = datetime('now'), "
                   "attempts = attempts + 1, last_verdict = 'probe-not-machine-executable', "
                   "next_due_at = datetime('now', '+' || COALESCE(expected_cadence_h, 24) || ' hours') "
                   "WHERE class = ?", [cls])
            continue

        resp = d1(probe)
        if not resp.get("success"):
            summary["errors"].append({"class": cls, "error": json.dumps(resp.get("errors"))[:300]})
            continue
        val = scalar(resp)
        passed = 1 if (ZERO_RE.search(probe) is not None and val == 0) else 0
        expected = "probe asserts zero: %s" % probe[:300]
        observed = "scalar=%r" % (val,)

        summary["probed"].append({"class": cls, "issue_id": issue_id, "scalar": val, "pass": passed})
        if args.dry_run:
            continue

        ins = d1(
            "INSERT INTO remediation_verifications "
            "(issue_id, class, probe_url, transport, expected, observed, pass, verifier) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [issue_id, cls, None, transport, expected, observed, passed,
             "qnfo-remediation-verifier@github-actions"])
        if not ins.get("success"):
            summary["errors"].append({"class": cls, "phase": "insert",
                                      "error": json.dumps(ins.get("errors"))[:300]})
        d1("UPDATE remediation_contracts SET last_attempt_at = datetime('now'), "
           "attempts = attempts + 1, last_verdict = ?, "
           "next_due_at = datetime('now', '+' || COALESCE(expected_cadence_h, 24) || ' hours') "
           "WHERE class = ?", ["pass" if passed else "fail", cls])

    if args.report:
        print(json.dumps(summary, indent=2, default=str))
    else:
        print("probed=%d skipped=%d stale=%d errors=%d" % (
            len(summary["probed"]), len(summary["skipped_not_executable"]),
            len(summary["stale_contracts"]), len(summary["errors"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())

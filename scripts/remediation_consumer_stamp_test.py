#!/usr/bin/env python3
"""CONTRACT-STAMP-NO-CLOBBER-1 offline test (2026-10-19, pillar autonomy).

The consumer stamps a probed contract with one UPDATE that also writes the next status. Between the probe and that write another
writer can change the status: on 2026-10-19 issue 100000 was closed as superseded at 10:45:49Z, agent_issues_superseded_contracts_upd
set its contract to superseded, and the stamp one second later wrote it back to holding/pass, so fm-superseded-closure-reopened and
fm-superseded-closure-via-status read recurring. The stamp moves a status only out of active or holding, the two the consumer owns.
Runs the real consume_one (the runner-https path, the one that asks for a status change) against an in-memory sqlite table behind a fake d1.

Run: python3 scripts/remediation_consumer_stamp_test.py
"""
import os
import re
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("CLOUDFLARE_ACCOUNT_ID", "acct")
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "tok")
os.environ.setdefault("CF_API_TOKEN", "tok")

import remediation_consumer as rc  # noqa: E402

fails = 0


def check(cond, msg, extra=None):
    global fails
    if cond:
        print("ok   " + msg)
    else:
        fails += 1
        print("FAIL " + msg + ("" if extra is None else " -- " + repr(extra)))


db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, status TEXT, attempts INTEGER, last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT)")
stamps = []


def fake_d1(sql, params=None):
    s = sql.lstrip()
    if s.startswith("SELECT 'a'"):
        return [{"expected": "a", "observed": "a"}]
    if s.startswith("UPDATE remediation_contracts SET attempts"):
        stamps.append(sql)
        db.execute(sql, params or [])
        return []
    return []


def run(status, passed=True, probe=None):
    """consume_one on a contract whose stored status is `status`; returns (status, attempts, verdict) after the stamp."""
    db.execute("DELETE FROM remediation_contracts")
    db.execute("INSERT INTO remediation_contracts (class, status, attempts) VALUES ('c1', ?, 4)", (status,))
    c = {"class": "c1", "verify_transport": rc.HTTPS_TRANSPORT, "expected_cadence_h": 1, "max_attempts": 3, "issue_id": None, "status": "active",
         "verify_probe": probe or ("SELECT 'a' AS expected, 'a' AS observed" if passed else "SELECT 'a' AS expected, 'b' AS observed")}
    rc.consume_one(c, {rc.HTTPS_TRANSPORT})
    return db.execute("SELECT status, attempts, last_verdict FROM remediation_contracts WHERE class = 'c1'").fetchone()


def fake_https(c, rec, local, trusted):
    """Stands in for the runner-https probe: a pass asks the stamp to move the contract to holding, a fail asks for nothing."""
    if "'b' AS observed" in c["verify_probe"]:
        rec["verdict"] = "fail"
        local["fail"] += 1
        return None, 1
    rec["verdict"] = "pass"
    local["pass"] += 1
    return "holding", 1


saved = (rc.d1, rc.consume_https)
rc.d1, rc.consume_https = fake_d1, fake_https
try:
    # a pass moves an active contract to holding; the same pass leaves a contract another writer superseded where it is
    check(run("active")[0] == "holding", "an active contract that passed moves to holding")
    r = run("superseded")
    check(r[0] == "superseded", "a contract superseded after the probe stays superseded", r)
    check(r[1] == 5, "the attempt is still counted on it", r)
    check(run("parked")[0] == "parked", "a parked contract is not moved by a stale stamp")
    check(run("needs-machine-probe")[0] == "needs-machine-probe", "needs-machine-probe is left alone")
    check(run("holding")[0] == "holding", "a holding contract that passed again stays holding")
    check(run("active", passed=False)[0] == "active", "a failing probe below the retry limit leaves an active contract active")
    check(run("superseded", passed=False)[0] == "superseded", "a failing probe leaves a superseded contract superseded")
finally:
    rc.d1, rc.consume_https = saved

check(len(stamps) >= 7, "every case went through the real stamp statement", len(stamps))
check(all(re.search(r"status\s*=\s*CASE WHEN status IN \('active', 'holding'\) THEN COALESCE\(\?, status\) ELSE status END", s) for s in stamps),
      "the statement guards the status write", stamps[:1])

print("%d failed" % fails if fails else "all passed")
sys.exit(1 if fails else 0)

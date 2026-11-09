#!/usr/bin/env python3
"""STAMP-ESCALATE-1 offline test (issue 9762): a failing contract at attempts + 1 >= max_attempts is stamped escalated.

Run: python3 scripts/remediation_consumer_escalate_test.py
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for k in ("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN"):
    os.environ.setdefault(k, "x")
import remediation_consumer as rc  # noqa: E402

fails = 0


def check(cond, msg, extra=None):
    global fails
    if not cond:
        fails += 1
    print(("ok   " if cond else "FAIL ") + msg + ("" if cond or extra is None else " -- " + repr(extra)))


def c(cls="issue-1", attempts=0, status="active", mx=3):
    return {"class": cls, "attempts": attempts, "status": status, "max_attempts": mx}


check(rc.escalation_status(c(attempts=2), "fail") == "escalated", "attempts+1 >= max escalates a failing contract")
check(rc.escalation_status(c(attempts=1), "fail") is None, "below the limit stays")
check(rc.escalation_status(c(attempts=2, status="holding"), "fail") == "escalated", "holding escalates too")
check(rc.escalation_status(c(attempts=2, status="superseded"), "fail") is None, "superseded is left alone")
check(rc.escalation_status(c(attempts=9), "pass") is None, "a pass never escalates")
check(rc.escalation_status(c("fm-x", attempts=9), "fail") is None, "standing detectors are exempt")
check(rc.escalation_status(c("belief-x", attempts=9), "fail") is None, "belief detectors are exempt")

db = sqlite3.connect(":memory:")
db.execute("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, status TEXT, attempts INTEGER, last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT, escalate_to TEXT)")


def fake_d1(sql, params=None):
    s = sql.lstrip()
    if s.startswith("SELECT 'a'"):
        return [{"expected": "a", "observed": "b"}]
    if s.startswith("UPDATE remediation_contracts SET attempts"):
        db.execute(sql, params or [])
    return []


saved = rc.d1
rc.d1 = fake_d1
try:
    db.execute("INSERT INTO remediation_contracts (class, status, attempts) VALUES ('issue-1', 'active', 2)")
    cc = {"class": "issue-1", "verify_transport": "d1-query", "expected_cadence_h": 1, "max_attempts": 3, "attempts": 2,
          "status": "active", "issue_id": None, "verify_probe": "SELECT 'a' AS expected, 'b' AS observed"}
    rc.consume_one(cc, {"d1-query"})
    row = db.execute("SELECT status, escalate_to FROM remediation_contracts").fetchone()
    check(row == ("escalated", "fleet"), "consume_d1 stamp writes escalated and escalate_to", row)
finally:
    rc.d1 = saved
print("%d failed" % fails if fails else "all passed")
sys.exit(1 if fails else 0)

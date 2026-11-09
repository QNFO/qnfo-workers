#!/usr/bin/env python3
"""STAMP-ESCALATE-1 offline test (issue 9762, pillar autonomy).

The consumer stamp never moved a contract to 'escalated': a contract that failed past max_attempts stayed active. verdict_next_status now
gives consume_code and consume_d1 a verdict-derived next status, and consume_one's stamp writes it with escalate_to. Standing detectors
(fm-*, belief-*) and liveness contracts are exempt. Runs the real consume_one against an in-memory sqlite table behind a fake d1.

Run: python3 scripts/remediation_consumer_escalate_test.py
"""
import os
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
db.execute("CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, status TEXT, attempts INTEGER, last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT, escalate_to TEXT)")

STATE = {"fails": 3}


def fake_d1(sql, params=None):
    s = sql.lstrip()
    if s.startswith("UPDATE remediation_contracts SET attempts"):
        db.execute(sql, params or [])
        return []
    if s.startswith("SELECT 'a' AS expected, 'b'"):
        return [{"expected": "a", "observed": "b"}]
    if s.startswith("SELECT 'a' AS expected, 'a'"):
        return [{"expected": "a", "observed": "a"}]
    return []


def run(cls, attempts, probe_fails=True, status="active", escalate_to=None, module=None, nfails=3):
    db.execute("DELETE FROM remediation_contracts")
    db.execute("INSERT INTO remediation_contracts (class, status, attempts, escalate_to) VALUES (?, ?, ?, ?)", (cls, status, attempts, escalate_to))
    STATE["fails"] = nfails
    probe = "SELECT 'a' AS expected, 'b' AS observed" if probe_fails else "SELECT 'a' AS expected, 'a' AS observed"
    c = {"class": cls, "verify_transport": "d1-query", "verify_probe": probe, "expected_cadence_h": 1, "max_attempts": 3, "attempts": attempts,
         "issue_id": None, "module": module, "ts": None}
    rc.consume_one(c, {"d1-query"})
    return db.execute("SELECT status, escalate_to, last_verdict FROM remediation_contracts").fetchone()


saved = (rc.d1, rc.record_verification, rc.fails_since_last_pass, rc.steady_state_cadence)
rc.d1 = fake_d1
rc.record_verification = lambda *a, **k: None
rc.fails_since_last_pass = lambda cls: STATE["fails"]
rc.steady_state_cadence = lambda cls, verdict, cadence, transport: cadence
try:
    r = run("issue-1", attempts=2)
    check(r[0] == "escalated" and r[1] == rc.ESCALATE_TO_DEFAULT, "a d1 contract failing at attempts + 1 >= max_attempts is escalated with an owner", r)
    r = run("issue-2", attempts=0)
    check(r[0] == "active", "below max_attempts it stays active", r)
    r = run("issue-3", attempts=9, nfails=1)
    check(r[0] == "active", "one fail after many passes is not an escalation (fails in a row < max_attempts)", r)
    r = run("issue-4", attempts=9, probe_fails=False)
    check(r[0] == "active", "a pass never escalates", r)
    r = run("fm-some-detector", attempts=50)
    check(r[0] == "active", "a standing detector (fm-*) is exempt", r)
    r = run("belief-x", attempts=50)
    check(r[0] == "active", "a standing detector (belief-*) is exempt", r)
    r = run("issue-5", attempts=5, escalate_to="owner-x")
    check(r[0] == "escalated" and r[1] == "owner-x", "an existing escalate_to is kept", r)
    r = run("issue-6", attempts=5, status="superseded")
    check(r[0] == "superseded", "a status another writer set is not clobbered", r)
    r = run("issue-7", attempts=5, status="holding")
    check(r[0] == "escalated", "a holding contract escalates too", r)
    c = {"class": "issue-8", "max_attempts": 3, "attempts": 5}
    check(rc.verdict_next_status(c, {"verdict": "vacuous-probe-result"}) is None, "a non-fail verdict never escalates")
    check(rc.verdict_next_status(c, {"verdict": "fail"}) == "escalated", "verdict_next_status says escalated on a sustained fail")
finally:
    rc.d1, rc.record_verification, rc.fails_since_last_pass, rc.steady_state_cadence = saved

print("%d failed" % fails if fails else "all passed")
sys.exit(1 if fails else 0)

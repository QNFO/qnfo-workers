#!/usr/bin/env python3
"""FIRST-PASS-CLOSE-1 offline test (2026-10-26, pillar autonomy; remediation session rem-a4).

remediation_verification_autoclose_ins and issue_close_evidence_required refuse to close an issue while a contract of it carries a refusal verdict
(fail, ...) in last_verdict. The consumer wrote the pass row first and stamped the contract after, so the trigger read the PREVIOUS run's verdict:
the first passing read of a contract that had been failing never closed its issue, the next run did (79 of 212 closes of never-reopened issues in
3 days, 6.2 hours of waiting on average). record_verification now stamps the refusal verdict to 'pass' immediately before a passing row.

Runs the real consume_one (d1-query path) against an in-memory sqlite database that carries the live text of the two triggers (the autoclose trigger is
copied from qnfo-audit sqlite_master read 2026-10-26 19:20Z, the evidence trigger is sliced from the live-shaped BASE_DDL of
qnfo-fleet-control/breach-doctor.test.mjs) behind a fake d1.

Run: python3 scripts/remediation_consumer_first_pass_test.py
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


HERE = os.path.dirname(os.path.abspath(__file__))
engine = open(os.path.join(HERE, "..", "qnfo-fleet-control", "breach-doctor.test.mjs"), encoding="utf-8").read()
at = engine.index("CREATE TRIGGER issue_close_evidence_required")
EVIDENCE_TRIGGER = engine[at: engine.index("END;", at) + 4]

CB = "NOT EXISTS (SELECT 1 FROM remediation_contracts cb WHERE cb.issue_id = NEW.issue_id AND cb.status IN ('active', 'holding') AND COALESCE(cb.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))"
AUTOCLOSE = """CREATE TRIGGER remediation_verification_autoclose_ins AFTER INSERT ON remediation_verifications
WHEN NEW.pass = 1
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = NEW.issue_id AND c2.class <> COALESCE(NEW.class, '')
                  AND c2.status IN ('active', 'holding')
                  AND (SELECT v2.pass FROM remediation_verifications v2 WHERE v2.class = c2.class AND COALESCE(v2.observed, '') <> ''
                       AND (lower(trim(v2.observed)) NOT LIKE 'pending%') ORDER BY v2.id DESC LIMIT 1) = 0)
  AND (COALESCE((SELECT t.reopened_count FROM issue_triage t WHERE t.issue_id = NEW.issue_id), 0) = 0
       OR (SELECT v3.pass FROM remediation_verifications v3 WHERE v3.class = NEW.class AND v3.id < NEW.id AND COALESCE(v3.observed, '') <> ''
           AND (lower(trim(v3.observed)) NOT LIKE 'pending%') ORDER BY v3.id DESC LIMIT 1) = 1)
BEGIN
  INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT NEW.issue_id, 'verified-remediation', 'closed', 'fleet-autoremediation', datetime('now','+7 days'), 'remediation_verifications#' || NEW.id || ' pass=1 class=' || COALESCE(NEW.class,'') || ' transport=' || NEW.transport || ' verified_at=' || COALESCE(NEW.verified_at, datetime('now')) WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND status = 'open') AND @@CB@@ ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence WHERE COALESCE(issue_triage.close_evidence,'') = '';
  UPDATE agent_issues SET status='closed', close_channel='auto:verified-remediation-trigger', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id = NEW.issue_id AND status = 'open'
    AND @@CB@@;
END""".replace("@@CB@@", CB)

DDL = """
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT DEFAULT 'open', close_channel TEXT, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT DEFAULT 'active', attempts INTEGER DEFAULT 0, last_attempt_at TEXT, last_verdict TEXT, next_due_at TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
"""


def world(status="active", verdict="fail", reopened=0, passes_before=0):
    db = sqlite3.connect(":memory:")
    db.executescript(DDL)
    db.executescript(EVIDENCE_TRIGGER.replace("remediation_contracts", "remediation_contracts") + ";")
    db.executescript(AUTOCLOSE + ";")
    db.execute("INSERT INTO agent_issues (id, title, status) VALUES (7, 'T: x', 'open')")
    db.execute("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, reopened_count) VALUES (7, 'AUTOTRIAGE-1', 'qnfo-ops', '2026-10-01', ?)", (reopened,))
    db.execute("INSERT INTO remediation_contracts (class, issue_id, status, last_verdict) VALUES ('issue-7', 7, ?, ?)", (status, verdict))
    for _ in range(passes_before):
        db.execute("INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass) VALUES (7, 'issue-7', 'd1-query', '0', '0', 1)")
    db.commit()
    return db


def install(db, log_list):
    """Point the consumer's d1() at db and record every statement in order."""
    def fake_d1(sql, params=None):
        s = sql.lstrip()
        log_list.append(s[:60])
        if s.upper().startswith("SELECT"):
            cur = db.execute(sql, params or [])
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]
        db.execute(sql, params or [])
        db.commit()
        return []
    rc.d1 = fake_d1


def contract(probe):
    return {"class": "issue-7", "issue_id": 7, "verify_transport": "d1-query", "expected_cadence_h": 1, "max_attempts": 3, "status": "active", "verify_probe": probe}


PASS = "SELECT '0' AS expected, '0' AS observed"
FAIL = "SELECT '0' AS expected, '1' AS observed"


def issue_state(db):
    return db.execute("SELECT status, close_channel FROM agent_issues WHERE id = 7").fetchone()


def contract_state(db):
    return db.execute("SELECT status, last_verdict, attempts FROM remediation_contracts WHERE class = 'issue-7'").fetchone()


# 1. the defect, reproduced with the pre-stamp switched off: the first passing read of a failing contract leaves the issue open, the second closes it
orig = rc.stamp_pass_before_row
db = world()
rc.stamp_pass_before_row = lambda cls, passed: False
install(db, [])
rc.consume_one(contract(PASS), {"d1-query"})
check(issue_state(db)[0] == "open" and contract_state(db)[1] == "pass", "control: without the pre-stamp the first pass leaves the issue open (the defect), and the contract reads pass afterwards", (issue_state(db), contract_state(db)))
rc.consume_one(contract(PASS), {"d1-query"})
check(issue_state(db) == ("closed", "auto:verified-remediation-trigger"), "control: the second pass closes it", issue_state(db))
rc.stamp_pass_before_row = orig

# 2. the fix: the first passing read of a failing contract closes the issue
db = world()
order = []
install(db, order)
rc.consume_one(contract(PASS), {"d1-query"})
check(issue_state(db) == ("closed", "auto:verified-remediation-trigger"), "the first passing read of a contract that was failing closes its issue with the trigger's channel", issue_state(db))
upd = [i for i, s in enumerate(order) if s.startswith("UPDATE remediation_contracts SET last_verdict = 'pass'")]
ins = [i for i, s in enumerate(order) if s.startswith("INSERT INTO remediation_verifications")]
stamp = [i for i, s in enumerate(order) if s.startswith("UPDATE remediation_contracts SET attempts")]
check(len(upd) == 1 and len(ins) == 1 and len(stamp) == 1 and upd[0] < ins[0] < stamp[0], "order: pre-stamp, then the pass row, then the consumer's own stamp", order)
check(contract_state(db) == ("active", "pass", 1), "the contract ends at pass with one attempt counted (the pre-stamp counts nothing)", contract_state(db))
ev = db.execute("SELECT close_evidence FROM issue_triage WHERE issue_id = 7").fetchone()[0]
check(ev.startswith("remediation_verifications#1 pass=1 class=issue-7"), "the close evidence names the verification row", ev)

# 3. a failing read never pre-stamps and never closes
db = world(verdict="pass")
order = []
install(db, order)
rc.consume_one(contract(FAIL), {"d1-query"})
check(not any(s.startswith("UPDATE remediation_contracts SET last_verdict = 'pass'") for s in order), "a fail issues no pre-stamp")
check(issue_state(db)[0] == "open" and contract_state(db)[1] == "fail", "a fail leaves the issue open and the contract at fail", (issue_state(db), contract_state(db)))

# 4. a contract that is not active or holding is not touched by the pre-stamp
for status in ("superseded", "monitoring", "escalated", "probe-review-refused"):
    db = world(status=status, verdict="fail")
    install(db, [])
    rc.stamp_pass_before_row("issue-7", 1)
    check(contract_state(db)[1] == "fail", "pre-stamp leaves a %s contract alone" % status, contract_state(db))

# 5. a verdict that is not a refusal is not rewritten (a deferral or a pass stays as it is)
for verdict in ("deferred", "pass", None):
    db = world(verdict=verdict)
    install(db, [])
    rc.stamp_pass_before_row("issue-7", 1)
    check(contract_state(db)[1] == verdict, "pre-stamp leaves last_verdict %r alone" % (verdict,), contract_state(db))

# 6. every refusal token is moved to pass, a holding contract too
for verdict in rc.REFUSAL_VERDICTS:
    db = world(status="holding", verdict=verdict)
    install(db, [])
    check(rc.stamp_pass_before_row("issue-7", 1) is True and contract_state(db)[1] == "pass", "refusal verdict %s of a holding contract becomes pass" % verdict, contract_state(db))
check(rc.stamp_pass_before_row("issue-7", 0) is False and rc.stamp_pass_before_row(None, 1) is False, "no pre-stamp for a fail or for a missing class")

# 7. the two-pass rule of a reopened issue is unchanged: the first pass does not close it, the second does
db = world(reopened=1, passes_before=0)
install(db, [])
rc.consume_one(contract(PASS), {"d1-query"})
check(issue_state(db)[0] == "open", "a reopened issue is still open after its first pass", issue_state(db))
rc.consume_one(contract(PASS), {"d1-query"})
check(issue_state(db) == ("closed", "auto:verified-remediation-trigger"), "a reopened issue closes after its second consecutive pass", issue_state(db))

# 8. a refused pre-stamp is logged and the row is still written and the issue still closes on the next read (best effort, never a new failure)
db = world()
calls = []


def refusing_d1(sql, params=None):
    calls.append(sql.lstrip()[:40])
    if sql.lstrip().startswith("UPDATE remediation_contracts SET last_verdict = 'pass'"):
        raise RuntimeError("D1 refused the pre-stamp")
    s = sql.lstrip()
    if s.upper().startswith("SELECT"):
        cur = db.execute(sql, params or [])
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in cur.fetchall()]
    db.execute(sql, params or [])
    db.commit()
    return []


rc.d1 = refusing_d1
rec, local = rc.consume_one(contract(PASS), {"d1-query"})
check(rec.get("verdict") == "pass" and local["pass"] == 1 and rec.get("written") is True, "a refused pre-stamp changes nothing for the verdict, the counters or the row", rec)
check(db.execute("SELECT COUNT(*) FROM remediation_verifications").fetchone()[0] == 1, "the pass row is written")

print("%d failed" % fails)
sys.exit(1 if fails else 0)

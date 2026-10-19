#!/usr/bin/env python3
"""CONFLICT-REPAIR-SETTLE-2 offline test (2026-10-19, PR 2603 review, charter pillar autonomy).

settle_issue closes the repair issue of a merged or closed pull request. It failed for good on the live schema: issue_triage
.sla_due_at is NOT NULL with no default, and SQLite checks NOT NULL before an ON CONFLICT upsert. This runs the statements
against an in-memory SQLite with the LIVE issue_triage definition (read from sqlite_master of qnfo-audit on 2026-10-19) and the
live close triggers (issue_close_evidence_required with CLOSE-BINDS-TO-PROBE-1, issue_close_evidence_weak_predicate_upd), so a
statement the real database would refuse fails here.

Run: python3 scripts/conflict_repair_test.py
"""
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ["CLOUDFLARE_ACCOUNT_ID"] = "acct"
os.environ["CLOUDFLARE_API_TOKEN"] = "tok-test"

import apply_migrations  # noqa: E402
import conflict_repair as cr  # noqa: E402

fails = 0


def check(cond, msg, extra=None):
    global fails
    if cond:
        print("ok   " + msg)
    else:
        fails += 1
        print("FAIL " + msg + ("" if extra is None else " -- " + repr(extra)))


# Live definitions, copied from sqlite_master of qnfo-audit.
SCHEMA = """
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT NOT NULL DEFAULT 'open', updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE remediation_contracts (id INTEGER PRIMARY KEY, issue_id INTEGER, status TEXT, last_verdict TEXT);
CREATE TRIGGER issue_close_evidence_weak_predicate_upd BEFORE UPDATE OF close_evidence ON issue_triage WHEN NEW.close_evidence IS NOT NULL AND NEW.close_evidence LIKE '%present in%' AND NEW.close_evidence LIKE '%directory listing%' BEGIN SELECT RAISE(ABORT,'CLOSE-EVIDENCE-WEAK-PREDICATE-1: file presence is not defect resolution (issue 1698)'); END;
CREATE TRIGGER issue_close_evidence_required
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence')
    WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  SELECT RAISE(ABORT,'close-while-contract-fails')
    WHERE NEW.status IN ('closed','resolved')
      AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id
                    AND c.status IN ('active','holding')
                    AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END;
"""


def fresh():
    db = sqlite3.connect(":memory:")
    db.executescript(SCHEMA)
    return db


def fake_d1(db):
    def d1(acct, token, db_id, sql, params=None):
        cur = db.execute(sql, params or [])
        rows = [dict(zip([c[0] for c in cur.description], r)) for r in cur.fetchall()] if cur.description else []
        db.commit()
        return rows
    return d1


def add_issue(db, iid, pr, triage=True, contract=None):
    db.execute("INSERT INTO agent_issues (id, title) VALUES (?1, ?2)", [iid, "STALE-PR-CONFLICT-REPAIR-1 PR %d: merge conflicts" % pr])
    if triage:
        db.execute("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at) VALUES (?1, 'AUTOTRIAGE-1', 'qnfo-ops', '2026-10-18 15:10:12')", [iid])
    if contract:
        db.execute("INSERT INTO remediation_contracts (issue_id, status, last_verdict) VALUES (?1, 'active', ?2)", [iid, contract])
    db.commit()


def state(db, iid):
    return db.execute("SELECT a.status, t.close_evidence, t.rc FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.id = ?1", [iid]).fetchone()


EV = cr.settled_evidence({"number": 2144, "state": "closed", "merged_at": None, "closed_at": "2026-10-19T01:00:00Z"})
db = fresh()
apply_migrations.d1 = fake_d1(db)

# 0. the failure this test pins: the first settle statement is refused by the live definition, with or without a triage row.
bad = fresh()
add_issue(bad, 1, 2144)
try:
    bad.execute("INSERT INTO issue_triage (issue_id, rc, owner, close_evidence) VALUES (1, 'x', 'y', 'z') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence")
    refused = ""
except sqlite3.IntegrityError as e:
    refused = str(e)
check("sla_due_at" in refused, "the old INSERT ... ON CONFLICT is refused by the live issue_triage (NOT NULL sla_due_at)", refused)

# 1. an issue with its AUTOTRIAGE-1 row: the evidence is written, the issue closes, rc and sla are kept.
add_issue(db, 10, 2144)
check(cr.settle_issue(2144, EV) is True, "settle_issue returns True for an issue with a triage row")
st = state(db, 10)
check(st == ("closed", EV, "AUTOTRIAGE-1"), "the issue is closed with the GitHub read as evidence and its triage row kept", st)

# 2. an issue with no triage row: the guarded INSERT supplies every NOT NULL column.
add_issue(db, 11, 2589, triage=False)
check(cr.settle_issue(2589, EV) is True, "settle_issue returns True for an issue with no triage row")
st = state(db, 11)
check(st == ("closed", EV, "CONFLICT-REPAIR-SETTLE-1"), "a missing triage row is created with sla_due_at and the issue closes", st)
check(db.execute("SELECT sla_due_at FROM issue_triage WHERE issue_id = 11").fetchone()[0] is not None, "the created row has sla_due_at")

# 3. CLOSE-BINDS-TO-PROBE-1 is not bypassed: a failing active contract keeps the issue open and the refusal is reported.
add_issue(db, 12, 2629, contract="fail")
check(cr.settle_issue(2629, EV) is False, "settle_issue returns False when a failing contract refuses the close")
check(state(db, 12)[0] == "open", "the issue stays open while its contract fails", state(db, 12))

# 4. only the open issue of the named pull request is touched; a second run is a no-op.
add_issue(db, 13, 91)
check(cr.settle_issue(2144, EV) is True and state(db, 13)[0] == "open", "another pull request's issue is untouched, a second run is a no-op")

# 5. repair() reports the settle honestly.
orig_gh, orig_elig, orig_settle = cr.gh, cr.eligible, cr.settle_issue
cr.gh = lambda path: {"number": 2144, "state": "closed", "merged_at": None, "closed_at": "x"}
cr.eligible = lambda pr: "not open"
cr.settle_issue = lambda n, e: False
check(cr.repair(2144, push=True)["outcome"] == "settle-failed", "repair() says settle-failed when the close did not land")
cr.settle_issue = lambda n, e: True
check(cr.repair(2144, push=True)["outcome"] == "settled", "repair() says settled when it did")
cr.gh, cr.eligible, cr.settle_issue = orig_gh, orig_elig, orig_settle

print("FAILS=%d" % fails)
sys.exit(1 if fails else 0)

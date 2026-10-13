#!/usr/bin/env python3
"""Offline replay of migrations/2026-10-13-issue-dup-annotate.sql (ISSUE-DUP-ABORT-1).

A replica of the agent_issues guards in production (the two unique open-title indexes, issue_refile_reopen and the retired
agent_issues_dedup_gap_ledger) plus a parent table whose AFTER INSERT trigger files an issue, as the autonomy-first and
code-task reroute triggers do. Proves: before the migration a duplicate open title (different case and spaces) aborts the
parent insert; after it the parent insert lands, no duplicate row is written, the refile is counted against the open
issue, a title that is not open still files, and a recently closed title is still reopened by issue_refile_reopen.
Run: python3 scripts/issue_dup_annotate_test.py   (prints "N passed, 0 failed")
"""
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import apply_migrations as M  # noqa: E402

MIG = os.path.join(HERE, "..", "migrations", "2026-10-13-issue-dup-annotate.sql")
passed = failed = 0


def ok(cond, label, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + repr(extra)[:300]))


REPLICA = """
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT,
  category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT,
  created_at INTEGER, updated_at INTEGER);
CREATE UNIQUE INDEX idx_agent_issues_open_title ON agent_issues(title) WHERE status = 'open';
CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues(lower(trim(title))) WHERE status = 'open';
CREATE TABLE issue_id_gap_ledger (id INTEGER PRIMARY KEY, recorded_at TEXT, verdict TEXT, evidence TEXT);
CREATE TRIGGER agent_issues_dedup_gap_ledger BEFORE INSERT ON agent_issues
WHEN EXISTS (SELECT 1 FROM agent_issues x WHERE x.status = 'open' AND lower(trim(x.title)) = lower(trim(NEW.title)))
BEGIN
  INSERT OR IGNORE INTO issue_id_gap_ledger (id, verdict, evidence)
  VALUES ((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues') + 1, 'deduped-insert', NEW.title);
END;
CREATE TRIGGER issue_refile_reopen BEFORE INSERT ON agent_issues
WHEN EXISTS (SELECT 1 FROM agent_issues t WHERE t.title = NEW.title AND t.status IN ('resolved', 'wontfix', 'closed')
  AND typeof(t.updated_at) = 'integer' AND t.updated_at > (strftime('%s', 'now') * 1000 - 86400000))
BEGIN
  UPDATE agent_issues SET status = 'open' WHERE id = (SELECT t.id FROM agent_issues t WHERE t.title = NEW.title
    AND t.status IN ('resolved', 'wontfix', 'closed') ORDER BY t.id DESC LIMIT 1);
  SELECT RAISE(IGNORE);
END;
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT CURRENT_TIMESTAMP, source TEXT);
CREATE TRIGGER fleet_tick_files_issue AFTER INSERT ON fleet_tick
BEGIN
  INSERT INTO agent_issues (title, source) VALUES ('  stuck-queue-1: Remediation Over SLA ', 'trigger:fleet_tick');
END;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT,
  probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT,
  verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h REAL, status TEXT, ts TEXT,
  last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER, next_due_at TEXT, max_items INTEGER,
  requires_container INTEGER, attempts INTEGER);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT CHECK (kind IN ('hold', 'filter', 'pause',
  'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER, disposition TEXT,
  disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT CURRENT_TIMESTAMP, actor TEXT, assumption TEXT,
  action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT,
  reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE migration_runs (id INTEGER PRIMARY KEY, file TEXT, status TEXT, error TEXT, applied_at TEXT);
"""


def apply(con, path):
    for s in M.statements(open(path, encoding="utf-8").read()):
        con.execute(s)


con = sqlite3.connect(":memory:", isolation_level=None)
con.executescript(REPLICA)
con.execute("INSERT INTO agent_issues (title, source) VALUES ('STUCK-QUEUE-1: remediation over SLA', 'seed')")

# Before: the duplicate filed by the trigger aborts the parent write.
try:
    con.execute("INSERT INTO fleet_tick (source) VALUES ('before')")
    aborted = False
except sqlite3.IntegrityError as e:
    aborted = "idx_agent_issues_open_title_ci" in str(e)
ok(aborted, "before the migration a duplicate open title aborts the parent insert")
ok(con.execute("SELECT COUNT(*) FROM fleet_tick").fetchone()[0] == 0, "and the parent row is rolled back")

opted, problems, info = M.plan(MIG, open(MIG, encoding="utf-8").read())
ok(opted and not problems, "the migration passes apply_migrations --check", problems)
ok(info.get("creates_backup"), "the migration creates its own BACKUP table before the DROP")
apply(con, MIG)

ok(con.execute("SELECT COUNT(*) FROM sqlite_master WHERE name = 'agent_issues_dedup_gap_ledger'").fetchone()[0] == 0,
   "the id-gap ledger trigger is retired")
ok(con.execute("SELECT COUNT(*) FROM bak_20261013_issue_dup_triggers WHERE name = 'agent_issues_dedup_gap_ledger'").fetchone()[0] == 1,
   "its text is kept in the backup table")

con.execute("INSERT INTO fleet_tick (source) VALUES ('after')")
con.execute("INSERT INTO fleet_tick (source) VALUES ('after-2')")
ok(con.execute("SELECT COUNT(*) FROM fleet_tick").fetchone()[0] == 2, "after the migration the parent inserts land")
ok(con.execute("SELECT COUNT(*) FROM agent_issues WHERE status = 'open'").fetchone()[0] == 1, "no duplicate open issue is written")
row = con.execute("SELECT issue_id, refiles, last_source FROM agent_issue_refiles").fetchone()
ok(row == (1, 2, "trigger:fleet_tick"), "each refile is counted against the open issue with its source", row)
ok(con.execute("SELECT COUNT(*) FROM sqlite_sequence WHERE name = 'agent_issues' AND seq = 1").fetchone()[0] == 1,
   "a skipped duplicate consumes no id")

con.execute("INSERT INTO agent_issues (title, source) VALUES ('NEW-ISSUE-1', 'x')")
ok(con.execute("SELECT COUNT(*) FROM agent_issues WHERE title = 'NEW-ISSUE-1'").fetchone()[0] == 1, "a title that is not open still files")

con.execute("INSERT INTO agent_issues (title, source, status) VALUES ('NEW-ISSUE-1', 'x', 'closed')")
ok(con.execute("SELECT COUNT(*) FROM agent_issues WHERE title = 'NEW-ISSUE-1'").fetchone()[0] == 2,
   "an insert with a closed status is not treated as a refile")

con.execute("UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE title = 'NEW-ISSUE-1' AND status = 'open'")
con.execute("INSERT INTO agent_issues (title, source) VALUES ('NEW-ISSUE-1', 'y')")
ok(con.execute("SELECT COUNT(*) FROM agent_issues WHERE title = 'NEW-ISSUE-1' AND status = 'open'").fetchone()[0] == 1,
   "a recently closed title is still reopened by issue_refile_reopen")

FIX = os.path.join(HERE, "..", "migrations", "2026-10-13-fm-issue-dup-abort-probe.sql")
opted, problems, _ = M.plan(FIX, open(FIX, encoding="utf-8").read())
ok(opted and not problems, "the probe fix passes apply_migrations --check", problems)
apply(con, FIX)

# FM-PROBE-ISO-COMPARE-1: migration_runs.applied_at is ISO ('...T...Z'), as apply_migrations.py writes it. A failure earlier
# the same day but more than 24 h ago must not count; the first probe compared it as text and counted it.
probe = con.execute("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-issue-dup-abort'").fetchone()[0]
err = "UNIQUE constraint failed: index ''idx_agent_issues_open_title_ci''"
con.execute("INSERT INTO migration_runs (file, status, error, applied_at) VALUES ('old', 'error', '" + err + "', "
            "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 hours'))")
exp, obs = con.execute(probe).fetchone()
ok(exp == obs == "1", "the fm-issue-dup-abort detector passes with only an ISO-stamped failure older than 24 h", (exp, obs))
con.execute("INSERT INTO migration_runs (file, status, error, applied_at) VALUES ('new', 'error', '" + err + "', "
            "strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hours'))")
exp, obs = con.execute(probe).fetchone()
ok(exp == "1" and obs == "0", "and fails on a fresh migration failure on the open-title index", (exp, obs))

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

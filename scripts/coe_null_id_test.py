#!/usr/bin/env python3
"""Offline replay of migrations/2026-10-13-coe-null-id-ts-normalise.sql (COE-NULL-ID-1, TS-FORMAT-MIX-1).

A replica of cloud_ops_events (TEXT PRIMARY KEY id, which SQLite lets be NULL) with the production ts normalisers keyed on
id, trg_metric_write_audit, the alerts dedupe and the worker_removals dedupe. Proves: before the migration an id-less insert
keeps its space-format ts and an ISO alert from hours earlier swallows a new one; after it every insert gets an id and an
ISO ts, the audit trigger writes an id, the backfill fixes existing rows, the alert dedupe only folds alerts from the last
60 minutes in either format, and the fm-coe-null-id detector reads 0.
Run: python3 scripts/coe_null_id_test.py   (prints "N passed, 0 failed")
"""
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import apply_migrations as M  # noqa: E402

MIG = os.path.join(HERE, "..", "migrations", "2026-10-13-coe-null-id-ts-normalise.sql")
passed = failed = 0


def ok(cond, label, extra=None):
    global passed, failed
    if cond:
        passed += 1
    else:
        failed += 1
        print("FAIL " + label + ("" if extra is None else " :: " + repr(extra)[:300]))


REPLICA = """
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE INDEX idx_coe_kind_ts ON cloud_ops_events(kind, ts);
CREATE TRIGGER cloud_ops_events_ts_norm_ins AFTER INSERT ON cloud_ops_events WHEN NEW.ts IS NOT NULL AND length(NEW.ts)=19
BEGIN UPDATE cloud_ops_events SET ts = replace(substr(NEW.ts,1,19),' ','T') || '.000Z' WHERE id=NEW.id; END;
CREATE TRIGGER cloud_ops_events_ts_norm_upd AFTER UPDATE OF ts ON cloud_ops_events WHEN NEW.ts IS NOT NULL AND length(NEW.ts)=19
BEGIN UPDATE cloud_ops_events SET ts = replace(substr(NEW.ts,1,19),' ','T') || '.000Z' WHERE id=NEW.id; END;
CREATE TRIGGER cloud_ops_events_ts_norm_epoch_ins AFTER INSERT ON cloud_ops_events WHEN NEW.ts IS NOT NULL AND length(NEW.ts)=10
  AND NEW.ts GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'
BEGIN UPDATE cloud_ops_events SET ts = strftime('%Y-%m-%dT%H:%M:%S.000Z', CAST(NEW.ts AS INTEGER), 'unixepoch') WHERE id=NEW.id; END;
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, state TEXT, last_refreshed TEXT);
CREATE TRIGGER trg_metric_write_audit AFTER UPDATE OF last_value ON metric_registry WHEN NEW.metric IN ('worker_count')
BEGIN INSERT INTO cloud_ops_events (ts,kind,status,text) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ','now'),'metric-write-audit','audit','m'); END;
CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, message TEXT, created_at TEXT, repeats INTEGER DEFAULT 0);
CREATE TRIGGER alerts_dedup_count BEFORE INSERT ON alerts
WHEN EXISTS (SELECT 1 FROM alerts WHERE source = NEW.source AND message = NEW.message AND created_at > datetime('now', '-60 minutes'))
BEGIN
  UPDATE alerts SET repeats = repeats + 1
  WHERE id = (SELECT id FROM alerts WHERE source = NEW.source AND message = NEW.message AND created_at > datetime('now', '-60 minutes') ORDER BY id DESC LIMIT 1);
  SELECT RAISE(IGNORE);
END;
CREATE TABLE worker_live_audit (worker TEXT PRIMARY KEY, note TEXT, http INTEGER, live_version TEXT, probed_at TEXT);
CREATE TABLE worker_removals (worker TEXT, removed_at TEXT, action TEXT, target TEXT, rationale TEXT, evidence TEXT, source TEXT);
CREATE TRIGGER worker_removals_from_live_audit AFTER UPDATE OF note ON worker_live_audit
WHEN NEW.note = 'NOT_DEPLOYED' AND OLD.note IN ('SYNC','DRIFT','CRON_ONLY')
 AND NOT EXISTS (SELECT 1 FROM worker_removals r WHERE r.worker = NEW.worker AND r.removed_at > datetime('now','-1 day'))
BEGIN INSERT INTO worker_removals (worker, removed_at, action) VALUES (NEW.worker, datetime('now'), 'OBSERVED-REMOVED'); END;
CREATE TABLE llm_gateway_log (ts TEXT, cost_usd REAL);
CREATE TABLE cost_router_metrics (ts TEXT, cost_usd REAL);
CREATE TABLE ai_queries (ts TEXT, cost_usd REAL);
CREATE VIEW v_cost_fleet_30d AS SELECT 'llm_gateway_log' AS source, COUNT(*) AS requests FROM llm_gateway_log WHERE ts >= datetime('now','-30 day');
CREATE TABLE issue_ledger (fingerprint TEXT, source TEXT, level TEXT, title TEXT, status TEXT, first_seen TEXT, last_seen TEXT, occurrences INTEGER);
CREATE TABLE tool_error_exclusions (pattern TEXT);
CREATE VIEW issue_ledger_exclusion_aware AS SELECT fingerprint FROM issue_ledger;
CREATE TABLE handoffs (id INTEGER PRIMARY KEY, session_id TEXT, project_id TEXT, wbs_code TEXT, timestamp TEXT, dod_verdict TEXT, claim_sheet TEXT);
CREATE VIEW v_closeouts_no_verdict AS SELECT id FROM handoffs WHERE timestamp >= datetime('now','-7 days');
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT,
  probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT,
  verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h REAL, status TEXT, ts TEXT,
  last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER, next_due_at TEXT, max_items INTEGER,
  requires_container INTEGER, attempts INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT,
  outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT,
  surfaces_tested TEXT, outcome_matched INTEGER);
"""

con = sqlite3.connect(":memory:", isolation_level=None)
con.executescript(REPLICA)
con.execute("INSERT INTO metric_registry (metric, last_value) VALUES ('worker_count', '1')")

# Before: an id-less insert keeps a space ts, the audit trigger writes no id, an ISO alert from hours ago swallows a new one.
con.execute("INSERT INTO cloud_ops_events (ts, kind, job) VALUES (datetime('now'), 'obs-ingest', 'qnfo-fleet-control')")
row = con.execute("SELECT id, ts FROM cloud_ops_events WHERE kind = 'obs-ingest'").fetchone()
ok(row[0] is None and row[1][10] == " ", "before: an id-less row keeps its space-format ts", row)
con.execute("UPDATE metric_registry SET last_value = '2' WHERE metric = 'worker_count'")
ok(con.execute("SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'metric-write-audit' AND id IS NULL").fetchone()[0] == 1,
   "before: trg_metric_write_audit writes a row with no id")
con.execute("INSERT INTO cloud_ops_events (ts, kind) VALUES ('2026-10-13 08:00:00', 'dispose-blocked')")
con.execute("INSERT INTO alerts (source, message, created_at) VALUES ('qnfo-deploy-guard', 'lock held', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 hours'))")
same_day = con.execute("SELECT date('now', '-5 hours') = date('now')").fetchone()[0]
con.execute("INSERT INTO alerts (source, message, created_at) VALUES ('qnfo-deploy-guard', 'lock held', datetime('now'))")
if same_day:
    ok(con.execute("SELECT COUNT(*) FROM alerts").fetchone()[0] == 1, "before: an ISO alert from 5 h earlier the same day swallows the new one")
con.execute("DELETE FROM alerts")

opted, problems, info = M.plan(MIG, open(MIG, encoding="utf-8").read())
ok(opted and not problems and info.get("creates_backup"), "the migration passes --check and creates its own backup", (problems, info))
for s in M.statements(open(MIG, encoding="utf-8").read()):
    con.execute(s)

ok(con.execute("SELECT COUNT(*) FROM bak_20261013_coe_null_id WHERE obj = 'row'").fetchone()[0] == 3,
   "the backup holds every id-less or space-stamped row")
ok(con.execute("SELECT COUNT(*) FROM bak_20261013_coe_null_id WHERE obj = 'sql'").fetchone()[0] == 9, "and the text of every replaced object")
ok(con.execute("SELECT COUNT(*) FROM cloud_ops_events WHERE id IS NULL").fetchone()[0] == 0, "backfill: no row has a NULL id")
ok(con.execute("SELECT COUNT(*) FROM cloud_ops_events WHERE substr(ts, 11, 1) = ' '").fetchone()[0] == 0, "backfill: no row has a space ts")
ok(con.execute("SELECT ts FROM cloud_ops_events WHERE kind = 'dispose-blocked'").fetchone()[0] == "2026-10-13T08:00:00.000Z",
   "backfill: a space ts becomes the ISO form the normaliser writes")

con.execute("INSERT INTO cloud_ops_events (ts, kind, job) VALUES ('2026-10-13 21:21:08', 'obs-ingest', 'qnfo-fleet-control')")
row = con.execute("SELECT id, ts FROM cloud_ops_events WHERE ts LIKE '2026-10-13T21:21:08%'").fetchone()
ok(row and row[0] and row[0].startswith("coe-") and row[1] == "2026-10-13T21:21:08.000Z", "after: an id-less insert gets an id and an ISO ts", row)
con.execute("INSERT INTO cloud_ops_events (ts, kind) VALUES ('1760390000', 'epoch')")
row = con.execute("SELECT id, ts FROM cloud_ops_events WHERE kind = 'epoch'").fetchone()
ok(row[0] and row[1].endswith(".000Z") and row[1][10] == "T", "after: an epoch ts on an id-less insert is normalised", row)
con.execute("INSERT INTO cloud_ops_events (id, ts, kind) VALUES ('given', '2026-10-13T21:00:00Z', 'k')")
ok(con.execute("SELECT ts FROM cloud_ops_events WHERE id = 'given'").fetchone()[0] == "2026-10-13T21:00:00Z", "a row with an id and an ISO ts is untouched")
con.execute("UPDATE metric_registry SET last_value = '3' WHERE metric = 'worker_count'")
ok(con.execute("SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'metric-write-audit' AND id LIKE 'mwa-%'").fetchone()[0] == 1,
   "after: trg_metric_write_audit writes its own id")

con.execute("INSERT INTO alerts (source, message, created_at) VALUES ('qnfo-deploy-guard', 'lock held', strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-5 hours'))")
con.execute("INSERT INTO alerts (source, message, created_at) VALUES ('qnfo-deploy-guard', 'lock held', datetime('now'))")
ok(con.execute("SELECT COUNT(*) FROM alerts").fetchone()[0] == 2, "after: an alert older than 60 min no longer swallows a new one")
con.execute("INSERT INTO alerts (source, message, created_at) VALUES ('qnfo-deploy-guard', 'lock held', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")
ok(con.execute("SELECT COUNT(*), MAX(repeats) FROM alerts").fetchone() == (2, 1), "after: a repeat within 60 min is still folded, in either format")

con.execute("INSERT INTO worker_removals (worker, removed_at, action) VALUES ('w1', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 hours'), 'x')")
con.execute("INSERT INTO worker_live_audit (worker, note) VALUES ('w1', 'SYNC')")
con.execute("UPDATE worker_live_audit SET note = 'NOT_DEPLOYED' WHERE worker = 'w1'")
ok(con.execute("SELECT COUNT(*) FROM worker_removals WHERE worker = 'w1'").fetchone()[0] == 2,
   "after: a removal recorded 30 h ago in ISO does not hide a new one")

con.execute("INSERT INTO handoffs (timestamp) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-8 days'))")
con.execute("INSERT INTO handoffs (timestamp) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 days'))")
ok(con.execute("SELECT COUNT(*) FROM v_closeouts_no_verdict").fetchone()[0] == 1, "v_closeouts_no_verdict windows ISO timestamps correctly")
con.execute("INSERT INTO llm_gateway_log VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-31 days'), 1.0), (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days'), 2.0)")
ok(con.execute("SELECT usd, requests FROM v_cost_fleet_30d WHERE source = 'llm_gateway_log'").fetchone() == (2.0, 1), "v_cost_fleet_30d windows ISO timestamps correctly")
con.execute("SELECT * FROM issue_ledger_exclusion_aware").fetchall()
ok(True, "issue_ledger_exclusion_aware compiles")

probe = con.execute("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-coe-null-id'").fetchone()[0]
exp, obs = con.execute(probe).fetchone()
ok(exp == obs == "0", "the fm-coe-null-id detector passes after the migration", (exp, obs))
con.execute("DROP TRIGGER cloud_ops_events_id_fill_ins")
con.execute("INSERT INTO cloud_ops_events (ts, kind) VALUES (datetime('now'), 'obs-ingest')")
exp, obs = con.execute(probe).fetchone()
ok(obs != "0", "and fails when an id-less row appears again", (exp, obs))

print(f"{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)

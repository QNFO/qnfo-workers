// ISSUE-ACCOUNTING-1 offline suite for migrations/2026-10-19-silent-drops-unrecorded-only.sql (QNFO D1 issues 3014, 2960; trigger 3075).
// silent_drops counted every issue_lifecycle 'deleted' row, although issue_lifecycle_bd writes the agent_issues_tombstone copy in the
// same statement, so a recorded delete kept the metric at 7 for good. The file applies twice to an in-memory SQLite database built
// from the qnfo-audit objects it touches (sql read from sqlite_master on 2026-10-19). Set SILENT_DROPS_MIGRATION to another file
// to run the cases against it. Run: node migrations/issue-accounting-20261019.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };
const FILE = process.env.SILENT_DROPS_MIGRATION || new URL("./2026-10-19-silent-drops-unrecorded-only.sql", import.meta.url).pathname;
const MIG = readFileSync(FILE, "utf8");

const OLD_VIEW = String.raw`
CREATE VIEW v_issue_accounting AS
SELECT
  MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) AS entered,
  (SELECT COUNT(*) FROM agent_issues WHERE status = 'open') AS open_n,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
     AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_with_disposition,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status IN ('closed', 'resolved', 'wontfix')
     AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '')) AS closed_without_disposition,
  (SELECT COUNT(*) FROM agent_issues_tombstone) AS deleted_recorded,
  MAX(0, MAX(COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'agent_issues'), 0), COALESCE((SELECT MAX(id) FROM agent_issues), 0)) - (SELECT COUNT(*) FROM agent_issues) - (SELECT COUNT(DISTINCT id) FROM agent_issues_tombstone)
    - (SELECT COUNT(*) FROM issue_id_gap_ledger g WHERE g.id NOT IN (SELECT id FROM agent_issues) AND g.id NOT IN (SELECT id FROM agent_issues_tombstone)
         AND NOT EXISTS (SELECT 1 FROM issue_id_gap_ranges r WHERE g.id BETWEEN r.lo AND r.hi))
    - COALESCE((SELECT SUM((r.hi - r.lo + 1)
         - (SELECT COUNT(*) FROM agent_issues a WHERE a.id BETWEEN r.lo AND r.hi)
         - (SELECT COUNT(DISTINCT t.id) FROM agent_issues_tombstone t WHERE t.id BETWEEN r.lo AND r.hi
              AND t.id NOT IN (SELECT id FROM agent_issues))) FROM issue_id_gap_ranges r), 0)) AS deleted_unrecorded,
  (SELECT COUNT(*) FROM issue_lifecycle WHERE (event = 'dispositioned' AND has_evidence = 0) OR event = 'deleted') AS silent_drops_since_ledger;
`;

// The live objects (sqlite_master, 2026-10-19). v_doctrine_scorecard_v2 and scorecard_v2_tick are cut to the columns and
// statements that read v_issue_accounting; the other columns read tables this change does not touch.
const SCHEMA = String.raw`
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE agent_issues_tombstone(
  id INT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, linked_session TEXT, created_at INT, updated_at INT,
  pipeline_stage TEXT, predicate_id TEXT, recheck_count INT, close_channel TEXT
, deleted_at TEXT);
CREATE TABLE issue_lifecycle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  has_evidence INTEGER,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TRIGGER issue_lifecycle_no_update BEFORE UPDATE ON issue_lifecycle
BEGIN SELECT RAISE(ABORT, 'NO-SILENT-DROP-2: issue_lifecycle is append-only (doctrine section 14)'); END;
CREATE TRIGGER issue_lifecycle_no_delete BEFORE DELETE ON issue_lifecycle
BEGIN SELECT RAISE(ABORT, 'NO-SILENT-DROP-2: issue_lifecycle is append-only (doctrine section 14)'); END;
CREATE TRIGGER issue_lifecycle_bd BEFORE DELETE ON agent_issues
BEGIN
  INSERT INTO agent_issues_tombstone SELECT *, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM agent_issues WHERE id = OLD.id;
  INSERT INTO issue_lifecycle (issue_id, event, from_status, has_evidence) VALUES (OLD.id, 'deleted', OLD.status, 0);
END;
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE issue_id_gap_ledger (id INTEGER PRIMARY KEY, recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), verdict TEXT NOT NULL, evidence TEXT NOT NULL);
CREATE TABLE issue_id_gap_ranges (lo INTEGER NOT NULL, hi INTEGER NOT NULL, verdict TEXT NOT NULL, evidence TEXT NOT NULL, recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), PRIMARY KEY (lo, hi), CHECK (hi >= lo));
${OLD_VIEW}
CREATE VIEW v_doctrine_scorecard_v2 AS
SELECT
  (SELECT silent_drops_since_ledger FROM v_issue_accounting) AS silent_drops,
  (SELECT closed_without_disposition + deleted_unrecorded FROM v_issue_accounting) AS issues_unaccounted;
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE TRIGGER scorecard_v2_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT silent_drops FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'silent_drops';
  UPDATE metric_registry SET last_value = CAST((SELECT issues_unaccounted FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'issues_unaccounted';
END;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
INSERT INTO metric_registry (metric, layer, kind, last_value, state) VALUES ('silent_drops', 'x', 'target', '7', 'MEASURED'), ('issues_unaccounted', 'x', 'target', '0', 'MEASURED');
`;

const OLD_PROBE = "SELECT '1' AS expected, 'old' AS observed";
const row = (db, sql) => db.prepare(sql).get();
const one = (db, sql) => Object.values(row(db, sql))[0];
function fresh(open3014 = true) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA);
  if (open3014) db.exec("INSERT INTO agent_issues (id, title, status) VALUES (3014, 'METRIC-TRIGGER-3075-SILENT-DROPS', 'open')");
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES ('issue-3014', 3014, 'p', 'a', ?, 'd1-query', 'qnfo-fleet-control', 'monitoring')").run(OLD_PROBE);
  return db;
}
// Seed the live shape: the 7 recorded deletes (each goes through issue_lifecycle_bd, so each leaves a tombstone and a lifecycle row).
function seedRecordedDeletes(db, ids = [2947, 2948, 2949, 3006, 3007, 99917, 99918]) {
  for (const id of ids) {
    db.exec("INSERT INTO agent_issues (id, title, status) VALUES (" + id + ", 't" + id + "', 'open')");
    db.exec("DELETE FROM agent_issues WHERE id = " + id);
  }
}
const accounting = db => row(db, "SELECT silent_drops_since_ledger AS sd, deleted_unrecorded AS du, deleted_recorded AS dr FROM v_issue_accounting");
const apply = db => db.exec(MIG);

// (a) seven recorded deletes: the base view reads 7 (the defect), the migration reads 0 and leaves the ledgers as they were.
{
  const db = fresh(); seedRecordedDeletes(db);
  ok(accounting(db).sd === 7, "base view counts the 7 recorded deletes (the defect being fixed)", accounting(db));
  ok(one(db, "SELECT COUNT(*) FROM issue_lifecycle WHERE event = 'deleted'") === 7 && one(db, "SELECT COUNT(*) FROM agent_issues_tombstone") === 7, "7 deleted events and 7 tombstones seeded through issue_lifecycle_bd");
  apply(db);
  const a = accounting(db);
  ok(a.sd === 0, "recorded deletes (tombstone present) are not silent drops", a);
  ok(a.dr === 7, "deleted_recorded still counts the 7 tombstones", a);
  ok(one(db, "SELECT COUNT(*) FROM issue_lifecycle WHERE event = 'deleted'") === 7, "the 7 deleted events stay in issue_lifecycle");
  ok(one(db, "SELECT COUNT(*) FROM agent_issues_tombstone") === 7, "the 7 tombstones stay in agent_issues_tombstone");
  ok(row(db, "SELECT silent_drops AS s FROM v_doctrine_scorecard_v2").s === 0, "v_doctrine_scorecard_v2 reads silent_drops 0 through the column");
  ok(one(db, "SELECT last_value FROM metric_registry WHERE metric = 'silent_drops'") === "0", "the migration's fleet_tick refreshes metric_registry silent_drops to 0", one(db, "SELECT last_value FROM metric_registry WHERE metric = 'silent_drops'"));
  ok(one(db, "SELECT COUNT(*) FROM fleet_tick WHERE source = 'migration:silent-drops-unrecorded-only'") === 1, "one fleet_tick row from the file");
}

// (b) a deleted lifecycle row with no tombstone is still a silent drop (a delete that bypassed issue_lifecycle_bd).
{
  const db = fresh(); seedRecordedDeletes(db); apply(db);
  db.exec("INSERT INTO issue_lifecycle (issue_id, event, from_status, has_evidence) VALUES (500, 'deleted', 'open', 0)");
  ok(accounting(db).sd === 1, "a deleted event with no tombstone counts", accounting(db));
  ok(row(db, "SELECT silent_drops AS s FROM v_doctrine_scorecard_v2").s === 1, "the scorecard shows it");
  db.exec("INSERT INTO agent_issues_tombstone (id, title, deleted_at) VALUES (500, 'late copy', '2026-10-19T00:00:00Z')");
  ok(accounting(db).sd === 0, "the same event stops counting once the tombstone copy exists", accounting(db));
}

// (c) a dispositioned row without evidence still counts; one with evidence does not.
{
  const db = fresh(); seedRecordedDeletes(db); apply(db);
  db.exec("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence) VALUES (600, 'dispositioned', 'open', 'closed', 0)");
  ok(accounting(db).sd === 1, "a dispositioned event without evidence counts", accounting(db));
  db.exec("INSERT INTO issue_lifecycle (issue_id, event, from_status, to_status, has_evidence) VALUES (601, 'dispositioned', 'open', 'closed', 1)");
  ok(accounting(db).sd === 1, "a dispositioned event with evidence does not count", accounting(db));
  let threw = false;
  try { db.exec("DELETE FROM issue_lifecycle WHERE issue_id = 600"); } catch (e) { threw = /append-only/.test(String(e)); }
  ok(threw, "issue_lifecycle stays append-only (the fixture carries the live guard)");
}

// (d) the deleted_unrecorded and closed_without_disposition columns keep their meaning.
{
  const db = fresh(); apply(db);
  db.exec("INSERT INTO agent_issues (id, title, status) VALUES (3015, 'a', 'open')");
  db.exec("INSERT INTO agent_issues (id, title, status) VALUES (99901, 'jump', 'open')");
  ok(accounting(db).du === 99901 - 3, "a sequence jump with no range row still reads as unrecorded ids", accounting(db));
  db.exec("INSERT INTO issue_id_gap_ranges (lo, hi, verdict, evidence) VALUES (1, 99900, 'never-allocated', 'test') ");
  ok(accounting(db).du === 0, "a range row explains the jump (ISSUE-ID-GAP-RANGES-1 unchanged)", accounting(db));
  db.exec("INSERT INTO agent_issues (id, title, status) VALUES (99902, 'closed no evidence', 'closed')");
  ok(row(db, "SELECT closed_without_disposition AS c FROM v_issue_accounting").c === 1, "closed_without_disposition unchanged");
}

// Apply twice: one row each, backups keep the first (original) text, the 3014 probe is the new one.
{
  // ids 1..7 and a range row for the rest of 1..3013 leave no unexplained id, so issues_unaccounted is 0 as it is live
  const db = fresh(); seedRecordedDeletes(db, [1, 2, 3, 4, 5, 6, 7]);
  db.exec("INSERT INTO issue_id_gap_ranges (lo, hi, verdict, evidence) VALUES (1, 3013, 'never-allocated', 'test')");
  apply(db); apply(db);
  ok(accounting(db).sd === 0, "second apply leaves silent_drops 0");
  ok(one(db, "SELECT COUNT(*) FROM failure_modes WHERE fm_key = 'silent-drop-recorded-delete'") === 1, "one failure_modes row after two applies");
  ok(one(db, "SELECT COUNT(*) FROM remediation_contracts WHERE class = 'fm-silent-drop-recorded-delete'") === 1, "one fm- detector contract after two applies");
  const fm = row(db, "SELECT probe_class AS p FROM failure_modes WHERE fm_key = 'silent-drop-recorded-delete'").p;
  ok(fm === "fm-silent-drop-recorded-delete", "failure_modes.probe_class names the contract class", fm);
  ok(one(db, "SELECT COUNT(*) FROM decision_log WHERE instr(action, 'ISSUE-ACCOUNTING-1:') = 1") === 1, "one decision_log row after two applies");
  ok(/event = 'deleted'\) AS silent_drops_since_ledger/.test(one(db, "SELECT sql FROM bak_20261019_v_issue_accounting_sd")), "the view backup keeps the pre-migration text across the second apply");
  ok(one(db, "SELECT verify_probe FROM bak_20261019_silent_drops_rc") === OLD_PROBE, "the issue-3014 probe backup keeps the original probe");
  const p3014 = one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-3014'");
  ok(/silent_drops \+ issues_unaccounted FROM v_doctrine_scorecard_v2/.test(p3014) && p3014.startsWith("SELECT '0' AS expected"), "issue-3014 closing probe is the scorecard probe", p3014);
  ok(one(db, "SELECT status FROM remediation_contracts WHERE class = 'issue-3014'") === "monitoring", "issue-3014 contract status is untouched");
  // the two probes run as written
  const det = row(db, one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-silent-drop-recorded-delete'"));
  ok(det.expected === "0" && det.observed === "0", "the fm detector probe passes after the migration", det);
  const cp = row(db, p3014);
  ok(cp.expected === "0" && cp.observed === "0", "the issue-3014 closing probe passes after the migration", cp);
  db.exec("INSERT INTO issue_lifecycle (issue_id, event, from_status, has_evidence) VALUES (700, 'deleted', 'open', 0)");
  const det2 = row(db, one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-silent-drop-recorded-delete'"));
  ok(det2.observed === "1", "the detector fails on an unrecorded delete", det2);
}

// issue 3014 closed: its contract probe is left alone (the UPDATE applies only while the issue is open).
{
  const db = fresh(false);
  db.exec("INSERT INTO agent_issues (id, title, status) VALUES (3014, 'x', 'closed')");
  apply(db);
  ok(one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-3014'") === OLD_PROBE, "a closed issue keeps its contract probe");
}

// The file is idempotent text: headers, a backup ahead of the DROP, an UPDATE (never INSERT OR IGNORE) of the issue class.
{
  ok(/^-- APPLY-BY: ci$/m.test(MIG) && /^-- DB: qnfo-audit$/m.test(MIG) && /^-- Rollback: /m.test(MIG) && /^-- BACKUP: bak_20261019_v_issue_accounting_sd$/m.test(MIG), "migration headers");
  ok(MIG.indexOf("CREATE TABLE IF NOT EXISTS bak_20261019_v_issue_accounting_sd") > -1 && MIG.indexOf("CREATE TABLE IF NOT EXISTS bak_20261019_v_issue_accounting_sd") < MIG.indexOf("DROP VIEW IF EXISTS v_issue_accounting;\n"), "backup table is created ahead of DROP VIEW");
  ok(!/INSERT OR IGNORE INTO remediation_contracts[^;]*'issue-3014'/.test(MIG), "issue-3014 contract is never inserted with OR IGNORE");
  ok(/UPDATE remediation_contracts\s+SET verify_probe[^;]*WHERE class = 'issue-3014'/.test(MIG), "issue-3014 contract is updated");
}

console.log(`issue-accounting-20261019: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

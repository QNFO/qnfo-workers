// SLA-120M-5 offline suite: runs migrations/2026-10-14-sla-120m-5-cooldown-cadence.sql on SQLite. Proves: trigger cooldowns and
// active contract cadences above 2 h drop to 2, holding contracts keep their soak cadence, later writes are normalised, the
// definitions metric counts a row that escapes, the detector passes, and the backup restores the old values.
// Run: node migrations/sla-120m-5.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-14-sla-120m-5-cooldown-cadence.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE TABLE queue_sla (stuck_type TEXT PRIMARY KEY, queue TEXT, definition TEXT, cycle_min INTEGER, sla_min INTEGER, auto_fix TEXT, owner TEXT, summary_column TEXT, producer_cycle_min INTEGER);
CREATE TABLE content_stages (stage TEXT PRIMARY KEY, sla_min INTEGER);
CREATE TABLE sla_registry (sla_id TEXT PRIMARY KEY, window TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, formula TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE guard_registry (guard TEXT PRIMARY KEY, object_type TEXT NOT NULL, target_table TEXT NOT NULL, invariant TEXT NOT NULL, negative_test TEXT NOT NULL, remediation_hint TEXT NOT NULL, verified_at TEXT DEFAULT (datetime('now')), claim TEXT, evidence TEXT, confidence TEXT, status TEXT, db TEXT);
INSERT INTO guard_registry (guard, object_type, target_table, invariant, negative_test, remediation_hint, status) VALUES ('trg_metric_trigger_cooldown_cap_ins', 'trigger', 'analytics_metric_triggers', 'capped at 24', 'expect 24', 'at most 24h', 'verified');
CREATE TRIGGER trg_metric_trigger_cooldown_cap_ins AFTER INSERT ON analytics_metric_triggers FOR EACH ROW WHEN NEW.cooldown_hours > 24 BEGIN UPDATE analytics_metric_triggers SET cooldown_hours = 24 WHERE id = NEW.id; END;
CREATE TRIGGER trg_metric_trigger_cooldown_cap_upd AFTER UPDATE OF cooldown_hours ON analytics_metric_triggers FOR EACH ROW WHEN NEW.cooldown_hours > 24 BEGIN UPDATE analytics_metric_triggers SET cooldown_hours = 24 WHERE id = NEW.id; END;
INSERT INTO metric_registry (metric, formula) VALUES ('sla_definitions_over_120m', 'base');
INSERT INTO queue_sla VALUES ('q1', 'q', 'd', 10, 120, 'f', 'o', 'c', 60);
INSERT INTO content_stages VALUES ('draft', 120);
INSERT INTO sla_registry VALUES ('s1', '120m');
INSERT INTO analytics_metric_triggers (metric_key, action, cooldown_hours) VALUES ('m24', 'a', 24), ('m6', 'a', 6), ('m1', 'a', 1), ('sla_definitions_over_120m', 'base', 2);
INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status) VALUES
 ('issue-1901', 'p', 'a', 'v', 'd1-query', 'e', 168, 'active'), ('attention-loop-1', 'p', 'a', 'v', 'd1-query', 'e', 24, 'active'),
 ('issue-1947', 'p', 'a', 'v', 'd1-query', 'e', 24, 'holding'), ('issue-9', 'p', 'a', 'v', 'd1-query', 'e', 1, 'active');`);
db.exec(sql);
const q = (s, ...a) => db.prepare(s).all(...a);
const cd = Object.fromEntries(q("SELECT metric_key k, cooldown_hours v FROM analytics_metric_triggers").map((r) => [r.k, r.v]));
ok(cd.m24 === 2 && cd.m6 === 2 && cd.m1 === 1, "cooldowns above 2 h drop to 2; shorter ones stay", cd);
const cad = Object.fromEntries(q("SELECT class k, expected_cadence_h v FROM remediation_contracts").map((r) => [r.k, r.v]));
ok(cad["issue-1901"] === 2 && cad["attention-loop-1"] === 2 && cad["issue-9"] === 1, "active cadences above 2 h drop to 2", cad);
ok(cad["issue-1947"] === 24, "a holding (post-closure soak) contract keeps its cadence", cad);
db.exec("INSERT INTO analytics_metric_triggers (metric_key, action) VALUES ('new-default', 'a')");
db.exec("UPDATE analytics_metric_triggers SET cooldown_hours = 12 WHERE metric_key = 'm1'");
db.exec("INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status) VALUES ('x', 'p', 'a', 'v', 'd1-query', 'e', 24, 'active')");
db.exec("UPDATE remediation_contracts SET status = 'active' WHERE class = 'issue-1947'");
const after = q("SELECT (SELECT cooldown_hours FROM analytics_metric_triggers WHERE metric_key = 'new-default') a, (SELECT cooldown_hours FROM analytics_metric_triggers WHERE metric_key = 'm1') b, (SELECT expected_cadence_h FROM remediation_contracts WHERE class = 'x') c, (SELECT expected_cadence_h FROM remediation_contracts WHERE class = 'issue-1947') d")[0];
ok(after.a === 2 && after.b === 2 && after.c === 2 && after.d === 2, "later inserts, updates and re-activations are normalised to 2", after);
db.exec("INSERT INTO fleet_tick (source) VALUES ('test')");
ok(q("SELECT last_value v FROM metric_registry WHERE metric = 'sla_definitions_over_120m'")[0].v === "0", "the definitions metric reads 0 once everything is capped");
db.exec("DROP TRIGGER sla_120_guard_contract_ins; INSERT INTO remediation_contracts (class, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status) VALUES ('y', 'p', 'a', 'v', 'd1-query', 'e', 6, 'active'); INSERT INTO fleet_tick (source) VALUES ('test')");
ok(q("SELECT last_value v FROM metric_registry WHERE metric = 'sla_definitions_over_120m'")[0].v === "1", "a contract that escapes a dropped guard is counted");
const probe = q("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-response-clock-over-120m'")[0].p;
const r = q(probe)[0];
ok(r.expected === "0" && r.observed === "1", "the detector fails while a row escapes", r);
db.exec("DELETE FROM remediation_contracts WHERE class = 'y'");
const r2 = q(probe)[0];
ok(r2.observed === r2.expected, "the detector passes once the row is gone", r2);
const bak = Object.fromEntries(q("SELECT k, v FROM bak_20261014_sla_120m_5 WHERE kind IN ('trigger', 'contract')").map((x) => [x.k, x.v]));
ok(bak["issue-1901"] === 168 && bak["attention-loop-1"] === 24 && Object.values(bak).includes(24) && Object.values(bak).includes(6), "the backup holds the old values", bak);
ok(q("SELECT COUNT(*) n FROM bak_20261014_sla_120m_5 WHERE kind = 'sql'")[0].n === 2, "the backup holds the replaced trigger definitions");
ok(/SLA-120M-5/.test(q("SELECT action a FROM analytics_metric_triggers WHERE metric_key = 'sla_definitions_over_120m'")[0].a), "the trigger action names the new checks");
ok(q("SELECT negative_test t FROM guard_registry WHERE guard = 'trg_metric_trigger_cooldown_cap_ins'")[0].t.includes("expect 2"), "the guard registry describes the 2 h cap");
ok(q("SELECT COUNT(*) n FROM guard_registry WHERE guard LIKE 'sla_120_guard_contract_%'")[0].n === 2, "the new guards are registered");
db.exec(sql);
ok(q("SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'SLA-120M-5:') = 1")[0].n === 1, "re-applying the file adds no second decision row");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

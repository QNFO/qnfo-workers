// FLEET-JOURNEYS-1/-2 offline suite: applies migrations/2026-10-13-fleet-journeys.sql on an in-memory SQLite and proves: journey_runs and
// v_journey_state exist and the view keeps the newest row per (journey, runner); fleet_journeys_failing is registered trigger-exempt and
// journey_tick_age_min has its trigger; the fleet_tick heartbeat refreshes the tick age only once a cf row exists; each fm- detector
// reads 0 only when its condition is cleared (no run at all is not a pass); a second apply changes nothing.
// Run: node migrations/fleet-journeys.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-13-fleet-journeys.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT UNIQUE, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT);
CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE worker_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts_ms INTEGER, script_name TEXT, exceptions_json TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
db.exec(sql);
const q = (s, ...a) => db.prepare(s).all(...a);
const ago = (m) => q("SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) t", "-" + m + " minutes")[0].t;
const run = (journey, runner, okv, minAgo) => db.prepare("INSERT INTO journey_runs (ts, runner, journey, ok, steps, failed) VALUES (?, ?, ?, ?, 3, ?)").run(ago(minAgo), runner, journey, okv, okv ? 0 : 1);

const m = q("SELECT metric, refresh_class FROM metric_registry ORDER BY metric");
ok(m.length === 2 && m[0].metric === "fleet_journeys_failing" && m[1].metric === "journey_tick_age_min", "both metrics registered", m);
const t = q("SELECT metric_key, operator, threshold FROM analytics_metric_triggers");
ok(t.length === 1 && t[0].metric_key === "journey_tick_age_min" && t[0].operator === "gt" && t[0].threshold === 60, "only the tick age has a trigger (fleet_journeys_failing self-files)", t);
ok(q("SELECT COUNT(*) n FROM failure_modes")[0].n === 3 && q("SELECT COUNT(*) n FROM capability_ledger")[0].n === 1, "three failure modes, one capability");

// The heartbeat does not invent an age before the server-side tick has ever run.
db.prepare("INSERT INTO fleet_tick (source) VALUES ('test')").run();
ok(q("SELECT last_value v FROM metric_registry WHERE metric = 'journey_tick_age_min'")[0].v === null, "no cf run yet: tick age untouched");
run("deploy-coherence", "gha", 0, 30);
run("deploy-coherence", "cf", 0, 40);
run("deploy-coherence", "cf", 1, 15);
db.prepare("INSERT INTO fleet_tick (source) VALUES ('test')").run();
const age = Number(q("SELECT last_value v FROM metric_registry WHERE metric = 'journey_tick_age_min'")[0].v);
ok(age >= 14 && age <= 16, "heartbeat refreshes the tick age from the newest cf row", age);
const vs = q("SELECT runner, ok FROM v_journey_state WHERE journey = 'deploy-coherence' ORDER BY runner");
ok(vs.length === 2 && vs[0].runner === "cf" && vs[0].ok === 1 && vs[1].ok === 0, "view keeps the newest row per runner", vs);

const probe = (cls) => q(q("SELECT verify_probe p FROM remediation_contracts WHERE class = ?", cls)[0].p)[0];
ok(probe("fm-registry-version-sweep-regex").observed === "1", "a failing newest gha run keeps the detector red", probe("fm-registry-version-sweep-regex"));
run("deploy-coherence", "gha", 1, 2);
ok(probe("fm-registry-version-sweep-regex").observed === "0", "both runners' newest runs pass: detector green");
ok(probe("fm-fleet-census-blind").observed === "1", "no binding-census run at all is not a pass");
run("binding-census", "cf", 1, 5);
ok(probe("fm-fleet-census-blind").observed === "0", "a passing census turns it green");
db.prepare("INSERT INTO worker_logs (ts_ms, script_name, exceptions_json) VALUES (?, 'qnfo-ops', ?)").run(Date.now() - 600e3, '[{"message":"D1_ERROR: duplicate column name: upstream_model"}]');
ok(probe("fm-ops-schema-alter-noise").observed === "1", "a fresh duplicate-column error keeps the noise detector red");
db.prepare("UPDATE worker_logs SET ts_ms = ?").run(Date.now() - 3 * 3600e3);
ok(probe("fm-ops-schema-alter-noise").observed === "0", "older than 2 h: green");

db.exec(sql);
ok(q("SELECT COUNT(*) n FROM decision_log")[0].n === 1 && q("SELECT COUNT(*) n FROM remediation_contracts")[0].n === 3 && q("SELECT COUNT(*) n FROM analytics_metric_triggers")[0].n === 1 && q("SELECT COUNT(*) n FROM journey_runs")[0].n === 5, "idempotent");
console.log(`fleet-journeys: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

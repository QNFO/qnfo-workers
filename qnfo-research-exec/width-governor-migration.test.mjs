// WAI-WIDTH-GOVERNOR-1 migration suite (node:sqlite, synthetic rows): migrations/2026-10-19-wai-width-governor.sql adds the four controls,
// the two ops_config switches, the two failure modes with their fm-<key> detector contracts and the decision row; replaces the stale
// markError lever on triggers 3687 and 409 (and nothing on 354); runs twice without a second effect; and its Rollback line restores
// the trigger text byte for byte. The detectors are single read-only SELECTs that read '0' only for the defect they name.
// Run: node qnfo-research-exec/width-governor-migration.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../migrations/2026-10-19-wai-width-governor.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };

ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- Rollback: .+/m.test(sql), "the file opts in with APPLY-BY, DB and a Rollback line");
ok(!/\b(DROP|DELETE FROM)\b/.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "no statement of the file drops or deletes (so no BACKUP header is owed)");

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, action TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, published_at TEXT);
CREATE TABLE cost_daily (date TEXT, source TEXT, usd REAL);
CREATE TABLE ai_call_counters (day TEXT, worker TEXT, purpose TEXT, model TEXT, calls INTEGER, errors INTEGER);`);

const LEVER = "\ncode-task: repo=qnfo-workers path=qnfo-research-exec/worker.js\ncode-anchor: async function markError(env, row, msg) {";
const A3687 = "Pillar cost. Read cost_daily source workers_ai for the last 7 days and ai_call_counters grouped by worker and purpose. Done: workers_ai_run_rate_usd <= 95 at two refreshes.\nACT-BRIDGE-LEVERS-20261013: the top neuron consumer is qnfo-research-exec re-running whole papers." + LEVER;
const A409 = "Read ai_call_counters for the last 7 days grouped by worker and model. Close when metric_registry.fleet_ai_run_rate_30d_usd <= 95.\nACT-BRIDGE-LEVERS-20261013: the top neuron consumer is qnfo-research-exec re-running whole papers." + LEVER;
const A354 = "Pillar cost. Workers AI cost is far above its $7.50/30d target. Use ai_call_counters to find the largest neuron consumers.";
const trg = db.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, action) VALUES (?, ?, ?)");
trg.run(3687, "workers_ai_run_rate_usd", A3687); trg.run(409, "fleet_ai_run_rate_30d_usd", A409); trg.run(354, "workers_ai_cost_30d_usd", A354);
const action = (id) => db.prepare("SELECT action FROM analytics_metric_triggers WHERE id = ?").get(id).action;

db.exec(sql);
// controls, switches, failure modes, detectors, decision
const cr = db.prepare("SELECT control, kind, disposition, disposition_state, critical_path, alternate_path, issue_id FROM control_registry ORDER BY control").all();
ok(cr.length === 4 && cr.every((r) => r.disposition === "keep" && r.disposition_state === "applied" && r.alternate_path && r.issue_id), "four controls, each kept with its alternate path and issue", cr);
ok(cr.find((r) => r.control === "research-width-governor").critical_path === 1 && cr.find((r) => r.control === "research-width-governor").kind === "cap" && cr.find((r) => r.control === "research-model-skip-gauge").kind === "pause", "the governor is a critical-path cap and the gauge a pause (it expires in 20 s)");
const cfg = db.prepare("SELECT key, value FROM ops_config ORDER BY key").all();
ok(JSON.stringify(cfg) === JSON.stringify([{ key: "research_governor", value: "on" }, { key: "research_kimi_last_resort", value: "on" }]), "the two switches exist, on, with a note", cfg);
const fm = db.prepare("SELECT fm_key, probe_class, issue_id FROM failure_modes ORDER BY fm_key").all();
ok(fm.length === 2 && fm.every((f) => f.probe_class === "fm-" + f.fm_key && f.issue_id === 99924), "two failure modes, each with its fm-<key> probe class", fm);
const rc = db.prepare("SELECT class, verify_transport, status, expected_cadence_h FROM remediation_contracts ORDER BY class").all();
ok(rc.length === 2 && rc.every((r) => r.verify_transport === "d1-query" && r.status === "active") && rc.map((r) => r.class).join() === "fm-wai-rate-limit-spiral,fm-wai-spend-per-paper", "two active d1-query detector contracts", rc);
const WRITE_KW = ["insert into", "update ", "delete from", "drop table", "drop index", "alter table", "create table", "create index", "create trigger", "attach ", "detach ", "pragma ", "replace into", "vacuum"];
for (const c of db.prepare("SELECT class, verify_probe FROM remediation_contracts").all()) {
  const low = c.verify_probe.toLowerCase();
  ok(low.startsWith("select") && !WRITE_KW.some((k) => low.includes(k)) && !c.verify_probe.replace(/;\s*$/, "").includes(";") && /AS expected/.test(c.verify_probe) && /AS observed/.test(c.verify_probe), c.class + ": a single literal read-only SELECT with expected and observed columns");
}
const dl = db.prepare("SELECT * FROM decision_log").all();
ok(dl.length === 1 && /^[a-z0-9_]+ (<=|>=|<|>|=) [0-9.]+ within [0-9]+ h$/.test(dl[0].predicted_outcome) && dl[0].capability_gain && dl[0].rollback_path, "one decision_log row with a predicted_outcome in the form metric op number within N h", dl[0] && dl[0].predicted_outcome);

// the trigger text
ok(!action(3687).includes("code-anchor") && !action(3687).includes("code-task:") && !action(409).includes("code-anchor") && !action(409).includes("code-task:"), "the markError code-task and code-anchor lines are gone from triggers 3687 and 409");
ok(action(3687).startsWith(A3687.slice(0, A3687.length - LEVER.length)) && /WAI-WIDTH-GOVERNOR-1 \(2026-10-19\)/.test(action(3687)) && /fm-wai-spend-per-paper/.test(action(409)), "the rest of each action is kept and the replacement note names the governor and the detector");
ok(action(354) === A354, "trigger 354 is untouched");

// idempotent
const snap = JSON.stringify([action(3687), action(409), db.prepare("SELECT COUNT(*) n FROM decision_log").get().n, db.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n]);
db.exec(sql);
ok(JSON.stringify([action(3687), action(409), db.prepare("SELECT COUNT(*) n FROM decision_log").get().n, db.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n]) === snap && db.prepare("SELECT COUNT(*) n FROM control_registry").get().n === 4, "applying the file again changes no trigger text and writes no second decision row, control or detector");

// the detectors
const probe = (cls) => db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = ?").get(cls).verify_probe;
const obs = (cls) => db.prepare(probe(cls)).get().observed;
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const reset = () => { db.exec("DELETE FROM research_queue; DELETE FROM cost_daily; DELETE FROM cloud_ops_events; DELETE FROM ai_call_counters;"); };
{
  reset();
  const papers = (n) => { for (let i = 0; i < n; i++) db.prepare("INSERT INTO research_queue (id, published_at) VALUES (?, ?)").run("p" + i, day(1 + (i % 3)) + "T10:00:00.000Z"); };
  const usd = (v) => { db.exec("DELETE FROM cost_daily"); for (const n of [1, 2, 3]) db.prepare("INSERT INTO cost_daily VALUES (?, 'workers_ai', ?)").run(day(n), v / 3); db.prepare("INSERT INTO cost_daily VALUES (?, 'workers_ai', 99)").run(day(0)); };
  papers(14); usd(63.2);
  ok(obs("fm-wai-spend-per-paper") === "1", "spend per paper: fewer than 15 papers in the three full days is no evidence, so the detector stays quiet");
  reset(); papers(38); usd(63.2);
  ok(obs("fm-wai-spend-per-paper") === "0", "38 papers for 63.20 USD (1.66 each, the 10-16..10-18 reading) reads 0: the defect exists today");
  usd(28.5);
  ok(obs("fm-wai-spend-per-paper") === "1", "38 papers for 28.50 USD (0.75 each) reads 1");
  usd(28.6);
  ok(obs("fm-wai-spend-per-paper") === "0", "28.60 USD for 38 papers reads 0 again; today's partial day is not counted (a 99 USD row for today changed nothing)");
}
{
  reset();
  ok(obs("fm-wai-rate-limit-spiral") === "1", "rate-limit spiral: before the first research-width event the detector is quiet (the deploy is not live yet)");
  const ev = (mins) => db.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?, ?, 'research-width', 'width=24', '{}', 'qnfo-research-exec', 'ok')").run("e" + Math.random(), new Date(Date.now() - mins * 6e4).toISOString());
  ev(300); ev(200);
  ok(obs("fm-wai-rate-limit-spiral") === "0", "events exist but fewer than 6 in the last 2 hours reads 0: the governor is not running");
  for (const m of [5, 15, 25, 35, 45, 55]) ev(m);
  ok(obs("fm-wai-rate-limit-spiral") === "1", "six ticks in two hours and no glm-5.3-flash errors today reads 1");
  const cc = db.prepare("INSERT INTO ai_call_counters VALUES (?, 'qnfo-research-exec', 'binding', ?, ?, ?)");
  cc.run(day(0), "@cf/zai-org/glm-5.3-flash", 100, 19);
  ok(obs("fm-wai-rate-limit-spiral") === "1", "a glm-5.3-flash error share of 0.19 today is under the line");
  db.exec("DELETE FROM ai_call_counters"); cc.run(day(0), "@cf/zai-org/glm-5.3-flash", 100, 20);
  ok(obs("fm-wai-rate-limit-spiral") === "0", "0.20 reads 0");
  db.exec("DELETE FROM ai_call_counters"); cc.run(day(1), "@cf/zai-org/glm-5.3-flash", 100, 90); cc.run(day(0), "@cf/moonshotai/kimi-k2.6", 100, 90);
  ok(obs("fm-wai-rate-limit-spiral") === "1", "yesterday's glm-5.3-flash errors and today's kimi-k2.6 errors are not the signal");
}

// rollback
const rb = /^-- Rollback: (.+)$/m.exec(sql)[1];
db.exec(rb);
ok(action(3687) === A3687 && action(409) === A409 && action(354) === A354, "the Rollback line restores the trigger text byte for byte");
ok(["control_registry", "failure_modes", "remediation_contracts", "ops_config"].every((t) => db.prepare("SELECT COUNT(*) n FROM " + t).get().n === 0), "and removes the rows the file added");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

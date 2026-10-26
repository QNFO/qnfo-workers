// EVOLVE-REASK-1 offline suite: replays migrations/2026-10-26-evolve-parse-pass-metric.sql on SQLite.
// Proves: the metric evolve_parse_pass_pct_7d is registered UNMEASURED with its source, cadence and target; the first measurement and the heavy-tick trigger count a rejected-parse row and a
// "no usable JSON" model-skip as failures and a model that parsed and chose to skip as a pass; proposing and no-context rows and rows older than 7 days are ignored; an empty 7-day window resets the
// metric to UNMEASURED (never stale, never a value) and the 50-minute gate holds; the trigger row (lt 50, agent_issues) is added once; lever 7 gets its path and anchor; issue 100317 gains the
// code-task lines once and the anchor occurs exactly once in the real worker.js; the refused BACKFILL probe now reads the metric; a second apply changes nothing; the Rollback line undoes it.
// Run: node --no-warnings migrations/evolve-parse-pass-metric.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-evolve-parse-pass-metric.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../qnfo-fleet-control/worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "the opt-in and DB headers are present");

const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
  CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority TEXT, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
  CREATE TABLE evolve_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, status TEXT, note TEXT);
  CREATE TABLE fleet_tick_heavy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT);
  CREATE TABLE transformation_levers (id INTEGER PRIMARY KEY AUTOINCREMENT, tp INTEGER, n INTEGER, key TEXT, path TEXT, anchor TEXT, detail TEXT, status TEXT, note TEXT, updated_at TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, description TEXT, updated_at INTEGER);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, status TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const ev = (age, status, note) => d.prepare("INSERT INTO evolve_candidates (ts, status, note) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?), ?, ?)").run(age, status, note ?? null);
d.prepare("INSERT INTO transformation_levers (tp, n, key, status, note) VALUES (1, 7, 'evolve-parse-gate', 'session', 'needs a session')").run();
d.prepare("INSERT INTO agent_issues (id, title, status, description) VALUES (100317, 'TP-1.7-EVOLVE-PARSE-GATE-1', 'open', 'original text')").run();
d.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status) VALUES ('issue-100317-BACKFILL-1', 100317, 'SELECT 1', 'probe-review-refused')").run();
const metric = () => d.prepare("SELECT * FROM metric_registry WHERE metric = 'evolve_parse_pass_pct_7d'").get();
const tick = () => d.exec("INSERT INTO fleet_tick_heavy (ts) VALUES (datetime('now'))");

// apply with an empty window: UNMEASURED, no value
d.exec(sql);
let m = metric();
ok(m && m.state === "UNMEASURED" && m.last_value === null && m.last_refreshed === null, "an empty 7-day window leaves the metric UNMEASURED with no value", m);
ok(m.refresh_cadence === "hourly" && m.target === ">= 50" && m.owner === "qnfo-fleet-control" && /evolve_candidates/.test(m.source_of_truth) && m.refresh_class === "computed" && m.layer === "system", "the registry row names its source, cadence, owner and target", m);
const trig = d.prepare("SELECT * FROM analytics_metric_triggers WHERE metric_key = 'evolve_parse_pass_pct_7d'").all();
ok(trig.length === 1 && trig[0].operator === "lt" && trig[0].threshold === 50 && trig[0].queue_target === "agent_issues" && trig[0].enabled === 1 && /100317/.test(trig[0].action) && !trig[0].action.includes(";"), "one enabled trigger: lt 50, files an agent_issue, names the lever", trig);

// the trigger counts failures and passes
ev("-1 hours", "rejected-parse", null);                                      // failure
ev("-2 hours", "model-skip", "no usable JSON from @cf/x (empty reply, finish length)"); // failure
ev("-3 hours", "model-skip", "The excerpt does not contain the code that must change"); // pass (model parsed, chose to skip)
ev("-4 hours", "ci-rejected", "required check(s) failed: gate");               // pass
ev("-5 hours", "verified", "live");                                             // pass
ev("-6 hours", "proposing", null);                                              // ignored
ev("-7 hours", "no-context", "no excerpt matched");                             // ignored
ev("-9 days", "rejected-parse", null);                                          // outside the window
tick();
m = metric();
ok(m.state === "MEASURED" && Number(m.last_value) === 60 && m.last_refreshed, "3 of 5 proposals parsed: the heavy tick writes 60.0", m);
// the 50-minute gate
ev("-1 minutes", "rejected-parse", null);
tick();
ok(Number(metric().last_value) === 60, "a second heavy tick inside 50 minutes does not rewrite the value", metric());
d.prepare("UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes') WHERE metric = 'evolve_parse_pass_pct_7d'").run();
tick();
ok(Math.abs(Number(metric().last_value) - 50) < 0.01, "after the gate opens 3 of 6 reads 50.0", metric());
// the window empties: reset to UNMEASURED, not stale
d.exec("DELETE FROM evolve_candidates");
ev("-9 days", "rejected-parse", null);
tick();
m = metric();
ok(m.state === "UNMEASURED" && m.last_value === null && m.last_refreshed === null, "an empty window resets the metric to UNMEASURED (never a stale value)", m);

// the first measurement at apply on a window that holds proposals
const d3 = new DatabaseSync(":memory:");
d3.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
  CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority TEXT, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
  CREATE TABLE evolve_candidates (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, status TEXT, note TEXT);
  CREATE TABLE fleet_tick_heavy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT);
  CREATE TABLE transformation_levers (id INTEGER PRIMARY KEY AUTOINCREMENT, tp INTEGER, n INTEGER, key TEXT, path TEXT, anchor TEXT, detail TEXT, status TEXT, note TEXT, updated_at TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, description TEXT, updated_at INTEGER);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, status TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
for (const [age, st, note] of [["-1 days", "model-skip", "no usable JSON from @cf/x (empty reply, finish length)"], ["-2 days", "verified", "live"], ["-3 days", "ci-rejected", "gate"], ["-4 days", "model-skip", "no usable JSON from @cf/x"]]) d3.prepare("INSERT INTO evolve_candidates (ts, status, note) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?), ?, ?)").run(age, st, note);
d3.prepare("INSERT INTO transformation_levers (tp, n, key, status, note) VALUES (1, 7, 'evolve-parse-gate', 'session', 'needs a session')").run();
d3.prepare("INSERT INTO agent_issues (id, title, status, description) VALUES (100317, 'TP', 'open', 'original text')").run();
d3.prepare("INSERT INTO remediation_contracts (class, issue_id, verify_probe, status) VALUES ('issue-100317-BACKFILL-1', 100317, 'SELECT 1', 'probe-review-refused')").run();
d3.exec(sql);
const m3 = d3.prepare("SELECT * FROM metric_registry WHERE metric = 'evolve_parse_pass_pct_7d'").get();
ok(m3.state === "MEASURED" && Number(m3.last_value) === 50 && m3.last_refreshed, "the first measurement at apply reads 2 of 4 = 50.0", m3);

// lever, issue and probe (on the second database, after one apply)
const lever = d3.prepare("SELECT * FROM transformation_levers WHERE tp = 1 AND n = 7").get();
ok(lever.path === "qnfo-fleet-control/worker.js" && lever.anchor === "async function evModelJson(env, model, system, user) {" && lever.status === "pending" && /EVOLVE-REASK-1/.test(lever.note), "lever 7 gets its path and anchor and goes back to pending", lever);
ok(worker.split(lever.anchor).length === 2, "the anchor occurs exactly once in qnfo-fleet-control/worker.js", worker.split(lever.anchor).length - 1);
const desc = d3.prepare("SELECT description FROM agent_issues WHERE id = 100317").get().description;
ok(desc.startsWith("original text") && desc.split("EVOLVE-REASK-1 (session-old-issues-6d-2038").length === 2 && /\ncode-task: repo=qnfo-workers path=qnfo-fleet-control\/worker\.js\ncode-anchor: async function evModelJson\(env, model, system, user\) \{$/.test(desc), "issue 100317 gains the note and the code-task lines once, at the end", desc.slice(-200));
const probe = d3.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'issue-100317-BACKFILL-1'").get().verify_probe;
ok(/^SELECT '1' AS expected/.test(probe) && !probe.includes(";") && probe.includes("evolve_parse_pass_pct_7d"), "the refused BACKFILL probe reads the metric", probe);
ok(d3.prepare(probe).get().observed === "1", "the probe reads 1 once the metric is MEASURED at 50", d3.prepare(probe).get());
d3.exec("UPDATE metric_registry SET last_value = '40' WHERE metric = 'evolve_parse_pass_pct_7d'");
ok(d3.prepare(probe).get().observed === "0", "the probe reads 0 under 50");
d3.exec("UPDATE metric_registry SET last_value = NULL, state = 'UNMEASURED' WHERE metric = 'evolve_parse_pass_pct_7d'");
ok(d3.prepare(probe).get().observed === "0", "the probe reads 0 while the metric is UNMEASURED");
d3.exec("UPDATE metric_registry SET last_value = '50.0', state = 'MEASURED' WHERE metric = 'evolve_parse_pass_pct_7d'");

// idempotence and rollback
const snap = (db) => JSON.stringify([db.prepare("SELECT metric, last_value, state, target, refresh_cadence FROM metric_registry").all(), db.prepare("SELECT * FROM analytics_metric_triggers").all(), db.prepare("SELECT description FROM agent_issues").all(), db.prepare("SELECT status, path FROM transformation_levers").all(), db.prepare("SELECT COUNT(*) AS n FROM decision_log").get()]);
const before = snap(d3);
d3.exec(sql);
ok(snap(d3) === before, "a second apply changes nothing");
d3.exec(rollback);
ok(!d3.prepare("SELECT 1 FROM metric_registry WHERE metric = 'evolve_parse_pass_pct_7d'").get() && d3.prepare("SELECT COUNT(*) AS n FROM analytics_metric_triggers").get().n === 0, "Rollback removes the metric and its trigger");
const l2 = d3.prepare("SELECT * FROM transformation_levers WHERE tp = 1 AND n = 7").get();
ok(l2.status === "session" && l2.path === null && l2.anchor === null, "Rollback returns lever 7 to session", l2);
d3.prepare("INSERT INTO fleet_tick_heavy (ts) VALUES (datetime('now'))").run();
ok(true, "the heavy tick still inserts after Rollback (the trigger is gone)");
console.log("evolve-parse-pass-metric: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

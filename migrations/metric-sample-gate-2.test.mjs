// METRIC-SAMPLE-GATE-2 offline suite: replays migrations/2026-10-26-metric-sample-gate-1.sql and then migrations/2026-10-26-metric-sample-gate-2.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped, no trigger touched); after the first file the closing probe of issue 1000033 passes on the live shape and FAILS when
// ask_helpful_rate_30d graduates (what kernel_registries_tick does on 2026-11-18, the time bomb this file removes); after the second file the probe accepts probation or graduated, still fails when a row is retired or deleted, when
// the counter is not 0, when the step is missing and when the awaiting metric is stale, and is still one read with none of the consumer's write keywords; the action text is updated; a replay changes nothing; a contract another doer
// rewrote is left alone; the Rollback restores both texts byte for byte; the decision is logged once.
// Run: node migrations/metric-sample-gate-2.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql1 = readFileSync(new URL("./2026-10-26-metric-sample-gate-1.sql", import.meta.url), "utf8");
const sql2 = readFileSync(new URL("./2026-10-26-metric-sample-gate-2.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql2.split("\n").filter((l) => l.startsWith("--"));
const body = sql2.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\r/.test(sql2), "the file has LF line endings only");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/\b(CREATE|DROP)\s+(TRIGGER|VIEW)\b/i.test(body) && !/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body) && !/claude\.ai|anthropic\.com/i.test(sql2), "no trigger or view is touched, no fleet_tick write, no claude.ai link");
ok([...body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes (D1 limit)");

const iso = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 19) + "Z";
const GATE_ASK = "helpful / rated answers over 30d (visitor ratings); unmeasured below 10 ratings";
const GATE_Q08 = "void / (resolved + void) over all q08_forecasts, written once at least 10 forecasts are finished";
function world() {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE metric_authorship (metric TEXT PRIMARY KEY, formula TEXT, authored_by TEXT NOT NULL DEFAULT 'x', authored_at TEXT NOT NULL DEFAULT '2026-10-01T00:00:00Z', probation_until TEXT NOT NULL, graduation TEXT NOT NULL DEFAULT 'g', status TEXT NOT NULL DEFAULT 'probation' CHECK (status IN ('probation', 'graduated', 'retired')), graduated_at TEXT);
CREATE TRIGGER metric_authorship_birth AFTER INSERT ON metric_registry BEGIN INSERT OR IGNORE INTO metric_authorship (metric, formula, probation_until, status) VALUES (NEW.metric, NEW.formula, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+7 days'), 'probation'); END;
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', last_verdict TEXT, module TEXT, next_due_at TEXT, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'open');
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);`);
  const steps = [{ type: "sql", db: "AUDIT", sql: "SELECT 1" }, { type: "sql", db: "AUDIT", name: "attributed-share", sql: "SELECT 2" }];
  w.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, updated_at) VALUES ('metric-refresh', 'METRIC-REFRESH-1', 'workflow', ?, 4, '2026-10-26T18:43:00Z')").run(JSON.stringify({ steps }));
  w.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (1000033, 'METRIC-SAMPLE-GATE-1: metrics_on_probation_overdue can never reach 0', 'Root cause: ...', 'open')").run();
  w.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (2192, 'METRIC-REGISTRY-STALENESS-1: metric_registry rows exceed their declared refresh cadence', '10/369 metrics not fresh', 'open')").run();
  w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, reopened_count) VALUES (2192, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', datetime('now'), 'PR 965. Cause: ...', 26)").run();
  w.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, last_verdict, module) VALUES ('issue-1000033', 1000033, 'no earlier birth template matched this issue', 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open', 'SELECT ''closed'' AS expected, NULL AS observed', 'd1-query', 'qnfo-fleet-control', 1, 'superseded', 'superseded:closure-observing-probe-at-birth', 'probe-template-v3-generic')").run();
  const m = (metric, formula, value, state, until) => {
    w.prepare("INSERT INTO metric_registry (metric, layer, kind, formula, last_value, state) VALUES (?, 'operational', 'target', ?, ?, ?)").run(metric, formula, value, state);
    w.prepare("UPDATE metric_authorship SET probation_until = ?, status = 'probation', formula = ? WHERE metric = ?").run(until, formula, metric);
  };
  m("ask_helpful_rate_30d", GATE_ASK, "33.3", "MEASURED", iso(22));      // the live shape: a value, on probation until 2026-11-18
  m("q08_forecast_void_share", GATE_Q08, null, "UNMEASURED", iso(22));   // the live shape: no value, gated
  w.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value, state) VALUES ('metrics_on_probation_overdue', 'operational', 'target', '0', 'MEASURED')").run();
  return w;
}
const one = (w, s, ...p) => w.prepare(s).get(...p);
const contract = (w) => one(w, "SELECT * FROM remediation_contracts WHERE class = 'issue-1000033'");
const observed = (w) => one(w, contract(w).verify_probe).observed;

// ---- before: the first file only
const w1 = world(); w1.exec(sql1);
const c1 = contract(w1);
ok(c1.status === "active" && c1.module === "metric-sample-gate-1" && /AND status = 'probation'\) <> 2 THEN 'not met: ask_helpful_rate_30d and q08_forecast_void_share are not both still on probation'/.test(c1.verify_probe), "after the first file the probe requires status probation of both metrics (the live state to be fixed)");
ok(observed(w1) === "ok", "the first-file probe passes on the live shape", observed(w1));
w1.exec("UPDATE metric_authorship SET status = 'graduated', graduated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE metric = 'ask_helpful_rate_30d'");   // what kernel_registries_tick does once probation_until has passed and a value exists
ok(/not both still on probation/.test(observed(w1)), "CONTROL: when ask_helpful_rate_30d graduates (2026-11-18) the first-file probe fails, so the closed issue would reopen without a defect", observed(w1));

// ---- after: both files, applied twice
const w = world(); w.exec(sql1);
const before = contract(w);
w.exec(sql2); w.exec(sql2);   // a replay changes nothing
const c = contract(w);
ok(c.verify_probe !== before.verify_probe && /AND status IN \('probation', 'graduated'\)\) <> 2 THEN 'not met: ask_helpful_rate_30d and q08_forecast_void_share are not both still tracked \(probation or graduated\)'/.test(c.verify_probe) && !/still on probation/.test(c.verify_probe), "the probe now accepts probation or graduated and no longer says 'still on probation'");
ok(c.action !== before.action && /stay registered and tracked \(on probation, or graduated once they hold a value\)/.test(c.action) && !/stay registered and on probation/.test(c.action), "the action text says so");
ok(c.status === "active" && c.module === "metric-sample-gate-1" && c.verify_transport === "d1-query" && c.attempts === before.attempts && c.issue_id === 1000033, "status, module, transport, attempts and issue id are as the first file left them");
ok(Math.abs(Date.parse(c.next_due_at.replace(" ", "T") + "Z") - Date.now()) < 120e3, "next_due_at is now, so the consumer reads it within its cadence", c.next_due_at);
ok(!/;/.test(c.verify_probe) && !/\b(insert into|update |delete from|drop table|alter table|create table|replace into|attach |pragma )/i.test(c.verify_probe), "the probe is still a single read with none of the consumer's write keywords");
ok(!/\bagent_issues\b/.test(c.verify_probe), "the probe never reads an issue (CLOSE-PROBE-CIRCULAR-1)");
ok(c.verify_probe.replace(/AND status IN \('probation', 'graduated'\)\) <> 2 THEN 'not met: [^']*'/, "").length === before.verify_probe.replace(/AND status = 'probation'\) <> 2 THEN 'not met: [^']*'/, "").length, "nothing else in the probe changed (same text once the one condition is cut out of both)");

// ---- the new probe's behaviour
ok(observed(w) === "ok", "the probe passes on the live shape", observed(w));
w.exec("UPDATE metric_authorship SET status = 'graduated', graduated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE metric = 'ask_helpful_rate_30d'");
ok(observed(w) === "ok", "it still passes after ask_helpful_rate_30d graduates (2026-11-18)", observed(w));
w.exec("UPDATE metric_authorship SET status = 'retired' WHERE metric = 'q08_forecast_void_share'");
ok(/not both still tracked/.test(observed(w)), "it fails when a sample-gated metric is retired (no hiding the rows)", observed(w));
w.exec("UPDATE metric_authorship SET status = 'probation' WHERE metric = 'q08_forecast_void_share'");
ok(observed(w) === "ok", "and passes again once restored", observed(w));
w.exec("DELETE FROM metric_authorship WHERE metric = 'ask_helpful_rate_30d'");
ok(/not both still tracked/.test(observed(w)), "it fails when an authorship row is deleted", observed(w));
w.exec("INSERT INTO metric_authorship (metric, probation_until, status) VALUES ('ask_helpful_rate_30d', '2026-11-18T08:02:17Z', 'graduated')");
w.exec("DELETE FROM metric_registry WHERE metric = 'ask_helpful_rate_30d'");
ok(/not both registered/.test(observed(w)), "it fails when a sample-gated metric is deleted from the registry", observed(w));
w.exec("INSERT INTO metric_registry (metric, layer, kind, formula, last_value, state) VALUES ('ask_helpful_rate_30d', 'operational', 'target', 'x', '33.3', 'MEASURED')");
w.exec("UPDATE metric_authorship SET status = 'graduated' WHERE metric = 'ask_helpful_rate_30d'");
ok(observed(w) === "ok", "restored once more", observed(w));
w.exec("UPDATE metric_registry SET last_value = '2' WHERE metric = 'metrics_on_probation_overdue'");
ok(/^not met: metrics_on_probation_overdue reads 2/.test(observed(w)), "it fails when the counter is not 0");
w.exec("UPDATE metric_registry SET last_value = '0' WHERE metric = 'metrics_on_probation_overdue'");
w.exec("UPDATE metric_registry SET last_refreshed = '2000-01-01T00:00:00Z' WHERE metric = 'metrics_awaiting_samples'");
ok(/metrics_awaiting_samples is not measured within 180 minutes/.test(observed(w)), "it fails when the awaiting metric is stale");
w.exec("UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE metric = 'metrics_awaiting_samples'");
w.exec("UPDATE fleet_tasks SET definition = replace(definition, 'probation-sample-gate', 'x') WHERE id = 'metric-refresh'");
ok(/step probation-sample-gate is missing/.test(observed(w)), "it fails when the extension step is missing from the workflow");

// ---- replay, another doer, decision
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'METRIC-SAMPLE-GATE-2') > 0").n === 1, "one decision_log row after two applies");
const dl = one(w, "SELECT * FROM decision_log WHERE instr(action, 'METRIC-SAMPLE-GATE-2') > 0");
ok(dl.actor.startsWith("rem-a2") && dl.rollback_path.length > 40 && dl.predicted_outcome.length > 40 && dl.capability_gain === "closing-probe-without-a-time-bomb" && dl.surfaces_tested.length > 20, "the decision names its actor, rollback, prediction, capability gain and surfaces tested");
const d = world(); d.exec(sql1);
d.exec("UPDATE remediation_contracts SET module = 'someone-else', verify_probe = 'SELECT ''ok'' AS expected, ''ok'' AS observed' WHERE class = 'issue-1000033'");
d.exec(sql2);
ok(contract(d).module === "someone-else" && contract(d).verify_probe === "SELECT 'ok' AS expected, 'ok' AS observed", "a contract another doer rewrote is left alone");

// ---- the Rollback
const w2 = world(); w2.exec(sql1);
const original = contract(w2);
w2.exec(sql2);
const down = /^-- Rollback: (.*)$/m.exec(sql2)[1].split(";").map((s) => s.trim()).filter(Boolean);
ok(down.length === 1, "the Rollback is one statement", down.length);
for (const s of down) w2.exec(s);
const back = contract(w2);
ok(back.verify_probe === original.verify_probe && back.action === original.action, "Rollback: the probe and the action text are back byte for byte", { same_probe: back.verify_probe === original.verify_probe, same_action: back.action === original.action });

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

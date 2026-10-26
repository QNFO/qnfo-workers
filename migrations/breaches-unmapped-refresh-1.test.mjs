// BREACHES-UNMAPPED-REFRESH-1 offline suite: replays migrations/2026-10-26-breaches-unmapped-refresh-1.sql on node:sqlite.
// Proves: the header opts in (APPLY-BY ci, DB qnfo-audit, one Rollback line, nothing deleted or dropped, no trigger touched); fleet_tasks metric-refresh gains exactly one step, last, the others byte for byte, version +1,
// and a replay adds none; the stored step is one statement that writes only breaches_unmapped from SUM(breaches) of v_breach_by_cause where cause_key is unmapped; at apply the stale 0 becomes the view's count with a fresh
// last_refreshed and state MEASURED; the stored step, run later, follows the view (6, 2, no unmapped row = 0, 7) and moves last_refreshed; no other metric is touched; the WRITER line is appended once to the triage row
// of issue 2192 (older text kept, issue still open, nothing appended when the issue is closed); the decision is logged once; the Rollback line removes the step and the line and leaves the other steps as they were.
// Run: node migrations/breaches-unmapped-refresh-1.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-26-breaches-unmapped-refresh-1.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 600))); } };

const header = sql.split("\n").filter((l) => l.startsWith("--"));
const body = sql.split("\n").filter((l) => !l.startsWith("--")).join("\n");
ok(header.some((l) => /^-- APPLY-BY: ci\s*$/.test(l)) && header.some((l) => /^-- DB: qnfo-audit\s*$/.test(l)), "header opts in: APPLY-BY ci, DB qnfo-audit");
ok(header.filter((l) => /^-- Rollback:/.test(l)).length === 1, "exactly one single-line Rollback header");
ok(!/\r/.test(sql), "the file has LF line endings only");
ok(!/\b(DELETE\s+FROM|DROP\s+(TABLE|INDEX|VIEW|TRIGGER))\b/i.test(body), "the body deletes and drops nothing");
ok(!/\b(UPDATE|DELETE\s+FROM|REPLACE\s+INTO|INSERT\s+OR\s+REPLACE\s+INTO)\s+(decision_log|issue_lifecycle)\b/i.test(body), "APPEND-ONLY-LINT-1: decision_log is only inserted into");
ok(!/\b(CREATE|DROP)\s+(TRIGGER|VIEW)\b/i.test(body) && !/INSERT\s+(OR\s+\w+\s+)?INTO\s+fleet_tick/i.test(body), "no trigger or view is created or dropped and nothing is written to fleet_tick");
ok(!/claude\.ai|anthropic\.com/i.test(sql), "no claude.ai link");
ok([...body.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].every((m) => Buffer.byteLength(m[1]) <= 50), "every LIKE pattern is at most 50 bytes (D1 limit)");
ok(/-- BACKUP: bak_20261026_bu1_workflow\s*$/m.test(sql) && /CREATE TABLE IF NOT EXISTS bak_20261026_bu1_workflow AS SELECT/.test(body), "the backup table named in the header is created first");

const REM_OLD = "PR 965, migrations/2026-10-12-20-kernel-registries.sql. Cause: ...\nOWNERS 2026-10-26 (rem-a2, METRIC-SAMPLE-GATE-1): the stale rows have four writers";
function world(opts = {}) {
  const w = new DatabaseSync(":memory:");
  w.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, refresh_cadence TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, status TEXT DEFAULT 'open');
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, remediation TEXT, reopened_count INTEGER DEFAULT 0);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE breach_rows (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL, val REAL);
CREATE VIEW v_breach_by_cause AS SELECT cause_key, COUNT(*) AS breaches, group_concat(metric_key || '=' || val, ', ') AS metrics FROM breach_rows GROUP BY cause_key;`);
  const steps = [{ type: "sql", db: "AUDIT", sql: "SELECT 1" }, { type: "sql", db: "AUDIT", name: "attributed-share", sql: "SELECT 2" }, { type: "sql", db: "AUDIT", name: "awaiting-samples", sql: "SELECT 3" }];
  w.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, updated_at) VALUES ('metric-refresh', 'METRIC-REFRESH-1', 'workflow', ?, 6, '2026-10-26T19:15:00Z')").run(JSON.stringify({ steps }));
  // the live shape: stored 0 since 09:12:52Z, declared hourly, the view reads 6
  w.prepare("INSERT INTO metric_registry (metric, layer, kind, formula, refresh_cadence, last_value, last_refreshed, state) VALUES ('breaches_unmapped', 'system', 'guard', 'metrics in breach with no metric_breach_cause row', 'hourly', '0', '2026-10-26T09:12:52Z', 'MEASURED')").run();
  w.prepare("INSERT INTO metric_registry (metric, layer, kind, formula, refresh_cadence, last_value, last_refreshed, state) VALUES ('sentinel_metric', 'system', 'target', 'x', 'hourly', '41', '2026-10-26T18:00:00Z', 'MEASURED')").run();
  for (const k of ["drift_total", "cf_obs_reopen_churn_24h", "records_past_retention", "pii_in_logs", "agent_tool_calls_outside_allowlist", "metrics_worsening_7d"]) w.prepare("INSERT INTO breach_rows VALUES (?, 'unmapped', 1)").run(k);
  w.prepare("INSERT INTO breach_rows VALUES ('worker_count', 'cost', 36), ('open_agent_issues', 'backlog', 250)").run();
  w.prepare("INSERT INTO agent_issues (id, title, description, status) VALUES (2192, 'METRIC-REGISTRY-STALENESS-1: metric_registry rows exceed their declared refresh cadence', '10/369 metrics not fresh at 2026-10-26T18:00:48.398Z', ?)").run(opts.closed ? "closed" : "open");
  w.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, reopened_count) VALUES (2192, 'AUTOTRIAGE-1', 'triaged', 'qnfo-ops', datetime('now'), ?, 26)").run(REM_OLD);
  return w;
}
const one = (w, s, ...p) => w.prepare(s).get(...p);
const stepsOf = (w) => JSON.parse(one(w, "SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'").definition).steps;
const metric = (w, k = "breaches_unmapped") => one(w, "SELECT last_value v, last_refreshed r, state s FROM metric_registry WHERE metric = ?", k);
const within = (iso, ms) => Math.abs(Date.parse(iso) - Date.now()) < ms;

const w = world();
const stepsBefore = stepsOf(w), verBefore = one(w, "SELECT version v FROM fleet_tasks WHERE id = 'metric-refresh'").v;
const sentinelBefore = JSON.stringify(metric(w, "sentinel_metric"));
ok(metric(w).v === "0" && one(w, "SELECT breaches b FROM v_breach_by_cause WHERE cause_key = 'unmapped'").b === 6, "fixture: the stored guard reads 0 while the view reads 6 unmapped breaches (the live shape)");
w.exec(sql); w.exec(sql);   // a replay changes nothing

// ---- the workflow
const stepsAfter = stepsOf(w);
ok(stepsAfter.length === stepsBefore.length + 1 && stepsAfter[stepsAfter.length - 1].name === "breaches-unmapped", "metric-refresh gains exactly one step, last, although the file ran twice", stepsAfter.map((s) => s.name));
ok(JSON.stringify(stepsAfter.slice(0, stepsBefore.length)) === JSON.stringify(stepsBefore), "every earlier step is byte for byte as it was");
ok(one(w, "SELECT version v FROM fleet_tasks WHERE id = 'metric-refresh'").v === verBefore + 1, "the version moves by one, once");
ok(JSON.parse(one(w, "SELECT definition d FROM bak_20261026_bu1_workflow").d).steps.length === stepsBefore.length && one(w, "SELECT version v FROM bak_20261026_bu1_workflow").v === verBefore, "the backup holds the workflow as it was");
const stepSql = stepsAfter[stepsAfter.length - 1].sql;
ok(stepsAfter[stepsAfter.length - 1].type === "sql" && stepsAfter[stepsAfter.length - 1].db === "AUDIT", "the step is an AUDIT sql step like the others");
ok(!/;/.test(stepSql) && !/"/.test(stepSql) && /^UPDATE metric_registry SET /.test(stepSql), "the step is one UPDATE statement with no semicolon and no double quote");
ok(/FROM v_breach_by_cause WHERE cause_key = 'unmapped'/.test(stepSql) && /WHERE metric = 'breaches_unmapped'$/.test(stepSql) && /COALESCE\(SUM\(breaches\), 0\)/.test(stepSql), "it reads SUM(breaches) of the unmapped cause from v_breach_by_cause and writes only breaches_unmapped");

// ---- what apply did (the same statement as the step)
let m = metric(w);
ok(m.v === "6" && m.s === "MEASURED" && within(m.r, 120e3), "at apply the stale 0 becomes the view's 6, MEASURED, with the apply time", m);
ok(JSON.stringify(metric(w, "sentinel_metric")) === sentinelBefore, "no other metric row is touched");

// ---- the stored step, run later, follows the view
const runStep = (world_) => world_.prepare(stepSql).run();
w.exec("UPDATE metric_registry SET last_refreshed = '2026-10-26T09:12:52Z' WHERE metric = 'breaches_unmapped'");
w.exec("DELETE FROM breach_rows WHERE metric_key IN ('drift_total', 'cf_obs_reopen_churn_24h', 'records_past_retention', 'pii_in_logs')");
let r = runStep(w); m = metric(w);
ok(r.changes === 1 && m.v === "2" && within(m.r, 120e3), "after the doctor maps four breaches the next run reads 2 and moves last_refreshed", m);
w.exec("DELETE FROM breach_rows WHERE cause_key = 'unmapped'");
runStep(w); m = metric(w);
ok(m.v === "0" && m.s === "MEASURED", "with no unmapped row in the view the run reads 0 (COALESCE), not NULL", m);
w.exec("INSERT INTO breach_rows VALUES ('a', 'unmapped', 1), ('b', 'unmapped', 1), ('c', 'unmapped', 1), ('d', 'unmapped', 1), ('e', 'unmapped', 1), ('f', 'unmapped', 1), ('g', 'unmapped', 1)");
runStep(w);
ok(metric(w).v === "7", "a new unmapped breach count is picked up (7)", metric(w));
ok(JSON.stringify(metric(w, "sentinel_metric")) === sentinelBefore, "the stored step never touches another metric");
w.exec("UPDATE metric_registry SET state = 'UNMEASURED', last_value = NULL WHERE metric = 'breaches_unmapped'");
runStep(w);
ok(metric(w).s === "MEASURED" && metric(w).v === "7", "a row that lost its value is measured again by the step");

// ---- issue 2192
const rem = one(w, "SELECT remediation r FROM issue_triage WHERE issue_id = 2192").r;
ok(rem.startsWith(REM_OLD) && (rem.match(/WRITER 2026-10-26 \(rem-a2, BREACHES-UNMAPPED-REFRESH-1\)/g) || []).length === 1, "the WRITER line is appended once and the older owner map is kept");
ok(/no writer at all/.test(rem) && /drift_total, cf_obs_reopen_churn_24h, records_past_retention, pii_in_logs, agent_tool_calls_outside_allowlist, metrics_worsening_7d/.test(rem) && /metric_breach_cause/.test(rem) && /pr_merge_sla_heavy_tick/.test(rem), "it names the finding, the six unmapped breaches, who maps them, and the writer of pr_open_over_10m");
ok(one(w, "SELECT status s FROM agent_issues WHERE id = 2192").s === "open" && one(w, "SELECT description d FROM agent_issues WHERE id = 2192").d.startsWith("10/369 metrics not fresh"), "issue 2192 stays open and its producer-owned description is not touched");
const wc = world({ closed: true }); wc.exec(sql);
ok(one(wc, "SELECT remediation r FROM issue_triage WHERE issue_id = 2192").r === REM_OLD, "nothing is appended when issue 2192 is closed");

// ---- the decision
ok(one(w, "SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'BREACHES-UNMAPPED-REFRESH-1') > 0").n === 1, "one decision_log row after two applies");
const dl = one(w, "SELECT * FROM decision_log WHERE instr(action, 'BREACHES-UNMAPPED-REFRESH-1') > 0");
ok(dl.actor.startsWith("rem-a2") && dl.rollback_path.length > 40 && dl.predicted_outcome.length > 40 && dl.capability_gain === "guard-metric-has-a-writer" && dl.surfaces_tested.length > 20, "the decision names its actor, rollback, prediction, capability gain and surfaces tested");

// ---- the Rollback
const w2 = world(); w2.exec(sql);
const down = /^-- Rollback: (.*)$/m.exec(sql)[1].split(";").map((s) => s.trim()).filter(Boolean);
ok(down.length === 2, "the Rollback is two statements", down.length);
for (const s of down) w2.exec(s);
ok(JSON.stringify(stepsOf(w2)) === JSON.stringify(stepsBefore), "Rollback: the step is gone and the other steps are as they were");
ok(one(w2, "SELECT version v FROM fleet_tasks WHERE id = 'metric-refresh'").v === verBefore + 2, "Rollback: the version moves on (a workflow change always bumps it)");
ok(one(w2, "SELECT remediation r FROM issue_triage WHERE issue_id = 2192").r === REM_OLD, "Rollback: the WRITER line is stripped and the older text is as it was");
ok(metric(w2).v === "6", "Rollback: the metric keeps its last measured value (true) and is not forced back to the stale 0", metric(w2));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

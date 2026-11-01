// ISSUE-FAMILY-THROUGHPUT-ACTION-1: replays the migration on SQLite and proves the largest open family
// is measured, its metric trigger is actionable, the value follows recoveries, and the migration is idempotent.
// Run: node migrations/issue-family-throughput-action.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sql = readFileSync(new URL("./2026-10-20-issue-throughput.sql", import.meta.url), "utf8");
const change = readFileSync(new URL("./2026-11-01-issue-family-throughput-action.sql", import.meta.url), "utf8");
const d = new DatabaseSync(":memory:");
let pass = 0, fail = 0;
const ok = (condition, message, value) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message + (value === undefined ? "" : " :: " + JSON.stringify(value).slice(0, 300)));
  }
};

d.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
  CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours REAL, enabled INTEGER, notes TEXT);
  CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT);`);

d.exec(sql);
const now = Date.now(), hour = 3600000;
const add = (title, status, ageHours) => d.prepare("INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES (?, ?, ?, ?)").run(title, status, now - ageHours * hour, now - ageHours * hour);
// The family with the largest open backlog has 5 more opened than closed; the next family has 2.
const researchIds = [];
for (let i = 0; i < 5; i++) researchIds.push(add("RESEARCH-TERMINAL " + i + ": no applicable edit", "open", 2).lastInsertRowid);
add("RESEARCH-TERMINAL old: no applicable edit", "open", 130);
const probeIds = [
  add("PROBE-NEEDED-1 first: missing probe", "open", 2).lastInsertRowid,
  add("PROBE-NEEDED-1 second: missing probe", "open", 2).lastInsertRowid
];

d.exec(change);
const metric = () => d.prepare("SELECT last_value, state FROM metric_registry WHERE metric = 'largest_issue_family_net_inflow_24h'").get();
ok(metric().last_value === "5" && metric().state === "MEASURED", "initial metric reflects the largest positive family with open backlog", metric());
const trigger = d.prepare("SELECT operator, threshold, priority, action, owner, queue_target, enabled FROM analytics_metric_triggers WHERE metric_key = 'largest_issue_family_net_inflow_24h'").get();
ok(trigger && trigger.operator === "gt" && trigger.threshold === 0 && trigger.priority === 7 && trigger.owner === "qnfo-fleet-control" && trigger.queue_target === "agent_issues" && trigger.enabled === 1, "metric is routed through the existing qnfo-fleet-control evaluator", trigger);
ok(trigger && trigger.action.length <= 300 && /v_issue_family_throughput/.test(trigger.action) && /doer or verified close probe/.test(trigger.action), "the evaluator receives the complete family-selection and remediation action", trigger && trigger.action);

// Reducing RESEARCH-TERMINAL moves the metric to PROBE-NEEDED-1; closing both families clears it.
for (const id of researchIds.slice(0, 4)) d.prepare("UPDATE agent_issues SET status = 'closed', updated_at = ? WHERE id = ?").run(now, id);
d.prepare("UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-11 minutes') WHERE metric = 'largest_issue_family_net_inflow_24h'").run();
d.prepare("INSERT INTO fleet_tick (source) VALUES ('test-refresh')").run();
ok(metric().last_value === "2", "metric follows the next-largest open family", metric());
for (const id of probeIds) d.prepare("UPDATE agent_issues SET status = 'closed', updated_at = ? WHERE id = ?").run(now, id);
d.prepare("UPDATE agent_issues SET status = 'closed', updated_at = ? WHERE id = ?").run(now, researchIds[4]);
d.prepare("UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-11 minutes') WHERE metric = 'largest_issue_family_net_inflow_24h'").run();
d.prepare("INSERT INTO fleet_tick (source) VALUES ('test-refresh')").run();
ok(metric().last_value === "0", "metric returns to zero when no open family has positive net inflow", metric());

const counts = () => [
  d.prepare("SELECT COUNT(*) AS n FROM metric_registry WHERE metric = 'largest_issue_family_net_inflow_24h'").get().n,
  d.prepare("SELECT COUNT(*) AS n FROM analytics_metric_triggers WHERE metric_key = 'largest_issue_family_net_inflow_24h'").get().n,
  d.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'ISSUE-FAMILY-THROUGHPUT-ACTION-1:%'").get().n
];
d.exec(change);
ok(counts().join() === "1,1,1", "a second apply is idempotent", counts());

const rollback = /^-- Rollback: (.+)$/m.exec(change)[1];
d.exec(rollback);
ok(counts().join() === "0,0,0" && !d.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='issue_family_throughput_tick'").get(), "rollback removes only the added metric path", counts());

console.log("issue-family-throughput-action: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

// MANAGEMENT-PERSONAS-9 / QNFO.OPS regression: worst-first focus supplies the doer-request order.
// Run: node migrations/management-personas-9-ops.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const suite5 = rd("./management-personas-5.test.mjs");
const prep = suite5.slice(suite5.indexOf("const db = new DatabaseSync"), suite5.indexOf("const run = (s"));
const suite1 = rd("./management-personas.test.mjs");
const schema = suite1.slice(suite1.indexOf("db.exec(`") + 9, suite1.indexOf("`);", suite1.indexOf("db.exec(`")));
const sqls = ["./2026-10-26-management-personas.sql", "./2026-10-26-management-personas-2.sql", "./2026-10-26-management-personas-3.sql"].map(rd);
const migration = rd("./2026-11-01-management-personas-9.sql");
const migrationSql = migration.split("\n").filter((line) => !line.startsWith("--")).join("\n");
let pass = 0, fail = 0;
const ok = (condition, message, value) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message + (value === undefined ? "" : " :: " + JSON.stringify(value)));
  }
};

let db;
eval(prep.replace("const db = ", "db = "));
const run = (sql, ...args) => db.prepare(sql).run(...args);
const q = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);
for (const file of ["./2026-10-26-management-personas-4.sql", "./2026-10-26-management-personas-5.sql", "./2026-10-26-management-personas-6.sql", "./2026-10-28-management-personas-8.sql"]) {
  db.exec(rd(file));
}
db.exec(migrationSql);
db.exec(`DROP VIEW v_metric_trigger_state;
  CREATE VIEW v_metric_trigger_state AS
  SELECT t.id, t.metric_key, t.title, t.operator, t.threshold, t.owner, t.queue_target, t.priority,
    CAST(r.last_value AS REAL) AS val,
    CASE WHEN r.last_value IS NULL THEN NULL
         WHEN t.operator = 'gt' THEN CAST(r.last_value AS REAL) > t.threshold
         WHEN t.operator = 'lte' THEN CAST(r.last_value AS REAL) <= t.threshold
         WHEN t.operator = 'lt' THEN CAST(r.last_value AS REAL) < t.threshold
         WHEN t.operator = 'eq' THEN CAST(r.last_value AS REAL) = t.threshold
         ELSE CAST(r.last_value AS REAL) >= t.threshold END AS hit
  FROM analytics_metric_triggers t
  LEFT JOIN metric_registry r ON r.metric = t.metric_key
  WHERE t.enabled = 1`);

for (const [id, metric, value] of [[201, "ops_worst", 40], [202, "ops_mild", 11], [203, "ops_on_target", 10]]) {
  run("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES (?, 'operational', 'guard', ?)", metric, String(value));
  run("INSERT INTO analytics_metric_triggers (id, metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, enabled) VALUES (?, ?, ?, 'metric_registry', 'gt', 10, 5, 'fix metric', 'ops-test', 'agent_issues', 1)", id, metric, metric);
}
const created = Date.now() - 4 * 60 * 60 * 1000;
for (const [id, trigger, metric] of [[901, 201, "ops_worst"], [902, 202, "ops_mild"], [903, 203, "ops_on_target"]]) {
  run("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'no doer', 'metric-test', 'bug', 'medium', 'open', ?, ?)", id, `METRIC-TRIGGER-${trigger}-${metric}`, created, created);
  run("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind) VALUES (?, 'W.OPS', 'QNFO.OPS', 'fix')", id);
}
run("INSERT INTO portfolio_allocations (tick, program_code, manager_persona, verdict, risk_score, open_issues, slots, decision) VALUES ('2099-01-01T00:00Z', 'QNFO.OPS', 'program-manager:QNFO.OPS', 'RED', 10, 3, 3, 'steady')");

const focus = q("SELECT issue_id, rank, reason FROM v_program_focus_plan WHERE program_code = 'QNFO.OPS' ORDER BY rank");
ok(focus.map((row) => row.issue_id).join() === "901,902,903", "QNFO.OPS ranks its greatest breach, smaller breach, then in-target metric", focus);
ok(focus[0].reason.includes("ops_worst") && /300(?:\.0)?%/.test(focus[0].reason), "the leading QNFO.OPS issue identifies its greatest normalized breach", focus[0]);
ok(!focus[2].reason.includes("off-target"), "an in-target QNFO.OPS metric is not treated as a breach", focus[2]);

run("INSERT INTO program_focus (program_code, issue_id, rank, tier, reason, has_doer, entered_at) SELECT program_code, issue_id, rank, tier, reason, has_doer, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours') FROM v_program_focus_plan WHERE program_code = 'QNFO.OPS'");
const doerRequest = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps.find((step) => step.name === "dg-request");
db.prepare(doerRequest.sql).all();
const requests = q("SELECT instance, requester FROM cf_agent_requests WHERE instance LIKE 'doer-%' ORDER BY id");
ok(requests.map((row) => Number(row.instance.split("-")[1])).join() === "901,902,903", "QNFO.OPS files doer requests in the same worst-first order", requests);
ok(requests.every((row) => row.requester === "program-manager:QNFO.OPS"), "each request is owned by the QNFO.OPS manager", requests);

console.log("management-personas-9-ops: " + pass + " passed, " + fail + " failed");
db.close();
process.exit(fail ? 1 : 0);

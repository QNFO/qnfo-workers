// MANAGEMENT-PERSONAS-9 / QNFO.INFRA regression: breach rank stays program-local and doer requests follow that rank.
// Run: node migrations/management-personas-9-infra.test.mjs
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

run("INSERT INTO service_program_map (service, program_code) VALUES ('infra-test', 'QNFO.INFRA'), ('reach-test', 'QNFO.REACH')");
const metrics = [
  [201, "infra_worst", "infra-test", 10, 40],
  [202, "infra_mild", "infra-test", 10, 20],
  [203, "reach_worst", "reach-test", 10, 110]
];
for (const [id, metric, owner, threshold, value] of metrics) {
  run("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES (?, 'operational', 'guard', ?)", metric, String(value));
  run("INSERT INTO analytics_metric_triggers (id, metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, enabled) VALUES (?, ?, ?, 'metric_registry', 'gt', ?, 5, 'fix metric', ?, 'agent_issues', 1)", id, metric, metric, threshold, owner);
}
for (const [id, trigger, metric, program, project] of [
  [901, 201, "infra_worst", "QNFO.INFRA", "W.INFRA"],
  [902, 202, "infra_mild", "QNFO.INFRA", "W.INFRA"],
  [903, 203, "reach_worst", "QNFO.REACH", "W.REACH"]
]) {
  run("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'no doer', 'metric-test', 'bug', 'medium', 'open', 1, 1)", id, `METRIC-TRIGGER-${trigger}-${metric}`);
  run("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind) VALUES (?, ?, ?, 'fix')", id, project, program);
}
run("INSERT INTO portfolio_allocations (tick, program_code, manager_persona, verdict, risk_score, open_issues, slots, decision) VALUES ('2099-01-01T00:00Z', 'QNFO.INFRA', 'program-manager:QNFO.INFRA', 'RED', 10, 2, 2, 'steady'), ('2099-01-01T00:00Z', 'QNFO.REACH', 'program-manager:QNFO.REACH', 'RED', 10, 1, 1, 'steady')");

const infraFocus = q("SELECT issue_id, rank, reason FROM v_program_focus_plan WHERE program_code = 'QNFO.INFRA' ORDER BY rank");
ok(infraFocus.map((row) => row.issue_id).join() === "901,902", "QNFO.INFRA ranks its own breached metrics worst-first despite a larger QNFO.REACH breach", infraFocus);
ok(infraFocus[0].reason.includes("infra_worst") && /300(?:\.0)?%/.test(infraFocus[0].reason), "the leading QNFO.INFRA focus item identifies its greatest normalized breach", infraFocus[0]);

run("INSERT INTO program_focus (program_code, issue_id, rank, tier, reason, has_doer, entered_at) SELECT program_code, issue_id, rank, tier, reason, has_doer, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours') FROM v_program_focus_plan");
const doerRequest = JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps.find((step) => step.name === "dg-request");
db.prepare(doerRequest.sql).all();
const infraRequests = q("SELECT instance FROM cf_agent_requests WHERE requester = 'program-manager:QNFO.INFRA' ORDER BY id");
const allRequests = q("SELECT instance FROM cf_agent_requests WHERE instance LIKE 'doer-%'");
ok(infraRequests.map((row) => Number(row.instance.split("-")[1])).join() === "901,902", "the QNFO.INFRA manager requests doers for its no-doer issues in worst-first order", infraRequests);
ok(allRequests.length === 3 && allRequests.length <= 4, "doer requests remain within the existing per-tick cap", allRequests);

for (const [issueId, anchor] of [[901, "async function infraSecret(env, key) {"], [902, "async function infraDeployHash(env) {"]]) {
  run("UPDATE cf_agent_requests SET status = 'done', result = ? WHERE instance LIKE ?", `code-task: repo=qnfo-workers path=qnfo-infra/worker.js\ncode-anchor: ${anchor}`, `doer-${issueId}-%`);
}
for (const step of JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps.filter((item) => ["dg-parse", "dg-nofix", "dg-reject", "dg-apply", "dg-mark", "dg-log"].includes(item.name))) {
  db.prepare(step.sql).all();
}
const assigned = q("SELECT id, description FROM agent_issues WHERE id IN (901, 902) ORDER BY id");
ok(assigned.every((issue) => issue.description.startsWith("code-task: repo=qnfo-workers path=qnfo-infra/worker.js\ncode-anchor: async function infra")), "the workflow writes each requested doer and anchor into its QNFO.INFRA issue", assigned);
ok(q("SELECT issue_id FROM doer_assignments WHERE status = 'assigned' ORDER BY issue_id").map((row) => row.issue_id).join() === "901,902", "both QNFO.INFRA doer assignments are recorded", assigned);

console.log("management-personas-9-infra: " + pass + " passed, " + fail + " failed");
db.close();
process.exit(fail ? 1 : 0);

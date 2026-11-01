// MANAGEMENT-PERSONAS-10 offline suite: PERSONAL metric requests are worst-first and contain aggregate reasons only.
// Run: node migrations/management-personas-10-personal.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const suite5 = rd("./management-personas-5.test.mjs");
const prep = suite5.slice(suite5.indexOf("const db = new DatabaseSync"), suite5.indexOf("const run = (s"));
const suite1 = rd("./management-personas.test.mjs");
const schema = suite1.slice(suite1.indexOf("db.exec(`") + 9, suite1.indexOf("`);", suite1.indexOf("db.exec(`")));
const sqls = ["./2026-10-26-management-personas.sql", "./2026-10-26-management-personas-2.sql", "./2026-10-26-management-personas-3.sql"].map(rd);
const migration = rd("./2026-11-01-management-personas-10.sql");
const migrationSql = migration.split("\n").filter((line) => !line.startsWith("--")).join("\n");
const rollback = migration.match(/^-- Rollback: (.+)$/m)?.[1];
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
for (const file of [
  "./2026-10-26-management-personas-4.sql",
  "./2026-10-26-management-personas-5.sql",
  "./2026-10-26-management-personas-6.sql",
  "./2026-10-28-management-personas-8.sql",
  "./2026-11-01-management-personas-9.sql"
]) {
  const sql = rd(file);
  db.exec(file.endsWith("-9.sql") ? sql.split("\n").filter((line) => !line.startsWith("--")).join("\n") : sql);
}

const versionBefore = one("SELECT version FROM fleet_tasks WHERE id = 'management-personas'").version;
db.exec(migrationSql);
const versionAfter = one("SELECT version FROM fleet_tasks WHERE id = 'management-personas'").version;
db.exec(migrationSql);
ok(Boolean(rollback), "the migration declares a rollback");
ok(versionAfter === versionBefore + 1 && one("SELECT version FROM fleet_tasks WHERE id = 'management-personas'").version === versionAfter, "the request step is changed once");

const steps = () => JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps;
const doerRequest = steps().find((step) => step.name === "dg-request");
ok(doerRequest.sql.includes("f.reason LIKE 'worst off-target metric %'"), "PERSONAL requests are limited to off-target metric focus issues");
ok(doerRequest.sql.includes("ORDER BY f.rank, CASE a.priority"), "doer requests retain worst-first program focus ordering");
ok(doerRequest.sql.includes("Aggregate metric only: "), "PERSONAL requests use their aggregate focus reason");
ok(!doerRequest.sql.includes("AND f.program_code <> 'QNFO.PERSONAL' AND f.entered_at"), "PERSONAL is no longer excluded from eligible doer requests");

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
run("INSERT INTO service_program_map (service, program_code) VALUES ('personal-test', 'QNFO.PERSONAL')");
for (const [triggerId, metric, value] of [[201, "personal_worst", 40], [202, "personal_mild", 20], [203, "personal_on_target", 10]]) {
  run("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES (?, 'operational', 'guard', ?)", metric, String(value));
  run("INSERT INTO analytics_metric_triggers (id, metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, enabled) VALUES (?, ?, ?, 'metric_registry', 'gt', 10, 5, 'fix metric', 'personal-test', 'agent_issues', 1)", triggerId, metric, metric);
}
const created = Date.now() - 4 * 60 * 60 * 1000;
for (const [issueId, triggerId, metric] of [[901, 201, "personal_worst"], [902, 202, "personal_mild"], [903, 203, "personal_on_target"]]) {
  run("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, ?, 'metric-test', 'bug', 'medium', 'open', ?, ?)",
    issueId, `METRIC-TRIGGER-${triggerId}-${metric}`, `private issue body ${issueId}`, created, created);
  run("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind) VALUES (?, 'W.PERSONAL', 'QNFO.PERSONAL', 'fix')", issueId);
}
run("INSERT INTO portfolio_allocations (tick, program_code, manager_persona, verdict, risk_score, open_issues, slots, decision) VALUES ('2099-01-01T00:00Z', 'QNFO.PERSONAL', 'program-manager:QNFO.PERSONAL', 'RED', 10, 3, 3, 'steady')");

const focus = q("SELECT issue_id, rank, reason FROM v_program_focus_plan WHERE program_code = 'QNFO.PERSONAL' ORDER BY rank");
ok(focus.map((row) => row.issue_id).join() === "901,902,903", "PERSONAL metrics rank by normalized breach distance before the on-target metric", focus);
ok(focus[0].reason.includes("personal_worst") && /300(?:\.0)?%/.test(focus[0].reason), "the greatest PERSONAL breach is identified as the worst metric", focus[0]);
ok(focus[1].reason.includes("personal_mild") && /100(?:\.0)?%/.test(focus[1].reason), "the smaller PERSONAL breach follows the worst breach", focus[1]);
ok(!focus[2].reason.includes("off-target"), "the in-target PERSONAL metric is not treated as an off-target breach", focus[2]);

run("INSERT INTO program_focus (program_code, issue_id, rank, tier, reason, has_doer, entered_at) SELECT program_code, issue_id, rank, tier, reason, has_doer, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours') FROM v_program_focus_plan WHERE program_code = 'QNFO.PERSONAL'");
db.prepare(doerRequest.sql).all();
const requests = q("SELECT instance, requester, prompt FROM cf_agent_requests WHERE instance LIKE 'doer-%' ORDER BY id");
ok(requests.map((row) => Number(row.instance.split("-")[1])).join() === "901,902", "only off-target PERSONAL focus metrics receive doer requests, in worst-first order", requests);
ok(requests.every((row) => row.requester === "program-manager:QNFO.PERSONAL"), "requests are filed by the PERSONAL manager", requests);
ok(requests.every((row) => row.prompt.includes("Aggregate metric only: worst off-target metric")), "requests contain the aggregate metric reason", requests);
ok(requests.every((row) => !row.prompt.includes("private issue body") && !row.prompt.includes("METRIC-TRIGGER-")), "PERSONAL issue titles and bodies are not sent in requests", requests);
ok(one("SELECT COUNT(*) AS count FROM cf_agent_requests WHERE instance LIKE 'doer-903-%'").count === 0, "an in-target PERSONAL metric does not receive a doer request");

db.exec(rollback);
const restored = steps().find((step) => step.name === "dg-request").sql;
ok(restored.includes("f.program_code <> 'QNFO.PERSONAL'"), "rollback restores the prior PERSONAL exclusion");
ok(!restored.includes("Aggregate metric only: "), "rollback removes PERSONAL-specific prompt handling");
console.log("management-personas-10-personal: " + pass + " passed, " + fail + " failed");
db.close();
process.exit(fail ? 1 : 0);

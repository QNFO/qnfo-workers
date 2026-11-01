// MANAGEMENT-PERSONAS-9 offline suite: QNFO.REACH breach distance controls focus and doer-request order.
// Run: node migrations/management-personas-9.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8");
const suite5 = rd("./management-personas-5.test.mjs");
const prep = suite5.slice(suite5.indexOf("const db = new DatabaseSync"), suite5.indexOf("const run = (s"));
const suite1 = rd("./management-personas.test.mjs");
const schema = suite1.slice(suite1.indexOf("db.exec(`") + 9, suite1.indexOf("`);", suite1.indexOf("db.exec(`")));
const migration = rd("./2026-11-01-management-personas-9.sql");
const migrationSql = migration.split("\n").filter((line) => !line.startsWith("--")).join("\n");
const rollback = migration.match(/^-- Rollback: (.+)$/m)?.[1];
const sqls = ["./2026-10-26-management-personas.sql", "./2026-10-26-management-personas-2.sql", "./2026-10-26-management-personas-3.sql"].map(rd);
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
let db;
eval(prep.replace("const db = ", "db = "));
const run = (s, ...a) => db.prepare(s).run(...a);
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);

for (const f of ["./2026-10-26-management-personas-4.sql", "./2026-10-26-management-personas-5.sql", "./2026-10-26-management-personas-6.sql", "./2026-10-28-management-personas-8.sql"]) db.exec(rd(f));
const versionBefore = one("SELECT version FROM fleet_tasks WHERE id = 'management-personas'").version;
db.exec(migrationSql);
const versionAfter = one("SELECT version FROM fleet_tasks WHERE id = 'management-personas'").version;
db.exec(migrationSql);
ok(Boolean(rollback), "the migration declares a rollback");
ok(versionAfter === versionBefore + 1 && one("SELECT version FROM fleet_tasks WHERE id = 'management-personas'").version === versionAfter, "the request-order edit is applied once");
const steps = () => JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps;
const doerRequest = steps().find((s) => s.name === "dg-request");
ok(doerRequest.sql.includes("ORDER BY f.rank, CASE a.priority"), "doer requests follow program focus rank");
ok(!doerRequest.sql.includes("ORDER BY CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, f.entered_at"), "the previous priority-first ordering is gone");

const now = Math.floor(Date.now() / 1000) * 1000;
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
run("INSERT INTO service_program_map (service, program_code) VALUES ('reach-test', 'QNFO.REACH')");
const metrics = [
  [201, "reach_worst", "gt", 10, 40],
  [205, "reach_worst_tie", "gt", 10, 40],
  [206, "reach_gte", "gte", 10, 30],
  [202, "reach_middle", "lt", 100, 50],
  [207, "reach_lte", "lte", 100, 75],
  [203, "reach_mild", "gt", 10, 11],
  [204, "reach_on_target", "gt", 10, 10]
];
for (const [id, metric, operator, threshold, value] of metrics) {
  run("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES (?, 'operational', 'guard', ?)", metric, String(value));
  run("INSERT INTO analytics_metric_triggers (id, metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, enabled) VALUES (?, ?, ?, 'metric_registry', ?, ?, 5, 'fix metric', 'reach-test', 'agent_issues', 1)", id, metric, metric, operator, threshold);
}
const created = now - 4 * 60 * 60 * 1000;
for (const [id, trigger, metric] of [[901, 201, "reach_worst"], [905, 205, "reach_worst_tie"], [906, 206, "reach_gte"], [902, 202, "reach_middle"], [907, 207, "reach_lte"], [903, 203, "reach_mild"], [904, 204, "reach_on_target"]]) {
  run("INSERT INTO agent_issues (id, title, description, source, category, priority, status, created_at, updated_at) VALUES (?, ?, 'no doer', 'metric-test', 'bug', 'medium', 'open', ?, ?)", id, `METRIC-TRIGGER-${trigger}-${metric}`, created, created);
  run("INSERT INTO issue_project_map (issue_id, project_code, program_code, kind) VALUES (?, 'W.REACH', 'QNFO.REACH', 'fix')", id);
}
run("INSERT INTO portfolio_allocations (tick, program_code, manager_persona, verdict, risk_score, open_issues, slots, decision) VALUES ('2099-01-01T00:00Z', 'QNFO.REACH', 'program-manager:QNFO.REACH', 'RED', 10, 7, 7, 'steady')");

const focus = q("SELECT issue_id, rank, reason FROM v_program_focus_plan WHERE program_code = 'QNFO.REACH' ORDER BY rank");
ok(focus.map((f) => f.issue_id).join() === "901,905,906,902,907,903,904", "breached metrics using gt/gte/lt/lte rank by normalized deviation, ties retain deterministic issue order, then in-target metrics", focus);
ok(focus[0].reason.includes("reach_worst") && /300(?:\.0)?%/.test(focus[0].reason), "the greatest normalized QNFO.REACH breach is identified as the worst metric", focus[0]);
ok(focus[1].reason.includes("reach_worst_tie") && /300(?:\.0)?%/.test(focus[1].reason), "equal normalized QNFO.REACH breaches have deterministic ordering", focus[1]);
ok(focus[2].reason.includes("reach_gte") && /200(?:\.0)?%/.test(focus[2].reason), "gte QNFO.REACH breaches use high-side deviation", focus[2]);
ok(focus[3].reason.includes("reach_middle") && /50(?:\.0)?%/.test(focus[3].reason), "a lower normalized QNFO.REACH breach follows the worst breach", focus[3]);
ok(focus[4].reason.includes("reach_lte") && /25(?:\.0)?%/.test(focus[4].reason), "lte QNFO.REACH breaches use low-side deviation", focus[4]);
ok(focus[5].reason.includes("reach_mild") && /10(?:\.0)?%/.test(focus[5].reason), "the mild QNFO.REACH breach follows the larger breaches", focus[5]);
ok(!focus[6].reason.includes("off-target"), "an in-target metric is not treated as an off-target breach", focus[6]);

run("INSERT INTO program_focus (program_code, issue_id, rank, tier, reason, has_doer, entered_at) SELECT program_code, issue_id, rank, tier, reason, has_doer, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-4 hours') FROM v_program_focus_plan WHERE program_code = 'QNFO.REACH'");
for (const step of steps().filter((s) => ["dg-request"].includes(s.name))) db.prepare(step.sql).all();
const requests = q("SELECT instance FROM cf_agent_requests WHERE instance LIKE 'doer-%' ORDER BY id");
ok(requests.map((r) => Number(r.instance.split("-")[1])).join() === "901,905,906,902", "QNFO.REACH doer requests begin with worst metric issues in focus rank order and retain the four-request cap", requests);

db.exec(rollback);
ok(!one("SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = 'v_program_focus_plan' AND sql LIKE '%breach_ratio%'"), "rollback restores the prior focus-plan view");
ok(!JSON.parse(one("SELECT definition FROM fleet_tasks WHERE id = 'management-personas'").definition).steps.find((s) => s.name === "dg-request").sql.includes("ORDER BY f.rank"), "rollback restores the previous request ordering");
console.log("management-personas-9: " + pass + " passed, " + fail + " failed");
db.close();
process.exit(fail ? 1 : 0);

import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

let pass = 0, fail = 0;
const ok = (condition, message, detail) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message + (detail === undefined ? "" : " :: " + JSON.stringify(detail)));
  }
};
const source = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
const migration = readFileSync(new URL("../migrations/2026-10-25-remediation-budget-metric.sql", import.meta.url), "utf8");
const start = source.indexOf("// REMEDIATION-OVER-BUDGET-METRIC-1:BEGIN");
const end = source.indexOf("// REMEDIATION-OVER-BUDGET-METRIC-1:END", start);
ok(start >= 0 && end > start, "the metric query and writer are bounded by test markers");
ok(source === mirror, "the deployment mirror exactly matches the worker source");
ok(source.includes("await refreshRemediationOverBudgetMetric(db, nowIso, out);"), "the hourly owned-metric refresh calls the RED-DRAIN metric writer");
ok(/REMEDIATION-OVER-BUDGET-METRIC-1/.test(migration) && /threshold are unchanged/.test(migration), "the migration documents the measurement-only change");

const context = { console: { error() {} }, Number, String };
vm.createContext(context);
vm.runInContext(source.slice(start, end) + "\nglobalThis.metricHelpers = { RED_DRAIN_ELIGIBLE_REMEDIATION_SQL, redDrainEligibleRemediationCount, refreshRemediationOverBudgetMetric };", context);
const { RED_DRAIN_ELIGIBLE_REMEDIATION_SQL, redDrainEligibleRemediationCount, refreshRemediationOverBudgetMetric } = context.metricHelpers;
for (const predicate of [
  "r.status IN ('active','holding')",
  "r.last_verdict='fail'",
  "r.attempts > 5*COALESCE(r.max_attempts,3)",
  "substr(r.class,1,3) <> 'fm-'",
  "substr(r.class,1,7) <> 'belief-'",
  "ct.status NOT IN ('closed','superseded')",
  "a.title NOT LIKE 'METRIC-TRIGGER-%'",
  "c2.class<>r.class"
]) ok(RED_DRAIN_ELIGIBLE_REMEDIATION_SQL.includes(predicate), "the count includes RED-DRAIN step-2 predicate " + predicate);

function makeD1(db) {
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      let args = [];
      const wrapped = {
        bind(...values) { args = values; return wrapped; },
        async first() { return statement.get(...args); },
        async run() { return { meta: { changes: statement.run(...args).changes } }; }
      };
      return wrapped;
    }
  };
}

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT, last_verdict TEXT, attempts INTEGER, max_attempts INTEGER);
  CREATE TABLE code_tasks (status TEXT, goal TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT, title TEXT);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT, state TEXT);
  INSERT INTO remediation_contracts VALUES
    ('active-eligible', NULL, 'active', 'fail', 16, 3),
    ('holding-eligible', NULL, 'holding', 'fail', 16, 3),
    ('pass-is-not-eligible', NULL, 'active', 'pass', 99, 3),
    ('fm-detector-excluded', NULL, 'active', 'fail', 99, 3),
    ('belief-excluded', NULL, 'holding', 'fail', 99, 3),
    ('already-escalated', NULL, 'escalated', 'fail', 99, 3),
    ('code-task-in-flight', 77, 'active', 'fail', 99, 3),
    ('sole-open-issue-contract', 88, 'active', 'fail', 99, 3),
    ('open-issue-with-alternate', 99, 'active', 'fail', 99, 3),
    ('alternate-contract', 99, 'active', 'pass', 0, 3),
    ('metric-trigger-issue', 100, 'active', 'fail', 99, 3),
    ('exact-threshold-not-over', NULL, 'active', 'fail', 15, 3),
    ('null-max-attempts-uses-default', NULL, 'active', 'fail', 16, NULL);
  UPDATE remediation_contracts SET class='fm-detector-excluded' WHERE class='fm-detector-excluded';
  UPDATE remediation_contracts SET class='belief-excluded' WHERE class='belief-excluded';
  INSERT INTO code_tasks VALUES ('active', 'fix issue #77 code');
  INSERT INTO agent_issues VALUES (88, 'open', 'Ordinary issue');
  INSERT INTO agent_issues VALUES (99, 'open', 'Ordinary issue');
  INSERT INTO agent_issues VALUES (100, 'open', 'METRIC-TRIGGER-100: metric');
  INSERT INTO metric_registry VALUES ('remediation_contracts_over_budget', '2154', '2026-10-25T03:00:00Z', 'MEASURED');
`);

const d1 = makeD1(db);
const count = await redDrainEligibleRemediationCount(d1);
ok(count === 5, "only RED-DRAIN-eligible failures are counted", count);
const output = { written: [], skipped: {} };
const refreshedAt = "2026-10-25T18:40:00.000Z";
await refreshRemediationOverBudgetMetric(d1, refreshedAt, output);
const updated = db.prepare("SELECT last_value, last_refreshed, state FROM metric_registry WHERE metric=?").get("remediation_contracts_over_budget");
ok(updated.last_value === "5" && updated.last_refreshed === refreshedAt && updated.state === "MEASURED", "the writer stores the measured count and refresh time", updated);
ok(output.written.includes("remediation_contracts_over_budget=5"), "the writer reports the metric it wrote", output);

db.prepare("DELETE FROM metric_registry WHERE metric=?").run("remediation_contracts_over_budget");
const missing = { written: [], skipped: {} };
await refreshRemediationOverBudgetMetric(d1, refreshedAt, missing);
ok(missing.skipped.remediation_contracts_over_budget === "metric_registry row not found" && missing.written.length === 0, "a missing registry row is reported, never created", missing);

await Promise.all([
  (async () => {
    const badDb = { prepare() { return { first: async () => ({ n: "not-a-count" }) }; } };
    let rejected = false;
    try { await redDrainEligibleRemediationCount(badDb); } catch (error) { rejected = /valid count/.test(error.message); }
    ok(rejected, "an invalid query result fails explicitly instead of writing a success-shaped value");
  })()
]);

function migrationWorld() {
  const world = new DatabaseSync(":memory:");
  world.exec(`
    CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, formula TEXT, source_of_truth TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
    CREATE TABLE analytics_metric_triggers (metric_key TEXT PRIMARY KEY, notes TEXT, operator TEXT, threshold REAL, enabled INTEGER);
    CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
    CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, expected_cadence_h INTEGER, status TEXT, precondition TEXT, action TEXT, escalate_to TEXT, last_verdict TEXT, attempts INTEGER);
    CREATE TABLE code_tasks (status TEXT, goal TEXT);
    CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, status TEXT, title TEXT);
    CREATE TABLE capability_ledger (capability TEXT PRIMARY KEY, provenance TEXT NOT NULL, prerequisites TEXT, reliability TEXT, acquired_at TEXT NOT NULL, last_exercised_at TEXT, evidence TEXT NOT NULL);
    CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
    INSERT INTO metric_registry VALUES ('remediation_contracts_over_budget', 'old formula', 'old source', '2154', '2026-10-25T03:00:00Z', 'MEASURED');
    INSERT INTO analytics_metric_triggers VALUES ('remediation_contracts_over_budget', 'old trigger note', 'gt', 50, 1);
    INSERT INTO remediation_contracts (class, issue_id, status, last_verdict, attempts, max_attempts) VALUES ('eligible', NULL, 'active', 'fail', 16, 3);
  `);
  return world;
}

const mw = migrationWorld();
mw.exec(migration);
mw.exec(migration);
const formula = mw.prepare("SELECT formula, source_of_truth FROM metric_registry WHERE metric=?").get("remediation_contracts_over_budget");
const trigger = mw.prepare("SELECT notes, operator, threshold, enabled FROM analytics_metric_triggers WHERE metric_key=?").get("remediation_contracts_over_budget");
ok(formula.formula.includes("RED-DRAIN v6 step 2") && formula.source_of_truth.includes("code_tasks"), "the migration corrects formula and source provenance", formula);
ok(trigger.operator === "gt" && trigger.threshold === 50 && trigger.enabled === 1 && trigger.notes.includes("unchanged"), "the migration leaves the live trigger semantics unchanged", trigger);
ok(mw.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key='remediation-over-budget-metric-lifetime-count'").get().n === 1, "the failure mode is registered idempotently");
const detector = mw.prepare("SELECT verify_probe FROM remediation_contracts WHERE class='fm-remediation-over-budget-metric-lifetime-count'").get().verify_probe;
mw.prepare("UPDATE metric_registry SET last_value='1', last_refreshed=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE metric=?").run("remediation_contracts_over_budget");
ok(mw.prepare(detector).get().observed === "0", "the detector passes when the registry value matches a fresh RED-DRAIN count");
mw.prepare("UPDATE metric_registry SET last_value='99' WHERE metric=?").run("remediation_contracts_over_budget");
ok(mw.prepare(detector).get().observed === "1", "the detector catches a mismatched stored value");
ok(mw.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1 && mw.prepare("SELECT COUNT(*) AS n FROM capability_ledger").get().n === 1, "decision and capability records are idempotent");
const rollback = migration.match(/^-- Rollback: (.+)$/m)?.[1];
ok(Boolean(rollback), "the migration exposes a rollback command");
mw.exec(rollback);
const restored = mw.prepare("SELECT formula, source_of_truth, last_value, last_refreshed FROM metric_registry WHERE metric=?").get("remediation_contracts_over_budget");
ok(restored.formula === "old formula" && restored.source_of_truth === "old source" && restored.last_value === "2154", "rollback restores the original metric metadata and value", restored);
ok(mw.prepare("SELECT notes FROM analytics_metric_triggers WHERE metric_key=?").get("remediation_contracts_over_budget").notes === "old trigger note", "rollback restores the original trigger notes");
ok(mw.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class='fm-remediation-over-budget-metric-lifetime-count'").get().n === 1, "rollback retains the detector contract as a durable safety record");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

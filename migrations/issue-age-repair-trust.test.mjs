import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const migration = readFileSync(new URL("./2026-11-01-issue-age-repair-trust.sql", import.meta.url), "utf8");
const workerSrc = readFileSync(new URL("../qnfo-code-orchestrator/worker.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const pair = "qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:";
const backupKey = "code_merge_trusted_sources--bak-20261101-issue-age-repair-trust";
const trustedList = "session*,qnfo-fleet-control|METRIC-TRIGGER-";

const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, source TEXT, title TEXT, status TEXT);
  CREATE TABLE issue_plans (issue_id INTEGER PRIMARY KEY, planned_at TEXT, outcome TEXT, detail TEXT, task_id TEXT, path TEXT, model TEXT, attempts INTEGER DEFAULT 1);
  CREATE TABLE control_registry (control TEXT PRIMARY KEY, alternate_path TEXT, evidence TEXT, reviewed_at TEXT);
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, expected_cadence_h INTEGER, status TEXT, precondition TEXT, action TEXT, escalate_to TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
`);
db.prepare("INSERT INTO ops_config (key, value, note, updated_at) VALUES ('code_merge_trusted_sources', ?, 'existing trust policy', 'before')").run(trustedList);
db.prepare("INSERT INTO control_registry VALUES ('code-merge-trusted-sources', 'session PR through the stale-PR lane', 'existing provenance policy', 'before')").run();

const issue = db.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, ?)");
const plan = db.prepare("INSERT INTO issue_plans VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
issue.run(1, "qnfo-fleet-control", "ISSUE-AGE-24H-REPAIR-1: issue #1 has no live doer", "open");
plan.run(1, "2026-11-01T10:00:00Z", "untrusted", "source qnfo-fleet-control is not trusted", null, null, null, 2);
issue.run(2, "qnfo-fleet-control", "ISSUE-AGE-24H-REPAIR-1: issue #2 has no live doer", "closed");
plan.run(2, "2026-11-01T10:00:00Z", "untrusted", "closed history", null, null, null, 1);
issue.run(3, "qnfo-fleet-control", "METRIC-TRIGGER-1: unrelated", "open");
plan.run(3, "2026-11-01T10:00:00Z", "untrusted", "unrelated title", null, null, null, 1);
issue.run(4, "other-source", "ISSUE-AGE-24H-REPAIR-1: unrelated source", "open");
plan.run(4, "2026-11-01T10:00:00Z", "untrusted", "unrelated source", null, null, null, 1);
issue.run(5, "qnfo-fleet-control", "ISSUE-AGE-24H-REPAIR-1: already classified", "open");
plan.run(5, "2026-11-01T10:00:00Z", "not-code", "already reviewed", null, null, null, 1);

const start = workerSrc.indexOf("const PLAN_TRUSTED_DEFAULT");
const end = workerSrc.indexOf("// PLAN-TRUSTED-FIRST-1", start);
assert.ok(start >= 0 && end > start, "planner trust functions are present in qnfo-code-orchestrator");
const context = vm.createContext({});
vm.runInContext(workerSrc.slice(start, end) + "\nthis.api = { planTrustRules, planTrusted };", context);
const plannerTrusts = (value, source, title) => context.api.planTrusted(source, title, context.api.planTrustRules(value));

assert.equal(plannerTrusts(trustedList, "qnfo-fleet-control", "ISSUE-AGE-24H-REPAIR-1: issue #1"), false, "the current list rejects the age-repair notice");
db.exec(migration);

const config = () => db.prepare("SELECT value FROM ops_config WHERE key = 'code_merge_trusted_sources'").get().value;
const planFor = (id) => db.prepare("SELECT planned_at, outcome, detail, task_id, path, model, attempts FROM issue_plans WHERE issue_id = ?").get(id);
assert.equal(config(), `${trustedList},${pair}`, "only the exact source/title pair is appended");
assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = ?").get(backupKey).value, trustedList, "the previous trust list is backed up");
assert.equal(plannerTrusts(config(), "qnfo-fleet-control", "ISSUE-AGE-24H-REPAIR-1: issue #1"), true, "the planner accepts the generated age-repair title");
assert.equal(plannerTrusts(config(), "qnfo-fleet-control", "METRIC-TRIGGER-1: unrelated"), true, "an existing trusted metric prefix remains trusted");
assert.equal(plannerTrusts(config(), "qnfo-fleet-control", "ISSUE-AGE-OTHER: unrelated"), false, "other qnfo-fleet-control titles remain untrusted");
assert.equal(plannerTrusts(config(), "other-source", "ISSUE-AGE-24H-REPAIR-1: unrelated"), false, "the exact title from another source remains untrusted");

assert.equal(planFor(1).planned_at, "2000-01-01T00:00:00Z", "the matching open untrusted verdict is re-armed");
assert.match(planFor(1).detail, /^ISSUE-AGE-REPAIR-TRUST-1 re-arm/);
assert.equal(planFor(1).outcome, "untrusted", "the planner, not the migration, decides the next outcome");
assert.equal(planFor(2).planned_at, "2026-11-01T10:00:00Z", "closed issue history is unchanged");
assert.equal(planFor(3).planned_at, "2026-11-01T10:00:00Z", "a different trusted title is unchanged");
assert.equal(planFor(4).planned_at, "2026-11-01T10:00:00Z", "a different source is unchanged");
assert.equal(planFor(5).planned_at, "2026-11-01T10:00:00Z", "a non-untrusted verdict is unchanged");

const control = db.prepare("SELECT alternate_path, evidence FROM control_registry WHERE control = 'code-merge-trusted-sources'").get();
assert.equal(control.alternate_path, "none needed");
assert.match(control.evidence, /ALTERNATE-NOT-EXERCISABLE/);
assert.equal(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'issue-age-repair-untrusted'").get().n, 1);
const detector = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-issue-age-repair-untrusted'").get().verify_probe;
assert.equal(db.prepare(detector).get().observed, "0", "the detector passes after matching verdicts are re-armed");
assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'ISSUE-AGE-REPAIR-TRUST-1:%'").get().n, 1);

const snapshot = () => JSON.stringify({
  config: db.prepare("SELECT key, value, note, updated_at FROM ops_config ORDER BY key").all(),
  plans: db.prepare("SELECT * FROM issue_plans ORDER BY issue_id").all(),
  control: db.prepare("SELECT * FROM control_registry").all(),
  failure: db.prepare("SELECT * FROM failure_modes").all(),
  contract: db.prepare("SELECT * FROM remediation_contracts").all(),
  decisions: db.prepare("SELECT * FROM decision_log").all()
});
const first = snapshot();
db.exec(migration);
assert.equal(snapshot(), first, "reapplying the migration is idempotent");

const rollback = migration.match(/^-- Rollback: (.*)$/m)?.[1];
assert.ok(rollback, "the migration has a rollback");
for (const statement of rollback.split(/;\s*/).filter(Boolean)) db.exec(statement);
assert.equal(config(), trustedList, "rollback removes only the newly added prefix");
assert.equal(planFor(1).planned_at, "2026-11-01T10:00:00Z", "rollback restores the original plan timestamp");
assert.equal(planFor(1).detail, "source qnfo-fleet-control is not trusted", "rollback restores the original plan detail");
assert.equal(db.prepare("SELECT alternate_path FROM control_registry WHERE control = 'code-merge-trusted-sources'").get().alternate_path, "session PR through the stale-PR lane");
assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'ISSUE-AGE-REPAIR-TRUST-1:%'").get().n, 1, "the decision log remains append-only");

console.log("issue-age-repair-trust: all passed");
db.close();

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./2026-11-01-metric-cause-registration-guard.sql", import.meta.url), "utf8");
const body = migration.split("\n").filter((line) => !line.startsWith("--")).join("\n");
const rollback = migration.match(/^-- Rollback: (.+)$/m)?.[1];
const expectedMappings = {
  guard_rcs: "code-loop",
  ask_p95_total_ms_7d: "code-loop",
  program_focus_without_doer: "issue-backlog",
  compat_date_age_days_max: "structure",
  agent_tool_calls_outside_allowlist: "structure",
  fleet_quality_change_7d: "structure",
  plus_debt_oldest_weeks: "structure",
  product_plus_rate_7d: "structure",
  plus_keep_rate_30d: "structure",
};

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE metric_registry (metric TEXT PRIMARY KEY);
    CREATE TABLE metric_authorship (metric TEXT PRIMARY KEY, authored_at TEXT NOT NULL);
    CREATE TABLE metric_breach_cause (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL, note TEXT);
    CREATE TABLE failure_modes (
      fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL,
      detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT,
      symptom TEXT, blast_radius TEXT
    );
    CREATE TABLE remediation_contracts (
      class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT NOT NULL,
      verify_transport TEXT NOT NULL, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER,
      status TEXT, module TEXT, next_due_at TEXT
    );
    CREATE TABLE decision_log (
      id INTEGER PRIMARY KEY, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT,
      rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT
    );
    INSERT INTO metric_registry VALUES ('old_metric'), ('unmapped_legacy'), ('plus_debt_oldest_weeks');
    INSERT INTO metric_authorship VALUES
      ('old_metric', '2026-10-28T23:59:59Z'),
      ('unmapped_legacy', '2026-10-28T23:59:59Z'),
      ('plus_debt_oldest_weeks', '2026-10-29T12:29:00Z');
    INSERT INTO metric_breach_cause VALUES ('old_metric', 'structure', 'existing cause');
    INSERT INTO metric_breach_cause VALUES ('unrelated', 'code-loop', 'unrelated row');
  `);
  return db;
}

test("migration maps observed cause gaps and installs a registration detector", () => {
  assert.match(migration, /^-- APPLY-BY: ci$/m);
  assert.match(migration, /^-- DB: qnfo-audit$/m);
  assert.ok(rollback);

  const db = database();
  try {
    db.exec(body);
    db.exec(body);

    const mapped = db.prepare("SELECT metric_key, cause_key FROM metric_breach_cause WHERE note LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01:%' ORDER BY metric_key").all();
    assert.deepEqual(Object.fromEntries(mapped.map(({ metric_key, cause_key }) => [metric_key, cause_key])), expectedMappings);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'metric-cause-registration-missing'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'fm-metric-cause-registration-missing'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 detector:%'").get().n, 1);

    const probe = db.prepare("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-metric-cause-registration-missing'").get().verify_probe;
    const result = () => ({ ...db.prepare(probe).get() });
    assert.deepEqual(result(), { expected: "0", observed: "0" }, "legacy unmapped metrics before the registration cutoff are excluded");

    db.exec("INSERT INTO metric_registry VALUES ('new_metric'); INSERT INTO metric_authorship VALUES ('new_metric', '2026-11-01T10:00:00Z')");
    assert.deepEqual(result(), { expected: "0", observed: "1" }, "the detector fails for an active registration without a cause");
    db.exec("INSERT INTO metric_breach_cause VALUES ('new_metric', 'structure', 'mapped at registration')");
    assert.deepEqual(result(), { expected: "0", observed: "0" }, "the detector passes after the missing cause is recorded");

    db.exec(rollback);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM metric_breach_cause WHERE note LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01:%'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM remediation_contracts WHERE class = 'fm-metric-cause-registration-missing'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM failure_modes WHERE fm_key = 'metric-cause-registration-missing'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM metric_breach_cause WHERE metric_key = 'unrelated'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 detector:%'").get().n, 1);
  } finally {
    db.close();
  }
});

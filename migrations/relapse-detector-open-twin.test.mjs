import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./2026-11-01-relapse-detector-open-twin.sql", import.meta.url), "utf8");
const rollback = migration.match(/^-- Rollback: (.*)$/m)?.[1];
assert.ok(rollback);
assert.match(migration, /^-- APPLY-BY: ci$/m);
assert.match(migration, /^-- DB: qnfo-audit$/m);
assert.match(migration, /^-- BACKUP: bak_20261101_relapse_detector_open_twin$/m);

const originalProbe = "SELECT '0' AS expected, CAST(1 AS TEXT) AS observed";
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE remediation_contracts (
    class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT,
    verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER,
    status TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER
  );
  CREATE TABLE failure_modes (
    fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT,
    probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT
  );
  CREATE TABLE decision_log (
    actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT,
    rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT
  );
  CREATE TABLE relapse_candidates (issue_id INTEGER, twin_issue_id INTEGER);
  CREATE VIEW v_closure_relapses AS
    SELECT issue_id, twin_issue_id FROM relapse_candidates;
`);
db.prepare("INSERT INTO remediation_contracts (class, verify_probe) VALUES ('fm-closure-relapse-unreopened', ?)").run(originalProbe);
db.exec("INSERT INTO relapse_candidates VALUES (100461, 1000942)");

const run = (sql) => ({ ...db.prepare(sql).get() });
const detectorProbe = () => run("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-closure-relapse-unreopened'").verify_probe;

db.exec(migration);
const correctedProbe = detectorProbe();
assert.match(correctedProbe, /FROM v_closure_relapses WHERE twin_issue_id IS NULL/);
assert.deepEqual(run(correctedProbe), { expected: "0", observed: "0" }, "an open twin is not counted as an unreopened relapse");

db.exec("INSERT INTO relapse_candidates VALUES (100462, NULL)");
assert.deepEqual(run(correctedProbe), { expected: "0", observed: "1" }, "a relapse with no open twin remains visible");
db.exec("DELETE FROM relapse_candidates WHERE issue_id = 100462");

const detector = run("SELECT verify_probe FROM remediation_contracts WHERE class = 'fm-relapse-detector-open-twin'").verify_probe;
assert.deepEqual(run(detector), { expected: "1", observed: "1" }, "the new detector guards the view alignment");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'relapse-detector-open-twin'").get().n, 1);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1);
const backup = db.prepare("SELECT verify_probe FROM bak_20261101_relapse_detector_open_twin WHERE class = 'fm-closure-relapse-unreopened'").get();
assert.equal(backup.verify_probe, originalProbe);

const snapshot = () => JSON.stringify({
  contract: db.prepare("SELECT class, verify_probe FROM remediation_contracts ORDER BY class").all(),
  modes: db.prepare("SELECT fm_key, probe_class FROM failure_modes ORDER BY fm_key").all(),
  decisions: db.prepare("SELECT action FROM decision_log").all(),
  backup: db.prepare("SELECT class, verify_probe FROM bak_20261101_relapse_detector_open_twin").all(),
});
const firstApply = snapshot();
db.exec(migration);
assert.equal(snapshot(), firstApply, "reapplying the migration is idempotent");

db.exec(rollback);
assert.equal(detectorProbe(), originalProbe, "rollback restores the original detector");
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM remediation_contracts WHERE class = 'fm-relapse-detector-open-twin'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM failure_modes WHERE fm_key = 'relapse-detector-open-twin'").get().n, 0);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "rollback keeps the decision log append-only");

db.close();
console.log("relapse-detector-open-twin: all passed");

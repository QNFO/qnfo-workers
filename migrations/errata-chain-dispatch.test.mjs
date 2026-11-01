// ERRATA-CHAIN-DISPATCH-1: replay the real migration and rollback without changing errata or closing issues.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const sql = readFileSync(new URL("./2026-10-30-errata-chain-dispatch.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE fleet_issue_dispatch (fingerprint TEXT PRIMARY KEY, state TEXT, exec_state TEXT, exec_ts TEXT, exec_result TEXT, exec_attempts INTEGER);
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT);
  CREATE TABLE decision_log (actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
  INSERT INTO fleet_issue_dispatch VALUES ('iss-f3457a77','queued','no-action','old','no safe producer',3), ('unrelated','queued','no-action','old','leave alone',2);
`);
const get = () => db.prepare("SELECT * FROM fleet_issue_dispatch WHERE fingerprint='iss-f3457a77'").get();
const before = get();
db.exec(sql);
assert.equal(get().exec_state, null);
assert.equal(get().exec_attempts, 0);
assert.equal(get().state, "queued");
assert.equal(db.prepare("SELECT exec_state FROM fleet_issue_dispatch WHERE fingerprint='unrelated'").get().exec_state, "no-action");
const probe = db.prepare("SELECT verify_probe FROM remediation_contracts").get().verify_probe;
assert.equal(db.prepare(probe).get().observed, "0");
db.exec("UPDATE fleet_issue_dispatch SET exec_state='needs-human' WHERE fingerprint='iss-f3457a77'");
assert.equal(db.prepare(probe).get().observed, "1");
db.exec(sql);
assert.equal(get().exec_state, null, "legacy needs-human receipts are also retryable");
db.exec("UPDATE fleet_issue_dispatch SET exec_state='executed', exec_attempts=1 WHERE fingerprint='iss-f3457a77'");
db.exec(sql);
assert.equal(get().exec_state, "executed", "replay never requeues an executed action");
assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n, 1);
db.exec(/^-- Rollback: (.*)$/m.exec(sql)[1]);
assert.deepEqual(get(), before);
assert.equal(db.prepare("SELECT COUNT(*) n FROM remediation_contracts").get().n, 0);
db.close();
console.log("ERRATA-CHAIN-DISPATCH-1: targeted requeue, detector, replay and rollback passed");

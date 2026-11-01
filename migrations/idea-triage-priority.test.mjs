// IDEA-TRIAGE-PRIORITY-1: detect stale actionable intake, not cooling rows or a consumer making progress.
// Run: node migrations/idea-triage-priority.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const sql = readFileSync(new URL("2026-10-30-idea-triage-priority.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, next_due_at TEXT);
CREATE TABLE decision_log (actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE idea_proposals (status TEXT, rationale TEXT, created_at TEXT, triaged_at TEXT);
`);
db.exec(sql);
db.exec(sql);
for (const table of ["failure_modes", "remediation_contracts", "decision_log"]) {
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 1, `${table} registration is idempotent`);
}
const contract = db.prepare("SELECT * FROM remediation_contracts").get();
assert.equal(contract.verify_transport, "d1-query");
assert.equal(contract.status, "active");
assert.equal(contract.escalate_to, "qnfo-fleet-control");
const read = () => db.prepare(contract.verify_probe).get().observed;
const add = db.prepare("INSERT INTO idea_proposals VALUES (?, ?, ?, ?)");
const ago = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
assert.equal(read(), "0", "an empty queue needs no consumer progress");
add.run("new", null, ago(119), null);
assert.equal(read(), "0", "fresh proposals are not stale");
add.run("new", null, ago(121), null);
assert.equal(read(), "1", "stale intake without triage progress recurs");
add.run("triaged_hold", "noise", ago(200), ago(119));
assert.equal(read(), "0", "a real completed triage counts as progress");
db.exec("DELETE FROM idea_proposals WHERE status='triaged_hold'");
add.run("triaged_accepted", "accepted", ago(200), ago(121));
assert.equal(read(), "1", "old consumer progress does not hide a stall");
add.run("new", "[scoring-error 3 retrying]", ago(200), ago(1));
assert.equal(read(), "1", "a scoring retry is not completed triage");
db.exec("DELETE FROM idea_proposals WHERE rationale IS NULL");
assert.equal(read(), "0", "cooling rows alone are not actionable backlog");
add.run("deferred_budget", null, ago(121), null);
assert.equal(read(), "1", "legacy budget-deferred intake still needs triage");
add.run("deferred_diversity", "accepted, waiting for diversity", ago(200), ago(1));
assert.equal(read(), "0", "a scored diversity hold is completed triage");
db.exec("DELETE FROM idea_proposals WHERE status='deferred_diversity'");
db.exec("INSERT INTO idea_proposals VALUES ('triaged_accepted','ok',datetime('now','-200 minutes'),datetime('now','-1 minute'))");
assert.equal(read(), "0", "SQLite timestamps count alongside ISO timestamps");
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
db.exec(rollback);
assert.equal(db.prepare("SELECT status FROM remediation_contracts").get().status, "retired");
assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n, 1, "rollback preserves decision history");
console.log("triage starvation detector checks passed");

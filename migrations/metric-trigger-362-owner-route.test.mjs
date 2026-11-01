import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("./2026-11-01-metric-trigger-362-owner-route.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
  CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, owner TEXT, triage_state TEXT, close_evidence TEXT);
  CREATE TABLE service_registry (service TEXT PRIMARY KEY, state TEXT);
  INSERT INTO agent_issues VALUES (1798, 'METRIC-TRIGGER-362-OPEN-AGENT-ISSUES: Autonomy gap', 'open');
  INSERT INTO issue_triage VALUES (1798, 'qnfo-kaizen', 'triaged', 'keep the metric recovery probe');
  INSERT INTO service_registry VALUES ('qnfo-fleet-control', 'live');
`);

const owner = () => db.prepare("SELECT owner FROM issue_triage WHERE issue_id=1798").get().owner;
db.exec(migration);
assert.equal(owner(), "qnfo-fleet-control", "the open trigger issue is routed from the retired owner to its live metric owner");
assert.equal(db.prepare("SELECT status FROM agent_issues WHERE id=1798").get().status, "open", "a live metric breach is not closed");
assert.equal(db.prepare("SELECT triage_state FROM issue_triage WHERE issue_id=1798").get().triage_state, "triaged", "routing preserves triage state");
assert.equal(db.prepare("SELECT owner FROM bak_20261101_metric_trigger_362_owner WHERE issue_id=1798").get().owner, "qnfo-kaizen");

db.exec(migration);
assert.equal(owner(), "qnfo-fleet-control", "migration reapplication is idempotent");
db.exec(migration.match(/^-- Rollback: (.+)$/m)[1]);
assert.equal(owner(), "qnfo-kaizen", "rollback restores the original owner");

db.prepare("UPDATE agent_issues SET status='closed' WHERE id=1798").run();
db.exec(migration);
assert.equal(owner(), "qnfo-kaizen", "a closed issue is not reassigned");

db.close();
console.log("METRIC-TRIGGER-362 owner-route checks passed");

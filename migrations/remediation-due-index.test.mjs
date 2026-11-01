import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("./2026-11-01-remediation-due-index.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE remediation_contracts (
    class TEXT, issue_id INTEGER, verify_probe TEXT, verify_transport TEXT,
    expected_cadence_h INTEGER, max_attempts INTEGER, status TEXT,
    next_due_at TEXT, ts TEXT
  );
  CREATE TABLE agent_issues (
    id INTEGER PRIMARY KEY, status TEXT, updated_at TEXT, title TEXT
  );
  CREATE TABLE decision_log (
    id INTEGER PRIMARY KEY, actor TEXT, assumption TEXT, action TEXT, evidence TEXT,
    outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT,
    predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT
  );
`);

const query = `
  SELECT c.class, c.issue_id, c.verify_probe, c.verify_transport,
         c.expected_cadence_h, c.max_attempts, c.status AS contract_status,
         a.status AS issue_status, a.updated_at AS issue_updated_at,
         (SELECT COUNT(*) FROM agent_issues o
           JOIN remediation_contracts tc ON tc.issue_id = o.id AND tc.status IN ('active', 'holding')
          WHERE o.status = 'open' AND o.id <> COALESCE(c.issue_id, -1)
            AND lower(trim(o.title)) = lower(trim(COALESCE(a.title, char(1))))) AS carrying_twin
    FROM remediation_contracts c LEFT JOIN agent_issues a ON a.id = c.issue_id
   WHERE c.status IN ('active', 'holding')
     AND c.verify_transport IN ('d1-query', 'd1-query@portfolio-state', 'external-https')
     AND (c.next_due_at IS NULL OR datetime(c.next_due_at) <= datetime('now'))
   ORDER BY COALESCE(c.next_due_at, c.ts) LIMIT 150
`;
const plan = () => db.prepare("EXPLAIN QUERY PLAN " + query).all().map((row) => row.detail).join(" ");

assert.match(plan(), /USE TEMP B-TREE FOR ORDER BY/, "the fixture reproduces the unindexed sort");
db.exec(migration);
assert.match(plan(), /idx_rc_active_due_transport/, "the due-contract query uses the new index");
assert.doesNotMatch(plan(), /USE TEMP B-TREE FOR ORDER BY/, "the due-contract query no longer needs a temporary sort");

db.exec(migration);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "migration reruns do not duplicate the decision");

const rollback = /^-- Rollback: (.*)$/m.exec(migration)?.[1];
assert.ok(rollback, "migration declares a rollback");
db.exec(rollback);
assert.equal(
  db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name = 'idx_rc_active_due_transport'").get().n,
  0,
  "rollback removes the index"
);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "rollback preserves the append-only decision");

console.log("7 passed, 0 failed");

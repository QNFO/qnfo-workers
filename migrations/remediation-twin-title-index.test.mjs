import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("./2026-11-01-remediation-twin-title-index.sql", import.meta.url), "utf8");
const worker = readFileSync(new URL("../qnfo-fleet-control/worker.js", import.meta.url), "utf8");
const query = worker.match(/db\.prepare\("(SELECT c\.class.*?LIMIT 150)"\)\.all\(\)/)?.[1];
assert.ok(query, "the current worker due-contract query is available");

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
  CREATE INDEX idx_rc_issue_status ON remediation_contracts(issue_id, status);
  INSERT INTO agent_issues VALUES
    (1, 'closed', '2026-11-01', 'Example title'),
    (2, 'open', '2026-11-01', ' example TITLE '),
    (3, 'closed', '2026-11-01', 'No twin'),
    (4, 'open', '2026-11-01', 'No twin');
  INSERT INTO remediation_contracts VALUES
    ('closed-contract', 1, '', 'd1-query', 1, 3, 'active', NULL, '2026-11-01'),
    ('twin-contract', 2, '', 'd1-query', 1, 3, 'active', NULL, '2026-11-01'),
    ('no-twin-contract', 3, '', 'd1-query', 1, 3, 'active', NULL, '2026-11-01'),
    ('inactive-twin-contract', 4, '', 'd1-query', 1, 3, 'superseded', NULL, '2026-11-01');
`);

const plan = () => db.prepare("EXPLAIN QUERY PLAN " + query).all().map((row) => row.detail).join(" ");
assert.match(plan(), /SCAN o/, "the fixture reproduces the unindexed open-issue scan");

db.exec(migration);
assert.match(plan(), /SEARCH o USING INDEX idx_agent_issues_open_title_normalized/, "the twin lookup uses the normalized-title index");
assert.doesNotMatch(plan(), /SCAN o/, "the twin lookup no longer scans open issues");

const rows = new Map(db.prepare(query).all().map((row) => [row.class, row.carrying_twin]));
assert.equal(rows.get("closed-contract"), 1, "an open issue with a live contract matches after title normalization");
assert.equal(rows.get("twin-contract"), 0, "an issue does not carry itself");
assert.equal(rows.get("no-twin-contract"), 0, "an open issue without a live contract is not a twin");

db.exec(migration);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "migration reruns do not duplicate the decision");

const rollback = /^-- Rollback: (.*)$/m.exec(migration)?.[1];
assert.ok(rollback, "migration declares a rollback");
db.exec(rollback);
assert.equal(
  db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name = 'idx_agent_issues_open_title_normalized'").get().n,
  0,
  "rollback removes the index"
);
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "rollback preserves the append-only decision");

console.log("11 passed, 0 failed");

import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("./2026-11-01-agent-ws-blocker-refresh.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE agent_issues (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    description TEXT NOT NULL,
    updated_at INTEGER
  );
  CREATE TABLE control_registry (
    control TEXT PRIMARY KEY,
    disposition TEXT NOT NULL,
    disposition_state TEXT NOT NULL,
    evidence TEXT NOT NULL,
    reviewed_at TEXT NOT NULL
  );
  CREATE TABLE decision_log (
    id INTEGER PRIMARY KEY,
    actor TEXT NOT NULL,
    assumption TEXT NOT NULL,
    action TEXT NOT NULL,
    evidence TEXT NOT NULL,
    outcome TEXT NOT NULL,
    blast_radius TEXT NOT NULL,
    rollback_path TEXT NOT NULL,
    capability_gain TEXT,
    predicted_outcome TEXT,
    reach_gain TEXT,
    surfaces_tested TEXT
  );
  CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN
    SELECT RAISE(ABORT, 'decision_log is append-only');
  END;
  CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN
    SELECT RAISE(ABORT, 'decision_log is append-only');
  END;
  INSERT INTO agent_issues (id, title, status, priority, description, updated_at)
    VALUES (1000140, 'AGENT-WS-REACTIVATION-1', 'open', 'critical', 'Existing blocker evidence', 1);
  INSERT INTO control_registry (control, disposition, disposition_state, evidence, reviewed_at)
    VALUES ('agent-ws-reactivation-prerequisites', 'keep', 'applied', 'Previous live evidence', '2026-11-01T20:01:03Z');
`);

test("the refresh records current evidence without closing or activating the worker", () => {
  assert.match(sql, /^-- APPLY-BY: ci$/m);
  assert.match(sql, /^-- DB: qnfo-audit$/m);
  assert.match(sql, /^-- Rollback: .+/m);

  db.exec(sql);
  const issue = db.prepare("SELECT status, priority, description FROM agent_issues WHERE id = 1000140").get();
  const control = db.prepare("SELECT disposition, disposition_state, evidence FROM control_registry WHERE control = 'agent-ws-reactivation-prerequisites'").get();
  assert.equal(issue.status, "open");
  assert.equal(issue.priority, "critical");
  assert.match(issue.description, /39 scripts/);
  assert.match(issue.description, /worker_count was 39/);
  assert.match(issue.description, /no dependency-safe same-class retirement was evidenced/i);
  assert.equal(control.disposition, "keep");
  assert.equal(control.disposition_state, "applied");
  assert.match(control.evidence, /39 Workers against the hard cap of 30/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM decision_log").get().count, 1);

  db.exec(sql);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM agent_issues WHERE id = 1000140 AND instr(description, 'AGENT-WS-REACTIVATION-BLOCKER-1') > 0").get().count,
    1,
  );
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM decision_log").get().count, 1);
});

test("rollback removes only the appended evidence and leaves the decision ledger intact", () => {
  const rollback = sql.match(/^-- Rollback: (.+)$/m)?.[1];
  assert.ok(rollback);
  db.exec(rollback);

  const issue = db.prepare("SELECT status, priority, description FROM agent_issues WHERE id = 1000140").get();
  const control = db.prepare("SELECT disposition, disposition_state, evidence, reviewed_at FROM control_registry WHERE control = 'agent-ws-reactivation-prerequisites'").get();
  assert.equal(issue.status, "open");
  assert.equal(issue.priority, "critical");
  assert.equal(issue.description, "Existing blocker evidence");
  assert.equal(control.disposition, "keep");
  assert.equal(control.disposition_state, "applied");
  assert.equal(control.evidence, "Previous live evidence");
  assert.equal(control.reviewed_at, "2026-11-01T20:01:03Z");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM decision_log").get().count, 1);
});

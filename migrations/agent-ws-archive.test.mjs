import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("./2026-11-01-agent-ws-archive.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE roadmap_implementation (
    id INTEGER PRIMARY KEY,
    item TEXT NOT NULL,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    evidence TEXT,
    verified_at TEXT
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
  INSERT INTO roadmap_implementation
    (id, item, source, status, evidence, verified_at)
  VALUES (121, 'RM-AGENT-WS-DECISION-1', 'master backlog v2 s2.5', 'owner-decision', 'backlog mining', NULL);
`);

test("archive migration verifies the authoritative roadmap item with live evidence", () => {
  assert.match(sql, /^-- APPLY-BY: ci$/m);
  assert.match(sql, /^-- DB: qnfo-audit$/m);
  assert.match(sql, /^-- Rollback: .+/m);

  db.exec(sql);
  const row = db.prepare("SELECT status, evidence, verified_at FROM roadmap_implementation WHERE id = 121").get();
  assert.equal(row.status, "verified");
  assert.match(row.evidence, /script search returned no qnfo-agent-ws script/);
  assert.match(row.evidence, /worker_count was 39 against the hard cap of 30/);
  assert.ok(row.verified_at);

  db.exec(sql);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM decision_log").get().count, 1);
});

test("archive migration rollback restores the original roadmap state", () => {
  const rollback = sql.match(/^-- Rollback: (.+)$/m)?.[1];
  assert.ok(rollback);
  db.exec(rollback);
  const row = db.prepare("SELECT status, evidence, verified_at FROM roadmap_implementation WHERE id = 121").get();
  assert.deepEqual(Object.fromEntries(Object.entries(row)), {
    status: "owner-decision",
    evidence: "backlog mining",
    verified_at: null
  });
});

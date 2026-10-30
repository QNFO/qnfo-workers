import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./2026-10-30-structure-numbering-revisions.sql", import.meta.url), "utf8");
test("incident revisions queue once, preserve existing ownership and never mutate published papers", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE research_queue (
      id TEXT PRIMARY KEY, source TEXT, source_id TEXT UNIQUE, idea TEXT, summary TEXT,
      score REAL, decision TEXT, status TEXT, paper_slug TEXT, created_at TEXT, stage TEXT,
      attempt INTEGER DEFAULT 0, revise_count INTEGER, recover_count INTEGER);
      INSERT INTO research_queue (id, source, source_id, status, paper_slug, stage)
      VALUES ('busy', 'remediation', 'existing', 'researching', 'quniverse-fleet-lessons', 'revise');`);
    db.exec(sql);
    db.exec(sql);
    const rows = db.prepare("SELECT * FROM research_queue WHERE id <> 'busy'").all();
    assert.equal(rows.length, 7);
    assert.ok(rows.every((r) => r.status === "queued" && r.stage === "ground" && r.source_id.startsWith("revision:") && r.attempt === 0 && r.idea.includes("STRUCTURE-NUMBERING-1")));
    assert.equal(db.prepare("SELECT stage FROM research_queue WHERE id = 'busy'").get().stage, "revise");
    db.exec("UPDATE research_queue SET status = 'researching', attempt = 1 WHERE id = 'rem-structure-ontological-re-entry-what-can-we-say-exists'");
    db.exec(sql.match(/^-- Rollback: (.+)$/m)[1]);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM research_queue").get().n, 2);
    assert.doesNotMatch(sql.split("\n").filter((line) => !line.startsWith("--")).join("\n"), /\b(?:UPDATE|DELETE\s+FROM)\s+papers\b/i);
  } finally { db.close(); }
});

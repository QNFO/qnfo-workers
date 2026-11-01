import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./2026-11-01-plussing-4a-cause.sql", import.meta.url), "utf8");
const body = migration.split("\n").filter((line) => !line.startsWith("--")).join("\n");
const rollback = migration.match(/^-- Rollback: (.+)$/m)?.[1];
const expected = {
  plus_shipped_7d: "structure",
  plus_kept_share_30d: "structure",
};

test("PLUSSING-4 metrics receive structure causes with an isolated rollback", () => {
  assert.match(migration, /^-- APPLY-BY: ci$/m);
  assert.match(migration, /^-- DB: qnfo-audit$/m);
  assert.ok(rollback);

  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE metric_breach_cause (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL, note TEXT);
      CREATE TABLE decision_log (
        id INTEGER PRIMARY KEY, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT,
        blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT,
        surfaces_tested TEXT
      );
      INSERT INTO metric_breach_cause VALUES ('unrelated_metric', 'code-loop', 'existing mapping');
    `);

    db.exec(body);
    db.exec(body);
    const mapped = db.prepare("SELECT metric_key, cause_key FROM metric_breach_cause WHERE note LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01-plussing-4:%' ORDER BY metric_key").all();
    assert.deepEqual(Object.fromEntries(mapped.map(({ metric_key, cause_key }) => [metric_key, cause_key])), expected);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n, 1, "the decision is recorded once");

    db.exec(rollback);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM metric_breach_cause WHERE note LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01-plussing-4:%'").get().n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM metric_breach_cause WHERE metric_key = 'unrelated_metric'").get().n, 1);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n, 1, "rollback preserves the append-only decision");
  } finally {
    db.close();
  }
});

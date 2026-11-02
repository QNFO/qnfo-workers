import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./2026-11-02-plussing-7-fix-first.sql", import.meta.url), "utf8");
const body = migration.split("\n").filter((line) => !line.startsWith("--")).join("\n");
const rollback = migration.match(/^-- Rollback: (.+)$/m)?.[1];

test("PLUSSING-7 queues failed-plus repairs before new plus research and rolls back cleanly", () => {
  assert.match(migration, /^-- APPLY-BY: ci$/m);
  assert.match(migration, /^-- DB: qnfo-audit$/m);
  assert.match(migration, /^-- BACKUP: bak_20261102_plussing_7_workflow$/m);
  assert.ok(rollback);

  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, definition TEXT NOT NULL, version INTEGER, updated_at TEXT);
      CREATE TABLE decision_log (
        id INTEGER PRIMARY KEY, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT,
        blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT,
        surfaces_tested TEXT
      );
    `);
    const originalSteps = [
      "pl-research",
      "pl-ledger",
      "pl-sync",
      "pl-outcome-baseline",
      "pl-outcome-review",
      "pl-outcome-result",
      "pl-revert-request",
      "pl-revert-sync",
      "pl-revert-sync-check",
      "pl-shipped-metric",
    ].map((name) => ({ type: "sql", name, db: "AUDIT", sql: `SELECT '${name}'` }));
    db.prepare("INSERT INTO fleet_tasks (id, definition, version) VALUES (?, ?, ?)").run(
      "management-personas",
      JSON.stringify({ steps: originalSteps }),
      1,
    );

    db.exec(body);
    const definition = () => JSON.parse(db.prepare("SELECT definition FROM fleet_tasks").get().definition);
    const steps = definition().steps;
    const names = steps.map(({ name }) => name);
    assert.ok(names.indexOf("pl-revert-request") < names.indexOf("pl-research"));
    assert.ok(names.indexOf("pl-revert-sync-check") < names.indexOf("pl-research"));

    const version = db.prepare("SELECT version FROM fleet_tasks").get().version;
    db.exec(body);
    assert.equal(db.prepare("SELECT version FROM fleet_tasks").get().version, version, "replay does not reorder or bump twice");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "the decision is recorded once");

    db.exec(rollback);
    assert.deepEqual(definition().steps, originalSteps);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, 1, "rollback preserves the append-only decision");
  } finally {
    db.close();
  }
});

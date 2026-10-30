import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const original = readFileSync(new URL("./2026-10-29-finops-digest.sql", import.meta.url), "utf8");
const migration = readFileSync(new URL("./2026-10-30-finops-digest-upsert.sql", import.meta.url), "utf8");
const upsert = `INSERT INTO ai_spend_ledger (day, provider, caller, model, calls, usd, downgraded)
VALUES (?, 'workers-ai', ?, ?, ?, ?, ?)
ON CONFLICT(day, provider, caller, model) DO UPDATE SET calls = calls + excluded.calls, usd = usd + excluded.usd, downgraded = downgraded + excluded.downgraded`;
function world() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE ai_spend_ledger (day TEXT NOT NULL, provider TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, usd REAL DEFAULT 0, downgraded INTEGER DEFAULT 0, PRIMARY KEY(day, provider, caller, model));
    CREATE TABLE agent_actions (target TEXT, ts TEXT);`);
  db.exec(original);
  return db;
}
const totals = (db, caller = "qnfo-ai") => ({ ...db.prepare("SELECT calls, usd, downgraded FROM finops_digest WHERE caller = ? AND week = strftime('%Y-W%W', '2026-10-30')").get(caller) });

test("reproduces the original outer UPSERT / trigger OR REPLACE conflict", () => {
  const db = world();
  try {
    db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m1", 1, 0.1, 0);
    assert.throws(() => db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m1", 1, 0.1, 0), /UNIQUE constraint failed: finops_digest/);
  } finally { db.close(); }
});

test("explicit trigger UPSERT handles existing calls, new model rows and new day rows", () => {
  const db = world();
  try {
    db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m1", 1, 0.1, 0);
    db.exec(migration);
    db.exec(migration);
    db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m1", 2, 0.2, 1);
    db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m2", 3, 0.3, 2);
    db.prepare(upsert).run("2026-10-29", "qnfo-ai", "m1", 4, 0.4, 1);
    const result = totals(db);
    assert.equal(result.calls, 10);
    assert.ok(Math.abs(result.usd - 1) < 1e-10);
    assert.equal(result.downgraded, 4);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM bak_20261030_finops_triggers").get().n, 2);
  } finally { db.close(); }
});

test("moving or deleting a ledger row reconciles old groups without corrupting other callers", () => {
  const db = world();
  try {
    db.exec(migration);
    db.prepare(upsert).run("2026-10-30", "qnfo-ai", "m1", 2, 0.2, 1);
    db.prepare(upsert).run("2026-10-30", "qnfo-ai-search", "m1", 3, 0.3, 0);
    db.exec("UPDATE ai_spend_ledger SET caller = 'qnfo-ai-moved', day = '2026-11-06' WHERE caller = 'qnfo-ai'");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM finops_digest WHERE caller = 'qnfo-ai' AND week = strftime('%Y-W%W', '2026-10-30')").get().n, 1, "the emptied group keeps one zero-valued row");
    assert.deepEqual(totals(db), { calls: 0, usd: 0, downgraded: 0 });
    assert.equal(db.prepare("SELECT calls FROM finops_digest WHERE caller = 'qnfo-ai-moved'").get().calls, 2);
    db.exec("DELETE FROM ai_spend_ledger WHERE caller = 'qnfo-ai-moved'");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM finops_digest WHERE caller = 'qnfo-ai-moved' AND week = strftime('%Y-W%W', '2026-11-06')").get().n, 1, "the group emptied by a delete keeps one zero-valued row");
    assert.equal(db.prepare("SELECT calls FROM finops_digest WHERE caller = 'qnfo-ai-moved'").get().calls, 0);
    assert.equal(totals(db, "qnfo-ai-search").calls, 3);
    assert.doesNotThrow(() => db.exec(migration.match(/^-- Rollback: (.+)$/m)[1]));
  } finally { db.close(); }
});

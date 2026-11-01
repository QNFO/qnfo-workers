import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./2026-11-01-errata-confirm-default-20.sql", import.meta.url), "utf8");
const rollback = sql.match(/^-- Rollback: (.+)$/m)?.[1];

function database(value) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE ops_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      note TEXT,
      updated_at TEXT
    );
  `);
  db.prepare("INSERT INTO ops_config (key, value) VALUES ('errata_confirm_max', ?)").run(value);
  return db;
}

test("rolls the seeded default from 12 to 20, idempotently and with rollback", () => {
  assert.match(sql, /^-- APPLY-BY: ci$/m);
  assert.match(sql, /^-- DB: qnfo-audit$/m);
  assert.ok(rollback);
  const db = database("12");

  db.exec(sql);
  assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = 'errata_confirm_max'").get().value, "20");
  db.exec(sql);
  assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = 'errata_confirm_max'").get().value, "20");

  db.exec(rollback);
  assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = 'errata_confirm_max'").get().value, "12");
});

test("preserves an explicitly configured confirmation batch", () => {
  const db = database("30");
  db.exec(sql);
  assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = 'errata_confirm_max'").get().value, "30");
});

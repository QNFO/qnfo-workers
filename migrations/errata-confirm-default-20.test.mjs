import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./2026-11-01-errata-confirm-default-20.sql", import.meta.url), "utf8");
const rollback = sql.match(/^-- Rollback: (.+)$/m)?.[1];

function database(value, note = "configured value") {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE ops_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      note TEXT,
      updated_at TEXT
    );
  `);
  db.prepare("INSERT INTO ops_config (key, value, note) VALUES ('errata_confirm_max', ?, ?)").run(value, note);
  return db;
}

test("rolls the seeded default from 12 to 20, idempotently and with rollback", () => {
  assert.match(sql, /^-- APPLY-BY: ci$/m);
  assert.match(sql, /^-- DB: qnfo-audit$/m);
  assert.ok(rollback);
  const originalNote = "BREACH-SELFHEAL-1 / ERRATA-CONFIRM-COST-1: original configured default";
  const db = database("12", originalNote);

  db.exec(sql);
  assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = 'errata_confirm_max'").get().value, "20");
  assert.match(db.prepare("SELECT note FROM ops_config WHERE key = 'errata_confirm_max'").get().note, /^ERRATA-CONFIRM-COST-2: default 20 rows; /);
  db.exec(sql);
  assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = 'errata_confirm_max'").get().value, "20");

  db.exec(rollback);
  assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = 'errata_confirm_max'").get().value, "12");
  assert.equal(db.prepare("SELECT note FROM ops_config WHERE key = 'errata_confirm_max'").get().note, originalNote);
});

test("preserves an explicitly configured confirmation batch", () => {
  const db = database("30");
  db.exec(sql);
  assert.equal(db.prepare("SELECT value FROM ops_config WHERE key = 'errata_confirm_max'").get().value, "30");
});

test("preserves a budget-tuned value of 12", () => {
  const note = "BREACH-SELFHEAL-1 lowered at runtime because the research budget was spent";
  const db = database("12", note);
  db.exec(sql);
  assert.equal(db.prepare("SELECT value, note FROM ops_config WHERE key = 'errata_confirm_max'").get().value, "12");
  assert.equal(db.prepare("SELECT note FROM ops_config WHERE key = 'errata_confirm_max'").get().note, note);
});

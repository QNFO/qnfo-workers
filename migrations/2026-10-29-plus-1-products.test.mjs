import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./2026-10-29-plus-1-products.sql", import.meta.url), "utf8");

test("product plus registry does not replace the existing products catalog", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE products (
        slug TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        surface TEXT NOT NULL,
        owner_worker TEXT,
        repo TEXT NOT NULL DEFAULT 'QNFO/qnfo-workers',
        path TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO products (slug, name, surface, owner_worker)
      VALUES ('catalog-entry', 'Existing catalog entry', 'https://example.org', 'catalog-worker');
    `);

    db.exec(migration);
    db.exec(migration);

    assert.deepEqual(
      { ...db.prepare("SELECT slug, name, surface, owner_worker FROM products").get() },
      {
        slug: "catalog-entry",
        name: "Existing catalog entry",
        surface: "https://example.org",
        owner_worker: "catalog-worker",
      },
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM product_plus_registry").get().count, 7);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM v_product_plus_debt").get().count, 7);

    db.exec(migration.match(/^-- Rollback: (.+)$/m)[1]);

    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM products").get().count, 1);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'product_plus_registry'").get().count,
      0,
    );
  } finally {
    db.close();
  }
});

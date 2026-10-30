import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// Review of #5366: the rollback of 2026-10-30-product-plus-cause.sql must remove only the mapping that migration owns.
// It owns it alone because 2026-10-29-plussing-3.sql stays as merged, without the row (migrations/metric-family-cluster-b.test.mjs pins that file).
const dir = new URL("./", import.meta.url);
const forward = readFileSync(new URL("./2026-10-30-product-plus-cause.sql", import.meta.url), "utf8");
const metric = "product_plus_deployed_7d";
const count = (db, key) => db.prepare("SELECT COUNT(*) n FROM metric_breach_cause WHERE metric_key = ?").get(key).n;

test("2026-10-30-product-plus-cause.sql is the only migration that maps the product plus metric", () => {
  const owners = readdirSync(dir).filter((f) => f.endsWith(".sql")
    && readFileSync(new URL(f, dir), "utf8").split(";").some((s) => /INTO\s+metric_breach_cause\b/i.test(s) && s.includes(`'${metric}'`)));
  assert.deepEqual(owners, ["2026-10-30-product-plus-cause.sql"]);
});

test("replaying the forward migration keeps one mapping and its rollback removes only that row", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE metric_breach_cause (metric_key TEXT PRIMARY KEY, cause_key TEXT NOT NULL, note TEXT)");
    db.exec("INSERT INTO metric_breach_cause (metric_key, cause_key, note) VALUES ('other_metric', 'code-loop', 'METRIC-CAUSE-AT-REGISTRATION-1: another metric')");
    db.exec(forward);
    db.exec(forward);
    assert.equal(count(db, metric), 1);
    db.exec(forward.match(/^-- Rollback: (.+)$/m)[1]);
    assert.equal(count(db, metric), 0);
    assert.equal(count(db, "other_metric"), 1, "the rollback leaves every other mapping alone");
  } finally { db.close(); }
});

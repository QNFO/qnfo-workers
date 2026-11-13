// PERSONAL-PLANE-OWNERSHIP-1: a table family is created by one personal-plane worker. The duplicates that exist today are listed in
// personal-api/product.json and may only shrink; a new duplicate, or a listed one that no longer duplicates, fails the build.
import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
const reg = JSON.parse(fs.readFileSync("personal-api/product.json", "utf8"));
const tables = (w) => new Set([...fs.readFileSync(w + "/worker.js", "utf8").matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z_0-9]+)/gi)].map((m) => m[1].toLowerCase()));
test("personal-plane tables have one owning worker", () => {
  const a = tables("personal-api"), b = tables("personal-companion");
  const dup = [...a].filter((t) => b.has(t)).sort();
  assert.deepEqual(dup, [...reg.duplicate_tables_shrink_only].sort(), "duplicate DDL changed: add none, remove those you fixed (" + reg.refactor_issue + ")");
});
test("every personal-plane worker is registered", () => {
  for (const w of Object.keys(reg.workers)) assert.ok(fs.existsSync(w + "/worker.js"), w + " is registered but has no worker.js");
});

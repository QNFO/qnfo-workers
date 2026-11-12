// ULTRASTABLE-BOUNDARY-1: the product split in product/boundary.json covers every live worker exactly once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { checkBoundary, liveWorkers } from "./product_boundary.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "product", "boundary.json"), "utf8"));

test("every live worker is classified and every classified worker is live", () => {
  const r = checkBoundary(root, manifest);
  assert.deepEqual(r.violations, []);
  assert.ok(r.counts.core > 0 && r.counts.app > 0 && r.counts.personal > 0);
});

test("the personal plane never sits in the core", () => {
  for (const [w, v] of Object.entries(manifest.workers)) {
    if (w.startsWith("personal-") || w.startsWith("q08-")) assert.equal(v.class, "personal", w);
  }
});

test("an unclassified worker and a retired worker are reported", () => {
  const dir = mkdtempSync(join(tmpdir(), "boundary-"));
  for (const w of ["alpha", "beta", "gone"]) { mkdirSync(join(dir, w)); writeFileSync(join(dir, w, "worker.js"), "export default {}"); }
  writeFileSync(join(dir, "gone", "RETIRED"), "");
  assert.deepEqual(liveWorkers(dir), ["alpha", "beta"]);
  const r = checkBoundary(dir, { workers: { alpha: { class: "core", role: "x" }, gone: { class: "app", role: "y" } } });
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.includes("unclassified live worker: beta")));
  assert.ok(r.violations.some((v) => v.includes("classified worker is not live: gone")));
});

test("ULTRASTABLE-CLAIMS-1: every listed claim has a probe row in the migration, and every row is listed", () => {
  const sql = readFileSync(join(root, manifest.claims.migration), "utf8");
  const rows = [...sql.matchAll(/INSERT OR REPLACE INTO product_claims \(id, product, sort, claim, probe_sql, evidence_note\) VALUES \('([^']+)', 'ultrastable'/g)].map((m) => m[1]);
  assert.deepEqual([...rows].sort(), [...manifest.claims.ids].sort());
  assert.match(sql, /'claim-ultrastable-' \|\| id/);
});

test("ULTRASTABLE-CLAIMS-1: every claim probe, as stored, passes the remediation consumer's read-only guard", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync("python3", [join(root, "scripts", "product_claims_probe_guard_test.py")], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("ULTRASTABLE-POLICY-1: every rule in the default policy names an existing enforcer", () => {
  const text = readFileSync(join(root, "product", "policy", "DEFAULT-POLICY.md"), "utf8");
  assert.ok(text.includes("ULTRASTABLE-POLICY-1"));
  assert.ok(text.split("\n").length <= 60, "policy is at most 60 lines");
  const rules = text.split("\n").filter((l) => l.startsWith("- "));
  assert.ok(rules.length >= 8);
  for (const line of rules) {
    const m = line.match(/enforced-by:\s*(.+)$/);
    assert.ok(m, `rule names no enforcer: ${line}`);
    for (const p of m[1].split(",").map((s) => s.trim())) assert.ok(existsSync(join(root, p)), `enforcer missing: ${p}`);
  }
});

test("ULTRASTABLE-SCHEMA-1: core-schema.sql creates every core table, idempotently, and loads in sqlite", async () => {
  const { renderSchema } = await import("./product_boundary.mjs");
  const r = renderSchema(["a", "b"], [{ type: "table", name: "a", tbl_name: "a", sql: "CREATE TABLE a (x)" }, { type: "index", name: "ia", tbl_name: "a", sql: "CREATE UNIQUE INDEX ia ON a(x)" }]);
  assert.deepEqual(r.missing, ["b"]);
  assert.match(r.sql, /CREATE TABLE IF NOT EXISTS a \(x\);\nCREATE UNIQUE INDEX IF NOT EXISTS ia/);
  const sql = readFileSync(join(root, "product", "core-schema.sql"), "utf8");
  for (const t of manifest.core_tables) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${t}[ (]`), t);
  const { spawnSync } = await import("node:child_process");
  const py = "import sqlite3,sys;c=sqlite3.connect(':memory:');s=open(sys.argv[1],encoding='utf8').read();c.executescript(s);c.executescript(s);print(c.execute(\"select count(*) from sqlite_master where type='table'\").fetchone()[0])";
  const o = spawnSync("python3", ["-c", py, join(root, "product", "core-schema.sql")], { encoding: "utf8" });
  assert.equal(o.status, 0, o.stderr);
});

test("ULTRASTABLE-TENANT-1: tenant.example.json names every setting and lists every core worker file that hardcodes one", async () => {
  const { SETTINGS } = await import("./product_tenant_scan.mjs");
  const { spawnSync } = await import("node:child_process");
  const t = JSON.parse(readFileSync(join(root, "product", "tenant.example.json"), "utf8"));
  assert.ok("repository" in t);
  for (const k of Object.keys(SETTINGS)) assert.ok(t.settings[k] && t.settings[k].env, k);
  assert.ok(Object.keys(t.occurrences.repository).length > 0);
  const r = spawnSync("node", [join(root, "scripts", "product_tenant_scan.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// ULTRASTABLE-BOUNDARY-1: the product split in product/boundary.json covers every live worker exactly once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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

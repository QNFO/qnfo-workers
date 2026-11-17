import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
const s = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
test("IDA-STATUS-1: ?sort=updated filters to revised papers and is offered in the sort menu", () => {
  assert.ok(s.includes('"most-revised", "updated"'));
  assert.ok(s.includes('sort === "updated") all = all.filter((p) => (p.version_count || 1) > 1)'));
  assert.ok(s.includes("Revised papers only"));
});

// HANDBACK-NO-NEST-1: an issue-mirror card is handed back without filing a new task.
import { test } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const fn = src.slice(src.indexOf("async function v3Handback"), src.indexOf("async function v3Work"));
test("issue-<id> card reuses the open issue before ownerTaskFile", () => {
  assert.ok(fn.includes("const mirror = /^issue-("));
  assert.ok(fn.indexOf("open.length ?") < fn.indexOf("ownerTaskFile("));
});

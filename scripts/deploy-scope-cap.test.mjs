// DEPLOY-SCOPE-CAP-1: a push deploys only the workers it touched. Guards the cap that FLEET-FREEZE-1's root cause (one merge, about 29 workers) needed.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";

const wf = readFileSync(new URL("../.github/workflows/canonical-deploy.yml", import.meta.url), "utf8");

test("the widened diff base is capped and falls back to the push's own base", () => {
  assert.match(wf, /MAX_WIDENED_WORKERS=\d+/);
  const cap = Number(/MAX_WIDENED_WORKERS=(\d+)/.exec(wf)[1]);
  assert.ok(cap >= 1 && cap <= 10, "cap stays small (was 29 workers in one push)");
  assert.match(wf, /BASE="\$EV_BEFORE"/);
});

test("the cap runs before the added-files list uses BASE", () => {
  assert.ok(wf.indexOf("MAX_WIDENED_WORKERS=") < wf.indexOf('--diff-filter=A "$BASE"'), "cap is applied before /tmp/added.txt is computed");
});

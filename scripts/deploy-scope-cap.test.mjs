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

// DEPLOY-SCOPE-CAP-2: workers beyond the cap are deployed in batches of 6 by self-dispatch, never dropped and never swept in one run.
test("overflow is chained in batches of 6 through a `then` input", () => {
  assert.match(wf, /\n      then:\n/);
  assert.match(wf, /\/tmp\/overflow\.txt/);
  assert.match(wf, /Chain the overflow/);
  assert.match(wf, /head -6/);
  assert.match(wf, /gh workflow run canonical-deploy\.yml[^\n]*-f then=/);
  assert.ok(wf.indexOf("Chain the overflow") < wf.indexOf("Commit the ci-status artifact back"), "chain runs before the artifact commit");
});

test("the autodeploy apply path is capped per run", () => {
  const fa = readFileSync(new URL("./fleet-autoaudit.py", import.meta.url), "utf8");
  assert.match(fa, /FLEET_AUTODEPLOY_MAX/);
  assert.match(fa, /ahead = ahead\[:cap\]/);
});

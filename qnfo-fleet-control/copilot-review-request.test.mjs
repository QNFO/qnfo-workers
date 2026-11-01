import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(new URL("../.github/workflows/request-copilot-review.yml", import.meta.url), "utf8");

test("requests automated review when pull requests open or become ready", () => {
  assert.match(workflow, /pull_request_target:\s+types: \[opened, reopened, ready_for_review\]/);
  assert.match(workflow, /pull-requests: write/);
  assert.match(workflow, /timeout-minutes: 5/);
  assert.match(workflow, /copilot-pull-request-reviewer\[bot\]/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ secrets\.QNFO_GH_PAT \}\}/);
  assert.match(workflow, /if: steps\.primary\.outcome != 'success'/);
});

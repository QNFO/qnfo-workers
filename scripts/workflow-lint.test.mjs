// WORKFLOW-LINT-TIMEOUT-1 offline suite (issue 5649, agent_issues 1000869: PR 5319's `guard` and `lint` checks failed because its first revision had no job timeout).
// Proves scripts/workflow-lint.py passes the current assign-copilot-on-issue workflow and fails the same file with its job timeout removed, with the expected diagnostic.
// The timeout value is not pinned (any bounded value passes); only its presence is. Run: node --no-warnings scripts/workflow-lint.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const workflow = readFileSync(new URL("../.github/workflows/assign-copilot-on-issue.yml", import.meta.url), "utf8");
const lintScript = fileURLToPath(new URL("./workflow-lint.py", import.meta.url));

function lint(source) {
  const dir = mkdtempSync(join(tmpdir(), "workflow-lint-"));
  try {
    writeFileSync(join(dir, "workflow.yml"), source);
    return spawnSync("python3", [lintScript], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, WF_ROOT: dir },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const passing = lint(workflow);
assert.equal(passing.status, 0, passing.stdout + passing.stderr);

const withoutTimeout = workflow.replace(/^    timeout-minutes: \d+\n/m, "");
assert.notEqual(withoutTimeout, workflow, "the current workflow must declare its bounded job timeout");
const failing = lint(withoutTimeout);
assert.equal(failing.status, 1, failing.stdout + failing.stderr);
assert.match(failing.stdout, /job `assign` has no timeout-minutes \(default 360\)/);
console.log("workflow-lint job timeout: 4 passed, 0 failed");

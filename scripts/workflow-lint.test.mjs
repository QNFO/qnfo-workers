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

const withoutTimeout = workflow.replace(/^    timeout-minutes: 10\n/m, "");
assert.notEqual(withoutTimeout, workflow, "the current workflow must declare its bounded job timeout");
const failing = lint(withoutTimeout);
assert.equal(failing.status, 1, failing.stdout + failing.stderr);
assert.match(failing.stdout, /job `assign` has no timeout-minutes \(default 360\)/);

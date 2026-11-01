import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { activeCanonicalRun, canonicalDispatchArgs, deploymentPreflight } from "./deploy_fleet_dashboard.mjs";

const sha = "a".repeat(40);
const ready = (overrides = {}) => deploymentPreflight({
  branch: "main",
  dirty: false,
  localSha: sha,
  remoteSha: sha,
  checkRuns: [{ name: "deploy-gate", status: "completed", conclusion: "success" }],
  ...overrides
});

test("deployment preflight allows only clean main with matching origin and successful checks", () => {
  assert.deepEqual(ready(), { ok: true, reason: "main HEAD matches origin and every check run succeeded" });
});

test("deployment preflight refuses a feature branch or a dirty worktree", () => {
  assert.match(ready({ branch: "feature" }).reason, /branch must be main/);
  assert.match(ready({ dirty: true }).reason, /worktree must be clean/);
});

test("deployment preflight refuses stale local commits and missing checks", () => {
  assert.match(ready({ remoteSha: "b".repeat(40) }).reason, /match origin main/);
  assert.match(ready({ checkRuns: [] }).reason, /no GitHub check runs/);
});

test("deployment preflight refuses pending and unsuccessful check runs", () => {
  assert.match(ready({ checkRuns: [{ name: "deploy-gate", status: "in_progress" }] }).reason, /in_progress/);
  assert.match(ready({ checkRuns: [{ name: "mirror-guard", status: "completed", conclusion: "failure" }] }).reason, /failure/);
});

test("an active canonical run for the same commit is detected to prevent duplicate dispatch", () => {
  const run = { headSha: sha, status: "in_progress", url: "https://github.com/QNFO/qnfo-workers/actions/runs/1" };
  assert.equal(activeCanonicalRun([run], sha), run);
  assert.equal(activeCanonicalRun([{ ...run, headSha: "b".repeat(40) }], sha), null);
  assert.equal(activeCanonicalRun([{ ...run, status: "completed" }], sha), null);
});

test("dispatch targets the canonical workflow's explicit workers input", () => {
  const workflow = readFileSync(new URL("../.github/workflows/canonical-deploy.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:\s+inputs:\s+workers:\s+description:/);
  assert.deepEqual(canonicalDispatchArgs(), [
    "workflow", "run", "canonical-deploy.yml", "--repo", "QNFO/qnfo-workers", "--ref", "main",
    "--field", "workers=qnfo-fleet-dashboard"
  ]);
});

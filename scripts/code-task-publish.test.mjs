// WORKFLOW-SCRIPT-FIXES-1 suite: runs the offline checks of scripts/code-task-publish.py on every pull request that touches scripts/.
// The publisher's own selftest only ran inside code-task-publish.yml (after a main push), and scripts/code_task_publish_patch_size_test.py
// was wired into no workflow at all, so a regression showed up as a red publish run instead of a red pull request.
// Proves: the selftest passes and prints no ::notice::/::warning::/::error:: line (the red.test.mjs fixture notice sat on every run's
// annotations); the patch-size test passes; the repropose/no-patch test passes (an "[issue #N]" successor is not a false alarm).
// Run: node scripts/code-task-publish.test.mjs   (exit 0 = all passed; needs python3 and git)
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const run = (file, args = []) => spawnSync("python3", [join(here, file), ...args], { encoding: "utf8", timeout: 600000, cwd: join(here, "..") });

const probe = spawnSync("python3", ["--version"], { encoding: "utf8" });
const git = spawnSync("git", ["--version"], { encoding: "utf8" });
if (probe.status !== 0 || git.status !== 0) {
  console.log("code-task-publish: SKIP (python3 or git is not installed)");
  process.exit(0);
}

let r = run("code-task-publish.py", ["--selftest"]);
ok(r.status === 0 && /selftest: 0 failure\(s\)/.test(r.stdout), "the publisher's own selftest passes", (r.stdout || "").slice(-300) + (r.stderr || "").slice(-200));
const annotations = (r.stdout || "").split("\n").filter((l) => l.startsWith("::"));
ok(annotations.length === 0, "the selftest emits no workflow-command annotation line", annotations);

r = run("code_task_publish_patch_size_test.py");
ok(r.status === 0 && /\d+ passed, 0 failed/.test(r.stdout), "the patch-size test passes", (r.stdout || "").slice(-300) + (r.stderr || "").slice(-200));

r = run("code_task_publish_repropose_test.py");
ok(r.status === 0 && /\d+ passed, 0 failed/.test(r.stdout), "the repropose and no-patch test passes", (r.stdout || "").slice(-400) + (r.stderr || "").slice(-200));

r = run("code_task_publish_claim_test.py");
ok(r.status === 0 && /\bOK\b/.test(r.stderr), "atomic claim ownership survives trigger writes and concurrent publishers", (r.stdout || "").slice(-400) + (r.stderr || "").slice(-400));

console.log("code-task-publish: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

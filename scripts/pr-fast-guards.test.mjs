// PR-FAST-GUARDS-1 suite: scripts/pr_fast_guards.py selects the cheap guards a change needs and pr-checks.yml runs them as the strict `fast-guards` job.
// Run: node scripts/pr-fast-guards.test.mjs   -> prints "N passed, 0 failed"
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const PY = ["python3", "python"].find((p) => spawnSync(p, ["--version"], { encoding: "utf8" }).status === 0);
if (!PY) throw new Error("no python on PATH");

// which guards apply to a list of changed files, read from the module's own table
const selected = (files) => {
  const code = [
    "import sys, json",
    "sys.path.insert(0, " + JSON.stringify(here) + ")",
    "import pr_fast_guards as g",
    "files = json.loads(sys.argv[1])",
    "print(json.dumps([n for n, when, c, p in g.GUARDS if when(files)]))",
  ].join("\n");
  const r = spawnSync(PY, ["-c", code, JSON.stringify(files)], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout.trim());
};
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

ok(same(selected(["docs/X.md", "ci-status/a.json"]), []), "a docs-only change selects no guard", selected(["docs/X.md"]));
ok(same(selected(["qnfo-ai/worker.js", "qnfo-ai/deployed-current.worker.js"]), ["narrative-prompt-guard", "worker-load-gate", "code-anchor-once", "suite-regressions"]), "a worker change selects the prose, load and anchor guards and its suites", selected(["qnfo-ai/worker.js"]));
ok(same(selected(["migrations/2026-11-04-x.sql"]), ["metric-cause", "code-anchor-once", "suite-regressions"]), "a migration selects the metric-cause and anchor guards and the suites", selected(["migrations/2026-11-04-x.sql"]));
ok(same(selected([".github/workflows/pr-checks.yml"]), ["suite-regressions"]), "a workflow change selects the suites only", selected([".github/workflows/pr-checks.yml"]));
ok(same(selected(["scripts/narrative-prompt-guard.py"]), ["narrative-prompt-guard", "suite-regressions"]), "the guard's own file selects it", selected(["scripts/narrative-prompt-guard.py"]));
ok(same(selected(["_shared/x.js"]), ["worker-load-gate", "suite-regressions"]), "a shared helper selects the load gate", selected(["_shared/x.js"]));

// the suites command writes the changed directories, "." for a root file that is not prose
const r = spawnSync(PY, ["-c", [
  "import sys, json, os",
  "sys.path.insert(0, " + JSON.stringify(here) + ")",
  "import pr_fast_guards as g",
  "cmd = g.suites_cmd(['qnfo-ai/worker.js', 'scripts/a.py', 'deploy-targets.txt', 'README.md'])",
  "print(json.dumps([cmd[:3], open(cmd[3]).read().split()]))",
].join("\n")], { encoding: "utf8" });
ok(r.status === 0 && JSON.stringify(JSON.parse(r.stdout.trim())) === JSON.stringify([["node", "scripts/run-suites.mjs", "--changed-file"], ["qnfo-ai", "scripts", "."]]), "the suites command lists the changed directories and a root marker, prose excluded", { s: r.status, o: r.stdout, e: r.stderr });

// the wiring in pr-checks.yml
const wf = readFileSync(join(here, "..", ".github", "workflows", "pr-checks.yml"), "utf8");
const job = wf.slice(wf.indexOf("\n  fast-guards:"), wf.indexOf("\n  version-bump-guard:"));
ok(/python3 scripts\/pr_fast_guards\.py/.test(job), "pr-checks runs scripts/pr_fast_guards.py in the fast-guards job");
ok(!/continue-on-error/.test(job), "the fast-guards job is strict (no continue-on-error)");
ok(/node-version: "22"/.test(job) && /fetch-depth: 0/.test(job), "the job has Node 22 and the full history the suites read");
ok(wf.indexOf("\n  fast-guards:") < wf.indexOf("\n  workflow-lint:"), "the job sits before the last job of the file (additive, away from the append point)");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

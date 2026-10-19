// SKIP-TOKEN-GUARD-1 suite: scripts/skip-token-guard.py finds a skip-CI token in a pull request's title, description or commit messages,
// and deploy-gate.yml runs it on every pull request. Run: node scripts/skip-token-guard.test.mjs
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const guard = join(here, "skip-token-guard.py");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const run = (args, env) => spawnSync("python3", [guard, ...args], { encoding: "utf8", env: { ...process.env, PR_TITLE: "", PR_BODY: "", ...env } });

let r = run(["--selftest"]);
ok(r.status === 0 && /selftest: ok/.test(r.stdout) && !/^FAIL/m.test(r.stdout), "the guard's own selftest passes", r.stdout.slice(-300));
ok((r.stdout.match(/^PASS/gm) || []).length >= 10, "the selftest covers the cases", (r.stdout.match(/^PASS/gm) || []).length);

// the real entry point: nothing between HEAD and HEAD, so only the title and the description are read
r = run(["--base", "HEAD"], { PR_TITLE: "SOMETHING-1: a clean title", PR_BODY: "a clean description that says skip checks in prose" });
ok(r.status === 0 && /no skip-CI token/.test(r.stdout), "a clean pull request exits 0", { status: r.status, out: r.stdout });
r = run(["--base", "HEAD"], { PR_TITLE: "x", PR_BODY: "explains that a [" + "skip ci" + "] status commit never triggers a run" });
ok(r.status === 1 && /pull request description/.test(r.stdout) && /::error::SKIP-TOKEN-GUARD-1/.test(r.stdout), "a token in the description exits 1 and names where", { status: r.status, out: r.stdout });
r = run(["--base", "HEAD"], { PR_TITLE: "fix [" + "no ci" + "]" });
ok(r.status === 1 && /pull request title/.test(r.stdout), "a token in the title exits 1", { status: r.status, out: r.stdout });

const wf = readFileSync(join(here, "..", ".github", "workflows", "deploy-gate.yml"), "utf8");
ok(/SKIP-TOKEN-GUARD-1/.test(wf) && /python3 scripts\/skip-token-guard\.py --base "origin\/\$\{\{ github\.base_ref \}\}"/.test(wf), "deploy-gate runs the guard against the pull request's base");
ok(/PR_TITLE: \$\{\{ github\.event\.pull_request\.title \}\}/.test(wf) && /PR_BODY: \$\{\{ github\.event\.pull_request\.body \}\}/.test(wf), "the title and description reach the guard through the environment, never the shell command line");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

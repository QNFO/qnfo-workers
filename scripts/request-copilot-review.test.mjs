// REQUEST-COPILOT-REVIEW-1 offline suite (.github/workflows/request-copilot-review.yml; LANE-WAITS-FOR-REVIEW-1 lever 1, issue 5515). No network: the two request
// step scripts are run for real under `bash -eo pipefail` (the runner's shell) against a fake `gh` that records its calls.
// Proves: a ready pull request into main gets the Copilot reviewer requested through POST .../requested_reviewers, an already requested reviewer is left alone (an exact
// login match: a longer or prefixed login is not it), a failed list or a failed request makes the step fail (so continue-on-error lets the fallback run); the two
// scripts are identical (only the credential differs); both steps and the warning step cannot turn the job red (a failed non-required check stops the merge lane:
// bhMergeDecide "check(s) failed"); the fleet user credential reaches exactly one step, off pull_request_target only, with nothing checked out or executed from the
// pull request and only its number and draft flag read; the permissions, the runner pin, the timeout and the PR-keyed concurrency group are present.
// Run: node --no-warnings scripts/request-copilot-review.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wf = readFileSync(join(root, ".github/workflows/request-copilot-review.yml"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };

const code = wf.replace(/^\s*#.*$/gm, "");
const stepsAt = code.indexOf("    steps:");
const steps = code.slice(stepsAt).split(/\n      - name: /).slice(1).map((s) => "name: " + s);
const stepOf = (id) => steps.find((s) => new RegExp("^\\s+id: " + id + "\\s*$", "m").test(s)) || "";
const primary = stepOf("primary"), fallback = stepOf("fallback");
const warn = steps.find((s) => /Say so when no review/.test(s)) || "";
const runBlock = (s) => {
  const lines = s.split("\n"), i = lines.findIndex((l) => /^\s+run: \|\s*$/.test(l));
  if (i < 0) return (lines.find((l) => /^\s+run: /.test(l)) || "").replace(/^\s+run: /, "");
  const out = [];
  for (let j = i + 1; j < lines.length; j++) { if (/^ {10,}\S/.test(lines[j]) || lines[j].trim() === "") out.push(lines[j].replace(/^ {10}/, "")); else break; }
  return out.join("\n").trim();
};

// --- shape
ok(steps.length === 3 && !!primary && !!fallback && !!warn, "three steps: the request with GITHUB_TOKEN, the request with the fleet user credential, the warning", steps.length);
ok(/pull_request_target:\s*\n\s+types: \[opened, reopened, ready_for_review\]\s*\n\s+branches: \[main\]/.test(code), "it runs on pull_request_target when a pull request into main opens, reopens or becomes ready");
ok(!/^\s{2}(pull_request|push|workflow_run|workflow_dispatch|schedule):/m.test(code.slice(0, code.indexOf("\njobs:"))), "no other trigger can hand the fleet user credential to the job");
ok(/^permissions:\s*\n\s+pull-requests: write\s*\n/m.test(code) && !/contents:\s*write|actions:\s*write|issues:\s*write|id-token/.test(code), "the token may write pull requests and nothing else");
ok(/runs-on: ubuntu-24\.04/.test(code) && /timeout-minutes: 5\b/.test(code) && !/ubuntu-latest/.test(code), "the job has the runner pin and a timeout");
ok(/if: \$\{\{ github\.event\.pull_request\.draft == false \}\}/.test(code), "a draft is not reviewed: the request is made when the pull request is ready");
ok(/group: request-copilot-review-\$\{\{ github\.event\.pull_request\.number \}\}/.test(code) && /cancel-in-progress: false/.test(code), "one run per pull request, never cancelled mid-request");

// --- a request never blocks a merge
ok(/continue-on-error: true/.test(primary) && /continue-on-error: true/.test(fallback), "both request steps are continue-on-error (a red non-required check stops the lane)");
ok(/if: \$\{\{ steps\.primary\.outcome != 'success' \}\}/.test(fallback), "the fleet user credential is used only after the workflow token failed");
ok(/if: \$\{\{ steps\.primary\.outcome != 'success' && steps\.fallback\.outcome != 'success' \}\}/.test(warn) && /::warning::/.test(runBlock(warn)), "the warning step runs only when neither credential worked, and it only warns");
ok(!/continue-on-error:\s*false/.test(code) && !/\bexit 1\b/.test(code), "nothing in the job fails it on purpose");

// --- the credential and the pull request text
const secretRefs = code.match(/secrets\.[A-Za-z0-9_]+/g) || [];
ok(secretRefs.length === 1 && secretRefs[0] === "secrets.QNFO_GH_PAT" && /secrets\.QNFO_GH_PAT/.test(fallback) && !/secrets\./.test(primary) && !/secrets\./.test(warn), "the fleet user credential reaches exactly one step", secretRefs);
ok(/GH_TOKEN: \$\{\{ github\.token \}\}/.test(primary), "the first request uses the workflow token");
ok(!/\buses:/.test(code) && !/checkout/i.test(code) && !/\bref:/.test(code), "nothing is checked out or fetched from the pull request");
const prRefs = [...new Set(code.match(/github\.event\.pull_request\.[A-Za-z_.]+/g) || [])].sort();
ok(prRefs.join() === "github.event.pull_request.draft,github.event.pull_request.number", "only the number and the draft flag of the pull request are read", prRefs);
const runLines = code.split("\n").filter((l) => /^\s+run:/.test(l));
ok(runLines.length === 3 && !/\$\{\{/.test([runBlock(primary), runBlock(fallback), runBlock(warn)].join("\n")), "no run script carries an expression: the number travels through env", runLines);
ok(/^ {4}env:\s*\n\s+PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}/m.test(code), "the pull request number is handed over through env");
ok(runBlock(primary) === runBlock(fallback) && runBlock(primary).length > 100, "the two request scripts are identical: only the credential differs");

// --- behaviour: run the step script against a fake gh
const dir = mkdtempSync(join(tmpdir(), "rcr-"));
const bin = join(dir, "bin");
const log = join(dir, "gh.log");
writeFileSync(join(dir, "fake-gh.sh"), [
  "#!/usr/bin/env bash",
  'echo "$*" >> "$GH_LOG"',
  'case "$*" in',
  '  *"--method POST"*) if [ "${GH_POST_FAIL:-0}" = 1 ]; then echo "HTTP 422" >&2; exit 1; fi; exit 0;;',
  '  *"--jq"*) if [ "${GH_LIST_FAIL:-0}" = 1 ]; then echo "HTTP 403" >&2; exit 1; fi; printf "%s" "${GH_REQUESTED:-}"; exit 0;;',
  "esac", "exit 0", ""
].join("\n"));
mkdirSync(bin);
copyFileSync(join(dir, "fake-gh.sh"), join(bin, "gh"));
chmodSync(join(bin, "gh"), 0o755);
const exec = (script, env) => {
  writeFileSync(log, "");
  const r = spawnSync("bash", ["-eo", "pipefail", "-c", script], { encoding: "utf8", env: Object.assign({ PATH: bin + ":" + process.env.PATH, GH_LOG: log, GITHUB_REPOSITORY: "QNFO/qnfo-workers", PR_NUMBER: "42" }, env || {}) });
  return { code: r.status, calls: readFileSync(log, "utf8").split("\n").filter(Boolean), err: r.stderr };
};
const script = runBlock(primary);
const REVIEWER = "copilot-pull-request-reviewer[bot]";
const posts = (r) => r.calls.filter((c) => c.includes("--method POST"));

const a = exec(script, { GH_REQUESTED: "" });
ok(a.code === 0 && posts(a).length === 1 && posts(a)[0] === "api --method POST repos/QNFO/qnfo-workers/pulls/42/requested_reviewers -f reviewers[]=" + REVIEWER, "a pull request with no reviewer gets the Copilot reviewer requested", a);
const b = exec(script, { GH_REQUESTED: "rwnq8\n" + REVIEWER + "\n" });
ok(b.code === 0 && posts(b).length === 0 && b.calls.length === 1, "a reviewer that is already requested is left alone", b.calls);
for (const near of [REVIEWER + "x", "not-" + REVIEWER, "xcopilot-pull-request-reviewer[bot]", "copilot-pull-request-reviewer", "Copilot"]) {
  const c = exec(script, { GH_REQUESTED: near + "\n" });
  ok(c.code === 0 && posts(c).length === 1, "a different login (" + near + ") is not the reviewer, so the request is made", c.calls);
}
const d = exec(script, { GH_REQUESTED: "", GH_POST_FAIL: "1" });
ok(d.code !== 0 && posts(d).length === 1, "a refused request fails the step, so the fallback runs", d);
const e = exec(script, { GH_LIST_FAIL: "1" });
ok(e.code !== 0 && posts(e).length === 0, "an unreadable reviewer list fails the step and requests nothing", e);
const f = exec(script, { GH_REQUESTED: "", PR_NUMBER: "7" });
ok(posts(f).length === 1 && /pulls\/7\/requested_reviewers/.test(posts(f)[0]), "the request goes to the pull request named by PR_NUMBER", f.calls);
const w = exec(runBlock(warn), { PR_NUMBER: "42" });
ok(w.code === 0 && w.calls.length === 0, "the warning step succeeds and calls nothing");

rmSync(dir, { recursive: true, force: true });
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

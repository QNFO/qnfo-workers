// WORKSPACE-CHECKOUT-HINT-1 (agent_issues 100079, 100083, 100127), qnfo-ops 2.50.3 offline suite. No network.
// Proves: a container command that fails on `cd /workspace/...: No such file or directory` keeps its error text ("command exited 1: ...", which
// tool_error_exclusions matches) and gains a hint that names the missing path and the fix; other failures, other exit codes, successes and
// responses without a result are unchanged.
// Run: node qnfo-ops/workspace-hint.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const i = src.indexOf("function fmtContainer(j) {"), k = src.indexOf("\n__name(fmtContainer", i);
ok(i >= 0 && k > i, "fmtContainer is found in worker.js");
const { fmtContainer } = new Function(src.slice(i, k) + "\nreturn { fmtContainer };")();
const run = (exitCode, stderr, stdout) => fmtContainer({ ok: exitCode === 0, result: { exitCode, stderr, stdout: stdout || "" } });
{ const r = run(1, "bash: line 1: cd: /workspace/qw: No such file or directory\n");
  ok(r.ok === false && r.exit_code === 1 && /^command exited 1: bash: line 1: cd: \/workspace\/qw: No such file/.test(r.error), "the error text is unchanged (still matches the 'command exited' exclusion)", r.error);
  ok(/^\/workspace\/qw does not exist/.test(r.hint) && /git clone --depth 1 https:\/\/github\.com\/QNFO\/qnfo-workers\.git/.test(r.hint) && /github_repo_read/.test(r.hint) && /git_op/.test(r.hint), "the hint names the missing path and both ways out", r.hint); }
{ const r = run(1, "bash: line 1: cd: /workspace/qw/qnfo-code-orchestrator: No such file or directory\n");
  ok(/^\/workspace\/qw\/qnfo-code-orchestrator does not exist/.test(r.hint), "a nested missing directory is named in full", r.hint); }
{ const r = run(1, "bash: line 1: cd: /workspace/qnfo-workers: No such file or directory\n");
  ok(/^\/workspace\/qnfo-workers does not exist/.test(r.hint), "the other path the agent guesses is named", r.hint); }
{ const r = run(1, "grep: nothing.txt: No such file or directory\n");
  ok(r.hint === undefined && /^command exited 1/.test(r.error), "a missing file that is not a cd into /workspace gets no hint", r); }
{ const r = run(1, "bash: line 1: cd: /tmp/x: No such file or directory\n");
  ok(r.hint === undefined, "a cd outside /workspace gets no hint", r); }
{ const r = run(2, "Traceback (most recent call last): AttributeError\n");
  ok(r.hint === undefined && /^command exited 2/.test(r.error), "another failure is unchanged", r); }
{ const r = run(0, "", "ok\n");
  ok(r.ok === true && r.hint === undefined && r.error === undefined && r.stdout === "ok\n", "a success is unchanged", r); }
{ const r = fmtContainer({ ok: false, error: "pilot unreachable" });
  ok(r.ok === false && r.error === "pilot unreachable" && r.hint === undefined, "a response without a result is unchanged", r); }
{ const m = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src); ok(m && Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3]) >= 2050003, "VERSION is at least 2.50.3", m && m[0]); }
console.log(fail ? fail + " failed, " + pass + " passed" : pass + " passed, 0 failed");
process.exit(fail ? 1 : 0);

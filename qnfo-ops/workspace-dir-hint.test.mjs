// WORKSPACE-DIR-HINT-1 (agent_issues 100127), qnfo-ops 2.50.3 offline suite. No network: containerDispatch is a stub.
// Proves: a cd failure on a dir that does not exist lists /workspace (workspace_dirs, workspace_dirs_total) and says what dir must be; an empty
// /workspace says the container was recycled; any other failure, a missing dir argument, a listing that fails and a success are unchanged.
// Run: node qnfo-ops/workspace-dir-hint.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { versionAtLeast } from "../scripts/version-at-least.mjs";
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };
const grab = (start, end) => { const i = src.indexOf(start), j = src.indexOf(end, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const parts = [
  grab("function fmtContainer(j) {", "\n__name(fmtContainer"),
  grab("async function containerWorkspaceExec(env, args) {", "\n__name(containerWorkspaceExec"),
];
ok(parts.every((p) => p.length > 100), "fmtContainer and containerWorkspaceExec are found in worker.js", parts.map((p) => p.length));
let calls = [];
let dispatch = async () => ({ ok: true, result: { exitCode: 0, stdout: "", stderr: "" } });
const { containerWorkspaceExec } = new Function("containerDispatch", parts.join("\n") + "\nreturn { containerWorkspaceExec };")(async (env, path, body, timeout) => { calls.push({ path, body: { ...body } }); return dispatch(path, body); });
const exit = (code, stdout, stderr) => ({ ok: code === 0, result: { exitCode: code, stdout: stdout || "", stderr: stderr || "" } });
const CD_FAIL = "bash: line 1: cd: /workspace/qw: No such file or directory";

{ // the case from issue 100127: dir "qw" does not exist, the clone is qnfo-workers
  calls = []; dispatch = async (path, body) => body.cmd === "ls -1 /workspace" ? exit(0, "qnfo-workers\nqnfo-workers-r1a2b\n") : exit(1, "", CD_FAIL);
  const r = await containerWorkspaceExec({}, { cmd: "git status", dir: "qw" });
  ok(r.ok === false && /command exited 1/.test(r.error), "the original failure is kept", r);
  ok(JSON.stringify(r.workspace_dirs) === JSON.stringify(["qnfo-workers", "qnfo-workers-r1a2b"]) && r.workspace_dirs_total === 2, "a missing dir lists /workspace", r);
  ok(/workspace_dirs/.test(r.hint) && /"qw" does not exist/.test(r.hint) && /git_clone_exec/.test(r.hint), "the hint names the list, the missing dir and git_clone_exec", r.hint);
  ok(calls.length === 2 && calls[1].path === "/workspace/exec" && calls[1].body.cmd === "ls -1 /workspace" && calls[1].body.dir === "", "one extra call, the listing, through the same route", calls);
}
{ // a recycled container: /workspace is empty
  calls = []; dispatch = async (path, body) => body.cmd === "ls -1 /workspace" ? exit(0, "") : exit(1, "", CD_FAIL);
  const r = await containerWorkspaceExec({}, { cmd: "ls", dir: "qw" });
  ok(Array.isArray(r.workspace_dirs) && r.workspace_dirs.length === 0 && /recycled/.test(r.hint) && /git_clone_exec/.test(r.hint), "an empty /workspace says the container was recycled", r);
}
{ // a long listing is capped, the total is honest
  calls = []; const many = Array.from({ length: 80 }, (_, i) => "d" + i).join("\n");
  dispatch = async (path, body) => body.cmd === "ls -1 /workspace" ? exit(0, many) : exit(1, "", CD_FAIL);
  const r = await containerWorkspaceExec({}, { cmd: "ls", dir: "qw" });
  ok(r.workspace_dirs.length === 50 && r.workspace_dirs_total === 80, "at most 50 names, with the real total", { n: r.workspace_dirs.length, total: r.workspace_dirs_total });
}
{ // another failure inside an existing dir is not a missing dir
  calls = []; dispatch = async () => exit(2, "", "make: *** No rule to make target 'x'.  Stop.");
  const r = await containerWorkspaceExec({}, { cmd: "make x", dir: "qnfo-workers" });
  ok(r.ok === false && r.workspace_dirs === undefined && r.hint === undefined && calls.length === 1, "an ordinary command failure adds nothing and makes no second call", { r, calls: calls.length });
}
{ // a command that itself fails with "No such file" but not a cd
  calls = []; dispatch = async () => exit(1, "", "cat: nope.txt: No such file or directory");
  const r = await containerWorkspaceExec({}, { cmd: "cat nope.txt", dir: "qnfo-workers" });
  ok(r.workspace_dirs === undefined && calls.length === 1, "a missing file is not blamed on the dir", r);
}
{ // no dir argument: the default directory is /workspace itself, nothing to list
  calls = []; dispatch = async () => exit(1, "", "bash: line 1: cd: /workspace/x: No such file or directory");
  const r = await containerWorkspaceExec({}, { cmd: "cd x" });
  ok(r.workspace_dirs === undefined && calls.length === 1, "without a dir argument the command's own cd failure is left alone", r);
}
{ // the listing itself fails: the original answer comes back unchanged
  calls = []; dispatch = async (path, body) => body.cmd === "ls -1 /workspace" ? { ok: false, error: "container timeout" } : exit(1, "", CD_FAIL);
  const r = await containerWorkspaceExec({}, { cmd: "ls", dir: "qw" });
  ok(r.ok === false && /command exited 1/.test(r.error) && r.workspace_dirs === undefined, "a failed listing leaves the original failure", r);
}
{ // a throw from the listing is caught
  calls = []; dispatch = async (path, body) => { if (body.cmd === "ls -1 /workspace") throw new Error("boom"); return exit(1, "", CD_FAIL); };
  const _err = console.error; console.error = () => {};
  let r; try { r = await containerWorkspaceExec({}, { cmd: "ls", dir: "qw" }); } finally { console.error = _err; }
  ok(r && r.ok === false && r.workspace_dirs === undefined, "a throwing listing is caught and the original failure returned", r);
}
{ // success is untouched
  calls = []; dispatch = async () => exit(0, "done\n");
  const r = await containerWorkspaceExec({}, { cmd: "echo done", dir: "qnfo-workers" });
  ok(r.ok === true && r.stdout === "done\n" && r.workspace_dirs === undefined && calls.length === 1, "a successful command is unchanged", r);
}
ok(versionAtLeast((/var VERSION = "([^"]*)"/.exec(src) || [])[1] || "", "2.50.3"), "VERSION is at least 2.50.3"); // VERSION-PIN-TESTS-1: a minimum through versionAtLeast, never a range regex (a range regex rejected 2.50.4)

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);

// WORKSPACE-STAGE-1 offline suite (qnfo-ops 2.59.3, agent_issues 1000177 WORKSPACE-TWO-ROOTS-1). Measured 2026-10-25: workspace_write("cloudflare-agent-setup/RESTORE.sh") returned ok and stored the file in the R2 ops-workspace;
// shell_exec then ran `bash /workspace/cloudflare-agent-setup/RESTORE.sh` and answered "No such file or directory": the container /workspace is a different disk. A wipe-and-restore test was reported as passing on the strength
// of a script that had never existed where it ran.
// Proves: the shell tools stage ops-workspace files into the container before the command; a path in `stage` is written over the container copy and a /workspace/<path> the command names is filled in only when it is missing;
// the generated shell prelude, run in a real bash against a temp directory, writes the file byte-identical (all 256 byte values) and runnable, never overwrites a named file that exists, overwrites an explicit one, and creates
// directories; the command itself is dispatched unchanged after the prelude, and a command that names nothing in ops-workspace is dispatched exactly as before; limits, bad paths and a missing binding are handled; the answer says
// which root served each file.
// Run: node --no-warnings qnfo-ops/workspace-stage.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync, mkdtempSync, readFileSync as rf, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 500) : "")); } };
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };

ok(src === mirror, "deployed-current.worker.js is identical to worker.js");
const _v = (/^var VERSION = "(\d+)\.(\d+)\.(\d+)/m.exec(src) || []).slice(1).map(Number);
ok(_v.length === 3 && (_v[0] > 2 || (_v[0] === 2 && (_v[1] > 59 || (_v[1] === 59 && _v[2] >= 3)))), "VERSION is at least 2.59.3", _v);
const blk = grab("// ---- WORKSPACE-STAGE-1:BEGIN", "// ---- WORKSPACE-STAGE-1:END");
ok(blk.length > 2500, "the WORKSPACE-STAGE-1 block is found");
ok(/const st = await workspaceStage\(env, cmd, args\);\s*\n\s*const j = await containerDispatch\(env, "\/sh", \{ cmd: st\.prelude \+ cmd,/.test(src), "shell_exec stages before it dispatches");
ok(/const st = await workspaceStage\(env, cmd, args\);\s*\n\s*const j = await containerDispatch\(env, "\/workspace\/exec", \{ cmd: st\.prelude \+ cmd, dir \}/.test(src), "container_workspace_exec stages before it dispatches");
for (const n of ["shell_exec", "container_workspace_exec"]) {
  const decl = src.split("\n").find((l) => l.includes('{ name: "' + n + '", description')) || "";
  ok(/stage: \{ type: "array", items: \{ type: "string" \}/.test(decl) && /WORKSPACE-STAGE-1/.test(decl), n + " declares the stage argument and names WORKSPACE-STAGE-1");
}
ok(/NOT the container disk: shell_exec and container_workspace_exec see ops-workspace\/<path> as \/workspace\/<path>/.test(src), "workspace_write says which disk it is and where the shell sees the file");

const wsKey = (p) => "ops-workspace/" + String(p || "").replace(/^\/+/, "").replace(/\.\./g, "");
const lib = new Function("wsKey", "btoa", blk + "\nreturn { wssCandidates, workspaceStage, WSS_MAX_FILE, WSS_MAX_TOTAL, WSS_MAX_FILES };")(wsKey, btoa);
const fakeR2 = (files) => ({ BACKUPS_R2: { async get(key) { const v = files[key]; if (v === undefined) return null; const buf = typeof v === "string" ? new TextEncoder().encode(v) : v; return { arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }; } } });

// candidates
let c = lib.wssCandidates("bash /workspace/cloudflare-agent-setup/RESTORE.sh --check && cat /workspace/notes.txt.", ["probe.sh", "/workspace/sub/dir/x.py", "../evil", "a b", "", "probe.sh"]);
ok(JSON.stringify(c.map((x) => x.rel + ":" + x.how)) === JSON.stringify(["probe.sh:explicit", "sub/dir/x.py:explicit", "cloudflare-agent-setup/RESTORE.sh:named", "notes.txt:named"]), "explicit paths first (deduped, bad ones dropped), then named paths with trailing punctuation stripped", c);
ok(lib.wssCandidates("ls /workspace/ && cd /workspace", []).length === 0 && lib.wssCandidates("echo hi", undefined).length === 0, "a bare /workspace and a command that names nothing give no candidate");
ok(lib.wssCandidates("cat " + Array.from({ length: 30 }, (_, i) => "/workspace/f" + i).join(" "), []).length === 12, "at most 12 candidates");
ok(lib.wssCandidates("cat /workspace/../etc/passwd /workspace/a$b /workspace/x'y /workspace/`id`", []).every((x) => /^[A-Za-z0-9._\/-]+$/.test(x.rel) && x.rel.indexOf("..") < 0), "dot segments, shell metacharacters and quotes never reach a candidate (the name stops at the first one)");

// staging against a fake R2
const ALL = new Uint8Array(256); for (let i = 0; i < 256; i++) ALL[i] = i;
const files = { "ops-workspace/cloudflare-agent-setup/RESTORE.sh": "#!/bin/bash\necho restored-ok\n", "ops-workspace/probe.sh": "#!/bin/bash\necho probe-$1\n", "ops-workspace/data/all.bin": ALL, "ops-workspace/big.txt": "x".repeat(204801), "ops-workspace/note.txt": "from ops-workspace\n" };
let st = await lib.workspaceStage(fakeR2(files), "bash /workspace/cloudflare-agent-setup/RESTORE.sh", {});
ok(st.staged.length === 1 && st.staged[0].path === "cloudflare-agent-setup/RESTORE.sh" && st.staged[0].how === "named" && st.staged[0].bytes === 29 && /ops-workspace \(R2\) -> \/workspace\/cloudflare-agent-setup\/RESTORE\.sh/.test(st.staged[0].root), "a named path that exists in ops-workspace is staged and the answer names the root", st.staged);
ok(st.prelude.startsWith('W="${QNFO_WORKSPACE:-/workspace}"; ') && st.prelude.endsWith("; ") && /\[ -e "\$W\/cloudflare-agent-setup\/RESTORE\.sh" \] \|\| \{ mkdir -p "\$W\/cloudflare-agent-setup" && printf %s '[A-Za-z0-9+\/=]+' \| base64 -d > "\$W\/cloudflare-agent-setup\/RESTORE\.sh" && chmod \+x /.test(st.prelude), "a named file is filled in only when missing, with directories made and the script made executable", st.prelude.slice(0, 300));
st = await lib.workspaceStage(fakeR2(files), "echo hi", { stage: ["probe.sh", "missing.sh"] });
ok(st.staged.length === 1 && st.staged[0].how === "explicit" && st.skipped.length === 1 && st.skipped[0].path === "missing.sh" && /not found in ops-workspace/.test(st.skipped[0].why), "an explicit path is staged; an explicit path that is not in ops-workspace is reported, not hidden", { st: st.staged, sk: st.skipped });
ok(!/\[ -e/.test(st.prelude) && /mkdir -p "\$W" && printf/.test(st.prelude), "an explicit path is written over the container copy");
st = await lib.workspaceStage(fakeR2(files), "cat /workspace/nothing-here.txt /workspace/other", {});
ok(st.prelude === "" && st.staged.length === 0 && st.skipped.length === 0, "a named path that is not in ops-workspace is left alone (it may be a container file): no prelude, no skip noise", st);
st = await lib.workspaceStage(fakeR2(files), "cat /workspace/big.txt /workspace/note.txt", {});
ok(st.staged.length === 1 && st.staged[0].path === "note.txt" && st.skipped.length === 1 && /staging limit/.test(st.skipped[0].why), "a file over 200 KB is skipped with the way out named; the rest is staged", { st: st.staged, sk: st.skipped });
st = await lib.workspaceStage({}, "cat /workspace/note.txt", {});
ok(st.prelude === "" && st.staged.length === 0, "without the R2 binding nothing is staged and nothing throws");
st = await lib.workspaceStage({ BACKUPS_R2: { get: async () => { throw new Error("R2 down"); } } }, "cat /workspace/note.txt", { stage: ["note.txt"] });
ok(st.prelude === "" && st.skipped.length === 1, "an R2 read error is a skipped path, never a failed command", st);

// the prelude run in a real bash
const bash = (() => { const r = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" }); return r.status === 0 && /ok/.test(r.stdout) ? "bash" : null; })();
if (!bash) console.log("note: no bash on this host, the end-to-end run is skipped");
else {
  const root = mkdtempSync(join(tmpdir(), "wss-"));
  const run = (cmdLine) => spawnSync("bash", ["-c", cmdLine], { encoding: "utf8", env: Object.assign({}, process.env, { QNFO_WORKSPACE: root }) });
  // named: restore script runs although it never existed on the container disk
  let s1 = await lib.workspaceStage(fakeR2(files), "bash /workspace/cloudflare-agent-setup/RESTORE.sh", {});
  let r = run(s1.prelude + 'bash "$W/cloudflare-agent-setup/RESTORE.sh"');
  ok(r.status === 0 && r.stdout.trim() === "restored-ok", "the script written by workspace_write runs in the shell (the 2026-10-25 failure)", { out: r.stdout, err: r.stderr, status: r.status });
  ok(readFileSync(join(root, "cloudflare-agent-setup/RESTORE.sh"), "utf8") === files["ops-workspace/cloudflare-agent-setup/RESTORE.sh"], "and it is byte-identical to the ops-workspace file");
  if (process.platform !== "win32") ok((statSync(join(root, "cloudflare-agent-setup/RESTORE.sh")).mode & 0o111) !== 0, "and executable");
  // fill-only
  writeFileSync(join(root, "note.txt"), "container copy\n");
  s1 = await lib.workspaceStage(fakeR2(files), "cat /workspace/note.txt", {});
  r = run(s1.prelude + 'cat "$W/note.txt"');
  ok(r.stdout === "container copy\n", "a named path that already exists on the container disk is not overwritten", r.stdout);
  // explicit overwrites
  s1 = await lib.workspaceStage(fakeR2(files), "cat /workspace/note.txt", { stage: ["note.txt"] });
  r = run(s1.prelude + 'cat "$W/note.txt"');
  ok(r.stdout === "from ops-workspace\n", "an explicit path overwrites the container copy", r.stdout);
  // binary safe, nested directory
  s1 = await lib.workspaceStage(fakeR2(files), "cat /workspace/data/all.bin", {});
  r = run(s1.prelude + 'true');
  const got = rf(join(root, "data/all.bin"));
  ok(got.length === 256 && got.every((b, i) => b === i), "all 256 byte values survive the base64 prelude into a new directory");
  // the command's own exit status is the answer's
  s1 = await lib.workspaceStage(fakeR2(files), "false /workspace/note.txt", {});
  r = run(s1.prelude + "exit 7");
  ok(r.status === 7, "the prelude does not change the command's exit status", r.status);
  // probe.sh with an argument: workspace_write -> shell_exec -> same bytes back (the issue's own probe)
  s1 = await lib.workspaceStage(fakeR2(files), "echo", { stage: ["probe.sh"] });
  r = run(s1.prelude + 'bash "$W/probe.sh" 42');
  ok(r.stdout.trim() === "probe-42" && readFileSync(join(root, "probe.sh"), "utf8") === files["ops-workspace/probe.sh"], "write probe.sh with workspace_write, run it with shell_exec, compare the bytes: the definition of done of the issue");
}

// shellExec and containerWorkspaceExec: the prelude is in front, the command is unchanged, nothing changes when nothing is named
{
  const seen = [];
  const containerDispatch = async (env, route, body) => { seen.push({ route, body }); return { ok: true, result: { exitCode: 0, stdout: "x", stderr: "" } }; };
  const fmtContainer = (j) => ({ ok: j.result.exitCode === 0, exit_code: j.result.exitCode, stdout: j.result.stdout, stderr: j.result.stderr });
  const sh = new Function("wsKey", "btoa", "containerDispatch", "fmtContainer", "__name", blk + "\n" + grab("async function shellExec(env, args) {", 'async function execPython(env, args) {').replace(/\n__name\w*\(shellExec.*$/gm, "") + "\n" + grab("async function containerWorkspaceExec(env, args) {", "async function containerStatus(env, args) {").replace(/\n__name\w*\(containerWorkspaceExec.*$/gm, "") + "\nreturn { shellExec, containerWorkspaceExec };")(wsKey, btoa, containerDispatch, fmtContainer, () => {});
  const env = fakeR2(files);
  let out = await sh.shellExec(env, { cmd: "bash /workspace/probe.sh", cwd: "/workspace", env: { A: "1" } });
  ok(seen[0].route === "/sh" && seen[0].body.cmd.startsWith('W="${QNFO_WORKSPACE:-/workspace}"; ') && seen[0].body.cmd.endsWith("; bash /workspace/probe.sh") && seen[0].body.cwd === "/workspace" && seen[0].body.env.A === "1", "shell_exec dispatches the prelude and then the command exactly as written", { cmd: seen[0].body.cmd.slice(0, 80) + "..." + seen[0].body.cmd.slice(-40) });
  ok(out.staged && out.staged[0].path === "probe.sh" && out.ok === true, "and the answer lists what was staged", out);
  out = await sh.shellExec(env, { cmd: "ls -la /workspace" });
  ok(seen[1].body.cmd === "ls -la /workspace" && out.staged === undefined, "a command that names nothing in ops-workspace is dispatched exactly as before", { cmd: seen[1].body.cmd });
  out = await sh.containerWorkspaceExec(env, { cmd: "bash probe.sh 1", dir: "x", stage: ["probe.sh"] });
  ok(seen[2].route === "/workspace/exec" && seen[2].body.dir === "x" && seen[2].body.cmd.endsWith("; bash probe.sh 1") && out.staged[0].how === "explicit", "container_workspace_exec stages the explicit path in front of its command", { cmd: seen[2].body.cmd.slice(-30), out: out.staged });
  out = await sh.shellExec(env, { cmd: "cat /workspace/big.txt" });
  ok(out.stage_skipped && out.stage_skipped[0].path === "big.txt" && seen[3].body.cmd === "cat /workspace/big.txt", "a skipped file is reported on the answer and the command still runs", out);
  out = await sh.shellExec({}, { cmd: "" });
  ok(out.ok === false && /cmd required/.test(out.error), "an empty command is still refused");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);

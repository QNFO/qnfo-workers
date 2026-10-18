#!/usr/bin/env node
// scripts/run-suites.mjs: SUITE-RUNNER-1 (transformation levers T1.10 and T5.4, pillar autonomy).
//
// WHAT   Runs the repository's offline suites (<worker>/*.test.mjs and scripts/*.test.mjs) so that no suite depends on
//        someone remembering to wire it into a workflow. With --changed-file it runs every suite of each changed worker
//        directory; when a changed directory is a control-plane worker (CONTROL_PLANE, mirrored from qnfo-fleet-control
//        TP_CONTROL_PLANE and checked by scripts/run-suites.test.mjs) or a shared path (scripts, .github, migrations), it
//        runs every suite in the repository. --all runs every suite (push to main, manual dispatch).
// WHY    On 2026-10-06, 19 suites were referenced by no workflow, and three of them (radar-hub away-gate, taste-learn,
//        title-noise) had been failing on main unnoticed. Code-loop PRs are only as safe as the suites that run on them,
//        and the control plane can only be opened to the loop (T1.8) once its PRs run the full set (T5.4).
// USAGE  node scripts/run-suites.mjs --all | --changed-file /tmp/changed.txt [--jobs 4] [--timeout 180] [--list]
//        Exit 1 when any selected suite fails or times out. No network, no secrets; suites are run with node.
import { readdirSync, existsSync, readFileSync, statSync, mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const CONTROL_PLANE = ["qnfo-fleet-control", "qnfo-ops", "qnfo-deploy-guard", "qnfo-containers-pilot", "qnfo-gateway", "qnfo-ai", "qnfo-autonomy-scorer", "qnfo-observability", "qnfo-code-orchestrator", "qnfo-code-agent"];
export const SHARED = ["scripts", ".github", "migrations"];

// Every suite file in the repository, as relative paths, sorted.
export function discover(root) {
  const out = [];
  for (const d of readdirSync(root).sort()) {
    if (d.startsWith(".") || d === "node_modules") continue;
    const p = join(root, d);
    let st; try { st = statSync(p); } catch (e) { continue; }
    if (!st.isDirectory()) continue;
    for (const f of readdirSync(p).sort()) if (f.endsWith(".test.mjs")) out.push(d + "/" + f);
  }
  return out;
}

// The suites a change needs: every suite of each changed directory; a shared path (scripts, .github, migrations) still
// forces the full set. PRS-SCOPE-1 (2026-10-17): a control-plane worker validates its own suites on a PR; the full sweep
// stays on main's push (--all), so one worker's stale suite can no longer block every PR in the fleet.
// SUITE-GUARDS-ALWAYS-1 (2026-10-12): the repository-wide guard suites scan every suite or worker, so they run for any
// change at all; PR 946 (one worker) merged a range-regex VERSION pin that version-pin-guard refused on the next full-set run.
export const ALWAYS = ["scripts/version-pin-guard.test.mjs", "scripts/cron-single-trigger.test.mjs", "scripts/prompt-cache.test.mjs", "scripts/corruption-guard.test.mjs"];
export function select(all, changedDirs) {
  const dirs = Array.from(new Set((changedDirs || []).map((d) => String(d).trim()).filter(Boolean)));
  const wide = dirs.filter((d) => SHARED.includes(d));
  if (wide.length) return { suites: all.slice(), reason: "full set: " + wide.join(", ") + " changed" };
  const picked = all.filter((s) => dirs.includes(s.split("/")[0]) || (dirs.length && ALWAYS.includes(s)));
  return { suites: picked, reason: dirs.length ? "suites of " + dirs.join(", ") + " plus the repository guards" : "no worker directory changed" };
}

// SUITE-SYNTAX-CHECK-1 (2026-10-13, failure mode version-note-comment-terminator): node --check every worker.js and
// deployed-current.worker.js of the changed worker directories (all worker directories with --all), before any suite. Only
// charter-guard (qnfo-fleet-control) and code-loop-test (qnfo-code-orchestrator) syntax-checked a worker before, so a
// VERSION note containing the two characters that close a block comment broke a worker that has no suite.
export function syntaxTargets(root, changedDirs, everyWorker) {
  let dirs;
  if (everyWorker) dirs = readdirSync(root).filter((d) => !d.startsWith(".") && existsSync(join(root, d, "worker.js")));
  else dirs = Array.from(new Set((changedDirs || []).map((d) => String(d).trim()).filter((d) => d && !SHARED.includes(d))));
  const out = [];
  for (const d of dirs.sort()) for (const f of ["worker.js", "deployed-current.worker.js"]) if (existsSync(join(root, d, f))) out.push(d + "/" + f);
  return out;
}

// node 22 "--check" on a .js file that is an ES module exits 0 without parsing it as a module (module detection), so a
// worker with "export default" passed even with a syntax error; a module-shaped file is checked as a .mjs copy instead.
export function isModuleSource(text) { return /^\s*(export\s|import\s*[\w{*"'])/m.test(String(text || "")); }
function checkSyntax(root, file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let target = file;
    if (isModuleSource(readFileSync(join(root, file), "utf8"))) {
      target = join(mkdtempSync(join(tmpdir(), "syntax-")), file.replace(/[\\/]/g, "__") + ".mjs");
      copyFileSync(join(root, file), target);
    }
    const child = spawn(process.execPath, ["--check", target], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (b) => { out += b; });
    child.stderr.on("data", (b) => { out += b; });
    child.on("close", (code) => resolve({ suite: file + " (node --check)", code: code === null ? 124 : code, ms: Date.now() - t0, out }));
  });
}

function runOne(root, suite, timeoutS) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, ["--no-warnings", suite], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (b) => { out += b; });
    child.stderr.on("data", (b) => { out += b; });
    const timer = setTimeout(() => { out += "\n[run-suites] timed out after " + timeoutS + " s"; child.kill("SIGKILL"); }, timeoutS * 1000);
    child.on("close", (code) => { clearTimeout(timer); resolve({ suite, code: code === null ? 124 : code, ms: Date.now() - t0, out }); });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const root = process.cwd();
  const all = discover(root);
  let sel, syn;
  if (argv.includes("--all")) { sel = { suites: all, reason: "--all" }; syn = syntaxTargets(root, [], true); }
  else {
    const f = arg("--changed-file", null);
    if (!f || !existsSync(f)) { console.error("usage: run-suites.mjs --all | --changed-file <file of changed top-level dirs>"); process.exit(2); }
    const changed = readFileSync(f, "utf8").split(/\r?\n/);
    sel = select(all, changed);
    syn = syntaxTargets(root, changed, false);
  }
  console.log("SUITE-RUNNER-1: " + sel.suites.length + " of " + all.length + " suites (" + sel.reason + ")");
  if (argv.includes("--list")) { sel.suites.forEach((s) => console.log("  " + s)); return; }
  const jobs = Math.max(1, Number(arg("--jobs", 4)) || 4), timeoutS = Math.max(10, Number(arg("--timeout", 180)) || 180);
  const queue = sel.suites.slice(), results = [];
  for (const file of syn) { const r = await checkSyntax(root, file); if (r.code !== 0) results.push(r); }
  console.log("SUITE-SYNTAX-CHECK-1: " + syn.length + " worker file(s) syntax-checked, " + results.length + " failed");
  await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) results.push(await runOne(root, queue.shift(), timeoutS)); }));
  results.sort((a, b) => a.suite.localeCompare(b.suite));
  const failed = results.filter((r) => r.code !== 0);
  for (const r of results) console.log((r.code === 0 ? "ok   " : "FAIL ") + String(r.ms).padStart(6) + " ms  " + r.suite);
  for (const r of failed) { console.log("\n::group::FAIL " + r.suite + " (exit " + r.code + ")"); console.log(r.out.split("\n").slice(-40).join("\n")); console.log("::endgroup::"); }
  console.log("\nSUITE-RUNNER-1: " + (results.length - failed.length) + " passed, " + failed.length + " failed");
  process.exit(failed.length ? 1 : 0);
}

// ENTRY-POINT-1 (2026-10-17): `import.meta.url === "file://" + process.argv[1]` is POSIX-only. On Windows
// process.argv[1] is "C:\\...\\run-suites.mjs", so the comparison never matched: the runner printed nothing and
// exited 0, i.e. it reported a pass without running a single suite. pathToFileURL normalises both sides.
function isEntry() {
  try { return import.meta.url === pathToFileURL(process.argv[1]).href; } catch { return false; }
}
if (isEntry()) main();

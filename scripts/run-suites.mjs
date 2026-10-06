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
import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

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

// The suites a change needs: every suite of each changed directory, or all of them for a control-plane or shared change.
export function select(all, changedDirs) {
  const dirs = Array.from(new Set((changedDirs || []).map((d) => String(d).trim()).filter(Boolean)));
  const wide = dirs.filter((d) => CONTROL_PLANE.includes(d) || SHARED.includes(d));
  if (wide.length) return { suites: all.slice(), reason: "full set: " + wide.join(", ") + " changed" };
  const picked = all.filter((s) => dirs.includes(s.split("/")[0]));
  return { suites: picked, reason: dirs.length ? "suites of " + dirs.join(", ") : "no worker directory changed" };
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
  let sel;
  if (argv.includes("--all")) sel = { suites: all, reason: "--all" };
  else {
    const f = arg("--changed-file", null);
    if (!f || !existsSync(f)) { console.error("usage: run-suites.mjs --all | --changed-file <file of changed top-level dirs>"); process.exit(2); }
    sel = select(all, readFileSync(f, "utf8").split(/\r?\n/));
  }
  console.log("SUITE-RUNNER-1: " + sel.suites.length + " of " + all.length + " suites (" + sel.reason + ")");
  if (argv.includes("--list")) { sel.suites.forEach((s) => console.log("  " + s)); return; }
  const jobs = Math.max(1, Number(arg("--jobs", 4)) || 4), timeoutS = Math.max(10, Number(arg("--timeout", 180)) || 180);
  const queue = sel.suites.slice(), results = [];
  await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) results.push(await runOne(root, queue.shift(), timeoutS)); }));
  results.sort((a, b) => a.suite.localeCompare(b.suite));
  const failed = results.filter((r) => r.code !== 0);
  for (const r of results) console.log((r.code === 0 ? "ok   " : "FAIL ") + String(r.ms).padStart(6) + " ms  " + r.suite);
  for (const r of failed) { console.log("\n::group::FAIL " + r.suite + " (exit " + r.code + ")"); console.log(r.out.split("\n").slice(-40).join("\n")); console.log("::endgroup::"); }
  console.log("\nSUITE-RUNNER-1: " + (results.length - failed.length) + " passed, " + failed.length + " failed");
  process.exit(failed.length ? 1 : 0);
}

if (import.meta.url === "file://" + process.argv[1]) main();

#!/usr/bin/env node
// APPLY-LISTISSUES-AWAIT-FIX (2026-09-08)
// One-line guarded patch for the qnfo-ops invisible-backlog bug.
//
// Root cause: listIssues() calls stmt.all() (and stmt.bind(...).all()) WITHOUT await.
// D1's .all() is async -> res is a Promise -> res.results is undefined ->
// { count: 0, issues: [] } for EVERY status, including "all". The backlog is real
// (D1 agent_issues holds open rows) but ops_issues_list always reports zero.
//
// Fix: wrap the expression in await:
//   const res = params.length ? stmt.bind.apply(stmt, params).all() : stmt.all();
//   const res = await (params.length ? stmt.bind.apply(stmt, params).all() : stmt.all());
//
// Safety: asserts the buggy line occurs EXACTLY once per target file; refuses
// otherwise. Idempotent: files already patched are reported and skipped.
//
// Usage (from repo root):   node qnfo-ops/scripts/apply-listIssues-await-fix.mjs [file...]
// Default targets: qnfo-ops/worker.js (main = "worker.js" in qnfo-ops/wrangler.toml).
// After patching, deploy:   wrangler deploy (or the repo deploy runbook) from qnfo-ops/.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BUG = "    const res = params.length ? stmt.bind.apply(stmt, params).all() : stmt.all();";
const FIX = "    const res = await (params.length ? stmt.bind.apply(stmt, params).all() : stmt.all());";

const argvTargets = process.argv.slice(2);
const files = argvTargets.length ? argvTargets : ["qnfo-ops/worker.js"];

let changed = 0;
let exitCode = 0;

for (const f of files) {
  if (!existsSync(f)) {
    console.error("missing file:", f);
    exitCode = 1;
    continue;
  }
  const src = readFileSync(f, "utf8");
  const n = src.split(BUG).length - 1;
  if (n === 0) {
    const already = src.includes(FIX);
    console.log((already ? "already patched:" : "buggy line not found (already fixed or changed):"), f);
    continue;
  }
  if (n !== 1) {
    console.error("expected exactly 1 occurrence, found", n, "in", f, "- aborting (no write)");
    exitCode = 1;
    continue;
  }
  const patched = src.replace(BUG, FIX);
  writeFileSync(f, patched, "utf8");
  changed++;
  console.log("patched:", f, "bytes", Buffer.byteLength(src, "utf8"), "->", Buffer.byteLength(patched, "utf8"));
}

console.log(changed ? "OK: patched " + changed + " file(s). Redeploy qnfo-ops for the fix to go live." : "nothing to patch");
process.exit(exitCode);

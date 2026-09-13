#!/usr/bin/env node
// qnfo-pipeline-ops v0.5.6-terminal-requires-error — guarded patcher.
//
// WHY THIS EXISTS
// Verified 2026-09-13 against live qnfo-audit D1 from the ops endpoint:
//   research_queue source_id 45 -> status='queued',     attempt=3,  error=NULL, recover_count=0
//   research_queue source_id 51 -> status='researching',attempt=4,  error=NULL, recover_count=0
//   research_queue source_id 40 -> status='pending',    attempt=12, error=NULL, recover_count=0
// The deployed build alerts "terminal research failure 45" / "... 51" every hour
// (alerts ids 1103..1116 on 2026-09-13) while all three rows carry error=NULL.
// A terminal FAILURE without an error is a contradiction: the label is being
// derived from attempt count, which climbs forever on a re-picked row.
//
// The repo source's own query is status='failed' AND recover_count>=2, which
// cannot select those rows. That is the third independent proof that the live
// build is not this source (the other two: live alerts still emit the string
// "-> agent_issues dup" although v0.5.3 gates that emit on r.inserted; and
// pipeline_state exists in live D1 with 0 rows although v0.5.4 writes it).
//
// WHAT THIS CHANGES
//   1. terminalFailures() additionally requires error IS NOT NULL AND TRIM(error) <> ''
//   2. VERSION -> 0.5.6-terminal-requires-error
//
// SAFETY
// Guarded and idempotent, matching apply-remediation.mjs in this repo. Each
// anchor must appear EXACTLY ONCE. If any anchor is missing or ambiguous the
// script writes nothing and exits non-zero. Re-running after a successful apply
// reports "already applied" and changes nothing.
//
// USAGE
//   node apply-terminal-error-guard.mjs --check    # report, write nothing
//   node apply-terminal-error-guard.mjs --apply    # write worker.js in place

import { readFileSync, writeFileSync } from "node:fs";

const TARGET = new URL("./worker.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const ANCHORS = [
  {
    name: "terminalFailures query — require a real error",
    from: `const r = await env.QNFO_AUDIT.prepare("SELECT id, source_id, error, attempt, recover_count FROM research_queue WHERE status='failed' AND COALESCE(recover_count,0) >= ?1").bind(MAX_RECOVERS).all();`,
    to: `const r = await env.QNFO_AUDIT.prepare("SELECT id, source_id, error, attempt, recover_count FROM research_queue WHERE status='failed' AND COALESCE(recover_count,0) >= ?1 AND error IS NOT NULL AND TRIM(error) <> ''").bind(MAX_RECOVERS).all();`,
  },
  {
    name: "VERSION bump",
    from: `var VERSION = "0.5.5-race-and-triage-fix";`,
    to: `var VERSION = "0.5.6-terminal-requires-error";`,
  },
];

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0, i = 0;
  for (;;) {
    const j = hay.indexOf(needle, i);
    if (j === -1) break;
    n++;
    i = j + needle.length;
  }
  return n;
}

function main() {
  const mode = process.argv.includes("--apply") ? "apply"
    : process.argv.includes("--check") ? "check"
    : null;
  if (!mode) {
    console.error("usage: node apply-terminal-error-guard.mjs --check | --apply");
    process.exit(2);
  }

  let src;
  try {
    src = readFileSync(TARGET, "utf8");
  } catch (e) {
    console.error(`cannot read ${TARGET}: ${e.message}`);
    process.exit(1);
  }

  // idempotence: if every `to` is already present and no `from` remains, we are done
  const allApplied = ANCHORS.every((a) => src.includes(a.to));
  const noneApplied = ANCHORS.every((a) => src.includes(a.from));
  if (allApplied && !noneApplied) {
    console.log("already applied — worker.js already carries the error guard. nothing to do.");
    return;
  }

  // guard: every anchor must appear exactly once
  const problems = [];
  for (const a of ANCHORS) {
    const n = countOccurrences(src, a.from);
    if (n !== 1) problems.push(`  [${a.name}] expected exactly 1 occurrence of anchor, found ${n}`);
  }
  if (problems.length) {
    console.error("REFUSING TO WRITE — anchor ambiguity:");
    for (const p of problems) console.error(p);
    console.error("No file was modified. Re-derive the anchors from the current worker.js.");
    process.exit(1);
  }

  let out = src;
  for (const a of ANCHORS) out = out.replace(a.from, a.to);

  console.log(`mode=${mode} target=${TARGET}`);
  console.log(`  bytes: ${src.length} -> ${out.length} (delta ${out.length - src.length})`);
  for (const a of ANCHORS) console.log(`  ok  ${a.name}`);

  if (mode === "check") {
    console.log("check only — no file written. Re-run with --apply to patch.");
    return;
  }

  writeFileSync(TARGET, out, "utf8");
  console.log("applied. worker.js patched in place.");
  console.log("NEXT: deploy. The live build predates v0.5.3, so this patch alone changes nothing in production.");
}

main();

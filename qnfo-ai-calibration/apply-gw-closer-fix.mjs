#!/usr/bin/env node
/**
 * apply-gw-closer-fix.mjs  —  qnfo-ai-calibration
 *
 * Fixes the gw-fail ticket lifecycle so `[gw-fail]` / `[ai-cal]` tickets can actually close.
 *
 * FINDING (source-verified 2026-09-13, blob 7a37a8ab74bb4aeaf70fc2438e3c7a48f20d685e, VERSION 1.1.4):
 * the closer in gatewayFailureSweep() has two independent defects, so it can never close anything.
 *
 *   (1) UNSATISFIABLE PREDICATE. The close test is
 *         COUNT(*) FROM ai_gateway_failures WHERE model = ?1 AND ts > t0 - 24h
 *       Live data: 2515 rows over 385 sweeps in 7.979 d = 48.25 sweeps/day, 6.53 rows/sweep,
 *       i.e. ~315 rows always inside a 24 h window, and ~48 for any single model. The predicate
 *       requires 0. It can never be satisfied, so the close branch never fires.
 *
 *   (2) TABLE MISMATCH. The loop enumerates open titles from `agent_issues`, then calls
 *       closeIssue(), which resolves rows only in `issue_ledger` by fingerprint. Even with a
 *       satisfiable predicate, the agent_issues rows it enumerated would stay open.
 *       closeIssue() also early-returns when no issue_ledger row exists, which silently skips
 *       the agent_issues close for titles that only exist in agent_issues.
 *
 * Combined with the backlog-exec drain (which only closes rows with a re-probe target), these
 * tickets are triple-blocked. 10 `[gw-fail]` + 10 `MODEL-DEGRADED` of 25 open rows are affected.
 *
 * THIS PATCH
 *   A. Bind the sweep's own window (`lastTs`) instead of a 24 h window, mirroring the filing
 *      condition: a model that failed in this sweep has ts = t0 > lastTs, so it will not close;
 *      a model with no failure this sweep yields 0 and closes. The predicate becomes reachable.
 *   B. Make closeIssue() also close the `agent_issues` row it was asked about, and do that
 *      BEFORE the issue_ledger early-return so titles present only in agent_issues still close.
 *
 * Both edits are exact-string, single-occurrence, and verified before writing.
 *
 * Usage:
 *   node qnfo-ai-calibration/apply-gw-closer-fix.mjs [path/to/worker.js]
 *   node qnfo-ai-calibration/apply-gw-closer-fix.mjs [path] --apply
 *
 * Exit: 0 ok/dry-run | 2 wrong file | 3 pattern not found (nothing written)
 *       4 pattern ambiguous (nothing written) | 5 already patched (nothing written)
 */

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FILE = args.find((a) => !a.startsWith("--")) || "qnfo-ai-calibration/worker.js";

let src = readFileSync(FILE, "utf8");
console.log(`file:  ${FILE}`);
console.log(`bytes: ${Buffer.byteLength(src)}`);
console.log(`mode:  ${APPLY ? "APPLY" : "dry run"}`);

if (!src.includes("gatewayFailureSweep")) {
  console.error("\nFAIL: no 'gatewayFailureSweep' in this file. Wrong path?");
  process.exit(2);
}

/* ---------------- edit A: satisfiable window ---------------- */

const A_FROM =
`        var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2").bind(modelPart, t0 - 24 * 3600 * 1000).first();
        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures for 24h");`;

const A_TO =
`        // GW-CLOSER-FIX-1 (2026-09-13): was t0 - 24*3600*1000, a predicate that could never be
        // satisfied (the append-only failure table always holds ~48 rows per model per 24h at the
        // 29.8-min sweep cadence, so COUNT(*) could never reach 0 and the close branch never fired).
        // Bind the sweep's own window instead, mirroring the filing condition: rows are inserted
        // with ts = t0 for every model that failed in this sweep, so ts > lastTs is 0 exactly when
        // this model produced no failure this sweep.
        var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2").bind(modelPart, lastTs).first();
        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures in the latest sweep window");`;

/* ---------------- edit B: close the row that was enumerated ---------------- */

const B_FROM =
`  var ex = await env.QNFO_AUDIT.prepare("SELECT fingerprint FROM issue_ledger WHERE fingerprint = ?1 AND status = 'open' LIMIT 1").bind(fp).first();
  if (!ex) return false;
  await env.QNFO_AUDIT.prepare("UPDATE issue_ledger SET status = 'resolved', resolved_at = ?2, resolution_note = ?3, updated_at = ?2 WHERE fingerprint = ?1").bind(fp, now(), String(reason || "").slice(0, 300)).run();
  return true;
}`;

const B_TO =
`  // GW-CLOSER-FIX-1 (2026-09-13): the closer loop enumerates open titles from agent_issues but
  // this function only ever resolved issue_ledger rows, so the enumerated agent_issues rows stayed
  // open forever. Close the agent_issues row FIRST, before the issue_ledger early-return, so titles
  // that exist only in agent_issues also close.
  var closedAgent = 0;
  try {
    var ar = await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET status = 'closed', updated_at = ?2 WHERE title = ?1 AND status = 'open'").bind(title, now()).run();
    closedAgent = (ar && ar.meta && ar.meta.changes) || 0;
  } catch (e) {}
  var ex = await env.QNFO_AUDIT.prepare("SELECT fingerprint FROM issue_ledger WHERE fingerprint = ?1 AND status = 'open' LIMIT 1").bind(fp).first();
  if (ex) {
    await env.QNFO_AUDIT.prepare("UPDATE issue_ledger SET status = 'resolved', resolved_at = ?2, resolution_note = ?3, updated_at = ?2 WHERE fingerprint = ?1").bind(fp, now(), String(reason || "").slice(0, 300)).run();
    return true;
  }
  return closedAgent > 0;
}`;

const EDITS = [
  { name: "A satisfiable sweep window", from: A_FROM, to: A_TO },
  { name: "B close the enumerated agent_issues row", from: B_FROM, to: B_TO },
];

/* ---------------- preflight ---------------- */

const already = EDITS.filter((e) => src.includes(e.to) && !src.includes(e.from));
if (already.length === EDITS.length) {
  console.log("\nALREADY PATCHED (both edits present). Nothing to do.");
  process.exit(5);
}

let out = src;
for (const e of EDITS) {
  const n = out.split(e.from).length - 1;
  console.log(`\n[${e.name}] occurrences of target: ${n}`);
  if (n === 0) {
    console.error(`FAIL: target not found. Nothing written.`);
    console.error(`expected exact text:\n${e.from}`);
    process.exit(3);
  }
  if (n > 1) {
    console.error(`FAIL: target occurs ${n} times (ambiguous). Nothing written.`);
    process.exit(4);
  }
}

if (!APPLY) {
  console.log("\nDry run OK - both targets found exactly once. Nothing written.");
  console.log("Re-run with --apply to patch.");
  process.exit(0);
}

for (const e of EDITS) {
  out = out.replace(e.from, e.to);
  console.log(`applied: ${e.name}`);
}

copyFileSync(FILE, FILE + ".bak");
writeFileSync(FILE, out);
console.log(`\nwrote ${FILE} (backup at ${FILE}.bak)`);
console.log("\nVerify after deploy:");
console.log("  - a model with no failures in the current sweep has its [gw-fail] ticket closed");
console.log("  - agent_issues open [gw-fail] count falls (was 8: ids 654-660, 670)");
console.log("  - issue_ledger open [gw-fail] count falls (was 6, frozen since 2026-09-11T09:04Z)");
console.log("  - backlog_status openBacklog falls below 25");
console.log("\nNOTE: the backlog-exec drain will still report closed:0 for these rows - it only");
console.log("closes re-probed-healthy rows. The closure must come from this worker's sweep.");

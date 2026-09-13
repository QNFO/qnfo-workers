#!/usr/bin/env node
/**
 * apply-gw-closer-fix.mjs  —  qnfo-ai-calibration
 *
 * Makes `[gw-fail]` tickets able to close.
 *
 * ── REVISION 2 (2026-09-13). Revision 1 was WRONG. Read this before using. ──
 *
 * Rev 1 targeted `qnfo-ai-calibration/worker.js` and applied TWO edits, the second of which
 * assumed closeIssue() wrote to issue_ledger while the closer enumerated agent_issues. That
 * assumption came from worker.js — which is a STALE file. The deployed implementation is
 * `qnfo-ai-calibration/deployed-current.worker.js` (bundle, VERSION 1.1.4, sha 3624a4da), and its
 * closeIssue() correctly updates agent_issues. There is no table mismatch and no re-open path in
 * the deployed code. Edit B is therefore UNNECESSARY and has been REMOVED.
 *
 * Provenance defect worth fixing separately: `worker.js` (35,742 B, issue_ledger-based) and
 * `deployed-current.worker.js` (33,551 B, agent_issues-based) are materially different
 * implementations that both claim VERSION 1.1.4. Live data says the agent_issues variant is the
 * one running: agent_issues rows carry source='qnfo-ai-calibration' with the deployed bundle's
 * exact description string and are still being created (ids 654-660 on 09-11T13:30Z), while
 * issue_ledger's `gwfail:*` rows froze at 2026-09-11T09:04:00.430Z (first_seen == last_seen,
 * occurrences 1). Reconcile the two files and bump the version.
 *
 * ── THE ONE REMAINING DEFECT (present in BOTH files, verified) ──
 *
 * The closer's predicate requires ZERO failures in a 24h window:
 *     COUNT(*) FROM ai_gateway_failures WHERE model = ?1 AND ts > t0 - 24h   ==  0
 * The failure table is append-only at ~48.25 sweeps/day, and every affected model appears in
 * 47-48 of the last 48 sweeps, so this count is ~48 and can never reach 0. The close branch
 * NEVER fires. That is the bug this patch fixes.
 *
 * ── THE FIX ──
 *
 * Bind the sweep's own window (`lastTs`) instead of 24h. Rows are inserted with ts = t0 for every
 * model that failed in this sweep, so `ts > lastTs` is 0 exactly when this model produced no
 * failure this sweep. The predicate becomes reachable.
 *
 * The close then STICKS: the same loop's disposition gate
 *     SELECT id FROM agent_issues WHERE title LIKE '%<model>%' AND status IN ('wontfix','closed','resolved')
 * finds the row this patch just closed and `continue`s, suppressing re-filing. Verified in source.
 *
 * ── NOTE ON WHAT THIS DOES NOT DO ──
 *
 * It does not clear the current backlog. All 7 affected models currently fail every sweep, so
 * under the fixed predicate they correctly stay open. The fix removes a permanent ratchet
 * (tickets could never close even after recovery); it does not manufacture recovery.
 *
 * Usage:
 *   node qnfo-ai-calibration/apply-gw-closer-fix.mjs [path/to/file] [--apply]
 *   default path: qnfo-ai-calibration/deployed-current.worker.js
 *
 * Exit: 0 ok/dry-run | 2 wrong file | 3 pattern not found | 4 ambiguous | 5 already patched
 */

import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FILE = args.find((a) => !a.startsWith("--")) || "qnfo-ai-calibration/deployed-current.worker.js";

const src = readFileSync(FILE, "utf8");
console.log(`file:  ${FILE}`);
console.log(`bytes: ${Buffer.byteLength(src)}`);
console.log(`mode:  ${APPLY ? "APPLY" : "dry run"}`);

if (!src.includes("gatewayFailureSweep")) {
  console.error("\nFAIL: no 'gatewayFailureSweep' in this file. Wrong path?");
  process.exit(2);
}

/* ---------- which variant is this? ---------- */
const closeTargetsAgentIssues = /UPDATE agent_issues SET status = 'closed'/.test(src);
const closeTargetsIssueLedger = /UPDATE issue_ledger SET status = 'resolved'/.test(src);
console.log(`\nvariant: closeIssue() targets ` +
  (closeTargetsAgentIssues ? "agent_issues  (DEPLOYED variant - correct)" :
   closeTargetsIssueLedger ? "issue_ledger  (STALE variant)" : "NEITHER (unknown)"));
if (closeTargetsIssueLedger) {
  console.error("\nWARNING: this looks like the STALE issue_ledger-based implementation.");
  console.error("The deployed worker uses the agent_issues variant. Reconciling the two files is");
  console.error("a prerequisite - patching the stale file and deploying it would REGRESS the");
  console.error("agent_issues behaviour. Continuing in dry-run only is safe; --apply is refused.");
}

/* ---------- the single edit ---------- */

const FROM_BUNDLE =
`        var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2").bind(modelPart, t0 - 24 * 3600 * 1e3).first();
        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures for 24h");`;

const FROM_SOURCE =
`        var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2").bind(modelPart, t0 - 24 * 3600 * 1000).first();
        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures for 24h");`;

const TO_BUNDLE =
`        var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2").bind(modelPart, lastTs).first();
        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures in the latest sweep window");`;

const TO_SOURCE =
`        var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2").bind(modelPart, lastTs).first();
        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures in the latest sweep window");`;

// idempotency: already patched?
if (src.includes(".bind(modelPart, lastTs).first();")) {
  console.log("\nALREADY PATCHED (predicate already bound to lastTs). Nothing to do.");
  process.exit(5);
}

let FROM = null, TO = null, form = null;
const nBundle = src.split(FROM_BUNDLE).length - 1;
const nSource = src.split(FROM_SOURCE).length - 1;
console.log(`\ntarget occurrences: bundle-form(1e3)=${nBundle}  source-form(1000)=${nSource}`);

if (nBundle === 1 && nSource === 0) { FROM = FROM_BUNDLE; TO = TO_BUNDLE; form = "bundle (1e3)"; }
else if (nSource === 1 && nBundle === 0) { FROM = FROM_SOURCE; TO = TO_SOURCE; form = "source (1000)"; }
else if (nBundle === 0 && nSource === 0) {
  console.error("\nFAIL: predicate target not found in either form. Nothing written.");
  process.exit(3);
} else {
  console.error(`\nFAIL: ambiguous (bundle=${nBundle}, source=${nSource}). Nothing written.`);
  process.exit(4);
}
console.log(`matched form: ${form}`);

if (!APPLY) {
  console.log("\nDry run OK - target found exactly once. Nothing written. Re-run with --apply.");
  process.exit(0);
}
if (closeTargetsIssueLedger) {
  console.error("\nREFUSED (--apply): refusing to patch the stale issue_ledger variant. Nothing written.");
  process.exit(3);
}

const out = src.replace(FROM, TO);
copyFileSync(FILE, FILE + ".bak");
writeFileSync(FILE, out);
console.log(`\nwrote ${FILE} (backup at ${FILE}.bak)`);
console.log("\nVerify after deploy:");
console.log("  - a model with no failures in the current sweep gets its [gw-fail] ticket closed");
console.log("  - the closed row then suppresses re-filing via the disposition gate");
console.log("  - agent_issues open [gw-fail] count falls once a model recovers (was 8: 654-660, 670)");
console.log("\nDO NOT expect the backlog to fall while the models keep failing. bge-base-en-v1.5");
console.log("429s at 89/sweep; that is a separate, higher-value fix.");

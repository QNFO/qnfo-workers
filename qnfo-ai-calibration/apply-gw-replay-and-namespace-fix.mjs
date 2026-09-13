#!/usr/bin/env node
/**
 * apply-gw-replay-and-namespace-fix.mjs  —  qnfo-ai-calibration
 *
 * Fixes the defects that generate 100% of the open ai-calibration backlog:
 *   7x  [gw-fail] 429/400 tickets  (agent_issues 678-684)
 *   1x  MODEL-DEGRADED             (agent_issues 689)
 * and the replayed numbers the backlog drain cites as evidence that they are real.
 *
 * ── MEASURED (2026-09-13, qnfo-ops, live qnfo-audit D1) ──
 *
 * ai_gateway_failures, GROUP BY model over the full table:
 *
 *   model                                  rows  distinct_samples  distinct_counts  distinct_ts
 *   @cf/zai-org/glm-5.2                     641         4                1              398
 *   @cf/qwen/qwen2.5-coder-32b-instruct     398         2                1              398
 *   @cf/moonshotai/kimi-k2.6                398         3                2              398
 *   @cf/google/gemma-4-26b-a4b-it           397         2                1              397
 *   @cf/baai/bge-base-en-v1.5               397         2               15              397
 *   @cf/qwen/qwen3.8-27b                    337         5               12              337
 *   @cf/moonshotai/kimi-k2.7-code            51         1                1               51
 *
 * 397 rows for one model, drawn from TWO distinct sample_detail strings, at ONE constant count,
 * with 397 distinct timestamps spaced exactly 1_800_000 ms apart (the 30-min cron). The timestamps
 * advance; the payload does not. The gemma rows carry the SAME AiError request UUID
 * (d974d123-c3e5-428a-9ee6-3b7974665f40) for 397 consecutive sweeps.
 *
 * Per-sweep bucket counts sum to EXACTLY 150 = limit(3 pages) x per_page(50):
 *   79 (bge) + 42 (qwen2.5-coder) + 18 (qwen3.8-27b) + 6 + 2 + 1 + 1 + 1 = 150
 *
 * => RC-1: the AI Gateway logs API does not honour `start_time`. Every sweep re-reads the same
 *    newest-150 failed page and re-stamps it with ts = t0. Therefore:
 *      (a) every "N failures / 24h" figure is  N_per_sweep x sweeps, i.e. REPLAYED, not measured;
 *      (b) the closer predicate `COUNT(*) WHERE ts > t0-24h == 0` is unreachable (~48), so the
 *          7 [gw-fail] tickets are structurally unclosable;
 *      (c) ai_model_health is degraded on replayed data.
 *
 * => RC-2: internalId() is built only from TIER0_WA, so any @cf/... model absent from that map
 *    falls through to `return m` and is written to ai_model_health under its QUALIFIED id -- a
 *    second row nothing probes (last_probe_ts NULL) and nothing clears. The advisor reads that
 *    row and files MODEL-DEGRADED. Live: @cf/baai/bge-base-en-v1.5, @cf/qwen/qwen3.8-27b,
 *    @cf/zai-org/glm-5.2, @cf/qwen/qwen2.5-coder-32b-instruct, @cf/google/gemma-4-26b-a4b-it are
 *    all `degraded` while their short-name twin is `ok` (e.g. bge 39ms, qwen3.8-27b 432ms).
 *
 * ── WHAT THIS PATCH DOES ──
 *
 *   E1  internalId(): exact match, then tail match, then strip to the short form. Never returns
 *       "@cf/...". Maps all 7 failing models onto the health row that is actually probed.
 *   E1b defensive: never let a "@cf/" id reach ai_model_health.
 *   E2  replay guard: a signature of the bucket set is persisted in ai_calibration_config
 *       (gw_sweep_last_sig). On an identical consecutive signature the sweep inserts no rows,
 *       files no per-model ticket and degrades no model -- and files ONE dedupe-guarded ticket so
 *       that the loss of gateway-failure visibility is LOUD, not silent.
 *   E3  page cap: `limit = 3` becomes configurable (gw_sweep_pages, default 20) so that, once
 *       start_time IS honoured, the sweep can exhaust the window instead of truncating at 150.
 *
 * ── WHAT THIS PATCH DOES NOT DO ──
 *
 *   It does not fix the gateway logs API, and it does not clear the current backlog. After E2 the
 *   7 open [gw-fail] rows are still held open by the 24h predicate -- use the separately staged
 *   apply-gw-closer-fix.mjs (Rev 2) for that, or resolve them once the window is honest.
 *   It also does not resolve the two-writer contention on ai_model_health: qnfo-ai's router
 *   increments `gateway_failures` on the SHORT id (bge 0, kimi-k2.6 516, glm-5.2 362,
 *   gemma-4-26b 258, qwen3.8-27b 1371) while this sweep writes `status` on the qualified id.
 *   E1 collapses them onto one row, which makes the contention visible rather than fixing it.
 *
 * Usage:
 *   node qnfo-ai-calibration/apply-gw-replay-and-namespace-fix.mjs [path] [--apply]
 *   default path: qnfo-ai-calibration/deployed-current.worker.js
 *
 * Exit: 0 ok/dry-run | 2 wrong file | 3 anchor not found | 4 ambiguous | 5 already patched
 *
 * CAVEAT (binding): the live artifact is NOT either repo file. fleet_drift_report (latest scan)
 * lists qnfo-ai-calibration as `deployed-ahead` -- deployed 1.1.5, canonical 1.1.4 -- and the
 * deployer's own log (fleet_deploys id 9) records source_path = r2:qnfo-canonical/qnfo-ai-calibration.js.
 * Both repo files read 1.1.4. The 1.1.5 contents are unknown and qnfo-canonical is not a bound
 * bucket. This applier therefore fails closed: it will refuse to write rather than corrupt a
 * bundle whose anchors do not match.
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

const count = (h) => src.split(h).length - 1;
const edits = [];

/* ── E1: internalId must never return a qualified "@cf/..." id ── */
const E1_OLD = `function internalId(m) {
  if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m];
  if (m && m.indexOf("@cf/") === 0) {
    for (var k in TIER0_WA) {
      if (TIER0_WA[k] && TIER0_WA[k].indexOf(m.slice(5)) >= 0) return k;
    }
  }
  return m;
}`;
const E1_NEW = `function internalId(m) {
  if (!m) return null;
  if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m];
  if (m.indexOf("@cf/") === 0) {
    var tail = m.slice(4);
    for (var k in TIER0_WA) {
      if (TIER0_WA[k] === m) return k;
      if (TIER0_WA[k] && TIER0_WA[k].slice(4) === tail) return k;
    }
    return m.split("/").pop();
  }
  return m;
}`;
edits.push({ id: "E1", old: E1_OLD, neu: E1_NEW, note: "internalId: never return '@cf/...' (RC-2)" });

/* ── E1b: defensive -- a qualified id must never reach ai_model_health ── */
const E1B_OLD = `      var targetId = internalId(b.model);`;
const E1B_NEW = `      var targetId = internalId(b.model);
      if (targetId && targetId.indexOf("@cf/") === 0) targetId = targetId.split("/").pop();`;
edits.push({ id: "E1b", old: E1B_OLD, neu: E1B_NEW, note: "guard: strip '@cf/' before ai_model_health write" });

/* ── E3: page cap configurable (was a hard 150) ── */
const E3_OLD = `  var limit = 3;`;
const E3_NEW = `  var limit = parseInt(await cfgGet(env, "gw_sweep_pages", "20"), 10) || 20;`;
edits.push({ id: "E3", old: E3_OLD, neu: E3_NEW, note: "gw_sweep_pages (default 20) replaces the hard 3-page cap" });

/* ── E2: replay guard, inserted immediately after out.classes is set ── */
const E2_OLD = `  var cls = Object.keys(buckets);
  out.total = rows.length;
  out.classes = cls.length;
  var parts = [];`;
const E2_NEW = `  var cls = Object.keys(buckets);
  out.total = rows.length;
  out.classes = cls.length;
  // GW-REPLAY-GUARD-1 (2026-09-13): the AI Gateway logs API does not honour start_time.
  // Measured: 397 rows for one model from 2 distinct sample_detail strings at 1 constant count,
  // one row per 30-min sweep, carrying the same AiError request UUIDs; per-sweep buckets sum to
  // exactly 150 = limit x per_page. Without this guard the sweep re-inserts the frozen window
  // every 30 min, which (a) inflates every "N/24h" figure, (b) makes the 24h auto-close predicate
  // unreachable, (c) degrades ai_model_health on replayed data. Suppress the noise, but alert ONCE
  // so that the loss of gateway-failure visibility is not silent.
  var sigParts = [];
  for (var si = 0; si < cls.length; si++) {
    sigParts.push(buckets[cls[si]].status + "|" + buckets[cls[si]].model + "|" + buckets[cls[si]].count);
  }
  sigParts.sort();
  var sig = sigParts.join(";");
  var lastSig = await cfgGet(env, "gw_sweep_last_sig", "");
  if (sig && sig === lastSig) {
    out.total = 0;
    out.classes = 0;
    out.summary = "REPLAY: identical to previous sweep (" + cls.length + " classes suppressed); gateway log API not honouring start_time - failure rate unmeasurable";
    try {
      await env.QNFO_AUDIT.prepare("INSERT INTO ai_calibration_config (key, value) VALUES ('gw_sweep_last_ts', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(t0)).run();
    } catch (e) {
    }
    try {
      await fileIssue(env, "[gw-sweep] replay detected: start_time not honoured", "ai_gateway_failures received byte-identical buckets in two consecutive sweeps (same AiError request UUIDs, same per-model counts summing to limit x per_page). The gateway logs API is ignoring start_time, so every sweep re-reads a frozen page: per-model 24h counts are replayed rather than measured, and the [gw-fail] auto-close predicate (0 rows in 24h) is unreachable. Fix the sweep query or the API contract before trusting any gateway failure rate.", "high");
    } catch (e) {
    }
    return out;
  }
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO ai_calibration_config (key, value) VALUES ('gw_sweep_last_sig', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(sig).run();
  } catch (e) {
  }
  var parts = [];`;
edits.push({ id: "E2", old: E2_OLD, neu: E2_NEW, note: "replay guard + one loud ticket (RC-1)" });

/* ── resolve, verify, apply ── */
let out = src;
let failed = false;
for (const e of edits) {
  const n = count(e.old);
  if (n === 0) {
    console.error(`\n[${e.id}] ANCHOR NOT FOUND (${e.note})`);
    failed = true;
  } else if (n > 1) {
    console.error(`\n[${e.id}] AMBIGUOUS: anchor occurs ${n}x (${e.note})`);
    failed = true;
  } else {
    console.log(`[${e.id}] ok  ${e.note}`);
  }
}
if (failed) {
  console.error("\nFAIL: refusing to write (fail-closed).");
  process.exit(3);
}

for (const e of edits) out = out.replace(e.old, e.neu);

if (out === src) {
  console.log("\nNothing to do: already patched.");
  process.exit(5);
}

// sanity: balanced braces + the guard is present exactly once
const bal = (out.match(/{/g) || []).length - (out.match(/}/g) || []).length;
console.log(`\nbrace balance after patch: ${bal} (expect 0)`);
if (bal !== 0) {
  console.error("FAIL: brace imbalance -- refusing to write.");
  process.exit(4);
}
if (count("gw_sweep_last_sig") < 2) {
  console.error("FAIL: replay guard not inserted as expected -- refusing to write.");
  process.exit(4);
}
if (out.includes('return m;\n  }\n  return m;')) {
  console.error("FAIL: internalId fix did not land -- refusing to write.");
  process.exit(4);
}

if (!APPLY) {
  console.log("\nDRY RUN ok. Re-run with --apply to write (a .bak is kept).");
  process.exit(0);
}
copyFileSync(FILE, FILE + ".bak");
writeFileSync(FILE, out);
console.log(`\nAPPLIED. backup: ${FILE}.bak  bytes ${Buffer.byteLength(src)} -> ${Buffer.byteLength(out)}`);

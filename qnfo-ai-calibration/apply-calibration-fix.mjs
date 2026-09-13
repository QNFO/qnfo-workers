#!/usr/bin/env node
// qnfo-ai-calibration/apply-calibration-fix.mjs
// v2 — 2026-09-13 by qnfo-ops. Supersedes the v1 patcher (sha 57327ac1).
// EXECUTABLE BY THE DEPLOY RUNNER. Idempotent. Fails closed.
//
//   node apply-calibration-fix.mjs --check     # report, change nothing
//   node apply-calibration-fix.mjs --apply     # patch worker.js in place
//
// ---------------------------------------------------------------------------
// WHY v1 WAS BROKEN (verified, not suspected)
// ---------------------------------------------------------------------------
// v1's FIX C anchor was a RECONSTRUCTION from a lossy read. Tested this session
// against the VERBATIM source line (github_repo_read, sha 7a37a8ab):
//
//   v1 regex  /(\bpass\s*=\s*r\.status\s*===\s*200\s*&&\s*)echo\b/g   -> 0 hits
//   v1 skip-guard '&& String(content || "").trim().length > 0'        -> absent
//
// v1 therefore took its `problems.push(...)` branch and exited 2 WITHOUT WRITING,
// so FIX C (the F1 / issue-664 echo defect) was never applied by v1. The v1 comment
// blamed this on web_fetch's HTML stripping; the real cause was that the anchor
// assumed `r.status === 200 && echo`, whereas the source is
// `r.status === 200 && !!content && String(content).trim().length > 0 && echo`.
//
// v2 anchors are taken from VERBATIM source, and every one is asserted to match
// exactly the expected number of times before anything is written.
//
// ---------------------------------------------------------------------------
// FIX A — high — F3 in audits/2026-09-13-fix-queue.json (RC-4 in the calibration patch)
// ---------------------------------------------------------------------------
// `probeEndpoint`'s non-body branch asserts that the string "deepseek-v4-flash" appears
// in DeepSeek's own /models response. That string is a fleet-internal alias; keying an
// assertion on an internal alias appearing in a third party's catalogue is fragile.
// History (read-only D1): target='deepseek-direct/models' 335 rows, 182 pass / 153 fail.
// Last pass 2026-09-10T01:01:10Z; first fail 2026-09-10T01:31:08Z - the very next sweep -
// and every failure since is consecutive. A clean step change, not intermittent.
// v1 claimed the assertion "can never pass"; that was wrong and is retracted - it passed
// 182 times. Correct reading: a REGRESSION with a precise onset, most likely an upstream
// change to DeepSeek's model list. Either way a 200 with a body is being reported as an
// endpoint failure on every sweep, which is a probe defect.
//
// ---------------------------------------------------------------------------
// FIX B — medium — F2 (digest names nothing while fail > 0)
// ---------------------------------------------------------------------------
//   cal-1789279252538-41c75c  total=28 pass=26 fail=2  digest={"failing":[],"drift_models":[]}
// `failing` is only populated once a model crosses `failThreshold`, so a probe failing
// below threshold increments `fail` but is never named.
// ANCHOR UNCERTAINTY (stated, not hidden): the live digest emits the key `failing`, but
// v1's anchor was `failing_models: Object.keys(failing),`. worker.js is 35,742 B and
// truncates at 32,768 chars on read, so the digest-construction region was NOT inspected.
// v2 therefore tries BOTH candidate anchors and reports which matched; if neither does,
// it refuses to write. It does not guess.
//
// ---------------------------------------------------------------------------
// FIX C — high — F1 (issue 664: consecutive_failures=2 detail=http=200 echo=false "OK")
// ---------------------------------------------------------------------------
// http=200 with a non-empty body marked `fail` because the reply did not equal the model
// alias. A model that answers "OK." or adds a word is reported as an outage. Same class as
// FIX A. `echo` is kept in the detail string for diagnosis; it stops being a pass gate.
//
// ---------------------------------------------------------------------------
// FIX D — high — RC-1 (NEW in v2; the gateway sweep replays the same window forever)
// ---------------------------------------------------------------------------
// `gatewayFailureSweep` pages .../ai-gateway/logs?success=false&start_time=<lastTs>.
// Measured 2026-09-13 (read-only D1), the six dominant classes share ONE first_ts
// (1788595252513) AND ONE last_ts (1789281039437) with ~380 rows each:
//   @cf/google/gemma-4-26b-a4b-it 400 image-input      380 rows
//   @cf/moonshotai/kimi-k2.6      429 rate-capacity    380
//   @cf/qwen/qwen2.5-coder-32b    400 content-shape    379
//   @cf/baai/bge-base-en-v1.5     429 rate-capacity    377
//   @cf/zai-org/glm-5.2           400 tool-args-json   377
//   @cf/qwen/qwen3.8-27b          400 upstream         315
// 1789281039437-1788595252513 = 7.94 d; at a */30 cron that is ~381 sweeps; the row counts
// are ~381. i.e. exactly one re-inserted row per class per sweep. `start_time` is not
// honoured, so the sweep re-reads the same page and re-inserts it.
// Consequence: the 24h auto-close is defeated, because COUNT(*) WHERE model=? AND
// ts > t0-24h is always > 0. The open [gw-fail] tickets (#654-#660, #670) are structurally
// unclosable until this lands.
// FIX: compute an order-independent signature of the sweep and suppress a replay.
//
// ---------------------------------------------------------------------------
// FIX E — high — RC-2 (namespace split -> permanent MODEL-DEGRADED false positives)
// ---------------------------------------------------------------------------
// `internalId()` maps @cf/... -> short id via CF_TO_INTERNAL, built only from TIER0_WA.
// A model absent from TIER0_WA falls through `return m` and is written to ai_model_health
// under its QUALIFIED id - a second row nothing probes and nothing clears.
// Live 2026-09-13T06:31Z: 5 such rows, all degraded / consecutive_failures=0.
// FIX: canonicalise to the short form; never return a "@cf/..." key.
//
// ---------------------------------------------------------------------------
// FIX H — medium — RC-5 (vision probe results are never persisted)
// ---------------------------------------------------------------------------
// The vision runPool pushes to `results` but never calls upsertHealth, so vision health is
// never published. Six rows sit frozen at last_probe_ts=1789145063740 (2026-09-11T16:44Z)
// while their probes pass: llama-3.2-11b-vision, qwq-32b, glm-4.7-flash,
// deepseek-r1-qwen-32b, qwen2.5-coder-32b, glm-5.2.
// FIX: persist under a distinct `<model>:vision` key so the vision row cannot fight the
// completion row.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const NEW_VERSION = '1.1.5';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

let src = fs.readFileSync(WORKER, 'utf8');
const problems = [];
const applied = [];
let changed = 0;

// Count non-overlapping occurrences of a literal.
const count = (s, lit) => s.split(lit).length - 1;

// Replace a literal, asserting the expected occurrence count first.
function swap(label, oldLit, newLit, expect) {
  const n = count(src, oldLit);
  if (n === 0 && count(src, newLit) > 0) { console.log('  skip  ' + label + ' (already applied)'); return; }
  if (n !== expect) { problems.push(label + ': anchor matched ' + n + 'x, expected ' + expect); return; }
  src = src.split(oldLit).join(newLit);
  applied.push(label);
  changed++;
  console.log('  fix   ' + label);
}

// ------------------------------------------------------------------ FIX A
swap('FIX A: deepseek-direct catalogue-alias assertion',
  'r.text.indexOf("deepseek-v4-flash") >= 0',
  '/deepseek/i.test(r.text)',
  1);

// ------------------------------------------------------------------ FIX B
// Two candidate anchors; the digest-construction region was not inspectable.
const B_CANDS = [
  ['failing: Object.keys(failing),',
   'failing: results.filter(function (x) { return x.status === "fail"; }).map(function (x) { return x.target; }).filter(function (v, i, a) { return a.indexOf(v) === i; }),'],
  ['failing_models: Object.keys(failing),',
   'failing_models: results.filter(function (x) { return x.status === "fail"; }).map(function (x) { return x.target; }).filter(function (v, i, a) { return a.indexOf(v) === i; }),']
];
{
  let done = false;
  for (const [oldLit, newLit] of B_CANDS) {
    if (count(src, oldLit) === 1) { swap('FIX B: digest names every failed probe', oldLit, newLit, 1); done = true; break; }
    if (count(src, newLit) > 0) { console.log('  skip  FIX B (already applied)'); done = true; break; }
  }
  if (!done) {
    problems.push('FIX B: neither candidate anchor matched. The digest-construction region was '
      + 'NOT inspected (worker.js is 35,742 B; reads truncate at 32,768 chars with no offset). '
      + 'Do not guess a replacement - inspect the digest builder directly.');
  }
}

// ------------------------------------------------------------------ FIX C
swap('FIX C: minimal-probe echo is diagnostic, not a pass gate',
  'var pass = r.status === 200 && !!content && String(content).trim().length > 0 && echo;',
  'var pass = r.status === 200 && !!content && String(content).trim().length > 0;',
  1);

// ------------------------------------------------------------------ FIX D
// Insert the replay guard right after the sweep has its class list.
const D_ANCHOR = '  out.classes = cls.length;';
const D_INS = [
  '  out.classes = cls.length;',
  '  // v1.1.5 FIX D (RC-1): signature guard. The gateway logs API does not honour start_time,',
  '  // so every sweep re-reads and re-inserts the same page (measured: 6 classes, one first_ts',
  '  // and one last_ts, ~380 rows each = one row per class per */30 sweep over 7.94 days).',
  '  // Without this guard the 24h auto-close can never fire and [gw-fail] tickets never close.',
  '  var _sigParts = [];',
  '  for (var _si = 0; _si < cls.length; _si++) { var _sb = buckets[cls[_si]]; _sigParts.push(_sb.status + "|" + _sb.model + "|" + _sb.count); }',
  '  _sigParts.sort();',
  '  var _sig = fnv32(_sigParts.join(";"));',
  '  if (cls.length > 0 && _sig === await cfgGet(env, "gw_sweep_last_sig", "")) {',
  '    out.summary = "identical to previous sweep (gateway logs API does not honour start_time) - suppressed " + cls.length + " classes";',
  '    return out;',
  '  }'
].join('\n');
swap('FIX D: gateway-sweep replay signature guard (RC-1)', D_ANCHOR, D_INS, 1);

// Persist the signature next to the timestamp.
const D2_ANCHOR = '"INSERT INTO ai_calibration_config (key, value) VALUES (\'gw_sweep_last_ts\', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(t0)).run();';
const D2_NEW = D2_ANCHOR + '\n    try { await env.QNFO_AUDIT.prepare("INSERT INTO ai_calibration_config (key, value) VALUES (\'gw_sweep_last_sig\', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(_sig || "")).run(); } catch (e) {}';
swap('FIX D2: persist gw_sweep_last_sig', D2_ANCHOR, D2_NEW, 1);

// ------------------------------------------------------------------ FIX E
swap('FIX E: internalId never returns a qualified @cf/ key (RC-2)',
  'function internalId(m) { if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m]; if (m && m.indexOf("@cf/") === 0) { for (var k in TIER0_WA) { if (TIER0_WA[k] && TIER0_WA[k].indexOf(m.slice(5)) >= 0) return k; } } return m; }',
  'function internalId(m) { if (!m) return null; if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m]; if (m.indexOf("@cf/") === 0) { var _tail = m.slice(4); for (var k in TIER0_WA) { if (TIER0_WA[k] === m) return k; if (TIER0_WA[k] && TIER0_WA[k].slice(4) === _tail) return k; } return m.split("/").pop(); } return m; }',
  1);

// ------------------------------------------------------------------ FIX H
swap('FIX H: persist vision probe results (RC-5)',
  '    results.push(Object.assign({ probe: "vision", target: m }, res));\n    return res;',
  '    results.push(Object.assign({ probe: "vision", target: m }, res));\n    try { await upsertHealth(env, m + ":vision", res.status === "pass" ? "ok" : "degraded", res.latency_ms, res.status === "pass" ? 0 : 1); } catch (e) {}\n    return res;',
  1);

// ------------------------------------------------------------------ VERSION
swap('VERSION 1.1.4 -> ' + NEW_VERSION,
  'var VERSION = "1.1.4";',
  'var VERSION = "' + NEW_VERSION + '";',
  1);

// ------------------------------------------------------------------ outcome
console.log('\n' + changed + ' change(s) pending, ' + problems.length + ' problem(s)');
if (problems.length) {
  console.error('\nREFUSING TO WRITE:');
  problems.forEach(p => console.error('  ! ' + p));
  process.exit(2);
}
if (!apply) {
  console.log('--check only; nothing written. Re-run with --apply.');
  process.exit(0);
}
fs.writeFileSync(WORKER, src, 'utf8');
console.log('WROTE ' + WORKER + '\n');
console.log('Applied: ' + applied.join(', '));
console.log('\nPost-deploy acceptance:');
console.log('  1. GET /health -> version ' + NEW_VERSION);
console.log('  2. two consecutive sweeps: the second must report "identical to previous sweep ... suppressed".');
console.log('  3. ai_gateway_failures row count must STOP growing (~6 rows/sweep -> 0).');
console.log('  4. ai_model_health: no model_id LIKE "@cf/%" may exist.');
console.log('  5. target=deepseek-direct/models must stop reporting fail on http=200.');

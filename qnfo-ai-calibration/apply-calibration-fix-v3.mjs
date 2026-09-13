#!/usr/bin/env node
// qnfo-ai-calibration/apply-calibration-fix-v3.mjs
// v3 — 2026-09-13 by qnfo-ops. Supersedes v2 (sha 42fc45b4).
// EXECUTABLE BY THE DEPLOY RUNNER. Idempotent. Transactional per fix-group.
//
//   node apply-calibration-fix-v3.mjs --check     # report, change nothing
//   node apply-calibration-fix-v3.mjs --apply     # patch worker.js in place
//
// ===========================================================================
// WHY v3 EXISTS — two defects in v2, found by reading it against the verbatim
// source (sha 7a37a8ab), not by running it. Neither was caught by v2's author.
// ===========================================================================
//
// P1 (HIGH) — v2's FIX D is MISPLACED and cannot achieve its own stated goal.
//
//   v2 inserts the replay guard immediately after `out.classes = cls.length;`
//   and `return out;` on a replay. But the 24h auto-close loop lives LATER in
//   gatewayFailureSweep — after the per-class loop, before the config persist.
//   Verified source order:
//       out.classes = cls.length;
//       var parts = [];
//       for (ci...) { insert; fileIssue; degrade }   <- v2 returns before here
//       try { openTitles = SELECT ... FROM agent_issues ...; closeIssue(...) }
//       try { INSERT ai_calibration_config gw_sweep_last_ts }
//       out.summary = ...
//   So `return out` SKIPS the auto-close entirely. The [gw-fail] tickets v2
//   promises to unblock stay open. v2 would have shipped a no-op for its own
//   headline fix.
//   v3 suppresses only the row-insert / file / degrade work and lets the
//   auto-close loop run to completion.
//
// P2 (HIGH) — v2's FIX B gates every other fix.
//
//   FIX B's anchor sits in the region that truncates on read (worker.js is
//   35,742 B; the read cap is 32,768 chars with no offset). v2 therefore cannot
//   know whether it matches. If it does not, v2 executes
//       problems.push(...)  ->  if (problems.length) process.exit(2)
//   and refuses to write ANYTHING — discarding FIX A/C/D/E/H, every one of
//   which has a verified anchor. That is the identical all-or-nothing failure
//   mode v2 documents for v1 ("v1 therefore took its problems.push(...) branch
//   and exited 2 WITHOUT WRITING"), re-introduced through a different door.
//   v3 makes FIX B a WARNING and applies each verified group independently.
//   Live evidence for FIX B's defect, 2026-09-13:
//       ai_calibration_runs cal-1789281039437-517c52
//         total=28 pass=26 fail=2 digest={"failing":[],"drift_models":[]}
//   Two probes failed and the digest names neither.
//
// P3 (HIGH, NEW in v3) — closeIssue writes the wrong store.
//
//   `closeIssue`/`fileIssue` operate on issue_ledger. The auto-close loop
//   enumerates agent_issues. ops_issues_list and ops_issue_run read
//   agent_issues. Live 2026-09-13: agent_issues 25 open, issue_ledger 278 open.
//   Even with a correctly placed guard, every ticket the ops surface displays
//   stays open. FIX I closes in both stores.
//
// ===========================================================================
// ANCHORS — every anchor below was read VERBATIM from worker.js sha 7a37a8ab
// via github_repo_read. All are inside the readable 32,768-char region EXCEPT
// FIX B's, which is why FIX B is a warning and not a gate.
// ===========================================================================

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const NEW_VERSION = '1.1.5';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

let src = fs.readFileSync(WORKER, 'utf8');
const warnings = [];
const applied = [];

const count = (s, lit) => s.split(lit).length - 1;

// Transactional group: all swaps must match, or the group is discarded whole.
function group(label, swaps) {
  let tmp = src;
  const log = [];
  for (const [l, oldLit, newLit, expect] of swaps) {
    const n = count(tmp, oldLit);
    const already = count(tmp, newLit) > 0;
    if (n === 0 && already) { log.push(['skip', l + ' (already applied)']); continue; }
    if (n !== expect) {
      warnings.push(label + ' -> ' + l + ': anchor matched ' + n + 'x, expected ' + expect + '. GROUP DISCARDED, nothing written for this group.');
      return false;
    }
    tmp = tmp.split(oldLit).join(newLit);
    log.push(['fix', l]);
  }
  src = tmp;
  log.forEach(([k, l]) => console.log('  ' + (k === 'fix' ? 'fix   ' : 'skip  ') + l));
  applied.push(label);
  return true;
}

// ------------------------------------------------------------------ FIX A (RC-4, high)
// probeEndpoint's non-body branch keys on a fleet-internal alias appearing in
// DeepSeek's own /models catalogue. Live: target='deepseek-direct/models',
// 44 consecutive fails, every one detail="http=200". A 200 with a body is being
// scored as an endpoint failure on every sweep.
group('FIX A: deepseek-direct catalogue-alias assertion (RC-4)', [[
  'FIX A',
  'r.text.indexOf("deepseek-v4-flash") >= 0',
  '!!(r.data && Array.isArray(r.data.data) && r.data.data.length > 0)',
  1
]]);

// ------------------------------------------------------------------ FIX C (RC-3, high)
// pass required the router to echo the exact alias. Issue #664:
// consecutive_failures=2, detail=http=200 echo=false "OK" — the model returned
// the probe's own expected string and was still marked failing.
group('FIX C: minimal-probe echo is diagnostic, not a pass gate (RC-3)', [[
  'FIX C',
  'var pass = r.status === 200 && !!content && String(content).trim().length > 0 && echo;',
  'var pass = r.status === 200 && !!content && String(content).trim().length > 0;',
  1
]]);

// ------------------------------------------------------------------ FIX E (RC-2, high)
// internalId() returns a qualified "@cf/..." key for any model absent from
// TIER0_WA, creating a second ai_model_health row that nothing probes and
// nothing clears. Live: 5 such rows, all degraded, consecutive_failures=0,
// while the short-name twin is ok.
group('FIX E: internalId never returns a qualified @cf/ key (RC-2)', [[
  'FIX E',
  'function internalId(m) { if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m]; if (m && m.indexOf("@cf/") === 0) { for (var k in TIER0_WA) { if (TIER0_WA[k] && TIER0_WA[k].indexOf(m.slice(5)) >= 0) return k; } } return m; }',
  'function internalId(m) { if (!m) return null; if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m]; if (m.indexOf("@cf/") === 0) { var _tail = m.slice(4); for (var k in TIER0_WA) { if (TIER0_WA[k] === m) return k; if (TIER0_WA[k] && TIER0_WA[k].slice(4) === _tail) return k; } return m.split("/").pop(); } return m; }',
  1
]]);

// ------------------------------------------------------------------ FIX H (RC-5, medium)
// The vision runPool pushes to `results` but never calls upsertHealth, so vision
// health is never published. Six rows sit frozen at last_probe_ts=1789145063740
// while their probes pass. Persisted under a distinct <model>:vision key so the
// vision row cannot fight the completion row.
group('FIX H: persist vision probe results (RC-5)', [[
  'FIX H',
  '    results.push(Object.assign({ probe: "vision", target: m }, res));\n    return res;',
  '    results.push(Object.assign({ probe: "vision", target: m }, res));\n    try { await upsertHealth(env, m + ":vision", res.status === "pass" ? "ok" : "degraded", res.latency_ms, res.status === "pass" ? 0 : 1); } catch (e) {}\n    return res;',
  1
]]);

// ------------------------------------------------------------------ FIX D (RC-1, high) — RELOCATED
// v2 placed this guard after `out.classes = cls.length;` with `return out`,
// which skips the auto-close loop further down. v3 sets a flag and gates ONLY
// the per-class loop, so the auto-close loop and the config persist still run.
//
// Evidence the sweep really does replay (independently measured 2026-09-13,
// six consecutive runs, ts 1789272045336 .. 1789281039437, byte-identical):
//   400 @cf/qwen/qwen3.8-27b x18 [upstream]; 429 @cf/moonshotai/kimi-k2.6 x6;
//   429 @cf/moonshotai/kimi-k2.7-code x2; 429 @cf/zai-org/glm-5.2 x1;
//   400 @cf/qwen/qwen2.5-coder-32b-instruct x42 [content-shape];
//   400 @cf/zai-org/glm-5.2 x1 [tool-args-json]
// ai_gateway_failures: 380/380/379/377/377/315 rows per class, one shared
// first_ts 1788595252513 and one shared last_ts 1789281039437; the span is
// 7.94 d = ~381 sweeps at */30 = exactly one re-inserted row per class per sweep.
const D_FLAG = [
  '  var parts = [];',
  [
    '  var parts = [];',
    '  // v1.1.5 FIX D (RC-1): replay guard. The AI Gateway logs API does not honour',
    '  // start_time, so every sweep re-reads and re-inserts the same page (measured:',
    '  // 6 classes, one first_ts and one last_ts, ~380 rows each = one row per class',
    '  // per */30 sweep over 7.94 days). Without this the 24h auto-close can never',
    '  // fire. NOTE: this guard gates the per-class loop ONLY. v2 returned from the',
    '  // function here, which skipped the auto-close loop below and made the fix a no-op.',
    '  var _sigParts = [];',
    '  for (var _si = 0; _si < cls.length; _si++) { var _sb = buckets[cls[_si]]; _sigParts.push(_sb.status + "|" + _sb.model + "|" + _sb.count); }',
    '  _sigParts.sort();',
    '  var _sig = fnv32(_sigParts.join(";"));',
    '  var _replay = (cls.length > 0 && _sig === await cfgGet(env, "gw_sweep_last_sig", ""));',
    '  if (_replay) out.summary = "identical to previous sweep (gateway logs API does not honour start_time) - suppressed " + cls.length + " classes";'
  ].join('\n')
];
group('FIX D: gateway-sweep replay guard, relocated so auto-close still runs (RC-1)', [
  ['D1 flag', D_FLAG[0], D_FLAG[1], 1],
  ['D2 loop', '  for (var ci = 0; ci < cls.length; ci++) {', '  for (var ci = 0; ci < cls.length && !_replay; ci++) {', 1],
  ['D3 summary', '  out.summary = cls.length ? parts.join("; ") : "clean (0 failed requests in window)";', '  if (!_replay) out.summary = cls.length ? parts.join("; ") : "clean (0 failed requests in window)";', 1],
  ['D4 persist', '"INSERT INTO ai_calibration_config (key, value) VALUES (\'gw_sweep_last_ts\', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(t0)).run();', '"INSERT INTO ai_calibration_config (key, value) VALUES (\'gw_sweep_last_ts\', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(t0)).run();\n    try { await env.QNFO_AUDIT.prepare("INSERT INTO ai_calibration_config (key, value) VALUES (\'gw_sweep_last_sig\', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(_sig || "")).run(); } catch (e) {}', 1]
]);

// ------------------------------------------------------------------ FIX I (P3, high) — NEW
// The auto-close loop enumerates agent_issues but closeIssue updates
// issue_ledger, so the tickets the ops surface reads never close. Close both.
group('FIX I: auto-close writes agent_issues as well as issue_ledger (P3)', [[
  'FIX I',
  '        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures for 24h");',
  '        if (!recent || Number(recent.c || 0) === 0) {\n          await closeIssue(env, ttl, "no failures for 24h");\n          try { await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET status=\'closed\', updated_at=?2 WHERE title=?1 AND status=\'open\'").bind(ttl, now()).run(); } catch (e) {}\n        }',
  1
]]);

// ------------------------------------------------------------------ FIX B (F2, medium) — NON-BLOCKING
// Anchor lies in the unreadable region. Try both candidates; warn if neither
// matches. This must NOT gate the groups above — that was v2's fatal defect.
{
  const B_CANDS = [
    ['failing: Object.keys(failing),',
     'failing: results.filter(function (x) { return x.status === "fail"; }).map(function (x) { return x.target; }).filter(function (v, i, a) { return a.indexOf(v) === i; }),'],
    ['failing_models: Object.keys(failing),',
     'failing_models: results.filter(function (x) { return x.status === "fail"; }).map(function (x) { return x.target; }).filter(function (v, i, a) { return a.indexOf(v) === i; }),']
  ];
  let done = false;
  for (const [oldLit, newLit] of B_CANDS) {
    if (count(src, oldLit) === 1) { group('FIX B: digest names every failed probe (F2)', [['FIX B', oldLit, newLit, 1]]); done = true; break; }
    if (count(src, newLit) > 0) { console.log('  skip  FIX B (already applied)'); done = true; break; }
  }
  if (!done) warnings.push('FIX B: neither candidate anchor matched. The digest-construction region is NOT readable (worker.js 35,742 B, read cap 32,768 with no offset). NOT applied, and deliberately NOT fatal. Live digest is {"failing":[],"drift_models":[]}, so the key is `failing` and candidate 1 is the likely match. Inspect the digest builder directly to confirm.');
}

// ------------------------------------------------------------------ VERSION
group('VERSION 1.1.4 -> ' + NEW_VERSION, [[
  'VERSION',
  'var VERSION = "1.1.4";',
  'var VERSION = "' + NEW_VERSION + '";',
  1
]]);

// ------------------------------------------------------------------ outcome
console.log('\n' + applied.length + ' group(s) applied, ' + warnings.length + ' warning(s)');
if (warnings.length) {
  console.warn('\nWARNINGS (non-blocking):');
  warnings.forEach(w => console.warn('  ! ' + w));
}
if (!apply) {
  console.log('--check only; nothing written. Re-run with --apply.');
  process.exit(0);
}
if (!applied.length) {
  console.error('nothing to write.');
  process.exit(1);
}
fs.writeFileSync(WORKER, src, 'utf8');
console.log('WROTE ' + WORKER);
console.log('Applied: ' + applied.join(', '));
console.log('\nPost-deploy acceptance:');
console.log('  1. GET /health -> version ' + NEW_VERSION);
console.log('  2. two consecutive sweeps: the second reports "identical to previous sweep ... suppressed".');
console.log('  3. ai_gateway_failures row count STOPS growing (~6 rows/sweep -> 0).');
console.log('  4. ai_model_health: no model_id LIKE "@cf/%" may exist.');
console.log('  5. target=deepseek-direct/models stops reporting fail on http=200.');
console.log('  6. ~24h after deploy the [gw-fail] tickets close in agent_issues: the pre-deploy');
console.log('     rows age past the 24h window and COUNT(*) falls to 0. The 24h delay is the');
console.log('     correct semantic ("no failures for 24h"), not a bug.');

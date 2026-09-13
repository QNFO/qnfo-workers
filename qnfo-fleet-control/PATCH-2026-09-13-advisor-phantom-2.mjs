#!/usr/bin/env node
// qnfo-fleet-control/PATCH-2026-09-13-advisor-phantom-2.mjs
// Written by qnfo-ops 2026-09-13. Idempotent. Fails closed.
//
//   node PATCH-2026-09-13-advisor-phantom-2.mjs --check
//   node PATCH-2026-09-13-advisor-phantom-2.mjs --apply
//
// ===========================================================================
// WHY THIS EXISTS, AND A CORRECTION TO MY OWN EARLIER WORK
// ===========================================================================
//
// I first patched qnfo-fleet-advisor/src/server.js to v0.3.5 (commit 8fbf2f0d).
// That source is CANONICAL but NOT WHAT RUNS. Measured this session:
//
//   - qnfo-fleet-advisor appears in NEITHER fleet_status (55 workers) NOR
//     service_registry (55 services). `service_discover qnfo-fleet-advisor`
//     returns service: null.
//   - service_registry: qnfo-fleet-control v0.4.11,
//     purpose "Merged fleet control (wave A): advisor audits + calibration
//     baselines + deploy scan/heal/redeploy".
//   - qnfo-fleet-control/worker.js (sha d9d438f0, 75,875 B) is a BUNDLE whose
//     first module is the advisor: `var advisorMod = (function(){ ... // src/server.js
//     ... var VERSION = "0.3.3"; var WORKER = "qnfo-fleet-advisor"; ... })()`.
//
// So the advisor runs as a module inside qnfo-fleet-control, and the deployed
// bundle embeds advisor VERSION 0.3.3 — OLDER than the 0.3.4 source in the repo.
// My v0.3.5 src patch cannot take effect until the bundle is rebuilt from it.
//
// I also stated in an earlier record that the advisor's deployed modified_on was
// 2026-09-11T14:44:33Z. That was WRONG: 14:44:33 belongs to
// qnfo-research-supervisor, a different row in the same fleet_status response.
// qnfo-fleet-advisor has no fleet_status row at all. Corrected.
//
// This script therefore patches the BUNDLE, so the fix can land without a build
// step. It is belt-and-braces with the v0.3.5 src patch: whichever path the
// deploy takes, the behaviour is the same.
//
// ===========================================================================
// THE DEFECT (same as v0.3.5 PHANTOM-2, at bundle level)
// ===========================================================================
//
// Bundled code, verbatim:
//
//   const deg = await d1All(env, "SELECT model_id FROM ai_model_health WHERE status = 'degraded'");
//   if (deg && deg.length) findings.push({ kind: "model-health", severity: "medium",
//     title: "MODEL-DEGRADED " + deg.map((d) => d.model_id).slice(0, 4).join(","),
//     detail: "degraded: " + deg.map((d) => d.model_id).join(",") });
//
// Three faults, all live:
//   (a) NO predicate at all. ai_model_health holds 24 rows; 5 are status='degraded'
//       and ALL FIVE carry qualified @cf/ ids. Zero canonical rows are degraded.
//       Measured: SELECT COUNT(*) ... WHERE status IN ('degraded','failing')
//       AND model_id NOT LIKE '@cf/%'  ->  0
//   (b) The title embeds the live degraded set, so step-7 open-title dedupe never
//       matches and a NEW ticket is filed every */20 cron. That is exactly why
//       #668/#669/#671/#672/#673/#674 carry sets in their titles and why 10
//       MODEL-DEGRADED tickets are open.
//   (c) There is no auto-close, so the tickets never retire.
//
// The v0.3.4 source in the repo tried to fix this with `last_probe_ts IS NOT NULL`.
// That is INCOMPLETE: @cf/qwen/qwen3.8-27b carries last_probe_ts=1789280141458, so
// the predicate returns 1, not 0, and the auto-close branch would be dead code.
// Measured: SELECT COUNT(*) ... WHERE status='degraded' AND last_probe_ts IS NOT NULL -> 1
//
// The correct guard is STRUCTURAL: a qualified CF id is never a canonical roster id.
//
// ===========================================================================
// AFTER APPLYING
// ===========================================================================
// The advisor stops filing MODEL-DEGRADED while all 5 rows are phantoms, and the
// auto-close retires the existing 10 tickets (source='qnfo-fleet-advisor',
// category='model-health') on the next */20 run. Independently, the 4 rows with
// last_probe_ts NULL are re-keyed/removed by qnfo-ai-calibration v1.1.5 FIX E, and
// the 5th by the same namespace rule. This script is what makes the advisor stop
// filing regardless of when that deploy lands.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const apply = process.argv.slice(2).includes('--apply');

let src = fs.readFileSync(WORKER, 'utf8');
const count = (s, lit) => s.split(lit).length - 1;
const problems = [];
let changed = 0;

function swap(label, oldLit, newLit, expect) {
  const n = count(src, oldLit);
  if (n === 0 && count(src, newLit) > 0) { console.log('  skip  ' + label + ' (already applied)'); return; }
  if (n !== expect) { problems.push(label + ': anchor matched ' + n + 'x, expected ' + expect); return; }
  src = src.split(oldLit).join(newLit);
  changed++;
  console.log('  fix   ' + label);
}

// --- 1. the degraded predicate, stable title, and auto-close --------------
const OLD_DEG = [
  '    const deg = await d1All(env, "SELECT model_id FROM ai_model_health WHERE status = \'degraded\'");',
  '    if (deg && deg.length) findings.push({ kind: "model-health", severity: "medium", title: "MODEL-DEGRADED " + deg.map((d) => d.model_id).slice(0, 4).join(","), detail: "degraded: " + deg.map((d) => d.model_id).join(",") });'
].join('\n');

const NEW_DEG = [
  '    // PHANTOM-2 (2026-09-13, qnfo-ops): the predicate is STRUCTURAL. A qualified',
  '    // "@cf/..." id is never a canonical roster id, so it can never be a real degraded',
  '    // model. The previous query had NO predicate: all 5 status=\'degraded\' rows carry',
  '    // @cf/ ids and ZERO canonical rows are degraded, so the finding fired every */20',
  '    // cron and the title embedded the live set -> one new ticket per run (10 open).',
  '    // `last_probe_ts IS NOT NULL` is kept as an ADDITIONAL condition (a row with no',
  '    // probe is not evidence) but is NOT load-bearing: @cf/qwen/qwen3.8-27b carries',
  '    // last_probe_ts=1789280141458, so a last_probe_ts-only filter returns 1, not 0.',
  '    const deg = await d1All(env, "SELECT model_id FROM ai_model_health WHERE status = \'degraded\' AND last_probe_ts IS NOT NULL AND model_id NOT LIKE \'@cf/%\'");',
  '    if (deg && deg.length) {',
  '      findings.push({ kind: "model-health", severity: "medium", title: "MODEL-DEGRADED", detail: "degraded (probed): " + deg.map((d) => d.model_id).join(",") });',
  '    } else {',
  '      // No canonical model is degraded. Retire the stable ticket and the legacy',
  '      // per-run "MODEL-DEGRADED <set>" tickets (set embedded in the title).',
  '      await d1Run(env, "UPDATE agent_issues SET status=\'closed\', description=?, updated_at=? WHERE status=\'open\' AND source=? AND category=\'model-health\'", ["[advisor] closed: no canonical (non-@cf/) model is degraded at " + ts, ts, WORKER]);',
  '      await d1Run(env, "UPDATE agent_issues SET status=\'closed\', updated_at=? WHERE status=\'open\' AND source=? AND title LIKE \'MODEL-DEGRADED%\'", [ts, WORKER]);',
  '    }'
].join('\n');

swap('PHANTOM-2: structural degraded predicate + stable title + auto-close', OLD_DEG, NEW_DEG, 1);

// --- 2. mark the advisor module version ----------------------------------
// The module version is separate from the outer worker version (0.4.11).
swap('advisor module VERSION 0.3.3 -> 0.3.5',
  'var VERSION = "0.3.3";\nvar WORKER = "qnfo-fleet-advisor";',
  'var VERSION = "0.3.5";\nvar WORKER = "qnfo-fleet-advisor";',
  1);

// --- outcome -------------------------------------------------------------
console.log('\n' + changed + ' change(s) pending, ' + problems.length + ' problem(s)');
if (problems.length) {
  console.error('\nREFUSING TO WRITE:');
  problems.forEach(p => console.error('  ! ' + p));
  process.exit(2);
}
if (!apply) { console.log('--check only; nothing written. Re-run with --apply.'); process.exit(0); }
if (!changed) { console.error('nothing to write.'); process.exit(1); }
fs.writeFileSync(WORKER, src, 'utf8');
console.log('WROTE ' + WORKER);
console.log('\nNOTE: this bundle is BUILT from qnfo-fleet-advisor/src/server.js. The canonical');
console.log('fix is src v0.3.5 (commit 8fbf2f0d). If you rebuild instead of patching, the');
console.log('rebuild already carries this change and this script becomes a no-op (it detects');
console.log('the new text and skips). Prefer: rebuild from src, then deploy qnfo-fleet-control.');
console.log('\nPost-deploy acceptance:');
console.log('  1. GET qnfo-fleet-control/health -> outer version unchanged; the advisor module');
console.log('     string "0.3.5" appears in the bundle.');
console.log('  2. next */20 advisor-audit cloud_ops_events row: findings must NOT include a');
console.log('     model-health entry while all degraded rows are @cf/-qualified.');
console.log('  3. agent_issues: the 10 open MODEL-DEGRADED tickets (source=qnfo-fleet-advisor,');
console.log('     category=model-health) must be status=closed after that run.');
console.log('  4. no NEW agent_issues row with a title starting "MODEL-DEGRADED " (trailing set).');

#!/usr/bin/env node
// qnfo-fleet-control/PATCH-2026-09-13-downgrade-guard-bundle.mjs
// Written by qnfo-ops 2026-09-13. Idempotent. FAILS CLOSED on any anchor mismatch.
//
//   node PATCH-2026-09-13-downgrade-guard-bundle.mjs --check
//   node PATCH-2026-09-13-downgrade-guard-bundle.mjs --apply
//
// ===========================================================================
// WHY THIS FILE EXISTS — CORRECTING MY OWN EARLIER PATCH
// ===========================================================================
// I previously staged `qnfo-fleet-deploy/PATCH-2026-09-13-downgrade-guard.mjs`.
// That patch edits `qnfo-fleet-deploy/worker.js`. Verified this session, that
// file is SUPERSEDED SOURCE — nothing executes it.
//
// qnfo-fleet-control/wrangler.toml, verbatim:
//   "MERGE WAVE A (2026-09-11): qnfo-fleet-advisor + qnfo-fleet-calibrator +
//    qnfo-fleet-deploy merged into ONE worker (3 -> 1). Subsystems dispatched by
//    path: /advisor/*, /cal/*, else deploy control plane."
//
// The live deployer is `qnfo-fleet-control` (registry v0.4.11;
// qnfo-fleet-control/worker.js, 75,875 B, sha d9d438f042c8f39a0fe27661b977fdb8c437197e).
// Applying the old patch changes nothing that runs. This is the merge-aware
// replacement.
//
// ===========================================================================
// ANCHOR CONFIDENCE — READ THIS BEFORE RUNNING
// ===========================================================================
// `qnfo-fleet-control/worker.js` is 75,875 B. The read tool available to
// qnfo-ops caps at 32,768 chars with NO offset parameter, and only the first
// ~3,000 bytes were retrieved (they contain the advisor module, not the deploy
// subsystem). Therefore THE DEPLOY-SUBSYSTEM ANCHORS BELOW ARE NOT VERIFIED
// against this bundle. They are inherited from anchors that WERE verified
// against qnfo-fleet-deploy/worker.js (sha ed539ec3, VERSION 0.4.11).
//
// That is exactly why this script fails closed: `swap()` counts each anchor and
// REFUSES TO WRITE unless the count is exactly the expected value. On a bundle
// that has diverged, it exits 2 having changed nothing. Run --check first and
// read the output; do not run --apply on an unreviewed --check.
//
// ===========================================================================
// THE DEFECT (unchanged, and live)
// ===========================================================================
//   var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";
//   var toSha = await sha256(c.code);
//   ...  <PUT /workers/scripts/{worker}/content with c.code>
//
// `direction` is computed and never read again. Nothing in redeploy() gates on
// it. scan() avoids downgrades only INCIDENTALLY - its ahead-branch `continue`s
// before reaching redeploy() - and that guard lives in the caller, so the HTTP
// route `POST /redeploy` bypasses it entirely.
//
// EXPOSURE, measured 2026-09-13 from fleet_drift_report (deployed-ahead rows):
//   qnfo-ops              deployed 2.15.1  canonical 2.13.0
//   qnfo-ai               deployed 5.25.1  canonical 5.21.3
//   qnfo-research-exec    deployed 0.8.1   canonical 0.5.17-research-restored
//   qnfo-fleet-dashboard  deployed 1.5.1   canonical 1.1.0
//   personal-api          deployed 3.5.0   canonical v3.2.2-maxout200k
//   qnfo-signal-loop      deployed 1.1.2   canonical 1.1.0
//   qnfo-fleet-control    deployed 0.3.4   canonical 0.3.3
//   qnfo-backlog-exec     deployed 1.2.7   canonical 1.2.4
//   qnfo-ai-calibration   deployed 1.1.5   canonical 1.1.4
//   qnfo-email-orchestrator deployed 0.3.4-glm53 canonical 0.3.4
//   qnfo-social           deployed 0.5.3-failclosed canonical 0.5.3
// 518 deployed-ahead rows across 18 workers. One authenticated POST /redeploy
// per worker reverts any of them to an older build.
//
// AGGRAVATING CONFIG (verified live, fleet_deploy_state):
//   enabled   = 1   (README documents default 0, fail-closed)
//   auto_heal = 1   (README documents default 0, fail-closed)
// The README says: "Do NOT enable auto_heal until canonical bundles are synced
// ahead of deployed versions." fleet_drift_report holds 1,492 drift rows across
// 50 workers, so that precondition is NOT met. Disarm this first (see below);
// the guard is defence in depth, not the primary fix.
//
// ===========================================================================
// THE FIX
// ===========================================================================
// 1. redeploy(env, worker, opts) accepts opts.force.
// 2. A downgrade returns HTTP 409 unless force === true.
// 3. POST /redeploy forwards body.force === true for an intentional rollback.
// 4. The refusal is written to fleet_deploys via audit(), so it is visible.
// 5. scan()'s call site passes no opts, so a downgrade there is refused too.
//
// ===========================================================================
// DEPLOY NOTE — THIS WORKER CANNOT SELF-DEPLOY
// ===========================================================================
// var NO_SELF = ["qnfo-fleet-deploy"];   // scan() skips this worker
// Applying this patch and bumping VERSION will NOT cause a redeploy. A manual
// `wrangler deploy` from qnfo-fleet-control/ is required. Until then the fix is
// STAGED, not live. Do not report it as applied.
//
// ===========================================================================
// PRIMARY FIX IS CONFIGURATION, NOT THIS PATCH
// ===========================================================================
//   UPDATE fleet_deploy_state SET value='0', updated_at=datetime('now')
//    WHERE key IN ('auto_heal','enabled');
// qnfo-ops cannot execute this: its SQL surface is SELECT/WITH only. Recorded
// here so the operator has the exact statement.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const apply = process.argv.slice(2).includes('--apply');

if (!fs.existsSync(WORKER)) {
  console.error('FATAL: ' + WORKER + ' not found. Run from qnfo-fleet-control/.');
  process.exit(3);
}

let src = fs.readFileSync(WORKER, 'utf8');
const problems = [];
let changed = 0;
const count = (s, lit) => s.split(lit).length - 1;

function swap(label, oldLit, newLit, expect) {
  const n = count(src, oldLit);
  if (n === 0 && count(src, newLit) > 0) { console.log('  skip  ' + label + ' (already applied)'); return; }
  if (n !== expect) { problems.push(label + ': anchor matched ' + n + 'x, expected ' + expect); return; }
  src = src.split(oldLit).join(newLit);
  changed++;
  console.log('  patch ' + label);
}

// --- 1. redeploy() accepts opts ---------------------------------------------
swap('redeploy signature',
`async function redeploy(env, worker) {`,
`async function redeploy(env, worker, opts) {`, 1);

// --- 2. refuse the downgrade -------------------------------------------------
swap('downgrade guard',
`  var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";
  var toSha = await sha256(c.code);`,
`  var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";
  // PATCH-2026-09-13 (bundle): direction was computed and discarded, so POST /redeploy could
  // revert a live worker to a stale canonical build. Refuse by default; force=true is the
  // explicit, audited rollback path. scan() passes no opts, so this covers that caller too.
  if (direction === "downgrade" && !(opts && opts.force)) {
    await audit(env, worker, "deploy", depV || "?", canV, c.path, false, "refused: canonical is older than deployed (downgrade)");
    return { ok: false, status: 409, note: "refused-downgrade: deployed " + (depV || "?") + " > canonical " + canV + "; canonical source is stale. Pass force=true for an intentional rollback.", from: depV, to: canV, direction: direction, source: c.path };
  }
  var toSha = await sha256(c.code);`, 1);

// --- 3. /redeploy route forwards force --------------------------------------
swap('/redeploy forwards force',
`      var res = await redeploy(env, String(w));
      return json(res, res.ok ? 200 : res.status);`,
`      var res = await redeploy(env, String(w), { force: body.force === true });
      return json(res, res.ok ? 200 : res.status);`, 1);

// --- 4. version bump (outer bundle VERSION; anchored on the deploy marker) ---
// Deliberately NOT anchored on the advisor's inner `var VERSION = "0.3.3";`
// (that belongs to the advisor module and is unrelated). The outer bundle
// version is not visible within the readable prefix, so this step is left to
// the operator rather than guessed at.
console.log('  note  outer bundle VERSION not bumped automatically (not visible in the readable prefix).');
console.log('        Set it by hand next to the deploy control plane, then deploy.');

if (problems.length) {
  console.error('\nREFUSING TO WRITE - anchor mismatch (bundle has diverged, or anchors are stale):');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nNothing was written. Re-derive anchors from the real bundle before applying.');
  process.exit(2);
}
if (!changed) { console.log('\nnothing to do (all fixes already present).'); process.exit(0); }
if (!apply) { console.log('\n--check only; ' + changed + ' change(s) staged. Re-run with --apply to write.'); process.exit(0); }
fs.writeFileSync(WORKER, src);
console.log('\napplied ' + changed + ' change(s) to ' + WORKER);
console.log('NOTE: qnfo-fleet-control is NOT in NO_SELF (that list names qnfo-fleet-deploy), so a');
console.log('      successful canonical deploy could revert this patch. Deploy manually and verify.');

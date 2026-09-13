#!/usr/bin/env node
// qnfo-fleet-deploy/PATCH-2026-09-13-downgrade-guard.mjs
// Written by qnfo-ops 2026-09-13 during the fleet error audit. Idempotent. Fails closed
// (refuses to write on a mismatched anchor). Committed as a patch script rather than a
// wholesale rewrite of worker.js (24,761 B), matching the repo convention established by
// qnfo-social/PATCH-2026-09-13-checker-idrace.mjs.
//
//   node PATCH-2026-09-13-downgrade-guard.mjs --check
//   node PATCH-2026-09-13-downgrade-guard.mjs --apply
//
// ===========================================================================
// THE DEFECT: redeploy() computes `direction` and then DISCARDS it.
// ===========================================================================
// Verified by reading qnfo-fleet-deploy/worker.js (sha ed539ec3, VERSION 0.4.11):
//
//   var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";
//   var toSha = await sha256(c.code);
//   ...
//   var r = <PUT /workers/scripts/{worker}/content with c.code>
//
// `direction` is never read again. Nothing in redeploy() gates on it. So redeploy() will
// happily write a canonical source that is OLDER than what is live.
//
// WHY THIS IS NOT ALREADY CAUGHT: scan() avoids downgrades only INCIDENTALLY. Its
// `if (newer(depV, canV)) { out.ahead++; ...; continue; }` branch reports
// "deployed-ahead" and continues before it can call redeploy(). That guard lives in the
// caller, not in redeploy(), and it does not protect the other caller.
//
// THE UNGUARDED PATH: the HTTP route
//   if (p === "/redeploy" && request.method === "POST") { ... var res = await redeploy(env, String(w)); }
// calls redeploy() directly. A single authenticated POST /redeploy for any worker whose
// canonical source is stale DOWNGRADES that live production worker.
//
// LIVE EXPOSURE, measured 2026-09-13 07:05Z from fleet_drift_report (9 `deployed-ahead` rows):
//   qnfo-ops              deployed 2.15.1  canonical 2.13.0
//   qnfo-ai               deployed 5.25.1  canonical 5.21.3
//   qnfo-research-exec    deployed 0.8.1   canonical 0.5.17-research-restored
//   qnfo-fleet-dashboard  deployed 1.5.1   canonical 1.1.0
//   personal-api          deployed 3.5.0   canonical v3.2.2-maxout200k
//   qnfo-signal-loop      deployed 1.1.2   canonical 1.1.0
//   qnfo-fleet-control    deployed 0.3.4   canonical 0.3.3
//   qnfo-backlog-exec     deployed 1.2.6   canonical 1.2.4
//   qnfo-ai-calibration   deployed 1.1.5   canonical 1.1.4
// Nine live workers, including the AI router and the ops endpoint itself, are one
// authenticated POST away from being reverted to an older build.
//
// SEVERITY: latent, not observed firing. No fleet_deploys row shows a downgrade today.
// Stated plainly so this is not oversold: it is a missing guard on a live mutation path,
// not a demonstrated incident.
//
// ===========================================================================
// THE FIX
// ===========================================================================
// 1. redeploy(env, worker, opts) takes opts.force.
// 2. A downgrade is refused with HTTP 409 unless force === true.
// 3. POST /redeploy accepts body.force === true for an intentional, audited rollback.
// 4. The refusal is written to fleet_deploys via audit(), so it is visible, not silent.
// 5. scan()'s call site `redeploy(env, n)` is unchanged: it passes no opts, so force is
//    falsy and a downgrade there is refused too - defence in depth for a path that
//    already continues earlier.
//
// ===========================================================================
// DEPLOY NOTE - THIS WORKER CANNOT SELF-DEPLOY
// ===========================================================================
// var NO_SELF = ["qnfo-fleet-deploy"];  // scan() skips this worker
// So applying this patch and bumping VERSION will NOT cause qnfo-fleet-deploy to redeploy
// itself. A manual deploy (wrangler deploy from this directory, or
// POST /redeploy with force=true) is required. Until then this fix is STAGED, not live.
//
// SEPARATE FINDING (not fixed here, no safe anchor): scan()'s census is the Cloudflare API
//   GET /accounts/{ACCOUNT}/workers/scripts?per_page=100  using CF_DEPLOY_TOKEN,
// NOT qnfo-observability/fleet.js. Two independent reads agree on 55 scripts while the
// fleet.js census says 81 and worker_logs observed 58 - so some actively-running workers
// (qnfo-pipeline-ops, qnfo-idea-triage, qnfo-blank-audit, qnfo-error-selfheal) are absent
// from the listing the drift scan iterates and are therefore never drift-checked. Adding
// names to fleet.js would NOT fix that; the API view or token scope must be reconciled.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const apply = process.argv.slice(2).includes('--apply');

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
  // PATCH-2026-09-13: `direction` used to be computed and discarded, so POST /redeploy could
  // revert a live worker to a stale canonical build. Refuse by default; force=true is the
  // explicit, audited rollback path. scan() never reaches here for ahead rows, but it passes
  // no opts, so this guard also covers that caller.
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

// --- 4. version bump ---------------------------------------------------------
swap('VERSION bump', 'var VERSION = "0.4.11";', 'var VERSION = "0.4.12-downgrade-guard";', 1);

if (problems.length) {
  console.error('\nREFUSING TO WRITE - anchor mismatch:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(2);
}
if (!changed) { console.log('\nnothing to do (all fixes already present).'); process.exit(0); }
if (!apply) { console.log('\n--check only; ' + changed + ' change(s) staged. Re-run with --apply to write.'); process.exit(0); }
fs.writeFileSync(WORKER, src);
console.log('\napplied ' + changed + ' change(s) to ' + WORKER);
console.log('NOTE: NO_SELF excludes qnfo-fleet-deploy from its own scan - this needs a manual deploy.');

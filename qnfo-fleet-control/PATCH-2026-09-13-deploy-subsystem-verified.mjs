#!/usr/bin/env node
// qnfo-fleet-control/PATCH-2026-09-13-deploy-subsystem-verified.mjs
// Written by qnfo-ops 2026-09-13. Idempotent. FAILS CLOSED on any anchor mismatch.
//
//   node PATCH-2026-09-13-deploy-subsystem-verified.mjs --check  [path/to/worker.js]
//   node PATCH-2026-09-13-deploy-subsystem-verified.mjs --apply  [path/to/worker.js]
//
// Default target: ./worker.js  (run from qnfo-fleet-control/ or qnfo-fleet-deploy/)
//
// ===========================================================================
// ANCHOR PROVENANCE — THE DIFFERENCE FROM THE EARLIER PATCHES
// ===========================================================================
// Every anchor below was READ OUT OF THE ACTUAL SOURCE this session, not
// carried over from another file. Source read in full (24,761 B):
//
//   repo QNFO/qnfo-workers
//   path qnfo-fleet-deploy/deployed-current.worker.js
//   ref  db9d2fdb~1        <-- the commit BEFORE the tombstone
//   sha  ed539ec3254633ed265aa344bbbcffd6cc5fdc9d
//
// CORRECTION to SUPERSEDED-2026-09-13.md and to the earlier patch headers:
// both said the archived source is "retrievable via ref=ed539ec3". It is not.
// ed539ec3 is a BLOB sha; the contents API takes a COMMIT/branch ref, so that
// read returns `path not found`. Verified twice this session. The working ref
// is the tombstone commit's parent (`db9d2fdb~1` / `4c815079~1`).
//
// Why this matters: the earlier bundle patch declared its anchors UNVERIFIED
// and therefore could only ever fail closed. These anchors are verified, so
// --check is now meaningful rather than ceremonial.
//
// ===========================================================================
// THE DEFECTS (six, proven from source; five also by execution)
// ===========================================================================
// D1  versionOf() returns the FIRST `VERSION` in the file, regardless of module.
//     Reproduced:
//       versionOf('var advisorMod=...VERSION="0.3.3"...var deployMod=...VERSION="0.4.11"...')
//         -> "0.3.3"
//     Live match: fleet_drift_report id 1680, qnfo-fleet-control,
//       deployed=0.3.4 canonical=0.3.3 note=deployed-ahead.
//
// D2  newer() misorders on real strings (reproduced against the live pairs):
//       newer("v1.1.0","1.0.0")                     = false -> "upgrade"
//         (personal-companion id 1672 — the hourly failed deploy)
//       newer("qnfo-qwav/fabric-20260910","2.1.0")  = false -> "upgrade"
//         (qnfo-qwav id 1685 — would push 2.1.0 OVER a newer fabric build)
//       newer("0.5.3-failclosed","0.5.3")           = true  -> "downgrade"
//       newer("3.6.1-subscribers","3.6.1")          = true  -> "downgrade"
//     Polarity: the DANGEROUS direction is "upgrade", because scan() only heals
//     the branch it classifies as behind.
//
// D3  redeploy() computes `direction` and never reads it again. No downgrade
//     guard on the scan path; POST /redeploy bypasses scan()'s incidental
//     ahead-branch `continue` entirely.
//
// D4  r2Read() has NO `404:` tombstone rejection, while canonical()'s GitHub
//     loop DOES (`c.slice(0,4) !== "404:"`). Asymmetry visible in one file.
//     Live: fleet_deploys ids 55,57,59,61,63,66 — qnfo-cloud-ops,
//     25 attempts / 0 ok, "Uncaught SyntaxError: Invalid or unexpected token
//     at worker.js:1:2", source_path r2:qnfo-canonical/qnfo-cloud-ops.js.
//
// D5  NO_SELF = ["qnfo-fleet-deploy"], but the LIVE worker is named
//     qnfo-fleet-control (merge wave A). Self-redeploy is NOT refused for the
//     worker that actually runs.
//
// D6  redeploy()'s module branch sends multipart metadata `{main_module}` with
//     no `script_name`. Workers carrying a Workflow binding reject that with
//     CF 10021 "Workflow GenerationFlow must be exported or a script_name must
//     be specified". Live: personal-companion, 30 attempts / 4 ok, hourly.
//
// ===========================================================================
// WHAT THIS SCRIPT DELIBERATELY DOES NOT DO
// ===========================================================================
// It does NOT invent a worker-scoped versionOf. That needs the bundle's module
// boundaries, and a wrong guess would score "clean" on a version match and never
// roll back. Use the tested extractor instead:
//   qnfo-fleet-control/version-compare.mjs  ->  extractWorkerVersion(source, name)
//   qnfo-fleet-control/version-compare.test.mjs
//
// It does NOT flip the kill switch. That is the PRIMARY fix and it is config:
//   UPDATE fleet_deploy_state SET value='0', updated_at=datetime('now')
//    WHERE key IN ('auto_heal','enabled');
// Live values are enabled=1, auto_heal=1 (set 2026-09-08 16:25:49), while the
// README documents both as default-'0' fail-closed and warns not to enable
// auto_heal until canonicals are synced ahead of deployed versions. There are
// 1,492 drift rows across 50 workers, so that precondition is not met.
//
// ===========================================================================
// SELF-DEPLOY
// ===========================================================================
// qnfo-fleet-control is NOT in NO_SELF today. After this patch it will be (D5),
// so applying this and bumping VERSION will stop the worker from redeploying
// itself. A manual `wrangler deploy` from qnfo-fleet-control/ is still required.
// Until that runs, every fix here is STAGED, not live. Do not report otherwise.

import fs from 'node:fs';
import process from 'node:process';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const FILE = args.find((a) => !a.startsWith('--')) || 'worker.js';

if (!fs.existsSync(FILE)) {
  console.error('FATAL: ' + FILE + ' not found. Run from qnfo-fleet-control/ or pass a path.');
  process.exit(3);
}

let src = fs.readFileSync(FILE, 'utf8');
const problems = [];
let changed = 0;
const count = (s, lit) => s.split(lit).length - 1;

function swap(label, oldLit, newLit, expect) {
  const n = count(src, oldLit);
  if (n === 0 && count(src, newLit) > 0) { console.log('  skip    ' + label + ' (already applied)'); return; }
  if (n !== expect) { problems.push(label + ': anchor matched ' + n + 'x, expected ' + expect); return; }
  src = src.split(oldLit).join(newLit);
  changed++;
  console.log('  patch   ' + label);
}

// --- D5: NO_SELF must name the worker that actually runs --------------------
swap('D5 NO_SELF includes qnfo-fleet-control',
`var NO_SELF = ["qnfo-fleet-deploy"];`,
`var NO_SELF = ["qnfo-fleet-deploy", "qnfo-fleet-control"];`, 1);

// --- D4: r2Read must reject tombstones like the GitHub path does ------------
swap('D4 r2Read rejects 404: tombstone',
`    var t = await o.text();
    if (!t || t.length === 0) return null;
    var ts = o.customMetadata && o.customMetadata.ts ? parseInt(o.customMetadata.ts, 10) : 0;`,
`    var t = await o.text();
    if (!t || t.length === 0) return null;
    // PATCH-2026-09-13 (D4): canonical()'s GitHub loop rejects the "404:" tombstone
    // sentinel, but r2Read() did not — so a tombstoned R2 object was returned as a
    // deployable canonical and PUT to the live worker. Live evidence: qnfo-cloud-ops,
    // 25 attempts / 0 ok, "Uncaught SyntaxError: Invalid or unexpected token at
    // worker.js:1:2", source_path r2:qnfo-canonical/qnfo-cloud-ops.js.
    if (t.slice(0, 4) === "404:") return null;
    var ts = o.customMetadata && o.customMetadata.ts ? parseInt(o.customMetadata.ts, 10) : 0;`, 1);

// --- D1/D2: tri-state comparator --------------------------------------------
// cmpV is inlined rather than imported: this file is a single-script worker with
// no module imports, and adding one would change isModule()/upload behaviour.
swap('D1/D2 cmpV replaces newer',
`function newer(a, b) {
  a = String(a || ""); b = String(b || "");
  function num(s) { var m = s.split("-")[0]; var p = m.split("."); var n = []; for (var i = 0; i < p.length; i++) { var x = parseInt(p[i], 10); n.push(isNaN(x) ? 0 : x); } return n; }
  var ap = num(a), bp = num(b);
  var len = Math.max(ap.length, bp.length);
  for (var i = 0; i < len; i++) { var x = ap[i] || 0, y = bp[i] || 0; if (x !== y) return x > y; }
  return a > b;
}`,
`function cmpV(a, b) {
  // PATCH-2026-09-13 (D1/D2): tri-state. null = incomparable -> caller must NOT act.
  // The old newer() did s.split("-")[0] then a numeric compare then \`return a > b\`,
  // which misordered real live pairs in BOTH directions (see header).
  // Rule: only strings beginning with optional "v" then digits are versions.
  // Fabric tags / path-style -> null. Build suffixes (-failclosed, -subscribers)
  // -> core-equal, never a guessed direction. A naive semver rule would order
  // "3.6.1" ABOVE "3.6.1-subscribers" and strip a live build.
  function norm(s) {
    var m = String(s == null ? "" : s).trim().match(/^v?(\\d+(?:\\.\\d+)*)/);
    if (!m) return null;
    var p = m[1].split("."), n = [];
    for (var i = 0; i < p.length; i++) { var x = parseInt(p[i], 10); n.push(isNaN(x) ? 0 : x); }
    return n;
  }
  var ap = norm(a), bp = norm(b);
  if (!ap || !bp) return null;
  var len = Math.max(ap.length, bp.length);
  for (var i = 0; i < len; i++) { var x = ap[i] || 0, y = bp[i] || 0; if (x !== y) return x > y ? 1 : -1; }
  return 0;
}
function newer(a, b) { return cmpV(a, b) === 1; }`, 1);

// --- D1: scan() reports incomparable rather than guessing -------------------
swap('D1 scan out gains incomparable',
`  var out = { scanned: 0, clean: 0, drifted: 0, ahead: 0, healed: 0, errors: 0, staleCanon: 0, healthVer: 0, errKinds: {}, details: [] };`,
`  var out = { scanned: 0, clean: 0, drifted: 0, ahead: 0, incomparable: 0, healed: 0, errors: 0, staleCanon: 0, healthVer: 0, errKinds: {}, details: [] };`, 1);

swap('D1/D2 scan comparison branches on tri-state',
`      if (depV === canV) { await clearScanErr(env, n); out.clean++; continue; }
      if (newer(depV, canV)) {
        out.ahead++;`,
`      if (depV === canV) { await clearScanErr(env, n); out.clean++; continue; }
      var cmp = cmpV(depV, canV);
      if (cmp === 0) { await clearScanErr(env, n); out.clean++; continue; }
      if (cmp === null) {
        out.incomparable++;
        out.errKinds["version-incomparable"] = (out.errKinds["version-incomparable"] || 0) + 1;
        if (out.details.length < 80) out.details.push(n + ":incomparable " + depV + " ? " + canV);
        await scanErr(env, n, "version-incomparable", depV, canV, c.path);
        continue;
      }
      if (cmp === 1) {
        out.ahead++;`, 1);

// --- D3: refuse the downgrade instead of computing and discarding direction --
swap('D3 redeploy signature accepts force',
`async function redeploy(env, worker) {`,
`async function redeploy(env, worker, force) {`, 1);

swap('D3 downgrade guard',
`  var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";
  var toSha = await sha256(c.code);`,
`  // PATCH-2026-09-13 (D3): direction was computed here and discarded. Nothing
  // gated on it, so POST /redeploy could revert any of 18 deployed-ahead workers
  // to a stale canonical build (518 rows). Refuse by default; force=true is the
  // explicit, audited rollback path. scan() passes no force, so it is covered too.
  var cmpDir = cmpV(depV || "", canV);
  var direction = cmpDir === null ? "incomparable" : (cmpDir === 1 ? "downgrade" : "upgrade");
  if (cmpDir === null) {
    await audit(env, worker, "deploy", depV || "?", canV, c.path, false, "refused: incomparable version vocabularies");
    return { ok: false, status: 409, note: "refused: incomparable versions (" + (depV || "?") + " vs " + canV + ")", direction: direction, source: c.path };
  }
  if (direction === "downgrade" && !force) {
    await audit(env, worker, "deploy", depV || "?", canV, c.path, false, "refused: canonical older than deployed");
    return { ok: false, status: 409, note: "refused-downgrade: deployed " + (depV || "?") + " > canonical " + canV + "; pass force=true for an intentional rollback", from: depV, to: canV, direction: direction, source: c.path };
  }
  var toSha = await sha256(c.code);`, 1);

swap('D3 /redeploy forwards force',
`      var res = await redeploy(env, String(w));`,
`      var res = await redeploy(env, String(w), !!body.force);`, 1);

// --- D6: multipart metadata must carry script_name ---------------------------
swap('D6 multipart metadata carries script_name',
`    fd.append("metadata", new Blob([JSON.stringify({ main_module: "worker.js" })], { type: "application/json" }));`,
`    // PATCH-2026-09-13 (D6): a worker with a Workflow binding rejects a
    // /content PUT whose metadata omits script_name:
    //   CF 10021 "Workflow GenerationFlow must be exported or a script_name
    //   must be specified". Live: personal-companion, once per hour, 30 attempts
    //   / 4 ok (fleet_deploys ids 56,58,60,62,65,68,70-74).
    fd.append("metadata", new Blob([JSON.stringify({ main_module: "worker.js", script_name: worker })], { type: "application/json" }));`, 1);

if (problems.length) {
  console.error('\nREFUSING TO WRITE - anchor mismatch (source has diverged, or anchors are stale):');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nNothing was written. Re-derive anchors from the real source before applying.');
  process.exit(2);
}
if (!changed) { console.log('\nnothing to do (all fixes already present).'); process.exit(0); }
if (!apply) { console.log('\n--check only; ' + changed + ' change(s) staged. Re-run with --apply to write.'); process.exit(0); }
fs.writeFileSync(FILE, src);
console.log('\napplied ' + changed + ' change(s) to ' + FILE + ' (' + src.length + ' B)');
console.log('NOTE: qnfo-fleet-control is now in NO_SELF, so it can no longer redeploy itself.');
console.log('      A manual `wrangler deploy` from qnfo-fleet-control/ is required.');
console.log('      PRIMARY FIX IS STILL CONFIG: UPDATE fleet_deploy_state SET value=\'0\'');
console.log('      WHERE key IN (\'auto_heal\',\'enabled\');');

#!/usr/bin/env node
// qnfo-fleet-control/PATCH-2026-09-13-CONSOLIDATED.mjs
// Written by qnfo-ops 2026-09-13. Idempotent. FAILS CLOSED on any anchor mismatch.
//
//   node PATCH-2026-09-13-CONSOLIDATED.mjs --check        [target.js]
//   node PATCH-2026-09-13-CONSOLIDATED.mjs --apply        [target.js]
//   node PATCH-2026-09-13-CONSOLIDATED.mjs --apply --semantics   (adds group C)
//
// Default target: ./worker.js  — i.e. qnfo-fleet-control/worker.js, the LIVE bundle.
//
// SUPERSEDES five partial patches in this directory:
//   PATCH-2026-09-13-downgrade-guard.mjs
//   PATCH-2026-09-13-downgrade-guard-bundle.mjs
//   PATCH-2026-09-13-canonical-extraction-and-noself.mjs
//   PATCH-2026-09-13-registerwatch-dedupe-noself-probeversion.mjs
//   PATCH-2026-09-13-deploy-subsystem-verified.mjs
// Those are not wrong, they are partial. This carries every fix in one fail-closed
// pass so a single deploy closes all known mechanisms.
//
// ===========================================================================
// FOUR SILENT MASKING MECHANISMS
// ===========================================================================
// 1 FALSE CLEAN. versionOf() returns the FIRST `VERSION` in the file. On the merged
//   bundle that is the advisor module's "0.3.3" (fleet_drift_report id 1680,
//   qnfo-fleet-control deployed=0.3.4 canonical=0.3.3). Worse, proven live on
//   qnfo-cloud-ops: its canonical qnfo-cloud-ops/worker.js opens
//   `const VERSION = "1.14.1";` — the OUTER bundle version — so versionOf returns
//   "1.14.1" == deployed -> CLEAN, and the 1.14.1-gtd-guard change is neither
//   deployed nor tracked. The drift monitor became a mask.
//
// 2 STALE-CANON SELF-SEAL. When the canonical carries no VERSION marker, scan()
//   "heals" by copying the DEPLOYED content into R2 and calling it canonical.
//   Drift detection is then permanently disabled — whatever is deployed IS the
//   canonical. 4 live victims: research-daily-brief, qnfo-twin-maintain,
//   osf-integrity-check, obsidian-writer. Verified: research-daily-brief/
//   deployed-current.worker.js is a plain script with no version constant.
//
// 3 POISONED R2 CANONICAL. r2Read() has no `404:` tombstone rejection, while
//   canonical()'s GitHub loop does. A tombstoned/MIME-body R2 object is returned
//   as deployable. Fired on qnfo-cloud-ops: fleet_deploys ids 47-66, 25 attempts
//   / 0 ok, "Uncaught SyntaxError: Invalid or unexpected token at worker.js:1:2".
//   20 workers resolve canonicals from R2.
//
// 4 PROBE CROSS-ATTRIBUTION. probeHealth() short-circuits to an existence check
//   (`ok:true, via:"cf-api-list", version:null`) without contacting the worker, so
//   ~90% of probe rows carry no version. probeVersion() then falls back to a
//   SUBSTRING search, so worker "qnfo-email" matches "qnfo-email-orchestrator".
//   Traced live: qnfo-email's recorded canonical_version is "0.3.4-glm53", which
//   is the ORCHESTRATOR's version. Unresolvable forever, because scan() only heals
//   when !usedHealth and usedHealth is true here.
//
// Plus:
// 5 D2  newer() misorders real strings. The dangerous polarity is "upgrade":
//       newer("qnfo-qwav/fabric-20260910","2.1.0") = false -> "behind" -> scan
//       would push 2.1.0 OVER a newer fabric build.
// 6 D3  redeploy() computes `direction` and discards it. Already fired:
//       fleet_deploys ids 24 and 26, personal-companion, ok=1, "v1.1.0 -> 1.0.0".
// 7 D5  NO_SELF names qnfo-fleet-deploy; the live script is qnfo-fleet-control.
// 8 D6  multipart metadata omits script_name -> CF 10021 on Workflow-bearing
//       workers (personal-companion, 30 attempts / 4 ok, hourly).
// 9 registerWatch() dedupes on `evidence` while improvement() writes the marker
//   into `detail`, so the SELECT is inert. The partial unique index ux_fi_open
//   still prevents duplicate ROWS, so the impact is a miscounted `escalated`, NOT
//   row spam. (Correcting an earlier, larger claim of mine.)
//
// ===========================================================================
// ANCHOR PROVENANCE — READ BEFORE --apply
// ===========================================================================
//  VERIFIED IN SITU — read verbatim this session:
//    Group A : qnfo-fleet-control/worker.js sha d9d438f0 (advisor module, bundle head)
//  VERIFIED AGAINST PRE-MERGE SOURCE — groups B-J:
//    qnfo-fleet-deploy/deployed-current.worker.js, blob
//    ed539ec3254633ed265aa344bbbcffd6cc5fdc9d, 24,761 B, recovered via ref db9d2fdb~1.
//  NOT READ IN THE BUNDLE — the deploy module sits past the 32,768-char read cap
//  (75,875 B, no offset parameter). --check prints the live count for every anchor
//  so you can confirm before writing. Do not --apply on an unreviewed --check.
//
// Correction carried forward: earlier headers claimed the archived source is
// retrievable via `ref=ed539ec3`. It is not — that is a BLOB sha and the contents
// API takes a COMMIT ref. Use the tombstone commit's parent.

import fs from 'node:fs';
import process from 'node:process';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const semantics = args.includes('--semantics');
const FILE = args.find((a) => !a.startsWith('--')) || 'worker.js';

if (!fs.existsSync(FILE)) {
  console.error('FATAL: ' + FILE + ' not found. Run from qnfo-fleet-control/.');
  process.exit(3);
}
let src = fs.readFileSync(FILE, 'utf8');
const orig = src;
const countOf = (h, n) => h.split(n).length - 1;

console.log('target : ' + FILE);
console.log('bytes  : ' + Buffer.byteLength(src, 'utf8'));
console.log('mode   : ' + (apply ? 'APPLY' : 'CHECK') + (semantics ? ' +semantics' : ''));
console.log('');

// ── A. probeHealth must actually probe (VERIFIED in situ) ──────────────────
const A_OLD =
`async function probeHealth(name, names) {
  if (names && names.size) {
    if (names.has(name)) return { ok: true, via: "cf-api-list", version: null };
    return { ok: false, detail: "not-in-cf-worker-list" };
  }`;
const A_NEW =
`async function probeHealth(name, names) {
  // CONSOLIDATED-2026-09-13 (A): the previous form returned ok:true for any name in
  // the CF API script list WITHOUT contacting the worker, so the probe degraded into
  // an existence check. Measured: qnfo-email 206/218 probe rows are the body
  // "cf-api-list: script live" with no version; qnfo-ai 195/582. A monitor that
  // cannot fail is not a monitor. The list is kept, but only to detect ABSENCE.
  if (names && names.size && !names.has(name)) return { ok: false, detail: "not-in-cf-worker-list" };`;

// ── B. probeVersion must not match another worker by substring ─────────────
const B_OLD =
`      if (bodies[b].indexOf(worker) < 0) continue;
      var m = bodies[b].match(/"version"\\s*:\\s*"([^"]{1,40})"/);
      if (m && m[1]) return m[1];`;
const B_NEW =
`      // CONSOLIDATED-2026-09-13 (B): the guard was a SUBSTRING test, so worker
      // "qnfo-email" also matched any body containing "qnfo-email-orchestrator".
      // Traced live: qnfo-email's recorded canonical_version was "0.3.4-glm53",
      // the ORCHESTRATOR's version. Require the name as a complete quoted token.
      var wAnchor = bodies[b].indexOf('"' + worker + '"');
      if (wAnchor < 0) continue;
      var seg = bodies[b].slice(wAnchor, wAnchor + 400);
      var m = seg.match(/"version"\\s*:\\s*"([^"]{1,40})"/);
      if (m && m[1]) return m[1];`;

// ── C. worker-scoped versionOf (opt-in via --semantics) ────────────────────
const C_OLD =
`function versionOf(code) {
  code = code || "";
  var i = code.indexOf("VERSION");
  while (i >= 0 && i < code.length) {
    var j = code.indexOf("=", i);
    if (j < 0 || j - i > 15) { i = code.indexOf("VERSION", i + 1); continue; }
    var k = j + 1;
    if (code[k] === " ") k++;
    var d = code[k];
    if (d !== '"' && d !== "'") { i = code.indexOf("VERSION", i + 1); continue; }
    var q = code.indexOf(d, k + 1);
    if (q < 0 || q - k > 40) { i = code.indexOf("VERSION", i + 1); continue; }
    return code.slice(k + 1, q);
  }
  return null;
}`;
const C_NEW =
`function versionOf(code, expectWorker) {
  // CONSOLIDATED-2026-09-13 (C, mechanism 1): the old form returned the FIRST
  // "VERSION" in the file, whatever module it belonged to. On the merged bundle that
  // is the advisor's "0.3.3" (drift id 1680); on qnfo-cloud-ops/worker.js it is the
  // OUTER bundle version "1.14.1", which made a worker with an undeployed feature
  // change score CLEAN. When expectWorker is given, prefer the VERSION paired with
  // that worker's WORKER constant; if several distinct versions exist and none is
  // attributable, return null (fail closed) rather than guess.
  code = code || "";
  var re = /var\\s+VERSION\\s*=\\s*(?:"([^"]{1,40})"|'([^']{1,40})')/g;
  var found = [], mm;
  while ((mm = re.exec(code)) !== null) {
    var tail = code.slice(mm.index, mm.index + 400);
    var wm = tail.match(/var\\s+WORKER\\s*=\\s*"([^"]{1,80})"/);
    found.push({ v: mm[1] || mm[2], w: wm ? wm[1] : null });
  }
  if (!found.length) return null;
  if (expectWorker) {
    for (var a = 0; a < found.length; a++) if (found[a].w === expectWorker) return found[a].v;
  }
  var uniq = {};
  for (var b = 0; b < found.length; b++) uniq[found[b].v] = 1;
  if (Object.keys(uniq).length > 1 && !expectWorker) return null;
  return found[found.length - 1].v;
}`;
const C_CALLS = [
  [`  var canV = versionOf(c.code);\n  if (!canV) return { ok: false, status: 422, note: "canonical has no VERSION marker" };`,
   `  var canV = versionOf(c.code, worker);\n  if (!canV) return { ok: false, status: 422, note: "canonical has no VERSION marker" };`],
  [`      var canV = versionOf(c.code);\n      var usedHealth = false;`,
   `      var canV = versionOf(c.code, n);\n      var usedHealth = false;`],
  [`  var depV = dep ? versionOf(dep) : null;`, `  var depV = dep ? versionOf(dep, worker) : null;`],
  [`  var depV2 = dep2 ? versionOf(dep2) : null;`, `  var depV2 = dep2 ? versionOf(dep2, worker) : null;`],
  [`        var depHealV = depHeal ? versionOf(depHeal) : null;`, `        var depHealV = depHeal ? versionOf(depHeal, n) : null;`],
  [`      var depV = versionOf(dep);`, `      var depV = versionOf(dep, n);`],
];

// ── D. tri-state comparator ────────────────────────────────────────────────
const D_OLD =
`function newer(a, b) {
  a = String(a || ""); b = String(b || "");
  function num(s) { var m = s.split("-")[0]; var p = m.split("."); var n = []; for (var i = 0; i < p.length; i++) { var x = parseInt(p[i], 10); n.push(isNaN(x) ? 0 : x); } return n; }
  var ap = num(a), bp = num(b);
  var len = Math.max(ap.length, bp.length);
  for (var i = 0; i < len; i++) { var x = ap[i] || 0, y = bp[i] || 0; if (x !== y) return x > y; }
  return a > b;
}`;
const D_NEW =
`function cmpV(a, b) {
  // CONSOLIDATED-2026-09-13 (D, D2): tri-state; null = incomparable -> do not act.
  // The old newer() did s.split("-")[0], a numeric compare, then \`return a > b\`,
  // which misordered real live pairs in BOTH directions. Reproduced:
  //   newer("v1.1.0","1.0.0")                    = false -> "upgrade"
  //   newer("qnfo-qwav/fabric-20260910","2.1.0") = false -> "upgrade"  <-- would push
  //       2.1.0 OVER a newer fabric build, because scan() only heals the branch it
  //       classifies as behind. The dangerous polarity is "upgrade".
  // Only strings beginning with optional "v" then digits are versions; build
  // suffixes (-failclosed, -subscribers) make a pair core-equal, never a guessed
  // direction — a naive semver rule would order "3.6.1" ABOVE "3.6.1-subscribers"
  // and strip a live build.
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
function newer(a, b) { return cmpV(a, b) === 1; }`;

const D2_OLD =
`  var out = { scanned: 0, clean: 0, drifted: 0, ahead: 0, healed: 0, errors: 0, staleCanon: 0, healthVer: 0, errKinds: {}, details: [] };`;
const D2_NEW =
`  var out = { scanned: 0, clean: 0, drifted: 0, ahead: 0, incomparable: 0, healed: 0, errors: 0, staleCanon: 0, healthVer: 0, errKinds: {}, details: [] };`;

const D3_OLD =
`      if (depV === canV) { await clearScanErr(env, n); out.clean++; continue; }
      if (newer(depV, canV)) {
        out.ahead++;`;
const D3_NEW =
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
        out.ahead++;`;

// ── E. downgrade guard ─────────────────────────────────────────────────────
const E1_OLD = `async function redeploy(env, worker) {`;
const E1_NEW = `async function redeploy(env, worker, force) {`;
const E2_OLD =
`  var direction = newer(depV || "", canV) ? "downgrade" : "upgrade";
  var toSha = await sha256(c.code);`;
const E2_NEW =
`  // CONSOLIDATED-2026-09-13 (E, D3): direction was computed here and DISCARDED.
  // Nothing gated on it, so POST /redeploy could revert any of 18 deployed-ahead
  // workers to a stale canonical (518 rows). It has already fired: fleet_deploys
  // ids 24 and 26, personal-companion, ok=1, "v1.1.0 -> 1.0.0", 2026-09-12.
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
  var toSha = await sha256(c.code);`;
const E3_OLD = `      var res = await redeploy(env, String(w));`;
const E3_NEW = `      var res = await redeploy(env, String(w), !!body.force);`;

// ── F. r2Read tombstone rejection ──────────────────────────────────────────
const F_OLD =
`    var t = await o.text();
    if (!t || t.length === 0) return null;
    var ts = o.customMetadata && o.customMetadata.ts ? parseInt(o.customMetadata.ts, 10) : 0;`;
const F_NEW =
`    var t = await o.text();
    if (!t || t.length === 0) return null;
    // CONSOLIDATED-2026-09-13 (F, mechanism 3): canonical()'s GitHub loop rejects the
    // "404:" tombstone sentinel (c.slice(0,4) !== "404:"), but r2Read() did not — an
    // asymmetry in one file. A tombstoned or MIME-body R2 object was returned as a
    // deployable canonical. Fired on qnfo-cloud-ops: fleet_deploys ids 47-66,
    // 25 attempts / 0 ok, "Uncaught SyntaxError: Invalid or unexpected token at
    // worker.js:1:2". 20 workers resolve canonicals from R2.
    if (t.slice(0, 4) === "404:") return null;
    var ts = o.customMetadata && o.customMetadata.ts ? parseInt(o.customMetadata.ts, 10) : 0;`;

// ── G. stop the stale-canon self-seal ──────────────────────────────────────
const G_OLD =
`          await scanErr(env, n, "stale-canon", depHealV, "", c.path);
          try { if (env.CANONICAL) await env.CANONICAL.put(n + ".js", depHeal, { httpMetadata: { contentType: "text/plain" }, customMetadata: { ts: String(Date.now()) } }); } catch (e) {}
          continue;`;
const G_NEW =
`          await scanErr(env, n, "stale-canon", depHealV, "", c.path);
          // CONSOLIDATED-2026-09-13 (G, mechanism 2): this used to copy the DEPLOYED
          // content into R2 and call it canonical, which permanently disabled drift
          // detection for the worker — whatever is deployed IS the canonical, so every
          // later scan reports clean. It is a self-seal, not a heal. The 4 live victims
          // (research-daily-brief, qnfo-twin-maintain, osf-integrity-check,
          // obsidian-writer) have canonical files with no version marker at all. Record
          // the condition and leave R2 alone; the fix is to give those workers a
          // canonical that carries a version, not to bless the deployment.
          continue;`;

// ── H. NO_SELF ─────────────────────────────────────────────────────────────
const H_OLD = `var NO_SELF = ["qnfo-fleet-deploy"];`;
const H_NEW = `var NO_SELF = ["qnfo-fleet-deploy", "qnfo-fleet-control"];`;

// ── I. script_name in multipart metadata ───────────────────────────────────
const I_OLD =
`    fd.append("metadata", new Blob([JSON.stringify({ main_module: "worker.js" })], { type: "application/json" }));`;
const I_NEW =
`    // CONSOLIDATED-2026-09-13 (I, D6): a worker owning a Workflow binding rejects a
    // /content PUT whose metadata omits script_name with CF 10021 "Workflow
    // GenerationFlow must be exported or a script_name must be specified". Live:
    // personal-companion, once per hour, 30 attempts / 4 ok (fleet_deploys ids
    // 56,58,60,62,65,68,70-74).
    fd.append("metadata", new Blob([JSON.stringify({ main_module: "worker.js", script_name: worker })], { type: "application/json" }));`;

// ── J. register dedupe reads the column the marker is written to ───────────
const J_OLD =
`"SELECT COUNT(*) c FROM fleet_improvements WHERE evidence LIKE ?1 AND status IN ('proposed','approved','in_progress')"`;
const J_NEW =
`"SELECT COUNT(*) c FROM fleet_improvements WHERE (detail LIKE ?1 OR evidence LIKE ?1) AND status IN ('proposed','approved','in_progress')"`;

// ── assemble ───────────────────────────────────────────────────────────────
const GROUPS = [
  ['A probeHealth existence-check', A_OLD, A_NEW],
  ['B probeVersion substring', B_OLD, B_NEW],
  ['D newer->cmpV', D_OLD, D_NEW],
  ['D scan out incomparable', D2_OLD, D2_NEW],
  ['D scan comparison', D3_OLD, D3_NEW],
  ['E redeploy signature', E1_OLD, E1_NEW],
  ['E downgrade guard', E2_OLD, E2_NEW],
  ['E /redeploy force', E3_OLD, E3_NEW],
  ['F r2Read tombstone', F_OLD, F_NEW],
  ['G stale-canon self-seal', G_OLD, G_NEW],
  ['H NO_SELF', H_OLD, H_NEW],
  ['I script_name metadata', I_OLD, I_NEW],
  ['J register dedupe', J_OLD, J_NEW],
];

console.log('=== ANCHOR PRESENCE (live counts) ===');
const missing = [];
for (const [label, o, n] of GROUPS) {
  const c = countOf(src, o);
  const done = countOf(src, n) > 0 && c === 0;
  const state = done ? 'already applied' : c === 1 ? 'found (1)' : c === 0 ? 'ABSENT (0)' : 'AMBIGUOUS (' + c + ')';
  console.log('  ' + label.padEnd(30) + state);
  if (!done && c !== 1) missing.push(label + ' -> ' + c);
}
if (semantics) {
  console.log('  C versionOf (opt-in)            ' + (countOf(src, C_OLD) === 1 ? 'found (1)' : 'count ' + countOf(src, C_OLD)));
  let csOk = 0;
  for (const [o] of C_CALLS) if (countOf(src, o) === 1) csOk++;
  console.log('  C call sites                    ' + csOk + '/' + C_CALLS.length + ' found');
  if (countOf(src, C_OLD) !== 1) missing.push('C versionOf');
  if (csOk !== C_CALLS.length) missing.push('C call sites ' + csOk + '/' + C_CALLS.length);
}
console.log('');
console.log('=== CONTEXT ===');
console.log('  NO_SELF literal present        : ' + countOf(src, H_OLD) + 'x');
console.log('  evidence LIKE ?1               : ' + countOf(src, 'evidence LIKE ?1') + 'x');
console.log('  detail LIKE ?1                 : ' + countOf(src, 'detail LIKE ?1') + 'x');

if (missing.length) {
  console.error('');
  console.error('REFUSING TO WRITE — anchors absent or ambiguous:');
  for (const m of missing) console.error('  - ' + m);
  console.error('The bundle has diverged from the source these anchors came from.');
  console.error('Re-derive them from the real bundle before applying. Nothing was changed.');
  process.exit(2);
}

const edits = GROUPS.slice();
if (semantics) { edits.push(['C versionOf', C_OLD, C_NEW]); for (const [o, n] of C_CALLS) edits.push(['C call-site', o, n]); }

if (!apply) {
  console.log('');
  console.log('CHECK mode: all anchors resolved, nothing written. Re-run with --apply.');
  console.log('Then: wrangler deploy from qnfo-fleet-control/ (this worker is in NO_SELF after H).');
  process.exit(0);
}

let applied = 0;
for (const [name, o, n] of edits) {
  if (countOf(src, n) > 0 && countOf(src, o) === 0) { console.log('  skip (applied)  ' + name); continue; }
  if (countOf(src, o) !== 1) { console.error('  ABORT mid-apply at ' + name); process.exit(2); }
  src = src.split(o).join(n);
  applied++;
  console.log('  applied  ' + name);
}
fs.writeFileSync(FILE + '.bak-' + Date.now(), orig);
fs.writeFileSync(FILE, src);
console.log('');
console.log('WROTE ' + FILE + ' (' + applied + ' edit group(s)); backup written alongside.');
console.log('');
console.log('AFTER DEPLOY — verify, do not assume:');
console.log('  1. GET /health -> outer version unchanged; the advisor module string appears once.');
console.log('  2. next scan note: healthVer should DROP (group A stops the existence-check shortcut).');
console.log('  3. next scan note: incomparable should be > 0 (fabric-tagged pairs now refuse, not guess).');
console.log('  4. fleet_drift_report: qnfo-email must stop reporting canonical-ahead against 0.3.4-glm53.');
console.log('  5. fleet_deploys: no new refused-downgrade row for personal-companion, and no new 10021.');
console.log('  6. PRIMARY FIX IS STILL CONFIG (this endpoint cannot write it):');
console.log("       UPDATE fleet_deploy_state SET value='0', updated_at=datetime('now')");
console.log("        WHERE key IN ('auto_heal','enabled');");

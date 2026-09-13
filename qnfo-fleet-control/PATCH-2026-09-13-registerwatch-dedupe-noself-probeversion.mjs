#!/usr/bin/env node
// qnfo-fleet-control/PATCH-2026-09-13-registerwatch-dedupe-noself-probeversion.mjs
// Written by qnfo-ops 2026-09-13. Fail-closed. Run --check first.
//
//   node PATCH-2026-09-13-registerwatch-dedupe-noself-probeversion.mjs --check [target.js]
//   node PATCH-2026-09-13-registerwatch-dedupe-noself-probeversion.mjs --apply [target.js]
//   ... add --semantics to include the opt-in versionOf() rewrite (F4).
//
// Default target: qnfo-fleet-control/worker.js (the live worker).
// Anchors are verbatim from qnfo-fleet-deploy/worker.js, read in full this session.
// See the commit message for the evidence behind F1/F2/F3.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const semantics = args.includes('--semantics');
const target = args.find((a) => !a.startsWith('--')) || path.join(HERE, 'worker.js');

if (!fs.existsSync(target)) {
  console.error('FATAL: ' + target + ' not found.');
  process.exit(3);
}
let src = fs.readFileSync(target, 'utf8');
const orig = src;

console.log('target  : ' + target);
console.log('bytes   : ' + Buffer.byteLength(src, 'utf8'));
console.log('mode    : ' + (apply ? 'APPLY' : 'CHECK') + (semantics ? ' +semantics' : ''));
console.log('');

// ── ANCHORS ────────────────────────────────────────────────────────────────
// Escaping note: these are JS template literals, so every backslash that must
// survive into the anchor is doubled (\\s, \\d).

const A1_OLD =
  `"SELECT COUNT(*) c FROM fleet_improvements WHERE evidence LIKE ?1 AND status IN ('proposed','approved','in_progress')"`;
const A1_NEW =
  `"SELECT COUNT(*) c FROM fleet_improvements WHERE (detail LIKE ?1 OR evidence LIKE ?1) AND status IN ('proposed','approved','in_progress')"`;

const A2_OLD = `var NO_SELF = ["qnfo-fleet-deploy"];`;
const A2_NEW = `var NO_SELF = ["qnfo-fleet-deploy", "qnfo-fleet-control"];`;

const A3_OLD =
  `      if (bodies[b].indexOf(worker) < 0) continue;
      var m = bodies[b].match(/"version"\\s*:\\s*"([^"]{1,40})"/);
      if (m && m[1]) return m[1];`;
const A3_NEW =
  `      if (bodies[b].indexOf(worker) < 0) continue;
      // PATCH-2026-09-13 (F3): the guard above is a SUBSTRING test, so worker
      // "qnfo-email" also matches any body containing "qnfo-email-orchestrator".
      // Require the worker name to appear as a complete quoted token, and read the
      // version only from that token's neighbourhood.
      var wAnchor = bodies[b].indexOf('"' + worker + '"');
      if (wAnchor < 0) continue;
      var seg = bodies[b].slice(wAnchor, wAnchor + 400);
      var m = seg.match(/"version"\\s*:\\s*"([^"]{1,40})"/);
      if (m && m[1]) return m[1];`;

const A4_OLD =
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
const A4_NEW =
  `function versionOf(code, expectWorker) {
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

// call-site plumbing for F4 (each anchored with enough context to be unique)
const CS = [
  [`  var canV = versionOf(c.code);\n  if (!canV) return { ok: false, status: 422, note: "canonical has no VERSION marker" };`,
   `  var canV = versionOf(c.code, worker);\n  if (!canV) return { ok: false, status: 422, note: "canonical has no VERSION marker" };`],
  [`      var canV = versionOf(c.code);\n      var usedHealth = false;`,
   `      var canV = versionOf(c.code, n);\n      var usedHealth = false;`],
  [`  var depV = dep ? versionOf(dep) : null;`, `  var depV = dep ? versionOf(dep, worker) : null;`],
  [`  var depV2 = dep2 ? versionOf(dep2) : null;`, `  var depV2 = dep2 ? versionOf(dep2, worker) : null;`],
  [`        var depHealV = depHeal ? versionOf(depHeal) : null;`, `        var depHealV = depHeal ? versionOf(depHeal, n) : null;`],
  [`      var depV = versionOf(dep);`, `      var depV = versionOf(dep, n);`],
];

// ── CHECK ──────────────────────────────────────────────────────────────────
function countOf(hay, needle) { return hay.split(needle).length - 1; }

console.log('=== ANCHOR PRESENCE ===');
const rows = [
  ['F1 register-dedupe', A1_OLD],
  ['F2 NO_SELF', A2_OLD],
  ['F3 probeVersion', A3_OLD],
  ['F4 versionOf', A4_OLD],
];
for (const [label, lit] of rows) {
  const c = countOf(src, lit);
  console.log('  ' + label.padEnd(22) + (c === 1 ? 'found (1)' : c === 0 ? 'ABSENT (0)' : 'AMBIGUOUS (' + c + ')'));
}
if (semantics) {
  console.log('  F4 call sites:');
  for (const [o] of CS) console.log('    ' + (countOf(src, o) === 1 ? 'found' : 'ABSENT') + '  ' + o.trim().slice(0, 70));
}
console.log('');
console.log('=== CONTEXT ===');
console.log('  NO_SELF verbatim in this file : ' + (countOf(src, A2_OLD) ? 'var NO_SELF = ["qnfo-fleet-deploy"];' : 'not the expected literal'));
console.log('  evidence column referenced    : ' + countOf(src, 'evidence LIKE ?1') + 'x');
console.log('  detail column referenced      : ' + countOf(src, 'detail LIKE ?1') + 'x');

// ── APPLY ──────────────────────────────────────────────────────────────────
if (!apply) {
  console.log('');
  console.log('CHECK mode: nothing written. Re-run with --apply.');
  console.log('Before applying to the LIVE bundle, confirm F1/F2/F3 show "found (1)".');
  console.log('If any shows ABSENT, the bundle has diverged from the standalone source and');
  console.log('these edits must be re-derived by hand. Do not force them.');
  process.exit(0);
}

const edits = [
  ['F1 register-dedupe', A1_OLD, A1_NEW],
  ['F2 NO_SELF', A2_OLD, A2_NEW],
  ['F3 probeVersion', A3_OLD, A3_NEW],
];
if (semantics) {
  edits.push(['F4 versionOf', A4_OLD, A4_NEW]);
  for (const [o, nn] of CS) edits.push(['F4 call-site', o, nn]);
}

let applied = 0;
const missing = [];
for (const [name, o, nn] of edits) {
  if (countOf(src, nn) > 0 && countOf(src, o) === 0) { console.log('  skip (already applied)  ' + name); continue; }
  const c = countOf(src, o);
  if (c !== 1) { missing.push(name + ' (anchor count ' + c + ', expected 1)'); continue; }
  src = src.split(o).join(nn);
  applied++;
  console.log('  applied  ' + name);
}

if (missing.length) {
  console.error('');
  console.error('REFUSING TO WRITE - anchor problems:');
  for (const m of missing) console.error('  - ' + m);
  console.error('Nothing was changed.');
  process.exit(2);
}

if (!applied) { console.log('\nNo changes made. Writing nothing.'); process.exit(0); }

const backup = target + '.bak-' + Date.now();
fs.writeFileSync(backup, orig);
fs.writeFileSync(target, src);
console.log('');
console.log('WROTE ' + target + '  (' + applied + ' edit group(s))');
console.log('backup: ' + backup);
console.log('');
console.log('AFTER APPLYING:');
console.log('  1. this worker cannot self-deploy - run a manual wrangler deploy');
console.log("  2. disarm the aggravating config (qnfo-ops cannot; SELECT-only SQL):");
console.log("       UPDATE fleet_deploy_state SET value='0', updated_at=datetime('now')");
console.log("        WHERE key IN ('auto_heal','enabled');");
console.log('  3. re-run the F4 check with --semantics before enabling that group.');

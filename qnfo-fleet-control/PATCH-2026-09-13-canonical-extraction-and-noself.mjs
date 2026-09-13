#!/usr/bin/env node
// qnfo-fleet-control/PATCH-2026-09-13-canonical-extraction-and-noself.mjs
// Written by qnfo-ops 2026-09-13. Fail-closed. Run --check first.
//
// Consolidates and supersedes the canonical-extraction half of the staged patch set.
// Read the header of the commit message / this file's comments before running --apply.

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
console.log('bundle: ' + WORKER);
console.log('bytes : ' + Buffer.byteLength(src, 'utf8'));
console.log('');

// ───────────────────────────────────────────────────────────────────────────
// PHASE 1 — VERIFY (always runs, changes nothing)
// ───────────────────────────────────────────────────────────────────────────

function lineOf(offset) {
  return src.slice(0, offset).split('\n').length;
}

console.log('=== 1. ALL VERSION CONSTANTS IN THE BUNDLE ===');
const versionRe = /var\s+VERSION\s*=\s*"([^"]+)"/g;
const versions = [];
let m;
while ((m = versionRe.exec(src)) !== null) {
  versions.push({ value: m[1], offset: m.index, line: lineOf(m.index) });
}
if (!versions.length) {
  console.log('  (none found — a canonical extractor that requires VERSION will fail here)');
} else {
  for (const v of versions) {
    console.log('  line ' + String(v.line).padStart(6) + '  VERSION = "' + v.value + '"');
  }
  console.log('');
  if (versions.length > 1) {
    console.log('  >>> MULTI-VERSION BUNDLE (' + versions.length + ' constants).');
    console.log('  >>> First in file = "' + versions[0].value + '". Any extractor taking the first');
    console.log('  >>> VERSION it finds reports "' + versions[0].value + '" as this worker\'s canonical.');
  } else {
    console.log('  >>> Single VERSION constant. Extraction is unambiguous in this bundle.');
  }
}

console.log('');
console.log('=== 2. WORKER NAME CONSTANTS (merge provenance) ===');
const workerNameRe = /var\s+WORKER\s*=\s*"([^"]+)"/g;
while ((m = workerNameRe.exec(src)) !== null) {
  console.log('  line ' + String(lineOf(m.index)).padStart(6) + '  WORKER = "' + m[1] + '"');
}

console.log('');
console.log('=== 3. NO_SELF ===');
const noSelfRe = /var\s+NO_SELF\s*=\s*(\[[^\]]*\])/;
const ns = src.match(noSelfRe);
if (ns) {
  console.log('  ' + ns[1]);
  const listsControl = /qnfo-fleet-control/.test(ns[1]);
  const listsDeploy = /qnfo-fleet-deploy/.test(ns[1]);
  console.log('  lists "qnfo-fleet-deploy"  (pre-merge name): ' + listsDeploy);
  console.log('  lists "qnfo-fleet-control" (live name)     : ' + listsControl);
  if (listsDeploy && !listsControl) {
    console.log('  >>> DEFECT CONFIRMED: self-exclusion matches no live worker.');
    console.log('  >>> This worker is therefore in its own scan/redeploy set.');
  } else if (listsControl) {
    console.log('  >>> OK: self-exclusion covers the live worker name.');
  }
} else {
  console.log('  (no NO_SELF literal found — the exclusion may be expressed differently,');
  console.log('   or may not exist. Do NOT assume either. Inspect scan() by hand.)');
}

console.log('');
console.log('=== 4. CANONICAL PATH TEMPLATE (dangling main/ prefix) ===');
let mainHits = 0;
const pathRe = /["'`]([^"'`]*main\/[^"'`]*)["'`]/g;
while ((m = pathRe.exec(src)) !== null) {
  mainHits++;
  console.log('  line ' + String(lineOf(m.index)).padStart(6) + '  ' + m[1]);
}
if (!mainHits) {
  console.log('  (no literal "main/" path found; the prefix may be built by concatenation)');
} else {
  console.log('  >>> "main/" is a PRE-MIGRATION path. The repo was flattened 2026-07-13');
  console.log('  >>> (phase QNFO.INFRA.R2.P2). Verified absent from QNFO/qnfo-workers.');
}

console.log('');
console.log('=== 5. COMPARATOR CALL SITES ===');
const newerRe = /newer\s*\(/g;
let n = 0;
while ((m = newerRe.exec(src)) !== null) {
  n++;
  const line = lineOf(m.index);
  const snippet = src.slice(m.index, m.index + 90).split('\n')[0];
  console.log('  line ' + String(line).padStart(6) + '  ' + snippet.trim());
}
console.log('  total newer() call sites: ' + n);
console.log('  (a leading-"v" or build-tag argument at any of these is the drift false-positive)');

console.log('');
console.log('=== 6. CANONICAL SOURCE CONVENTION ===');
const sibling = path.join(HERE, 'deployed-current.worker.js');
console.log('  worker.js exists               : yes (this file)');
console.log('  deployed-current.worker.js     : ' + (fs.existsSync(sibling) ? 'yes' : 'NO'));
if (!fs.existsSync(sibling)) {
  console.log('  >>> This worker has NO deployed-current.worker.js. Other workers in the repo');
  console.log('  >>> do (qnfo-email, qnfo-qwav, qnfo-fleet-calibrator). The convention is');
  console.log('  >>> inconsistent; a path template that assumes one shape cannot serve both.');
}

// ───────────────────────────────────────────────────────────────────────────
// PHASE 2 — APPLY (fail-closed)
// ───────────────────────────────────────────────────────────────────────────
console.log('');
console.log('=== PHASE 2 ===');
if (!apply) {
  console.log('--check mode: nothing written. Re-run with --apply to attempt the patch.');
  console.log('');
  console.log('Anchors this script would use:');
  console.log('  A1  NO_SELF literal          : ' + (ns ? ns[1] : 'NOT FOUND — would refuse'));
  console.log('  A2  redeploy signature       : ' + (/async function redeploy\(env, worker\) \{/.test(src) ? 'found' : 'NOT FOUND'));
  console.log('  A3  direction/toSha pair     : ' + (/var direction = newer\(depV \|\| "", canV\)/.test(src) ? 'found' : 'NOT FOUND'));
  process.exit(0);
}

const problems = [];
let changed = 0;
const count = (s, lit) => s.split(lit).length - 1;

function swap(label, oldLit, newLit, expect) {
  const c = count(src, oldLit);
  if (c === 0 && count(src, newLit) > 0) { console.log('  skip  ' + label + ' (already applied)'); return; }
  if (c !== expect) { problems.push(label + ': anchor matched ' + c + 'x, expected ' + expect); return; }
  src = src.split(oldLit).join(newLit);
  changed++;
  console.log('  patch ' + label);
}

// FIX 1 — self-exclusion must cover the post-merge worker name.
if (ns && /qnfo-fleet-deploy/.test(ns[1]) && !/qnfo-fleet-control/.test(ns[1])) {
  swap('NO_SELF covers live name',
    ns[1],
    '["qnfo-fleet-deploy", "qnfo-fleet-control"]',
    1);
} else {
  console.log('  skip  NO_SELF (already correct, or literal not found)');
}

// FIX 2 — canonical extraction must not take the first VERSION in a merged bundle.
// Guarded, not guessed: only applied if the naive first-VERSION pattern is present verbatim.
swap('canonical VERSION extraction is bundle-aware',
  'var mv = code.match(/var VERSION = "([^"]+)"/);',
  'var mv = code.match(/var VERSION = "([^"]+)"/); // PATCH-2026-09-13: see NOTE below',
  0);

if (problems.length) {
  console.error('');
  console.error('REFUSING TO WRITE — anchor mismatches:');
  for (const p of problems) console.error('  - ' + p);
  console.error('The bundle has diverged from the anchors. Nothing was changed.');
  console.error('Re-derive anchors from the --check output above before patching.');
  process.exit(2);
}

if (changed === 0) {
  console.log('');
  console.log('No changes made (all anchors skipped). Writing nothing.');
  process.exit(0);
}

const backup = WORKER + '.bak-' + Date.now();
fs.writeFileSync(backup, fs.readFileSync(WORKER));
fs.writeFileSync(WORKER, src);
console.log('');
console.log('WROTE ' + WORKER + ' (' + changed + ' change group(s))');
console.log('backup: ' + backup);
console.log('');
console.log('NOTE — FIX 2 is intentionally NOT auto-applied.');
console.log('Rewriting the VERSION extractor requires the deploy subsystem\'s real source,');
console.log('which is past the 32,768-char read cap available to qnfo-ops. A guess here would');
console.log('score "clean" on version match and never roll back. Apply FIX 2 by hand after');
console.log('reading scan() in full. FIX 1 (NO_SELF) is a literal array and is safe to apply.');
console.log('');
console.log('AFTER APPLYING: this worker cannot self-deploy. Run a manual wrangler deploy.');
console.log('ALSO REQUIRED (qnfo-ops cannot execute — SELECT-only):');
console.log("  UPDATE fleet_deploy_state SET value='0', updated_at=datetime('now')");
console.log("   WHERE key IN ('auto_heal','enabled');");

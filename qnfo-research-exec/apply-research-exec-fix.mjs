#!/usr/bin/env node
// qnfo-research-exec/apply-research-exec-fix.mjs
//
// Added 2026-09-13 by qnfo-ops. EXECUTABLE BY THE DEPLOY RUNNER. Idempotent.
// Fails closed: if an anchor does not match the expected number of times, it writes
// NOTHING and exits non-zero.
//
//   node apply-research-exec-fix.mjs --check
//   node apply-research-exec-fix.mjs --apply
//
// WHY A PATCHER
// worker.js is 80,916 bytes. github_repo_read truncates at 32,768 chars with no
// offset; web_fetch loses every run of text between a '<' and the next '>'. Neither
// yields this file intact, so a hand-authored full-file rewrite would ship guessed
// code. This script does the surgery where the file lives.
//
// ---------------------------------------------------------------------------
// FIX A — HIGH — the recurring, unticketed, invisible v2-drain failure
// ---------------------------------------------------------------------------
// Observed production error, from cloud_ops_events (kind=v2-drain):
//
//     [{"ok":false,"stage":"v2","error":"NL is not defined"}]
//
// 18 occurrences in 2 days at a ~2h15m cadence, last seen 2026-09-13T03:11:34Z.
// Logged with status='ok', so telemetry_analyze never saw it and no ticket was ever
// filed. Blast radius: the version_queue publish drain silently stalls.
//
// ROOT CAUSE (read from source): depositToGithub() builds the deposit README with
// a bare `NL`:
//
//     var readme = '# ' + (title || slug) + NL + NL + 'DOI: ' + doi + NL + ...
//
// but `NL` is never declared anywhere in the bundle. The sibling worker
// personal-companion declares `var NL = String.fromCharCode(10);`; this bundle was
// assembled from a source that relied on that declaration without carrying it.
//
// THE ERROR MESSAGE IS ITSELF THE PROOF THAT NO DECLARATION EXISTS:
//   * `var NL` anywhere in module scope hoists to `undefined` — the README would then
//     contain the literal text "undefined", not throw.
//   * `let`/`const` would throw "Cannot access 'NL' before initialization".
//   * "NL is not defined" is precisely ReferenceError for an identifier with NO
//     binding in any enclosing scope.
// So the fix cannot collide with an existing declaration, and the insertion is safe.
//
// FIX: declare it, at module scope, next to the other constants.
//
// ---------------------------------------------------------------------------
// FIX B — MEDIUM — error payloads logged as success
// ---------------------------------------------------------------------------
// logEvent() writes `status || "ok"`. Callers that log a failure payload without
// passing a status therefore record a successful event, which is how FIX A stayed
// invisible for two days while occurring every ~2 hours.
//
// FIX: classify the text when no status is supplied. Any payload carrying an error
// signature is recorded as status='error' so the telemetry self-heal loop can see it.
// This does not change what is logged, only how it is labelled.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const NEW_VERSION = '0.8.2-nl-fix';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

let src = fs.readFileSync(WORKER, 'utf8');
const problems = [];
let changed = 0;

// ---------------------------------------------------------------- FIX A
const DECLARED = /(?:^|[^\w$])(?:var|let|const)\s+NL\s*=/m.test(src);
const USED = /(?:^|[^\w$])NL(?:[^\w$]|$)/m.test(src);

if (!USED) {
  console.log('  skip  FIX A: NL is not referenced in this bundle');
} else if (DECLARED) {
  console.log('  skip  FIX A: NL is already declared');
} else {
  const vAnchor = 'var VERSION = "0.8.1-quality-gate-fix";';
  if (src.split(vAnchor).length - 1 !== 1) {
    problems.push('FIX A: VERSION anchor "0.8.1-quality-gate-fix" not found exactly once, so there is no verified insertion point');
  } else {
    const insert = vAnchor + '\n// QRI-OPS 2026-09-13: NL was used by depositToGithub() but never declared in this\n'
      + '// bundle (ReferenceError "NL is not defined", 18x in 2 days, masked as status=\'ok\').\n'
      + 'var NL = String.fromCharCode(10);';
    src = src.split(vAnchor).join(insert);
    console.log('  fix   FIX A: declared NL (used but undeclared -> ReferenceError in depositToGithub)');
    changed++;
  }
}

// ---------------------------------------------------------------- FIX B
const L_OLD = 'status || "ok"';
const L_NEW = 'status || (/(?:"ok"\\s*:\\s*false|\\berror\\b|is not defined|failed|ERR_)/i.test(String(text)) ? "error" : "ok")';
const L_HITS = src.split(L_OLD).length - 1;
if (L_HITS === 0) {
  if (src.includes('is not defined|failed|ERR_')) {
    console.log('  skip  FIX B already applied');
  } else {
    problems.push('FIX B: anchor \'status || "ok"\' not found (0 matches)');
  }
} else if (L_HITS !== 1) {
  problems.push('FIX B: anchor \'status || "ok"\' appears ' + L_HITS + 'x (need 1)');
} else {
  src = src.split(L_OLD).join(L_NEW);
  console.log('  fix   FIX B: logEvent() now records error-signature payloads as status=error');
  changed++;
}

// ---------------------------------------------------------------- VERSION
const V_OLD = 'var VERSION = "0.8.1-quality-gate-fix";';
if (src.includes('var VERSION = "' + NEW_VERSION + '";')) {
  console.log('  skip  VERSION already ' + NEW_VERSION);
} else if (src.split(V_OLD).length - 1 === 1) {
  src = src.split(V_OLD).join('var VERSION = "' + NEW_VERSION + '";');
  console.log('  fix   VERSION -> ' + NEW_VERSION);
  changed++;
} else {
  problems.push('VERSION: anchor "var VERSION = \\"0.8.1-quality-gate-fix\\";" not found exactly once');
}

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
console.log('Verification after deploy:');
console.log('  SELECT ts, kind, status, text FROM cloud_ops_events');
console.log('   WHERE kind = \'v2-drain\' ORDER BY ts DESC LIMIT 10;');
console.log('  Expect: no further "NL is not defined" rows. With FIX B in place a future');
console.log('  v2-drain failure will appear with status=\'error\' and be visible to');
console.log('  telemetry_analyze instead of being filed as a success.');

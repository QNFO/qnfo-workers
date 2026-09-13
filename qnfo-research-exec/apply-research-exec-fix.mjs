#!/usr/bin/env node
// qnfo-research-exec/apply-research-exec-fix.mjs
//
// Added 2026-09-13 by qnfo-ops. EXECUTABLE BY THE DEPLOY RUNNER. Idempotent.
// Fails closed: if a REQUIRED anchor does not match the expected number of times, it writes
// NOTHING and exits non-zero.
//
//   node apply-research-exec-fix.mjs --check
//   node apply-research-exec-fix.mjs --apply
//   node apply-research-exec-fix.mjs --apply --with-deposit-log     (optional FIX D)
//
// WHY A PATCHER
// worker.js is 80,916 bytes. github_repo_read truncates at 32,768 chars with no offset, and
// web_fetch collapses whitespace and eats every run of text between a '<' and the next '>'.
// Neither yields this file intact, so a hand-authored full-file rewrite would ship guessed
// code. This script does the surgery where the file lives.
//
// ---------------------------------------------------------------------------
// FIX A — HIGH — the recurring, unticketed, invisible v2-drain failure
// ---------------------------------------------------------------------------
// Observed production error, verbatim from cloud_ops_events (kind=v2-drain):
//
//     [{"ok":false,"stage":"v2","error":"NL is not defined"}]
//
// EVIDENCE (read-only D1, 2026-09-13 ~14:15Z) — this SUPERSEDES the "38x over 10 days" figure
// in the first revision of this file, which conflated all v2-drain rows with the NL rows:
//
//   SELECT COUNT(*) n, MIN(ts), MAX(ts) FROM cloud_ops_events
//    WHERE kind='v2-drain' AND text LIKE '%NL is not defined%';
//     -> n=19, 2026-09-11T12:41:26.743Z .. 2026-09-13T05:21:30.947Z
//
//   SELECT kind, status, COUNT(*) n, MIN(ts), MAX(ts) FROM cloud_ops_events
//    WHERE kind='v2-drain' GROUP BY kind, status;
//     -> ONE row: status='ok', n=40, 2026-09-03T14:11:10.269Z .. 2026-09-13T09:55:46.687Z
//
// So 19 of the 40 rows carry the ReferenceError payload and EVERY ONE is recorded with
// status='ok'. The single-row GROUP BY is the proof of total masking — not one of the 19 was
// ever filed as an error, which is why this survived two days unticketed.
// The two newest rows (2026-09-13T07:45:50.931Z and 09:55:46.687Z) carry a different payload,
// `newversion failed: {"_status":504,...}` — a Zenodo 5xx at the newversion step, i.e. those
// attempts now fail EARLIER and the ReferenceError is never reached.
//
// The NL regression window is bounded: the last successful publish is version_queue id=17
// (updated 2026-09-11 10:16:31); the first NL failure is 2026-09-11T12:41:26Z.
//
// Blast radius: the version_queue publish drain silently stalls; nothing surfaces.
//
// ROOT CAUSE (read from source, 2026-09-13)
// depositToGithub() builds the deposit README with a bare `NL`:
//
//   async function depositToGithub(env, slug, title, md, doi) {
//     if (!env.GITHUB_TOKEN) return { ok: false, error: 'no github token' };
//     ...
//     var readme = '# ' + (title || slug) + NL + NL + 'DOI: ' + doi + NL + NL +
//       'Author: Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604)' + NL +
//       'License: CC BY 4.0' + NL + NL +
//       'Auto-deposited by qnfo-research-exec (artifact-deposition P3).';
//
// and `NL` is never declared in this bundle. The sibling function qualityGate() declares its
// own `var NLc = String.fromCharCode(10)` — the newline constant was renamed at one call site
// and this one was missed.
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
// ORDERING CONSEQUENCE (read from source — matters more than the throw itself)
// Both call sites of depositToGithub() sit AFTER the row is marked published:
//
//   ... UPDATE version_queue SET status='published', new_doi=? ... ; await depositToGithub(...)
//   ... UPDATE version_queue SET status='published', new_doi=? ... ; await depositToGithub(...)
//
// The ReferenceError therefore fires after Zenodo has published and after the row has left the
// drain's selection set. The drain's per-row catch logs the error, but the row is already
// 'published' and is never retried, so the GitHub artifact deposit for those versions is lost.
// Corroboration: QNFO/qnfo-research has no per-slug deposit directory for any recent slug —
// programFor() maps e.g. 'the-margolus-levitin-...' to 'margolus-levitin/<slug>', and neither
// 'margolus-levitin' nor 'topological-spin' nor 'jpcub-qec' exists at the repo root, while
// 'joules-per-compute-benchmark' and 'silent-radix' contain no per-slug directories.
//
// ---------------------------------------------------------------------------
// FIX B — MEDIUM — error payloads logged as success
// ---------------------------------------------------------------------------
// logEvent() writes `status || "ok"`. Callers that log a failure payload without
// passing a status therefore record a successful event, which is exactly how FIX A
// stayed invisible across 19 occurrences in 2 days.
//
// FIX: classify the text when no status is supplied. Any payload carrying an error
// signature is recorded as status='error' so the telemetry self-heal loop can see it.
// This does not change what is logged, only how it is labelled.
//
// ---------------------------------------------------------------------------
// FIX C — BLOCKER FOR FIX A — the canonical the scanner reads is not this file
// ---------------------------------------------------------------------------
// fleet_drift_report, hourly, ids 1610..1706 (2026-09-13 09:02:25 .. 14:04:41):
//   deployed_version    0.8.1
//   canonical_version   0.5.17-research-restored
//   source_path         qnfo-workers/main/qnfo-research-exec/deployed-current.worker.js
//   note                deployed-ahead          (fleet_deploys: zero rows for this worker, ever)
//
// The resolver stops at the first canonical candidate that fetches successfully, and
// deployed-current.worker.js precedes worker.js. While that mirror held a valid 0.5.17 bundle,
// patching worker.js alone could never ship: the scanner would keep reading the mirror and
// compute 0.5.17 < 0.8.1 -> no-act. A "404:" tombstone is now committed at that path
// (commit 45a8e360, prior blob 55e0e56f, 46,180 B) so the resolver falls through to worker.js.
// FIX C asserts that state and REFUSES TO WRITE if it does not hold.
//
// ---------------------------------------------------------------------------
// FIX D — LOW / OPTIONAL — depositToGithub()'s result is discarded
// ---------------------------------------------------------------------------
// Both call sites `await depositToGithub(...)` and ignore the return value, so a deposit that
// fails WITHOUT throwing is completely invisible:
//   * no/invalid GITHUB_TOKEN -> returns {ok:false,error:'no github token'} (no throw, no log)
//   * 401/404 from the contents API -> out=[{status:401}] -> ok:false (no throw, no log)
// --with-deposit-log rewrites the two statements to log a non-ok result through logEvent().
// Warn-only by design: if the anchors are not found the script says so and continues, because
// this is a diagnosability improvement and not the fix itself.
//
// NOTE ON COVERAGE: FIX B does not retro-fit the 19 existing masked rows. Optional backfill:
//   UPDATE cloud_ops_events SET status='error'
//    WHERE kind='v2-drain' AND text LIKE '%is not defined%';

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const MIRROR = path.join(HERE, 'deployed-current.worker.js');
const OLD_VERSION = '0.8.1-quality-gate-fix';
const NEW_VERSION = '0.8.2-nl-fix';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const withDepositLog = args.includes('--with-deposit-log');

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
  const vAnchor = 'var VERSION = "' + OLD_VERSION + '";';
  if (src.split(vAnchor).length - 1 !== 1) {
    problems.push('FIX A: VERSION anchor "' + vAnchor + '" not found exactly once, so there is no verified insertion point');
  } else {
    const insert = vAnchor + '\n// QRI-OPS 2026-09-13: NL was used by depositToGithub() but never declared in this\n'
      + '// bundle (ReferenceError "NL is not defined", 19x between 2026-09-11T12:41Z and\n'
      + '// 2026-09-13T05:21Z, every one masked as status=\'ok\' in cloud_ops_events).\n'
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
const V_OLD = 'var VERSION = "' + OLD_VERSION + '";';
if (src.includes('var VERSION = "' + NEW_VERSION + '";')) {
  console.log('  skip  VERSION already ' + NEW_VERSION);
} else if (src.split(V_OLD).length - 1 === 1) {
  src = src.split(V_OLD).join('var VERSION = "' + NEW_VERSION + '";');
  console.log('  fix   VERSION -> ' + NEW_VERSION);
  changed++;
} else {
  problems.push('VERSION: anchor "var VERSION = \\"' + OLD_VERSION + '\\";" not found exactly once');
}

// ---------------------------------------------------------------- FIX C
// The scanner reads the mirror BEFORE worker.js. Refuse to write a patch that cannot ship.
function versionOf(text) {
  const m = String(text).match(/var\s+VERSION\s*=\s*["']([^"']+)["']/);
  return m ? m[1] : null;
}
const finalVersion = versionOf(src);
let mirrorText = null;
try {
  mirrorText = fs.readFileSync(MIRROR, 'utf8');
} catch (e) {
  mirrorText = null;
}

if (mirrorText === null) {
  console.log('  ok    FIX C: no deployed-current.worker.js present, so worker.js is the resolver\'s first candidate');
} else if (mirrorText.trimStart().startsWith('404:')) {
  console.log('  ok    FIX C: deployed-current.worker.js is a "404:" tombstone, so the resolver falls through to worker.js');
} else {
  const mv = versionOf(mirrorText);
  if (mv && finalVersion && mv === finalVersion) {
    console.log('  ok    FIX C: deployed-current.worker.js carries VERSION ' + mv + ' (matches the patched worker.js)');
  } else {
    problems.push('FIX C: deployed-current.worker.js is NOT a "404:" tombstone and carries VERSION ' + JSON.stringify(mv)
      + ' while worker.js will carry ' + JSON.stringify(finalVersion)
      + '. The deploy resolver stops at that path first (fleet_drift_report source_path='
      + 'qnfo-workers/main/qnfo-research-exec/deployed-current.worker.js, note=deployed-ahead), so this'
      + ' patch could never ship. Either restore the committed tombstone (commit 45a8e360, blob 55e0e56f)'
      + ' or regenerate the mirror from the patched bundle.');
  }
}

// ---------------------------------------------------------------- FIX D (optional, warn-only)
if (withDepositLog) {
  const sites = [{ doi: 'adoptedDoi' }, { doi: 'newDoi' }];
  for (const site of sites) {
    let hits = 0;
    let usedQ = null;
    for (const q of ['""', "''"]) {
      const a = 'await depositToGithub(env, slug, row.title, row.corrected_md || ' + q + ', ' + site.doi + ');';
      const n = src.split(a).length - 1;
      if (n > 0) { hits += n; usedQ = q; }
    }
    if (hits !== 1) {
      console.log('  warn  FIX D: anchor for ' + site.doi + ' matched ' + hits + 'x (need 1) — skipped, not fatal');
      continue;
    }
    const q = usedQ;
    const a = 'await depositToGithub(env, slug, row.title, row.corrected_md || ' + q + ', ' + site.doi + ');';
    const r = 'var _dep = await depositToGithub(env, slug, row.title, row.corrected_md || ' + q + ', ' + site.doi + ');'
      + ' if (!_dep || !_dep.ok) await logEvent(env, "deposit-fail", String(slug) + " " + JSON.stringify(_dep).slice(0, 300));';
    src = src.split(a).join(r);
    console.log('  fix   FIX D: a non-ok deposit result at ' + site.doi + ' is now logged (deposit-fail)');
    changed++;
  }
} else {
  console.log('  skip  FIX D: not requested (--with-deposit-log)');
}

// ------------------------------------------------------------------ outcome
console.log('\n' + changed + ' change(s) pending, ' + problems.length + ' problem(s)');
if (problems.length) {
  console.error('\nREFUSING TO WRITE:');
  problems.forEach((p) => console.error('  ! ' + p));
  process.exit(2);
}
if (!apply) {
  console.log('--check only; nothing written. Re-run with --apply.');
  process.exit(0);
}
fs.writeFileSync(WORKER, src, 'utf8');
console.log('WROTE ' + WORKER + '\n');

console.log('Verification after deploy:');
console.log('  1) the drain:');
console.log("     SELECT ts, kind, status, text FROM cloud_ops_events");
console.log("      WHERE kind='v2-drain' ORDER BY ts DESC LIMIT 10;");
console.log('     Expect: no further "NL is not defined" rows. With FIX B in place a future');
console.log("     v2-drain failure appears with status='error' and is visible to telemetry_analyze");
console.log('     instead of being filed as a success.');
console.log('  2) the deploy path (the scanner runs hourly, ~:02):');
console.log('     SELECT ts, deployed_version, canonical_version, source_path, note FROM fleet_drift_report');
console.log("      WHERE worker='qnfo-research-exec' ORDER BY id DESC LIMIT 3;");
console.log('     Before: canonical=0.5.17-research-restored, source_path=.../deployed-current.worker.js,');
console.log('     note=deployed-ahead. After the tombstone + --apply: source_path should become');
console.log('     .../worker.js with canonical=0.8.2-nl-fix and note=canonical-ahead, followed by a');
console.log('     fleet_deploys row (ok=1).');
console.log('  3) the deposit target:');
console.log('     QNFO/qnfo-research should gain <program>/<slug>/README.md and <program>/<slug>/paper.md.');
console.log('     Neither exists for any recent slug today, so this step is still unproven even after FIX A.');
console.log('');
console.log('Optional backfill for the 19 masked rows (D1 write required, not done here):');
console.log("  UPDATE cloud_ops_events SET status = 'error'");
console.log("   WHERE kind = 'v2-drain' AND text LIKE '%is not defined%';");

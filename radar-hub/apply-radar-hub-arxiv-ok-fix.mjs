#!/usr/bin/env node
// radar-hub/apply-radar-hub-arxiv-ok-fix.mjs
//
// Added 2026-09-13 by qnfo-ops. EXECUTABLE BY THE DEPLOY RUNNER. Idempotent.
// Fails closed: if an anchor does not match the expected number of times, it writes
// NOTHING and exits non-zero.
//
//   node apply-radar-hub-arxiv-ok-fix.mjs --check
//   node apply-radar-hub-arxiv-ok-fix.mjs --apply
//
// WHY A PATCHER
// radar-hub/worker.js is 38,953 bytes. github_repo_read truncates at 32,768 chars with
// no offset, so a hand-authored full-file rewrite would ship guessed code. This script
// does the surgery where the file lives. Same approach as
// qnfo-research-exec/apply-research-exec-fix.mjs.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE AND NOT qnfo-arxiv-radar/worker.js
// ---------------------------------------------------------------------------
// qnfo-ops committed a fix to qnfo-arxiv-radar/worker.js earlier on 2026-09-13
// (sha 0185920c...). THAT FIX IS AIMED AT A RETIRED WORKER.
//
//   * service_registry: radar-hub = "Merged radar hub (wave B): events-radar +
//     qnfo-arxiv-radar + qnfo-research-radar + qnfo-citation-watch".
//   * fleet_status lists 55 workers. "radar-hub" is present.
//     "qnfo-arxiv-radar" is ABSENT.
//   * The standalone directory holds only a frozen bundle.
//
// So the arXiv radar that actually runs is the `arxivMod` module inside THIS file, and
// it carries the identical defect.
//
// ---------------------------------------------------------------------------
// THE DEFECT
// ---------------------------------------------------------------------------
// Inside arxivMod's run():
//
//     const r = await fetch("https://export.arxiv.org/api/query?...&sortBy=submittedDate&sortOrder=descending",
//                           { headers: { "User-Agent": UA } });
//     const txt = await r.text();
//     const entries = txt.split("<entry>").slice(1);      // <-- no r.ok check
//     ...
//     } catch (e) { out.error = String((e && e.message) || e); }
//
// On a 429 (arXiv rate-limits sorted queries hard — reproduced live 2026-09-13, 4 of 5
// probes) the body has no <entry> tags, so entries = [], out.hits = 0, and out.error
// stays null because the fetch never threw. The worker then writes a note reading
// "Widened scan: 0 hits, 0 strong candidates" and reports SUCCESS.
//
// Independent evidence that arXiv was in fact erroring the fleet on 2026-09-13:
//   outbound alert "[research-daily-brief] FAILED 2026-09-13T06:07:35.524Z"
//   (qnfo-email ids 709/708), whose throw site is `if (!r.ok) throw new Error('arxiv ' + r.status)`.
//
// ---------------------------------------------------------------------------
// THE FIX
// ---------------------------------------------------------------------------
// One line, inserted before the parse. It throws, which the module's EXISTING catch
// already handles by setting out.error — so no new error path is introduced and the
// downstream behaviour (no note, no enqueue, error reported) falls out for free.
//
// This does NOT change the query shape or the UA. Those are separate, riskier changes
// (arXiv's API terms want a descriptive UA; a browser-spoofed one is throttled harder)
// and are deliberately left out so this patch has exactly one effect.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');

const args = process.argv.slice(2);
const apply = args.includes('--apply');

let src = fs.readFileSync(WORKER, 'utf8');
const problems = [];
let changed = 0;

// ---------------------------------------------------------------- FIX
// The parse line is the insertion point. It must be unique in the file.
const ANCHOR = 'const entries = txt.split("<entry>").slice(1);';
const GUARD = 'if (!r.ok) throw new Error("arxiv http " + r.status + (r.status === 429 ? " (rate limited)" : ""));\n    ';

const hits = src.split(ANCHOR).length - 1;

if (hits === 0) {
  if (src.includes('arxiv http " + r.status')) {
    console.log('  skip  FIX already applied');
  } else {
    problems.push('FIX: anchor not found (0 matches) — the parse line has moved or been reformatted');
  }
} else if (hits !== 1) {
  problems.push('FIX: anchor appears ' + hits + 'x (need exactly 1) — refusing to guess which site is the arXiv parse');
} else {
  // Verify the guarded fetch is the one immediately preceding, so the inserted line
  // cannot reference an out-of-scope or different `r`.
  const idx = src.indexOf(ANCHOR);
  const before = src.slice(Math.max(0, idx - 400), idx);
  if (!/const\s+r\s*=\s*await\s+fetch\(/.test(before)) {
    problems.push('FIX: the 400 chars before the anchor do not contain `const r = await fetch(` — the `r` in scope is not the response object');
  } else if (before.indexOf('r.ok') !== -1) {
    console.log('  skip  FIX: an r.ok check already exists near the anchor');
  } else {
    src = src.replace(ANCHOR, GUARD + ANCHOR);
    console.log('  fix   inserted r.ok guard before the arXiv parse (throws -> existing catch sets out.error)');
    changed++;
  }
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
console.log('  curl -s https://radar-hub.<subdomain>.workers.dev/run | jq .error');
console.log('  Expect: a non-null error naming the HTTP status when arXiv rejects the');
console.log('  request, instead of hits:0 with error:null.');
console.log('');
console.log('Also confirm the retired copy does not confuse anyone:');
console.log('  qnfo-arxiv-radar/worker.js (sha 0185920c) carries the same fix but that');
console.log('  worker is NOT in fleet_status — it was merged into radar-hub.');
console.log('');

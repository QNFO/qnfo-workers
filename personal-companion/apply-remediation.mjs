#!/usr/bin/env node
// personal-companion/apply-remediation.mjs
//
// Added 2026-09-13 by qnfo-ops. EXECUTABLE BY THE DEPLOY RUNNER, not by a person
// on a client device. Idempotent. Fails closed: if any anchor does not appear
// exactly once, it writes NOTHING and exits non-zero.
//
//   node apply-remediation.mjs --check          # report, change nothing
//   node apply-remediation.mjs --apply          # patch worker.js in place
//   node apply-remediation.mjs --apply --fail-closed   # also invert authorized()
//
// WHY A PATCHER AND NOT A REWRITE
// worker.js is 62,666 bytes. The qnfo-ops tool surface reads at most 32,768 bytes
// of a file with no offset/range support, so a hand-authored full-file rewrite
// would have shipped the unseen half on trust. This script reads the file where it
// actually lives, verifies each anchor, and applies only additive, reversible edits.
//
// WHAT IT CHANGES (all four anchors were read and confirmed present in the repo copy)
//   1. VERSION 1.0.0 -> 1.4.0
//   2. loadLife(): inject the derived relations (durations and gaps) as context, so
//      the model is TOLD that LoF26 -> QPL is 7 days instead of computing it. This is
//      the direct fix for the wrong number, independent of any gate.
//   3. inline lib/grounding.js + lib/voice.js + lib/addressee.js + lib/filters.js +
//      lib/gate.js (exports stripped) so the pure gate is available in worker scope
//      without depending on the module style of a bundled file.
//      REV 2 (QRI-2): addressee.js was MISSING from this list in rev 1, while gate.js
//      rev 2 imports checkAddressee from it. Inlining gate.js without addressee.js
//      produces a worker that throws ReferenceError at the first gate call.
//      REV 3 (QRI-3): filters.js added for the same reason - gate.js rev 5 imports
//      checkStandingFilters from it. All five modules must be inlined together.
//   4. P_STYLE: add the anti-narration clause (do not write the reader's life in
//      the first person; never supply a particular the record does not hold).
//
// WHAT IT DELIBERATELY DOES NOT DO
//   - It does not flip authorized() to fail-closed by default. COMPANION_KEY is unset
//     on the live deployment, so inverting the default would black out reading.q08.org
//     on the next deploy. Pass --fail-closed only together with setting COMPANION_KEY.
//   - It does not insert the runGate() call at the insert site, or strip anchor_json /
//     quality_json from /api/pieces, or fix the masthead "Private." label. All three
//     live in the part of worker.js past the 32,768-byte read ceiling, so their exact
//     text is unverified. --report prints the surrounding context for those sites so
//     the wiring can be applied precisely instead of guessed.
//
// MARKER NOTE: MARK was bumped to v3 in QRI-3. Verified 2026-09-13 that the repo copy
// of worker.js still declares VERSION "1.0.0" (sha c06edffb) and contains no QRI marker,
// so the patcher has never been applied and there is no duplicate-inline risk from the
// marker change. If it HAS been applied by the time you read this, do not re-run without
// removing the old inline block first.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const WORKER = path.join(HERE, 'worker.js');
const NEW_VERSION = '1.4.0';
const MARK = '/* QRI-3-INLINE-GATE v3 */';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const failClosed = args.includes('--fail-closed');
const report = args.includes('--report');

const src = fs.readFileSync(WORKER, 'utf8');
const edits = [];
const problems = [];

// exactCount: refuse to act unless the anchor is unambiguous.
function exactCount(hay, needle, label) {
  const n = hay.split(needle).length - 1;
  if (n !== 1) problems.push(`anchor "${label}" appears ${n}x (need 1)`);
  return n;
}

// ---------------------------------------------------------------- 1. VERSION
const vOld = 'var VERSION = "1.0.0";';
const vNew = `var VERSION = "${NEW_VERSION}";`;
if (src.includes(vNew)) {
  console.log('  skip  VERSION already ' + NEW_VERSION);
} else {
  exactCount(src, vOld, 'VERSION');
  edits.push([vOld, vNew]);
}

// ------------------------------------------------- 2. loadLife derived facts
const lifeAnchor = '  var evs = await env.PERSONAL.prepare(';
const factsBlock = [
  '  // QRI-1: supply the relations between activity rows. The published piece',
  '  // "Five days later" came from the model computing the gap itself and reusing',
  '  // LoF26\'s DURATION (5 days) as the GAP (which is 7 days, 3 end-to-start).',
  '  try {',
  '    var _facts = deriveTemporalFacts(ar);',
  '    var _derived = injectFacts(_facts);',
  '    for (var _q = 0; _q < _derived.length; _q++) lines.push(_derived[_q]);',
  '  } catch (_e) { lines.push("DERIVED RELATIONS unavailable: " + String(_e && _e.message || _e)); }',
  ''
].join('\n');
if (src.includes('var _facts = deriveTemporalFacts(ar);')) {
  console.log('  skip  loadLife already injects derived facts');
} else {
  exactCount(src, lifeAnchor, 'loadLife/events query');
  edits.push([lifeAnchor, factsBlock + lifeAnchor]);
}

// ------------------------------------------------- 3. inline the gate modules
function stripModule(file) {
  let t = fs.readFileSync(path.join(HERE, 'lib', file), 'utf8');
  t = t.replace(/^import[^;]*;\s*$/gm, '');          // drop imports between modules
  t = t.replace(/^export\s+/gm, '');                 // exports -> plain declarations
  return t.trim();
}
// ORDER: filters.js before gate.js for readability; these are top-level declarations in
// one module scope, so functions hoist. gate.js is last because it calls the other four.
// ALL FIVE MUST BE PRESENT: gate.js imports from all four others, so omitting any one
// produces a worker that throws ReferenceError at the first gate call.
// NOTE (QRI-3): filters.js originally declared a top-level `esc`, which voice.js also
// declares. Inlined, that is a duplicate declaration and the bundle does not parse. It
// was renamed `fesc`. If a module is added later, check its top-level names against the
// others first - the collision is silent until the worker loads.
const inlineBlock = [MARK, '', stripModule('grounding.js'), '', stripModule('voice.js'), '', stripModule('addressee.js'), '', stripModule('filters.js'), '', stripModule('gate.js'), ''].join('\n');
const inlineAnchor = 'function json(obj, status) {';
if (src.includes(MARK)) {
  console.log('  skip  gate modules already inlined');
} else {
  exactCount(src, inlineAnchor, 'function json()');
  edits.push([inlineAnchor, inlineBlock + '\n' + inlineAnchor]);
}

// ------------------------------------------------- 4. P_STYLE anti-narration
const styleAnchor = '  "- One section must state the strongest objection to the piece\'s own central claim, in the objector\'s own terms, and say how bad it is."';
const styleAdded = [
  '  "",',
  '  "Do not narrate the reader\'s life. When you use his record, attribute it plainly - \\"the record shows he rated the week 5\\" - or leave it out.",',
  '  "Never write his experience in the first person. Never supply a particular the record does not hold: no headcounts, no rooms, no scene-setting.",',
  '  "If the piece needs a concrete particular to open on, take it from the anchors."'
].join('\n');
if (src.includes('Do not narrate the reader')) {
  console.log('  skip  P_STYLE already carries the anti-narration clause');
} else {
  exactCount(src, styleAnchor, 'P_STYLE epistemic contract');
  edits.push([styleAnchor, styleAnchor + ',\n' + styleAdded]);
}

// ------------------------------------------------- optional 5. fail-closed
if (failClosed) {
  const aOld = '  var key = env.COMPANION_KEY || "";\n  if (!key) return true;';
  const aNew = '  var key = env.COMPANION_KEY || "";\n  if (!key) return false;  // QRI-1: fail CLOSED. Requires COMPANION_KEY to be set,';
  //                                                     or the reading page goes dark.
  if (src.includes('if (!key) return false;')) {
    console.log('  skip  authorized() already fail-closed');
  } else {
    exactCount(src, aOld, 'authorized() fail-open');
    edits.push([aOld, aNew]);
  }
}

// ------------------------------------------------------------------ outcome
console.log('\nanchors: ' + edits.length + ' edit(s) pending, ' + problems.length + ' problem(s)');
for (const [a, b] of edits) console.log('  - ' + a.split('\n')[0].slice(0, 72) + '  ->  ' + b.split('\n')[0].slice(0, 40));

if (problems.length) {
  console.error('\nREFUSING TO WRITE:');
  problems.forEach(p => console.error('  ! ' + p));
  process.exit(2);
}
if (!apply) {
  console.log('\n--check only; nothing written. Re-run with --apply.');
  process.exit(0);
}

let out = src;
for (const [a, b] of edits) out = out.split(a).join(b);
fs.writeFileSync(WORKER, out, 'utf8');
console.log('\nWROTE ' + WORKER + ' (' + src.length + ' -> ' + out.length + ' bytes)');

// ------------------------------------------------------------ wiring report
if (report) {
  const idx = out.search(/INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+companion_pieces/i);
  console.log('\n--- runGate() wiring site ---');
  if (idx < 0) {
    console.log('  companion_pieces INSERT not found; wire runGate() before whatever');
    console.log('  persists the piece, and before it is reachable on / or /api/pieces.');
  } else {
    const from = Math.max(0, idx - 1400), to = Math.min(out.length, idx + 400);
    console.log(out.slice(from, to));
    console.log('\n  Insert immediately before the persist call:');
    console.log('    var decision = runGate({ body: piece.body_md, quality: quality,');
    console.log('      facts: _facts, kbRows: ar, forced: wasForced, names: ["Rowan"] });');
    console.log('    if (!decision.publish) { quality.gate = decision.gate; quality.gate_reason = decision.reason; }');
    console.log('  Then exclude non-publishing rows from the index, /api/pieces,');
    console.log('  /api/piece/<slug> and feed.xml (decision.warnings never block).');
  }
  console.log('\n--- /api exposure + masthead sites (unverified, review before editing) ---');
  for (const needle of ['anchor_json', 'quality_json', 'Private.']) {
    let i = out.indexOf(needle), n = 0;
    while (i >= 0 && n < 3) {
      const line = out.slice(out.lastIndexOf('\n', i) + 1, out.indexOf('\n', i));
      console.log('  ' + needle + ': ' + line.trim().slice(0, 110));
      i = out.indexOf(needle, i + 1); n++;
    }
  }
}

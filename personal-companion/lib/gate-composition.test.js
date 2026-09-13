// personal-companion/lib/gate-composition.test.js
//
// Added 2026-09-13 by qnfo-ops (QRI-2). Dependency-free. Run: node lib/gate-composition.test.js
//
// WHY THIS FILE EXISTS
// The QRI-1 suite pinned runGate's behaviour on the DEFECTIVE piece only. It could
// not have caught the two faults QRI-2 found, because both are about pieces that
// must NOT be blocked. A gate that blocks everything passes every test written
// only against a piece that deserves blocking.
//
// The three fixtures below are the three outcomes that matter:
//   id=8        the defective essay            -> MUST block  (regression guard)
//   id=7        the legitimate serial           -> MUST pass   (false-block guard)
//   runs 442    the heading the gate missed     -> MUST block  (false-pass guard)
//
// Fixture 2 is the one QRI-1 lacked. Fixture 3 is the one rev 1 of gate.js lacked.

import { runGate } from './gate.js';
import { deriveTemporalFacts } from './grounding.js';

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? '  [' + extra + ']' : '')); }
}

// Real rows, read from PERSONAL.activity on 2026-09-13.
const ROWS = [
  { date: '2026-08-10', title: 'LoF26 \u2014 Laws of Form conference, Cambridge (10-14 Aug)',
    venue: 'Wolfson College, Cambridge', city: '', energy: 5, energy_label: 'energized' },
  { date: '2026-08-17', title: 'QPL 2026, Amsterdam (17-21 Aug)',
    venue: 'Amsterdam', city: '', energy: 1, energy_label: 'drained' },
  { date: '2026-08-28', title: 'Attended CWI summer school on quantum algorithms and quantum error correction in Amsterdam.',
    venue: '', city: '', energy: null, energy_label: '' }
];
const facts = deriveTemporalFacts(ROWS);

// Verbatim opening of reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196 (id=8).
const DEFECTIVE = [
  "On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about forty people sat in a circle",
  "and took turns being wrong out loud. The occasion was LoF26, and it ran five days.",
  "Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam he rated the same",
  "week 1 out of 5. Drained. The two events cost roughly the same in travel and time.",
  "I think they are the same precondition seen from two sides."
].join(' ');

// companion_pieces.id=7, "The Hand That Signs": names the reader in order to EXCLUDE him.
const LEGITIMATE = [
  "The question is not whose hand wrote it.",
  "Rowan's own handwriting is not the subject here.",
  "What matters is the category the examiner is using, and how strange it turns out to be.",
  "I take the convergence to be real, and my attention is on the mechanism."
].join(' ');

// companion_runs id=442, as emitted: the heading names the addressee.
const HEADING = [
  '# Field Notes for Rowan', '', '## Notation Systems', '',
  'A note on scaffolds and double fugue. I take the convergence to be real.'
].join('\n');

const noForced = { quality: { verdict: 'reject', why: 'adversarial critic output' }, forced: false };

console.log('gate composition (QRI-2)');

// ---- 1. the defective piece must still block (QRI-1 regression guard)
const d8 = runGate(Object.assign({ body: DEFECTIVE, facts: facts, kbRows: ROWS }, noForced));
ok('id=8 does not publish', d8.publish === false, 'gate=' + d8.gate);
ok('id=8 blocks on 7 violations', d8.violations.length === 7, 'got ' + d8.violations.length);
ok('id=8 flags the wrong interval', d8.violations.some(v => v.kind === 'interval'));
ok('id=8 flags the cost equality', d8.violations.some(v => v.kind === 'comparative-equality'));
ok('id=8 flags the attribution seam', d8.violations.some(v => v.kind === 'attribution-seam'));
ok('id=8 flags invented particulars', d8.violations.filter(v => v.kind === 'invented-particular').length === 4);

// ---- 2. the legitimate serial must NOT block (QRI-2 false-block guard)
const d7 = runGate(Object.assign({ body: LEGITIMATE, facts: facts, kbRows: ROWS }, noFrozen(noForced)));
function noFrozen(o) { return o; }
ok('id=7 publishes', d7.publish === true, 'gate=' + d7.gate + ' violations=' + d7.violations.length);
ok('id=7 has zero blocking violations', d7.violations.length === 0);
ok('id=7 reports the possessive as a warning, not a block',
   d7.warnings.some(v => v.kind === 'reader-as-subject'));
ok('id=7 reports the abstract first person as a warning',
   d7.warnings.some(v => v.kind === 'impersonation'));

// ---- 3. the heading miss must block (QRI-2 false-pass guard)
const d442 = runGate(Object.assign({ body: HEADING, facts: facts, kbRows: ROWS }, noForced));
ok('runs id=442 does not publish', d442.publish === false, 'gate=' + d442.gate);
ok('runs id=442 blocks on the heading', d442.addresseeBlocking.some(v => v.kind === 'reader-in-heading'));
ok('runs id=442 blocks on the address frame', d442.addresseeBlocking.some(v => v.kind === 'reader-address'));

// ---- 4. the policy must not suppress the shipped defect class by kind
ok('attribution-seam is never a warning', d8.warnings.every(v => v.kind !== 'attribution-seam'));
ok('invented-particular is never a warning', d8.warnings.every(v => v.kind !== 'invented-particular'));

// ---- 5. forced pieces still never publish
const df = runGate({ body: 'A clean sentence.', facts: facts, kbRows: ROWS, quality: {}, forced: true });
ok('forced piece does not publish', df.publish === false && df.gate === 'forced-unpublished');

// ---- 6. the no-veto contract: a critic "reject" alone is not a block
const dClean = runGate({ body: 'The record holds the venue and the dates. The room is not in it.',
                         facts: facts, kbRows: ROWS, quality: { verdict: 'reject' }, forced: false });
ok('verdict=reject alone does not block', dClean.publish === true);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);

// personal-companion/lib/gate.test.js
//
// Dependency-free test. Run: node lib/gate.test.js
// Exits non-zero on failure. Added 2026-09-13 by qnfo-ops.
//
// The LIVE fixture below is the verbatim opening of
// reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196 (companion_pieces.id=8),
// fetched 2026-09-13. It is not a paraphrase: the seven violations asserted here
// are the seven qnfo-ops measured on the live text via run_code.

import assert from 'node:assert';
import { deriveTemporalFacts } from './grounding.js';
import { runGate, auditPublishedPiece } from './gate.js';

// The three real rows of PERSONAL.activity, as read 2026-09-13.
const KB = [
  { title: 'LoF26 — Laws of Form conference, Cambridge (10-14 Aug)', date: '2026-08-10',
    venue: 'Wolfson College, Cambridge', city: 'Cambridge', energy: 5, energy_label: 'energized' },
  { title: 'QPL 2026 (17-21 Aug)', date: '2026-08-17',
    venue: 'Amsterdam', city: 'Amsterdam', energy: 1, energy_label: 'drained' },
  { title: 'CWI summer school (28 Aug)', date: '2026-08-28',
    venue: 'Amsterdam', city: 'Amsterdam', energy: null, energy_label: '' }
];

const LIVE = "On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about forty people "
  + "sat in a circle and took turns being wrong out loud. The occasion was LoF26, a conference on "
  + "George Spencer-Brown's Laws of Form, and it ran five days on conversation, play, and free "
  + "participation. Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in "
  + "Amsterdam — the Workshop on Quantum Programming Languages, a status tournament with proceedings "
  + "and citations — he rated the same week 1 out of 5. Drained. The two events cost roughly the same "
  + "in travel and time. That difference is the subject here, and the claim I want to argue is "
  + "narrower than boredom helps creativity. I think they are the same precondition seen from two sides.";

const CONTROL = "The gap between the two conferences was seven days, and the record shows he rated "
  + "the first week 5 and the second 1. The record holds no travel cost for either event.";

const facts = deriveTemporalFacts(KB);
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok   ' + name); }
                          catch (e) { fail++; console.log('  FAIL ' + name + ' :: ' + e.message); } };

console.log('gate.test.js');

// --- derived relations: the number the model was previously left to compute ---
t('LoF26 duration = 5 days', () => {
  assert.strictEqual(facts.evs[0].duration, 5);
});
t('QPL duration = 5 days', () => {
  assert.strictEqual(facts.evs[1].duration, 5);
});
t('LoF26 -> QPL start-to-start = 7 days', () => {
  const g = facts.gaps.find(x => x.from === facts.evs[0].title && x.to === facts.evs[1].title);
  assert.strictEqual(g.startGap, 7);
});
t('LoF26 -> QPL end-to-start = 3 days', () => {
  const g = facts.gaps.find(x => x.from === facts.evs[0].title && x.to === facts.evs[1].title);
  assert.strictEqual(g.endToStart, 3);
});
t('unparseable-range row yields duration null, never 1', () => {
  assert.strictEqual(facts.evs[2].duration, null);
});

// --- the live piece must be blocked ---
const live = runGate({ body: LIVE, quality: { verdict: 'reject' }, facts, kbRows: KB });

t('live piece is NOT publishable', () => {
  assert.strictEqual(live.publish, false);
  assert.strictEqual(live.gate, 'blocked-grounding');
});
t('live piece: exactly 2 grounding violations', () => {
  assert.strictEqual(live.grounding.length, 2);
});
t('live piece: the interval error is caught', () => {
  assert.ok(live.grounding.some(v => v.kind === 'interval' && v.n === 5),
    'expected interval 5d to be rejected (computed gaps 3,7,11,18)');
});
t('live piece: the unsupported equality is caught', () => {
  assert.ok(live.grounding.some(v => v.kind === 'comparative-equality'));
});
t('live piece: exactly 5 voice violations', () => {
  assert.strictEqual(live.voice.length, 5);
});
t('live piece: the attribution seam is caught', () => {
  assert.ok(live.voice.some(v => v.kind === 'attribution-seam' && /Rowan rated/.test(v.span)));
});
t('live piece: the headcount is caught', () => {
  assert.ok(live.voice.some(v => v.kind === 'invented-particular' && /forty people/.test(v.span)));
});
t('live piece: the invented room is caught', () => {
  assert.ok(live.voice.some(v => v.kind === 'invented-particular' && v.span === 'dining hall'));
});
t('live piece: total violations = 7', () => {
  assert.strictEqual(live.violations.length, 7);
});

// --- false-positive guard: corrected prose must pass ---
const control = runGate({ body: CONTROL, quality: { verdict: 'reject' }, facts, kbRows: KB });

t('control text IS publishable', () => {
  assert.strictEqual(control.publish, true, 'a false block is as damaging as a false pass');
});
t('control text: 0 violations', () => {
  assert.strictEqual(control.violations.length, 0);
});

// --- the verdict must NOT be a veto (publishPolicy contract) ---
t('verdict=reject alone does not block', () => {
  const clean = runGate({ body: CONTROL, quality: { verdict: 'reject', why: 'harsh critic' }, facts, kbRows: KB });
  assert.strictEqual(clean.publish, true,
    'P_CRITIQUE asks the critic for reasons the piece is worthless; reject is its expected output');
});

// --- forced fallbacks must never be served ---
t('forced run is stored but not served', () => {
  const f = runGate({ body: CONTROL, quality: {}, facts, kbRows: KB, forced: true });
  assert.strictEqual(f.publish, false);
  assert.strictEqual(f.gate, 'forced-unpublished');
});

// --- regression guard: the audit path must derive facts from the rows ---
// A previous draft of gate.js defaulted to an EMPTY fact set here, which would have
// passed every claim in every published piece - a silent false pass, the exact
// failure mode this whole patch exists to prevent.
t('auditPublishedPiece does not silently pass (empty-facts regression)', () => {
  const row = { body_md: LIVE, quality_json: JSON.stringify({ verdict: 'reject' }) };
  const res = auditPublishedPiece(row, KB);
  assert.strictEqual(res.violations.length, 7,
    'audit path must derive facts from kbRows; got ' + res.violations.length + ' violations');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

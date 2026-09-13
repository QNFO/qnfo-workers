// personal-companion/lib/gate.test.js
//
// Dependency-free test. Run: node lib/gate.test.js
// Exits non-zero on failure. Added 2026-09-13 by qnfo-ops.
//
// The LIVE fixture below is the verbatim opening of
// reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196 (companion_pieces.id=8),
// fetched 2026-09-13. It is not a paraphrase: the seven violations asserted here
// are the seven qnfo-ops measured on the live text via run_code.
//
// REVISION 2 (same day): adds the addressee block, after measuring the hole that
// gate.js revision 1 left open. voice.js returns 1 violation on the run-442 text
// (reader-as-subject on "Rowan's") and 0 on the same text with a TYPOGRAPHIC
// apostrophe, so a piece headed "# Field Notes for Rowan" with no straight-apostrophe
// possessive passed revision 1 with zero voice violations. The assertions below pin
// both the hole and the fix. The live-fixture assertions from revision 1 are
// unchanged and still pass: addressee blocking on the live piece is 0.
//
// REVISION 3 (2026-09-13, QRI-2 red team): pins voice.js rev 3 (check 5,
// first-person-attendance) and grounding.js rev 3 (single-day rows, the silent
// duration 1, NaN gap poisoning). ONE EXISTING ASSERTION WAS DELIBERATELY CHANGED
// and is marked below: the shared KB row "CWI summer school (28 Aug)" is a single
// day, so rev 3 parses it as duration 1 where rev 2 returned unknown. The test that
// asserted `null` for it was asserting a parser gap, not an invariant; its real
// invariant ("never silently return duration 1 for a range you did not understand")
// is kept, against a genuinely unparseable title.

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
  const f = deriveTemporalFacts([{ title: 'Residency (2026, dates tba)', date: '2026-03-02' }]);
  assert.strictEqual(f.evs[0].duration, null);
  assert.strictEqual(f.evs[0].known, false);
});
// REVISION 3, CHANGED ASSERTION. Revision 2 asserted facts.evs[2].duration === null
// for the real KB row "CWI summer school (28 Aug)". That row is a single day, and
// rev 3 parses it as one day, so the assertion became false. The invariant it was
// protecting is kept in the test immediately above, against a title that really is
// an unparseable range. This is a deliberate change, not a test loosened to pass.
t('REVISION 3: the single-day KB row is 1 day, and no longer "unknown"', () => {
  assert.strictEqual(facts.evs[2].duration, 1);
  assert.strictEqual(facts.evs[2].known, true);
  assert.strictEqual(facts.unknownDuration.length, 0);
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

// --- addressee (gate.js revision 2): the hole revision 1 left open ------------
// Measured on the live fixture: 0 blocking, 1 warning. That is why the revision 1
// assertion `violations.length === 7` still holds after the merge.
t('live piece: 0 blocking addressee violations', () => {
  assert.strictEqual(live.addresseeBlocking.length, 0);
});
t('live piece: exactly 1 addressee warning naming the reader', () => {
  assert.strictEqual(live.addressee.length, 1);
  assert.ok(/Rowan rated/.test(live.addressee[0].span),
    'expected the warning span to carry the offending sentence');
});
t('live piece: total violations still 7 after the addressee merge', () => {
  assert.strictEqual(live.violations.length, 7);
});

// The heading that companion_runs id=442 actually emitted. Revision 1 blocked the
// real run only because of the straight-apostrophe possessive in the body; the
// heading itself produced nothing.
t('heading naming the addressee blocks on its own', () => {
  const body = '# Field Notes for Rowan\n\n## Notation Systems as Cognitive Scaffolds\n\nA notation system is a set of symbols.';
  const d = runGate({ body: body, quality: {}, facts: facts, kbRows: KB });
  assert.strictEqual(d.publish, false);
  assert.strictEqual(d.addresseeBlocking.length, 2,
    'expected reader-in-heading + reader-address');
});
t('a typographic apostrophe no longer escapes the gate', () => {
  const body = '# Field Notes for Rowan\n\nRowan\u2019s work on the seams between mathematics and music.';
  const d = runGate({ body: body, quality: {}, facts: facts, kbRows: KB });
  assert.strictEqual(d.publish, false, 'this exact shape passed revision 1 with 0 voice violations');
  assert.strictEqual(d.addresseeBlocking.length, 2);
});
t('a bare mention without a heading or address frame does NOT block', () => {
  const body = 'The record logs the first week 5 out of 5 for felt energy, as Rowan reported it.';
  const d = runGate({ body: body, quality: {}, facts: facts, kbRows: KB });
  assert.strictEqual(d.publish, true, 'a bare mention is a warning; blocking it would reject the serial');
  assert.ok(d.addressee.length >= 1, 'expected at least one warning');
  assert.strictEqual(d.addresseeBlocking.length, 0);
});

// ============================================================================
// REVISION 3 — voice.js check 5: first-person-attendance
// ============================================================================
// The hole, measured 2026-09-13 by executing revision 2 against this exact text:
// "I was there for both" produced ZERO findings from any check (publish = true,
// blockingTotal = 0), and the same text with "I attended both" produced one
// `impersonation` finding that gate.js rev 4 classifies as a WARNING, so it
// published anyway. Both must now block.
const RT_A = "On 10 August 2026, at Wolfson College, Cambridge, five days of conversation, play, and free "
  + "participation began. Seven days later, at QPL 2026 in Amsterdam, the week rated 1 out of 5. Drained. "
  + "I was there for both, and they differed in what they asked attention to do.";

t('a two-word presence claim no longer publishes (was publish=true)', () => {
  const d = runGate({ body: RT_A, quality: {}, facts, kbRows: KB });
  assert.strictEqual(d.publish, false);
  assert.ok(d.violations.some(v => v.kind === 'first-person-attendance'),
    'expected a BLOCKING first-person-attendance finding, not a warning');
});
t('an attendance claim using a LISTED verb now blocks instead of warning', () => {
  const d = runGate({ body: RT_A.replace('I was there for both', 'I attended both'), quality: {}, facts, kbRows: KB });
  assert.strictEqual(d.publish, false, 'rev 2 published this: impersonation was filtered to a warning');
  assert.strictEqual(d.warnings.length, 1, 'the impersonation finding stays a warning');
  assert.ok(d.violations.some(v => v.kind === 'first-person-attendance'));
});
t('a quoted presence claim is a warning, not a block', () => {
  const d = runGate({ body: 'The explorer wrote: "I was there, and the wind never stopped."', quality: {}, facts, kbRows: KB });
  assert.strictEqual(d.publish, true);
  assert.ok(d.warnings.some(w => w.kind === 'first-person-attendance'));
});
t('a presence claim outside any recorded venue is a warning, not a block', () => {
  const d = runGate({ body: 'I was there for a while, and the argument held.', quality: {}, facts, kbRows: KB });
  assert.strictEqual(d.publish, true);
  assert.strictEqual(d.warnings.length, 1);
});
t('the idiom "I was at a loss" is not a presence claim (no false block)', () => {
  const d = runGate({ body: 'Seven days later, at QPL 2026 in Amsterdam, I was at a loss to explain the drop. I was in doubt about the mechanism.', quality: {}, facts, kbRows: KB });
  assert.strictEqual(d.publish, true);
  assert.strictEqual(d.voice.length, 0, 'a false block is as damaging as a false pass');
});
t('the live piece gains no attendance finding from revision 3', () => {
  const d = runGate({ body: LIVE, quality: { verdict: 'reject' }, facts, kbRows: KB });
  assert.strictEqual(d.voice.length, 5, 'revision 3 must not add a finding to the live fixture');
  assert.strictEqual(d.violations.length, 7);
});
// KNOWN MISS, recorded rather than papered over: this verbatim extract of the live
// body still produces 0 findings and still publishes. It is the class the reader's
// own question is about. Pinned here so the gap cannot be forgotten.
t('KNOWN MISS: first-person narration of the record with no name/verb still passes', () => {
  const body = "Return to Cambridge and Amsterdam. The LoF26 room and the QPL 2026 room differed in what "
    + "they did to attention. The first leaves intervals \u2014 the pause after someone says something wrong, "
    + "the walk to the next session, the unminuted conversation. The energy ratings were 5 and 1.";
  const d = runGate({ body: body, quality: {}, facts, kbRows: KB });
  assert.strictEqual(d.publish, true, 'documented gap: unfixed because the candidate rule is unvalidated');
  assert.strictEqual(d.violations.length, 0);
});

// ============================================================================
// REVISION 3 — grounding.js: no silent duration 1, no NaN gaps
// ============================================================================
t('a row with no parseable date yields duration null, never 1', () => {
  const f = deriveTemporalFacts([{ title: 'No date row', date: null }]);
  assert.strictEqual(f.evs[0].duration, null, 'rev 2 emitted 1 here');
  assert.strictEqual(f.evs[0].known, false);
});
t('an undated row does not poison the gap arithmetic with NaN', () => {
  const f = deriveTemporalFacts([
    { title: 'LoF26 (10-14 Aug)', date: '2026-08-10' },
    { title: 'Undated', date: null },
    { title: 'QPL 2026 (17-21 Aug)', date: '2026-08-17' }]);
  assert.ok(f.gaps.every(g => Number.isFinite(g.startGap)), 'every gap must be a finite number');
  assert.strictEqual(f.gaps.length, 1, 'the undated row must not be paired into a gap');
  assert.strictEqual(f.gaps[0].startGap, 7);
});
t('the live piece is still blocked at exactly 7 after both revisions', () => {
  const d = runGate({ body: LIVE, quality: { verdict: 'reject' }, facts, kbRows: KB });
  assert.strictEqual(d.violations.length, 7);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

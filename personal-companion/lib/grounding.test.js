// personal-companion/lib/grounding.test.js
//
// Dependency-free tests for grounding.js. Run: node grounding.test.js
// Exits 1 on any failure. Added 2026-09-12 by qnfo-ops.
//
// The parser cases below are not hypothetical: revision 1 of parseRange parsed
// only "(10-14 Aug)" and silently returned duration 1 for the other six
// formats. These tests exist so that regression cannot recur unnoticed.

import { parseRange, deriveTemporalFacts, checkGrounding, publishPolicy, extractClaims } from './grounding.js';

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}
const dur = (title, date) => {
  const f = deriveTemporalFacts([{ date, title }]);
  return f.evs[0].duration;
};

// ---- parser: formats that must be understood ----
eq(dur('LoF26 \u2014 Laws of Form conference, Cambridge (10-14 Aug)', '2026-08-10'), 5, 'range bare month');
eq(dur('QPL 2026, Amsterdam (17-21 Aug)', '2026-08-17'), 5, 'range bare month 2');
eq(dur('Conference (3\u20135 Sep)', '2026-09-03'), 3, 'en dash');
eq(dur('Workshop (10-14 Aug 2026)', '2026-08-10'), 5, 'trailing year');
eq(dur('School (3-5 September)', '2026-09-03'), 3, 'full month name');
eq(dur('Meeting (Sept 3-5)', '2026-09-03'), 3, 'month first');
eq(dur('Trip (28 Feb - 3 Mar)', '2026-02-28'), 4, 'cross-month');
eq(dur('Retreat (2026-08-10 to 2026-08-14)', '2026-08-10'), 5, 'ISO range');
eq(dur('Block (3\u20135 Nov 2027)', '2026-11-03'), 3, 'explicit year overrides anchor year');

// ---- parser: no range at all -> single day ----
eq(dur('Attended CWI summer school on quantum algorithms and quantum error correction in Amsterdam.', '2026-08-28'), 1, 'no range');

// ---- parser: range visible but unparseable -> null, never a guess ----
eq(dur('Residency (14th to the 18th)', '2026-08-12'), null, 'unparseable range is null');

// ---- the real defect: interval claim vs computed gap ----
const ROWS = [
  { date: '2026-08-10', title: 'LoF26 \u2014 Laws of Form conference, Cambridge (10-14 Aug)', energy: 5, energy_label: 'energized', venue: 'Wolfson College, Cambridge', city: 'Cambridge' },
  { date: '2026-08-17', title: 'QPL 2026, Amsterdam (17-21 Aug)', energy: 1, energy_label: 'drained', venue: 'Amsterdam', city: 'Amsterdam' },
  { date: '2026-08-28', title: 'Attended CWI summer school on quantum algorithms and quantum error correction in Amsterdam.', energy: null, energy_label: '', venue: '', city: '' }
];
const facts = deriveTemporalFacts(ROWS);
eq(facts.evs.map(e => e.duration), [5, 5, 1], 'real durations');
eq(facts.gaps[0].startGap, 7, 'real gap LoF26 -> QPL');
eq(facts.gaps[0].endToStart, 3, 'real end-to-start');
eq(facts.unknownDuration.length, 0, 'no unknown durations in real rows');

// verbatim opening of the published piece (companion_pieces.id=8)
const PUBLISHED = "On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about forty people sat in a circle and took turns being wrong out loud. The occasion was LoF26, a conference on George Spencer-Brown's Laws of Form, and it ran five days on conversation, play, and free participation. Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam \u2014 the Workshop on Quantum Programming Languages, a status tournament with proceedings and citations \u2014 he rated the same week 1 out of 5. Drained. The two events cost roughly the same in travel and time.";
const v = checkGrounding(PUBLISHED, facts);
eq(v.length, 2, 'published piece yields 2 violations');
eq(v.map(x => x.kind).sort(), ['comparative-equality', 'interval'], 'violation kinds');
eq(v.find(x => x.kind === 'interval').span, 'Five days later', 'flags the wrong interval');
eq(v.find(x => x.kind === 'comparative-equality').span, 'cost roughly the same', 'flags the cost equality');

// control: corrected text must pass
const CORRECTED = 'The conference ran five days. Seven days later, at QPL 2026, he rated the week 1 out of 5.';
eq(checkGrounding(CORRECTED, facts).length, 0, 'corrected text passes');
eq(checkGrounding('It ran five days. Three days later the workshop began.', facts).length, 0, 'end-to-start gap accepted');

// a duration claim must match an established record duration
eq(checkGrounding('The conference ran nine days.', facts).length, 1, 'invented duration flagged');

// unknown-duration rows must not be matched against
const f2 = deriveTemporalFacts([{ date: '2026-08-12', title: 'Residency (14th to the 18th)' }]);
eq(f2.evs[0].duration, null, 'unknown duration stored as null');
eq(checkGrounding('It ran five days.', f2).length, 1, 'no established duration -> claim unsupported');
eq(f2.gaps.length, 0, 'single unknown row yields no gaps');

// ---- policy ----
eq(publishPolicy({ quality: { verdict: 'accept' }, violations: [] }).gate, 'passed', 'clean accept publishes');
eq(publishPolicy({ quality: { verdict: 'reject' }, violations: [] }).publish, true, 'verdict reject is NOT a block');
eq(publishPolicy({ quality: {}, violations: v }).gate, 'blocked-grounding', 'violations block');
eq(publishPolicy({ quality: {}, violations: [], forced: true }).gate, 'forced-unpublished', 'forced fallback not served');
eq(publishPolicy({ quality: {}, violations: v, forced: true }).publish, false, 'violations beat forced');

// ---- claim extraction ----
eq(extractClaims('Five days later').length, 1, 'extracts interval');
eq(extractClaims('it ran 12 days').length, 1, 'extracts numeric duration');
eq(extractClaims('no numbers here at all').length, 0, 'no false positives on plain prose');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

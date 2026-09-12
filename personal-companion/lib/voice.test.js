// personal-companion/lib/voice.test.js
//
// Dependency-free tests for voice.js. Run: node voice.test.js
// Exits 1 on any failure. Added 2026-09-12 by qnfo-ops.
//
// The PUBLISHED case is not hypothetical: it is the verbatim opening paragraph of
// companion_pieces.id=8 as served at
// reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196 on 2026-09-12. The
// REGRESSION controls are verbatim sentences from the other three live pieces,
// which rev1 of this module flagged as false positives. Both directions are
// pinned: if the module stops catching the real defect, or starts flagging
// ordinary hypothetical prose, these tests fail.

import { checkVoice, hasFirstPerson, venuesOf, mergeViolations } from './voice.js';

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

const VEN = ['Wolfson College, Cambridge', 'Amsterdam'];
const OPTS = { names: ['Rowan'], venues: VEN };

// verbatim opening of the published piece
const PUBLISHED = "On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about forty people sat in a circle and took turns being wrong out loud. The occasion was LoF26, a conference on George Spencer-Brown's *Laws of Form*, and it ran five days on conversation, play, and free participation. Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam \u2014 the Workshop on Quantum Programming Languages, a status tournament with proceedings and citations \u2014 he rated the same week 1 out of 5. Drained. The two events cost roughly the same in travel and time.";
// the piece continues in the first person; the seam only exists in a first-person text
const FIRST_PERSON = ' That difference is the subject here, and the claim I want to argue is narrower than "boredom helps creativity."';

// verbatim regression controls from the other live pieces (2026-09-12)
const WALKERS = 'Two people walking side by side cannot easily face each other, which means the exchange is not a confrontation; the eyes are on the path. Reading groups that meet in a seminar room, in fixed seats, facing a screen, should produce less frame-breaking per hour than the same group walking.';
const SECTOR = 'Australia administers it through the Australian Antarctic Division, staffs three stations \u2014 Mawson, Davis, Casey \u2014 and, in winter, those stations hold as few as eighty people.';
const SERIAL = "Rowan's own handwriting is not the subject here. What matters is the category the examiner is using, and how strange it turns out to be.";

// ---- the real defect ----
const v = checkVoice(PUBLISHED + FIRST_PERSON, OPTS);
eq(v.length, 5, 'published opening yields 5 voice violations');
eq(v.map(x => x.kind).sort(), ['attribution-seam', 'invented-particular', 'invented-particular', 'invented-particular', 'invented-particular'], 'violation kinds');
eq(v.find(x => x.kind === 'attribution-seam').span, 'Rowan rated', 'flags the attribution seam');
eq(v.filter(x => x.kind === 'invented-particular').map(x => x.span).sort(), ['about forty people', 'dining hall', 'sat in a circle', 'took turns being wrong'], 'flags every unrecorded particular');

// ---- scoping: no first-person voice in the text => no attribution seam ----
eq(hasFirstPerson(PUBLISHED), false, 'opening alone is not first person');
eq(checkVoice(PUBLISHED, OPTS).filter(x => x.kind === 'attribution-seam').length, 0, 'seam check is scoped to first-person text');

// ---- negative controls: must not fire ----
eq(checkVoice('LoF26 met at Wolfson College, Cambridge from 10 to 14 August 2026. The week rated 5 for felt energy. Seven days later QPL 2026 began in Amsterdam, and the week rated 1.', OPTS).length, 0, 'corrected prose passes');
eq(checkVoice('In her review, Rowan rated the conference 5 out of 5 and the workshop 1.', OPTS).length, 0, 'third-person review naming Rowan passes (agentive)');
eq(checkVoice(WALKERS, OPTS).length, 0, 'REGRESSION: hypothetical prose from the other essay yields 0');
eq(checkVoice(SECTOR, OPTS).length, 0, 'REGRESSION: attributed Antarctic headcount, no record venue, yields 0');

// ---- positive controls ----
eq(checkVoice('I attended the workshop and my week rated 1.', OPTS).map(x => x.kind), ['impersonation', 'impersonation'], 'first-person experience flagged');
eq(checkVoice('We sat in a circle with about forty researchers.', OPTS).map(x => x.kind), ['impersonation'], 'no venue: particulars out of scope, impersonation still flagged');
eq(checkVoice(SERIAL, OPTS).map(x => x.kind), ['reader-as-subject'], 'serial piece: reader named in the possessive');
eq(checkVoice('At Wolfson College, Cambridge, about forty people sat in a circle.', OPTS).length, 2, 'recorded-venue sentence: headcount + scene flagged');
eq(checkVoice('The lecture theatre at Wolfson College was full.', OPTS).map(x => x.kind), ['invented-particular'], 'room noun flagged when the venue string lacks it');
eq(checkVoice('The dining hall at Wolfson College dining hall was full.', { names: ['Rowan'], venues: ['dining hall, Wolfson College'] }).length, 0, 'room not flagged when the venue string contains it');

// ---- helpers ----
eq(venuesOf([{ venue: 'Wolfson College, Cambridge' }, { venue: '' }, { venue: 'Amsterdam' }]), ['Wolfson College, Cambridge', 'Amsterdam'], 'venuesOf drops empties');
eq(mergeViolations([{ kind: 'interval' }], [{ kind: 'impersonation' }]).length, 2, 'mergeViolations concatenates');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);

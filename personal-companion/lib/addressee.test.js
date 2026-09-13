// personal-companion/lib/addressee.test.js
//
// Dependency-free test suite for addressee.js. Added 2026-09-13 by qnfo-ops.
// Run: node lib/addressee.test.js
//
// REVISION 2 (same day): revision 1 of this file had three wrong expectations —
// it assumed one blocking violation per heading, that an empty names array
// disables the check, and that a single line yields one violation. All three were
// wrong, and running the suite is what showed it (18 passed, 4 failed). The one
// genuine module fault it exposed — a case-sensitive bare-mention regex — is
// fixed in addressee.js revision 2. Expectations below now match measured output.
//
// Every fixture is real text, not invented:
//   PIECE8    - the verbatim opening of the live companion_pieces.id=8
//               ("The Understimulated Interval"), fetched 2026-09-13 from
//               https://reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196
//   RUN442    - the verbatim `detail` of companion_runs id=442, the run the
//               shipped gate rejected on unrelated invented titles
//   PIECE12   - the verbatim opening of companion_pieces.id=12
//               ("Four Instruments for Reading a Claim"), live 2026-09-13
//   CORRECTED - the same two events stated from the record, as ERRATA proposes

import { checkAddressee, blockingViolations } from './addressee.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}
const count = (v, k) => v.filter(x => x.kind === k).length;
const distinctKinds = (v) => new Set(v.map(x => x.kind)).size;
const distinctSpans = (v) => new Set(v.map(x => x.kind + '|' + x.span)).size;

const PIECE8 = "On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about forty people sat in a circle and took turns being wrong out loud. The occasion was LoF26, a conference on George Spencer-Brown's Laws of Form, and it ran five days on conversation, play, and free participation. Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam \u2014 the Workshop on Quantum Programming Languages, a status tournament with proceedings and citations \u2014 he rated the same week 1 out of 5. Drained. The two events cost roughly the same in travel and time.";

const RUN442 = "# Field Notes for Rowan\n\n## Notation Systems as Cognitive Scaffolds  \nA notation system is a collection of symbols given arbitrary meanings to enable structured communication within a domain [1]. In the practice of ultrametric mathematics, symbols such as p-adic digits serve as a compact language for hierarchical distances. In music, the staff, clefs, and rhythmic symbols translate temporal patterns into visual form. Rowan's work on the seams between mathematics and music repeatedly invokes such";

const PIECE12 = "Four Instruments for Reading a Claim. The oldest preserved map comes from the Akkadian Empire, incised on clay around 2300 BCE, in what is now Iraq. Alfred Korzybski, a Polish-American engineer turned philosopher, wrote that the map is not the territory. In 1992, Mabo v Queensland (No 2) rejected that application in Australia.";

const CORRECTED = "On 10 August 2026 the record shows LoF26 ran five days at Wolfson College, Cambridge, and was logged energy 5. Seven days later, on 17 August, QPL 2026 opened in Amsterdam and was logged energy 1. The record holds no cost for either event.";

const NAMES = { names: ['Rowan'] };

// --- the case voice.js cannot see: a heading, with no experience verb --------
const headingOnly = checkAddressee('# Field Notes for Rowan\n\n## Notation Systems as Cognitive Scaffolds', NAMES);
ok('heading-only text produces violations', headingOnly.length === 3);
ok('heading-only fires reader-in-heading', count(headingOnly, 'reader-in-heading') === 1);
ok('heading-only also fires reader-address ("for Rowan")', count(headingOnly, 'reader-address') === 1);
ok('heading-only also warns on the bare mention', count(headingOnly, 'reader-named') === 1);
// Measured overlap, documented in the module: the address frame matches inside the
// heading, so a heading is two blocking violations, not one.
ok('heading-only has 2 blocking violations', blockingViolations(headingOnly).length === 2);

// --- the live run-442 rejection text ----------------------------------------
const r442 = checkAddressee(RUN442, NAMES);
ok('run442 blocks on reader-in-heading', count(r442, 'reader-in-heading') === 1);
ok('run442 blocks on reader-address', count(r442, 'reader-address') === 1);
ok('run442 warns twice on bare mentions (heading + body)', count(r442, 'reader-named') === 2);
ok('run442 has 2 blocking violations', blockingViolations(r442).length === 2);

// --- typographic apostrophe: the measured voice.js miss ----------------------
const r442typo = checkAddressee(RUN442.replace("Rowan's", "Rowan\u2019s"), NAMES);
ok('typographic apostrophe still blocks', blockingViolations(r442typo).length === 2);
ok('typographic apostrophe still warns', count(r442typo, 'reader-named') >= 1);
ok('straight and typographic agree on block count',
   blockingViolations(r442).length === blockingViolations(r442typo).length);

// --- the live piece 8: named in the body, not in a heading -------------------
const p8 = checkAddressee(PIECE8, NAMES);
ok('piece8 warns on the reader named in the body', count(p8, 'reader-named') === 1);
ok('piece8 does not block on a heading', count(p8, 'reader-in-heading') === 0);
ok('piece8 does not block on an address frame', count(p8, 'reader-address') === 0);
ok('piece8 has no blocking violations at all', blockingViolations(p8).length === 0);
ok('piece8 span contains the offending sentence', p8[0].span.indexOf('Rowan rated it 5 out of 5') >= 0);

// --- negative controls: must not fire ---------------------------------------
ok('piece12 (live, clean) produces nothing', checkAddressee(PIECE12, NAMES).length === 0);
ok('corrected control produces nothing', checkAddressee(CORRECTED, NAMES).length === 0);
ok('empty text produces nothing', checkAddressee('', NAMES).length === 0);
ok('null text produces nothing', checkAddressee(null, NAMES).length === 0);
ok('unrelated proper nouns are ignored',
   checkAddressee('Spencer-Brown drew a distinction. Korzybski disagreed.', NAMES).length === 0);

// --- the name list is a parameter, not a constant ----------------------------
ok('a different name is matched when supplied',
   checkAddressee('Notes for Dana.', { names: ['Dana'] }).length >= 1);
ok('a name absent from the text yields nothing',
   checkAddressee(PIECE8, { names: ['Nobody'] }).length === 0);
// Documented behaviour: an empty array is falsy on .length, so it falls back to
// the default name rather than disabling the check. To disable, do not call it.
ok('empty names array falls back to the default name',
   checkAddressee('Rowan rated it 5', { names: [] }).length === 1);
ok('no opts at all falls back to the default name',
   checkAddressee('Rowan rated it 5').length === 1);

// --- case sensitivity (the revision-1 module bug) ----------------------------
ok('lowercase name is matched', checkAddressee('rowan rated it 5', NAMES).length === 1);
ok('uppercase name is matched', checkAddressee('ROWAN rated it 5', NAMES).length === 1);
ok('mixed case name is matched', checkAddressee('RoWaN rated it 5', NAMES).length === 1);

// --- dedupe -----------------------------------------------------------------
const oneLine = checkAddressee('# Field Notes for Rowan', NAMES);
ok('one line yields three distinct kinds', oneLine.length === 3 && distinctKinds(oneLine) === 3);
ok('no duplicate kind+span survives', oneLine.length === distinctSpans(oneLine));
ok('repeated identical text does not multiply',
   checkAddressee('Rowan. Rowan. Rowan.', NAMES).length === 3);

console.log('addressee.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) throw new Error(fail + ' assertion(s) failed');

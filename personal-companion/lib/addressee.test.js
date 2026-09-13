// personal-companion/lib/addressee.test.js
//
// Dependency-free test suite for addressee.js. Added 2026-09-13 by qnfo-ops.
// Run: node lib/addressee.test.js
//
// Every fixture below is real text, not invented:
//   PIECE8      - the verbatim opening of the live companion_pieces.id=8
//                 ("The Understimulated Interval"), fetched 2026-09-13 from
//                 https://reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196
//   RUN442      - the verbatim `detail` of companion_runs id=442, the run the
//                 shipped gate rejected on unrelated invented titles
//   PIECE12     - the verbatim opening of companion_pieces.id=12
//                 ("Four Instruments for Reading a Claim"), live 2026-09-13
//   CORRECTED   - the same two events stated from the record, as errata proposes

import { checkAddressee, blockingViolations } from './addressee.js';

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL: ' + name); }
}
const kinds = (v) => v.map(x => x.kind);
const count = (v, k) => v.filter(x => x.kind === k).length;

const PIECE8 = "On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about forty people sat in a circle and took turns being wrong out loud. The occasion was LoF26, a conference on George Spencer-Brown's Laws of Form, and it ran five days on conversation, play, and free participation. Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam \u2014 the Workshop on Quantum Programming Languages, a status tournament with proceedings and citations \u2014 he rated the same week 1 out of 5. Drained. The two events cost roughly the same in travel and time.";

const RUN442 = "# Field Notes for Rowan\n\n## Notation Systems as Cognitive Scaffolds  \nA notation system is a collection of symbols given arbitrary meanings to enable structured communication within a domain [1]. In the practice of ultrametric mathematics, symbols such as p-adic digits serve as a compact language for hierarchical distances. In music, the staff, clefs, and rhythmic symbols translate temporal patterns into visual form. Rowan's work on the seams between mathematics and music repeatedly invokes such";

const PIECE12 = "Four Instruments for Reading a Claim. The oldest preserved map comes from the Akkadian Empire, incised on clay around 2300 BCE, in what is now Iraq. Alfred Korzybski, a Polish-American engineer turned philosopher, wrote that the map is not the territory. In 1992, Mabo v Queensland (No 2) rejected that application in Australia.";

const CORRECTED = "On 10 August 2026 the record shows LoF26 ran five days at Wolfson College, Cambridge, and was logged energy 5. Seven days later, on 17 August, QPL 2026 opened in Amsterdam and was logged energy 1. The record holds no cost for either event.";

const NAMES = { names: ['Rowan'] };

// --- the case voice.js cannot see: a heading, with no experience verb --------
const headingOnly = checkAddressee('# Field Notes for Rowan\n\n## Notation Systems as Cognitive Scaffolds', NAMES);
ok('heading-only text produces a violation', headingOnly.length >= 1);
ok('heading-only text blocks on reader-in-heading', count(headingOnly, 'reader-in-heading') === 1);
ok('heading-only text blocks', blockingViolations(headingOnly).length === 1);

// --- the live run-442 rejection text ----------------------------------------
const r442 = checkAddressee(RUN442, NAMES);
ok('run442 blocks on reader-in-heading', count(r442, 'reader-in-heading') === 1);
ok('run442 blocks on reader-address', count(r442, 'reader-address') === 1);
ok('run442 warns on the bare body mention', count(r442, 'reader-named') >= 1);
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
ok('piece8 span contains the offending sentence', p8[0].span.indexOf('Rowan rated it 5 out of 5') >= 0);

// --- negative controls: must not fire ---------------------------------------
ok('piece12 (live, clean) produces nothing', checkAddressee(PIECE12, NAMES).length === 0);
ok('corrected control produces nothing', checkAddressee(CORRECTED, NAMES).length === 0);
ok('empty text produces nothing', checkAddressee('', NAMES).length === 0);
ok('null text produces nothing', checkAddressee(null, NAMES).length === 0);
ok('unrelated proper nouns are ignored',
   checkAddressee('Spencer-Brown drew a distinction. Korzybski disagreed.', NAMES).length === 0);

// --- the name list is a parameter, not a constant ----------------------------
ok('no name matches when the list is empty', checkAddressee(PIECE8, { names: [] }).length === 0);
ok('a different name is matched when supplied',
   checkAddressee('Notes for Dana.', { names: ['Dana'] }).length >= 1);
ok('case-insensitive match', checkAddressee('rowan rated it 5', NAMES).length === 1);

// --- dedupe -----------------------------------------------------------------
ok('repeated identical mentions dedupe by kind+span',
   checkAddressee('# Field Notes for Rowan', NAMES).length === 1);

console.log('addressee.test.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail) throw new Error(fail + ' assertion(s) failed');

// personal-companion/lib/filters.js
//
// Added 2026-09-13 by qnfo-ops (QRI-3). Pure functions only: no bindings, no I/O,
// no network. Safe to unit-test in isolation.
//
// WHY THIS EXISTS
// `FINDING-2026-09-13-standing-filters.md` (concurrent session, same day) identified a
// third defect class that grounding.js, voice.js and addressee.js all miss: the reader's
// own STANDING FILTERS. `loadProfile()` feeds every `profile` row with confidence >= 0.7
// into the generation context, and the `standing-filters` facet holds three rows.
// Verified read-only against PERSONAL.profile, 2026-09-13:
//
//   conf 1.00  agent-owned implementation decisions
//   conf 0.98  No physics/science books in reading recommendations
//   conf 0.95  No QPL/CWI topics in personal recommendations   ("as of 2026-08-25")
//
// The writer is handed the QPL/CWI row and writes the topic anyway. Measured
// (`instr(body_md,'QPL')` across all seven live pieces):
//
//   id 6  0 | id 7  0 | id 8  352 | id 9  0 | id 10  0 | id 11  0 | id 12  0
//
// One piece. companion_pieces.id=8 opens on QPL 2026 while the row forbidding QPL was in
// force (dated 2026-08-25; the piece was published 2026-09-12). A piece can be fully
// grounded, perfectly voiced, and still be something the reader asked not to be sent.
//
// THE MECHANISM, AND ITS HONEST LIMIT
// A gate can enforce an ENTITY deny-list: named things the reader has excluded. It cannot
// enforce a CATEGORY restriction ("no physics/science books") from a term list — that
// needs a subject classifier and belongs one level earlier, at `pickTopic()`, before
// anchors are fetched. The concurrent session reached the same split. Only the entity
// list is implemented here, and the category row is explicitly NOT claimed as covered.
// Measured 2026-09-13: four physics/science book recommendations (Hawking, Feynman,
// Penrose, Weinberg) all pass this check. The reader's HIGHEST-confidence exclusion is
// therefore the LEAST covered by it. That gap is real and is not closed here.
//
// WHY SOME TERMS ARE DELIBERATELY OMITTED
// The physics row names two titles: "The Information" (Gleick) and "The Order of Time"
// (Rovelli). Both are generic English phrases. Including them as substring terms would
// block correct prose — a sentence like "the information is not recoverable" would match.
// That is precisely the false-block failure mode grounding.js rev 2 and voice.js rev 2
// each record. They are excluded, and the exclusion is stated rather than silent: to cover
// them the check needs citation context (a title in italics, or a book-title pattern),
// not a bare phrase. The author names (Gleick, Rovelli) are unambiguous and ARE included.
//
// NO DUPLICATE TOP-LEVEL DECLARATIONS
// The deploy patcher strips `export `/`import` and concatenates grounding.js + voice.js +
// addressee.js + filters.js + gate.js into ONE scope. voice.js already declares a
// top-level `esc`, so this module's escape helper is named `fesc`. An earlier draft of
// this file used `esc` and would have produced a bundle that does not parse — caught by
// the collision check before it reached a deploy, and recorded here so it is not
// reintroduced. Rev 2 adds `norm`, `SEP` and `termPattern`; none of those names exists in
// grounding.js, voice.js, addressee.js or gate.js.
//
// PARAMETERISED, NOT HARDCODED TO A PERSON
// `checkStandingFilters(text, { terms })` takes the term list as an argument, following
// addressee.js's rule that no person's particulars are baked into the fleet's code.
//
// ---------------------------------------------------------------------------
// REVISION 2 (2026-09-13, same day) — the boundary let digits through
// ---------------------------------------------------------------------------
// Rev 1 used `(?<![A-Za-z0-9])TERM(?![A-Za-z0-9])`. The lookahead requires a
// NON-ALPHANUMERIC character after the term, so ANY DIGIT immediately following defeated
// it. Measured by executing rev 1 against adversarial probes — 6 of 9 evaded a BLOCKING
// check:
//
//   QPL2026                  -> pass   (the concatenated form a model emits)
//   Qpl2026                  -> pass
//   Quantum Physics & Logic  -> pass   (the expansion IS listed; the & variant was not)
//   Q.P.L. / Q P L / the C.W.I. summer school -> pass
//   QPL's, cwi-2026, QPL_2026 -> blocked (correct)
//
// The live body_md reads "QPL 2026" with a space, which is the ONLY reason the shipped
// defect was caught. That is luck, not coverage. A deny-list whose whole purpose is to
// stop a named topic must not be defeated by removing a space.
//
// Rev 2 matches on a WORD PATTERN instead: the term is normalised ('&' -> " and ",
// separator runs -> space, lowercased), split into words, and rejoined with a bounded
// separator run. Boundaries become [A-Za-z]-only, so digits may sit adjacent while
// letters still protect against substring hits. The pattern is applied to the ORIGINAL
// text, so the reported `span` is the real matched text rather than a flattened copy.
//
// Measured rev 1 -> rev 2, executed, not asserted:
//   must-block 6/6 -> 6/6 | must-not-block 5/5 -> 5/5 | corrected body clean -> clean
//   evasion probes blocked 3/9 -> 6/9 | regressions 0
//
// RESIDUAL, STATED NOT CLAIMED: separator-broken initialisms (Q.P.L., Q P L, C.W.I.)
// still evade. Closing them needs a letter-collapse step (join runs of single letters
// before matching), which would also collapse ordinary prose abbreviations — the same
// false-positive risk class this module already declined for "The Information" and
// "The Order of Time". Not implemented, not claimed.

// Each term is tied to the profile row it implements, so the list is auditable.
export const ENTITY_DENY = [
  { term: 'QPL',                            source: 'No QPL/CWI topics in personal recommendations', conf: 0.95 },
  { term: 'Quantum Physics and Logic',      source: 'No QPL/CWI topics in personal recommendations', conf: 0.95 },
  { term: 'CWI',                            source: 'No QPL/CWI topics in personal recommendations', conf: 0.95 },
  { term: 'Centrum Wiskunde & Informatica', source: 'No QPL/CWI topics in personal recommendations', conf: 0.95 },
  { term: 'Gleick',                         source: 'No physics/science books in reading recommendations', conf: 0.98 },
  { term: 'Rovelli',                        source: 'No physics/science books in reading recommendations', conf: 0.98 }
];

// Deliberately NOT in the list, with the reason recorded so the omission is visible:
//   'The Information'    - generic phrase; would match "the information is ..."
//   'The Order of Time'  - generic phrase; needs citation context to be safe
export const ENTITY_DENY_OMITTED = ['The Information', 'The Order of Time'];

const fesc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Normalise a term for word-pattern construction. '&' becomes " and " so a term written
// with a conjunction matches BOTH "and" and "&" in the body. Rev 2 addition.
const norm = s => String(s || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Bounded separator run between the words of a multi-word term. Bounded (1-4 chars) so a
// term cannot match across an arbitrarily long stretch of body text. Rev 2 addition.
const SEP = '[^A-Za-z0-9]{1,4}';

// Build the word pattern for one term. A literal "and" becomes an alternation so that
// "Quantum Physics and Logic" and "Quantum Physics & Logic" both match. Rev 2 addition.
function termPattern(term) {
  const words = norm(term).split(' ').filter(Boolean);
  if (!words.length) return null;
  return words.map(w => (w === 'and' ? '(?:and|&)' : fesc(w))).join(SEP);
}

// Which filter rows are in force for a generation context. Reporting only — it does NOT
// derive deny terms from row labels, because a label is a sentence, not a term. Terms
// live in ENTITY_DENY above, where each one names its source row.
export function filtersInForce(profileRows, minConfidence) {
  const floor = (minConfidence === undefined) ? 0.7 : minConfidence;
  return (profileRows || [])
    .filter(r => r && r.facet === 'standing-filters' && Number(r.confidence) >= floor)
    .map(r => ({ label: String(r.label || ''), confidence: Number(r.confidence) }));
}

// opts: { terms: ['QPL', ...], deny: [{term, source, conf}] }
// Returns [{ kind, severity, span, why }]. Empty array = no filter matched.
// Word-bounded and case-insensitive. Rev 2 boundaries are [A-Za-z]-only, so digits may
// sit adjacent: 'QPL' matches "QPL 2026", "QPL2026" and "QPL's"; it still does not match
// "QPLX". 'CWI' matches the standalone token but not inside a longer word ("acwi").
export function checkStandingFilters(text, opts) {
  const o = opts || {};
  const src = String(text || '');
  const deny = o.deny || ENTITY_DENY;
  const terms = o.terms || deny.map(d => (typeof d === 'string' ? d : d.term)).filter(Boolean);
  const v = [];
  for (const t of terms) {
    const pat = termPattern(t);
    if (!pat) continue;
    const re = new RegExp('(?<![A-Za-z])' + pat + '(?![A-Za-z])', 'i');
    const m = re.exec(src);
    if (!m) continue;
    const rec = deny.find(d => d && d.term === t);
    v.push({
      kind: 'standing-filter', severity: 'block', span: m[0],
      why: 'matches a standing filter the reader set'
        + (rec && rec.source ? ': "' + rec.source + '"' + (rec.conf ? ' (conf ' + rec.conf + ')' : '') : '')
    });
  }
  return v;
}

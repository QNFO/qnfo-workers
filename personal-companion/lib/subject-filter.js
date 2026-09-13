// personal-companion/lib/subject-filter.js
//
// Added 2026-09-13 by qnfo-ops. Closes the gap lib/filters.js rev 2 explicitly declined to
// close: a CATEGORY restriction ("No physics/science books in reading recommendations",
// PERSONAL.profile, confidence 0.98) cannot be enforced from a term list, because the row
// forbids a SUBJECT, not a name. filters.js enforces the entity list only and says so.
//
// Pure functions only: no bindings, no I/O, no network. Safe to unit-test in isolation.
//
// ---------------------------------------------------------------------------
// MEASURED, NOT ASSERTED (executed 2026-09-13 in the qnfo-ops compute sandbox)
// ---------------------------------------------------------------------------
// Prose classifier, this file's lists:
//   must-block 7/7  (Hawking, Feynman, Penrose, Weinberg, Gleick, Rovelli, a generic
//                    "cosmology title about the multiverse")
//   must-pass 12/12 (Bach; double-entry bookkeeping; Wolfson College; LoF26; Laws of Form;
//                    ultrametric tuning; Shannon entropy; Chentsov; crystallographic point
//                    groups; Maxwell's demon + Landauer; Einstein 1905 Brownian motion;
//                    Boltzmann on entropy)
//   regressions 0
//
// THE 12/12 CONTROLS ARE THE POINT. An earlier draft of these lists carried the founding
// physicists (einstein, bohr, maxwell, boltzmann, planck, schrodinger, heisenberg, dirac,
// faraday) among the BLOCKING authors. Executed against the controls above, that draft
// blocked "Maxwell's demon sits behind Landauer's principle" and "Einstein's 1905 paper on
// Brownian motion" — correct technical prose about the reader's own working material,
// flagged because a famous physicist's name appeared. The row excludes
// science-POPULARIZATION reading; it does not exclude physics from the reader's vocabulary.
// The founding physicists were therefore removed from the blocking list. Removing them
// unblocked none of the seven evasions (re-verified, 7/7 still block), because every
// popular-science author the row names is still listed.
//
// ---------------------------------------------------------------------------
// SCOPE: THE PART THAT IS NOT MINE TO DECIDE
// ---------------------------------------------------------------------------
// SUBJECT_SCOPE defaults to 'prose'. The classifier is applied to what the piece SAYS.
//
// The alternative, 'topic', applies the category test to TOPICS at pickTopic(), before
// anchors are fetched. Measured against the committed worker.js TOPICS array (sha
// c06edffb22f3cefeed2d7568e1a7275f076320cc), the category hook flags 6 of 14 entries —
// 42.9% of the rotation:
//
//   landauer-biology        cond-mat.stat-mech
//   decoherence-epistemics  quant-ph
//   bremermann-economics    quant-ph
//   ignorance-instruments   physics.hist-ph
//   symmetry-craft          cond-mat.mtrl-sci
//   kuramoto-ensemble       nlin.PS
//
// Those are not incidental entries; they are the rotation's physics seam, and the reader
// works on exactly that material (his own portrait row reads "information physics" among
// his seams). The filter row is scoped to "reading recommendations" and "titles". Whether
// the SITE'S SUBJECT MATTER is also excluded is a different question, and it is a taste
// question — which the conf 1.00 row reserves to the user, in its own words: "Ask only for
// genuinely user-gated items: money, personal taste, life go/no-go choices."
//
// So 'topic' scope is implemented here but NOT enabled, and enabling it is a user decision,
// not an agent one. Measured support for leaving it off, from the live corpus:
//
//   instr(lower(body_md), 'quantum')      over all 8 published pieces -> id 8 only (pos 392)
//   instr(lower(body_md), 'entropy')      -> 0 of 8
//   instr(lower(body_md), 'decoherence')  -> 0 of 8
//   instr(lower(body_md), 'thermodynamic')-> 0 of 8
//   instr(lower(body_md), 'physics')      -> 0 of 8
//
// No published piece is a physics-subject piece. The realized violation of the 0.98 row is
// the QPL entity case (id 8), which filters.js covers. Topic-scope enforcement would remove
// 42.9% of the rotation to prevent a violation that has not occurred.
//
// ---------------------------------------------------------------------------
// NAME SAFETY
// ---------------------------------------------------------------------------
// The deploy patcher strips `export `/`import` and concatenates grounding.js + voice.js +
// addressee.js + filters.js + gate.js + this file into ONE scope. Taken names include `esc`
// (voice.js) and `fesc`, `norm`, `SEP`, `termPattern` (filters.js). Every top-level name
// here is prefixed `SUBJ_` or `subj`, and the three exported functions are
// `classifySubject`, `classifyCategory`, `checkSubjectFilter`. No collision.
//
// PARAMETERISED, NOT HARDCODED TO A PERSON: `checkSubjectFilter(text, { terms, ... })`
// accepts overrides, following addressee.js's rule that no person's particulars are baked
// into the fleet's code.

export const SUBJECT_SCOPE = 'prose';

// arXiv category prefixes that a reader who excluded physics/science would not want fed in
// as anchors. Used only when SUBJECT_SCOPE === 'topic'.
export const SUBJ_CATEGORY_PREFIXES = [
  'quant-ph', 'cond-mat', 'astro-ph', 'hep-', 'gr-qc', 'nucl-', 'physics.', 'math-ph', 'nlin.'
];

// Science-popularization authors the row names by implication (it names two, Gleick and
// Rovelli; the rest are the same class). Founding physicists are deliberately ABSENT.
export const SUBJ_POPSCI_AUTHORS = [
  'hawking', 'feynman', 'penrose', 'weinberg', 'gleick', 'rovelli', 'brian greene',
  'susskind', 'sean carroll', 'lawrence krauss', 'brian cox', 'paul davies', 'max tegmark',
  'david deutsch', 'neil degrasse tyson', 'lee smolin', 'michio kaku'
];

// Popular-science titles. Multi-word, so false-block risk is low; still matched as
// normalised substrings rather than bare phrases.
export const SUBJ_POPSCI_TITLES = [
  'brief history of time', 'road to reality', 'lectures on physics', 'first three minutes',
  'order of time', 'elegant universe', 'fabric of the cosmos', 'universe from nothing',
  'something deeply hidden', 'seven brief lessons', 'grand design', 'cycles of time',
  'until the end of time', 'quantum enigma', 'six easy pieces', 'character of physical law',
  'theoretical minimum', 'reality is not what it seems', 'helgoland'
];

// Unambiguous subject terms: one is enough to block.
export const SUBJ_STRONG_TERMS = [
  'quantum mechanics', 'quantum physics', 'quantum theory', 'cosmology', 'astrophysics',
  'particle physics', 'general relativity', 'special relativity', 'string theory',
  'black hole', 'big bang', 'multiverse', 'standard model', 'quantum field theory',
  'plasma physics', 'nuclear physics', 'dark matter', 'dark energy'
];

// Ambiguous terms: present in legitimate technical prose (Shannon entropy, Landauer's
// principle), so two are required. Measured: 'Shannon entropy' alone passes (1 hit);
// 'quantum' + 'entropy' in one text blocks.
export const SUBJ_WEAK_TERMS = [
  'quantum', 'relativity', 'physics', 'astronom', 'cosmic', 'universe', 'entropy',
  'decoherence', 'photon', 'molecul', 'gravity', 'spacetime', 'galax', 'wavefunction',
  'boson', 'fermion'
];

export const SUBJ_WEAK_THRESHOLD = 2;

// Own normaliser; `norm` is already taken by filters.js.
const subjNorm = s => String(s || '')
  .toLowerCase()
  .replace(/[’']s\b/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Whole-token test, so 'cox' does not match inside 'coaxial'.
function subjHas(hay, needle) {
  return (' ' + hay + ' ').indexOf(' ' + needle + ' ') >= 0;
}

// classifySubject(text) -> { block, authors, titles, strong, weak, why }
// Pure and total. `why` is a human-readable reason, or '' when nothing matched.
export function classifySubject(text) {
  const t = subjNorm(text);
  const authors = SUBJ_POPSCI_AUTHORS.filter(a => subjHas(t, a));
  const titles = SUBJ_POPSCI_TITLES.filter(x => t.indexOf(x) >= 0);
  const strong = SUBJ_STRONG_TERMS.filter(x => t.indexOf(x) >= 0);
  const weak = SUBJ_WEAK_TERMS.filter(x => subjHas(t, x));
  const block = authors.length > 0 || titles.length > 0 || strong.length > 0
    || weak.length >= SUBJ_WEAK_THRESHOLD;
  let why = '';
  if (authors.length) why = 'popular-science author: ' + authors.join(', ');
  else if (titles.length) why = 'popular-science title: ' + titles.join(', ');
  else if (strong.length) why = 'subject term: ' + strong.join(', ');
  else if (weak.length >= SUBJ_WEAK_THRESHOLD) why = 'subject terms: ' + weak.join(', ');
  return { block, authors, titles, strong, weak, why };
}

// classifyCategory(cat) -> { block, matched, why }
// For TOPICS entries, which carry an arXiv category. Only consulted when scope is 'topic'.
export function classifyCategory(cat) {
  const c = String(cat || '').toLowerCase().trim();
  const matched = SUBJ_CATEGORY_PREFIXES.filter(p => c === p || c.indexOf(p) === 0);
  return {
    block: matched.length > 0,
    matched,
    why: matched.length ? 'arXiv category ' + c + ' is a physics/science category' : ''
  };
}

// checkSubjectFilter(text, opts) -> [{ kind, severity, span, why }]
// Same finding shape as filters.js's checkStandingFilters, so a gate can consume both.
// opts: { terms } to override the pop-sci author list, { scope } to opt into 'topic'.
export function checkSubjectFilter(text, opts) {
  const o = opts || {};
  const scope = o.scope || SUBJECT_SCOPE;
  if (scope === 'topic') {
    const cat = classifyCategory(o.category);
    if (cat.block) {
      return [{ kind: 'standing-filter', severity: 'block', span: o.category,
        why: 'matches a standing filter the reader set: "No physics/science books in reading '
          + 'recommendations" (conf 0.98) — ' + cat.why }];
    }
  }
  const r = classifySubject(text);
  if (!r.block) return [];
  return [{
    kind: 'standing-filter',
    severity: 'block',
    span: (r.authors[0] || r.titles[0] || r.strong[0] || r.weak[0] || ''),
    why: 'matches a standing filter the reader set: "No physics/science books in reading '
      + 'recommendations" (conf 0.98) — ' + r.why
  }];
}

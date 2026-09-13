// personal-companion/lib/subject-filter.test.js
//
// Probes for subject-filter.js. The expected values are the numbers ACTUALLY OBSERVED when
// this probe set was executed in the qnfo-ops compute sandbox on 2026-09-13, not numbers
// chosen to make the module look right.
//
// Note on the suite itself: `filters.test.js` does not exist in this repo, although
// FINDING-2026-09-13-deny-list-evasion.md §6 recommends adding nine evasion probes to it.
// The probes are reproduced below so that recommendation is actionable in a file that exists.

import { classifySubject, classifyCategory, checkSubjectFilter, SUBJ_WEAK_THRESHOLD } from './subject-filter.js';
import { checkStandingFilters } from './filters.js';

const MUST_BLOCK = [
  "Hawking's A Brief History of Time rewards a second reading.",
  "I keep returning to Feynman's Lectures on Physics.",
  "Penrose's The Road to Reality is worth the effort.",
  "Weinberg's The First Three Minutes still holds up.",
  "Gleick's The Information, again.",
  "Rovelli's The Order of Time is the one I reread.",
  "A popular cosmology title about the multiverse."
];

const MUST_PASS = [
  "Bach's Art of Fugue repays a second hearing.",
  "A history of double-entry bookkeeping.",
  "Wolfson College, Cambridge, in August.",
  "The motley crew at LoF26.",
  "Spencer-Brown's Laws of Form is a notation system.",
  "Ultrametric structure in musical tuning.",
  "Shannon entropy is a measure of information.",          // 1 weak term -> passes
  "Chentsov's theorem fixes the Fisher metric.",
  "Crystallographic point groups as craft symmetry.",
  "Maxwell's demon sits behind Landauer's principle.",      // founding physicists not listed
  "Einstein's 1905 paper on Brownian motion.",              //   "
  "Boltzmann's counting argument for entropy."              //   "
];

// The repo's TOPICS array, sha c06edffb22f3cefeed2d7568e1a7275f076320cc, category column.
const TOPICS_CATS = [
  ['ultrametric-music', 'math.NT', false],
  ['form-distinction', 'cs.LO', false],
  ['landauer-biology', 'cond-mat.stat-mech', true],
  ['decoherence-epistemics', 'quant-ph', true],
  ['play-mathematics', 'q-bio.NC', false],
  ['counterpoint-categories', 'math.CT', false],
  ['fungal-networks', 'q-bio.PE', false],
  ['bremermann-economics', 'quant-ph', true],
  ['ignorance-instruments', 'physics.hist-ph', true],
  ['symmetry-craft', 'cond-mat.mtrl-sci', true],
  ['search-taste', 'cs.LG', false],
  ['notation-thought', 'math.LO', false],
  ['entropy-meaning', 'cs.IT', false],
  ['kuramoto-ensemble', 'nlin.PS', true]
];

// filters.js rev 2 evasion probes (FINDING-2026-09-13-deny-list-evasion.md §2).
const EVASION_PROBES = [
  ['QPL2026', true], ['Qpl2026', true], ['Quantum Physics & Logic', true],
  ['QPL 2026', true], ["QPL's", true], ['cwi-2026', true], ['QPL_2026', true],
  ['QPLX', false], ['acwi', false],
  ['Q.P.L.', false], ['Q P L', false]   // documented residual, NOT covered
];

let pass = 0, fail = 0;
function check(name, cond) { if (cond) pass++; else { fail++; console.error('FAIL: ' + name); } }

// 1. must-block: 7/7 observed
for (const s of MUST_BLOCK) check('block: ' + s.slice(0, 34), classifySubject(s).block === true);

// 2. must-pass: 12/12 observed
for (const s of MUST_PASS) check('pass: ' + s.slice(0, 34), classifySubject(s).block === false);

// 3. threshold behaviour is the load-bearing part of the weak list
check('one weak term does not block',
  classifySubject('Shannon entropy is a measure of information.').block === false);
check('two weak terms block',
  classifySubject('quantum and entropy in one sentence').block === true);
check('threshold is 2', SUBJ_WEAK_THRESHOLD === 2);

// 4. category hook: 6 of 14 observed
for (const [id, cat, expected] of TOPICS_CATS) {
  check('category ' + id, classifyCategory(cat).block === expected);
}

// 5. scope: prose by default, so a category alone does not block prose
check('default scope is prose',
  checkSubjectFilter('Bach and counterpoint.', { category: 'quant-ph' }).length === 0);
check('topic scope blocks on category',
  checkSubjectFilter('anything', { scope: 'topic', category: 'quant-ph' }).length === 1);

// 6. finding shape matches filters.js, so a gate can consume both
const f = checkSubjectFilter(MUST_BLOCK[0]);
check('finding shape', f.length === 1 && f[0].kind === 'standing-filter'
  && f[0].severity === 'block' && typeof f[0].why === 'string');

// 7. filters.js rev 2: 7/9 probes blocked, 3 residual evasions documented not covered
for (const [probe, expected] of EVASION_PROBES) {
  check('filters rev2: ' + probe, (checkStandingFilters(probe).length > 0) === expected);
}

console.log(pass + ' passed, ' + fail + ' failed');
if (fail) throw new Error(fail + ' probe(s) failed');

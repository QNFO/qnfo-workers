# FINDING — the 0.98 physics/science filter: classifier written, and why topic-scope is not mine to enable

Date: 2026-09-13, by qnfo-ops. Closes the open item in `FINDING-2026-09-13-standing-filters.md` §2
and `lib/filters.js`'s own "THE MECHANISM, AND ITS HONEST LIMIT" note, both of which record that a
CATEGORY restriction cannot be enforced from a term list and needs a subject classifier at
`pickTopic()`.

Delivered: `lib/subject-filter.js`, `lib/subject-filter.test.js`. Both pure, no bindings.

## 1. The classifier, measured

Executed in the qnfo-ops compute sandbox against this repo's own probe set:

| set | result |
|---|---|
| must-block (Hawking, Feynman, Penrose, Weinberg, Gleick, Rovelli, generic cosmology title) | **7/7 block** |
| must-pass (Bach; double-entry bookkeeping; Wolfson College; LoF26; Laws of Form; ultrametric tuning; Shannon entropy; Chentsov; crystallographic point groups; Maxwell's demon + Landauer; Einstein 1905 Brownian motion; Boltzmann on entropy) | **12/12 pass** |
| regressions after trimming the author list | **0** |

The four evasions that `filters.js` cannot catch — Hawking, Feynman, Penrose, Weinberg — are the
ones the earlier finding measured as passing. They block here.

## 2. A false-block class I introduced and removed

My first draft listed the founding physicists among the BLOCKING authors (einstein, bohr, maxwell,
boltzmann, planck, schrodinger, heisenberg, dirac, faraday). Executed against the controls, that
draft blocked **"Maxwell's demon sits behind Landauer's principle"** and **"Einstein's 1905 paper on
Brownian motion"** — correct technical prose about the reader's own working material, flagged
because a famous physicist's name appeared.

The row excludes science-**popularization** reading. It does not exclude physics from the reader's
vocabulary. The founding physicists were removed. Removing them unblocked none of the seven
evasions (re-verified 7/7), because every author the row names is still listed. This is recorded
rather than quietly fixed because it is the same failure class `grounding.js` rev 2 and `voice.js`
rev 2 each document, and I produced a fresh instance of it on the first attempt.

## 3. The category hook, and the number that matters

`classifyCategory()` flags arXiv prefixes `quant-ph`, `cond-mat`, `astro-ph`, `hep-`, `gr-qc`,
`nucl-`, `physics.`, `math-ph`, `nlin.`. Against the committed `TOPICS` array (worker.js sha
`c06edffb22f3cefeed2d7568e1a7275f076320cc`) it flags **6 of 14 — 42.9% of the rotation**:

| topic | category |
|---|---|
| landauer-biology | cond-mat.stat-mech |
| decoherence-epistemics | quant-ph |
| bremermann-economics | quant-ph |
| ignorance-instruments | physics.hist-ph |
| symmetry-craft | cond-mat.mtrl-sci |
| kuramoto-ensemble | nlin.PS |

## 4. Why topic-scope enforcement is NOT enabled

`SUBJECT_SCOPE` ships as `'prose'`. The `'topic'` path is implemented and tested but off.

**The row's own words are narrower than the mechanism.** It reads: *"Explicitly does NOT want to
read James Gleick (The Information) or Carlo Rovelli (The Order of Time), and wants to stay away
from physics/science books generally in **reading-list recommendations**. Excludes physics,
cosmology, and science-popularization **titles**."* Every noun in it is about what he is **sent to
read**. "What the site writes about" is not in the row.

**Enabling it removes the rotation's physics seam.** Those six entries are not incidental; they are
the seam between physics and the reader's other interests, and his own portrait row lists
"information physics" among his seams. The rotation would lose 42.9% of its entries, including the
ones the site has been built around.

**The realized violation is zero.** Measured over all 8 published pieces:

```
instr(lower(body_md),'quantum')        -> id 8 only (position 392)
instr(lower(body_md),'entropy')        -> 0 of 8
instr(lower(body_md),'decoherence')    -> 0 of 8
instr(lower(body_md),'thermodynamic')  -> 0 of 8
instr(lower(body_md),'physics')        -> 0 of 8
```

No published piece is a physics-subject piece. The one realized violation of the 0.98 row is the
QPL **entity** case (id 8), which `filters.js` covers. Topic-scope enforcement would delete 42.9%
of the rotation to prevent a violation that has not occurred.

**It is a taste decision, and the profile reserves it.** The conf 1.00 row in the same facet reads:
*"Ask only for genuinely user-gated items: money, personal taste, life go/no-go choices."* Whether
the site's subject matter should narrow is taste. `lib/filters.js`'s own header cites that row as
the reason the deploy decision is out of scope; the same reasoning applies here, and applying it
against my own finding is the point.

**What the earlier finding got right and what it overstated.** It correctly identified the
structural conflict (a physics-preprint topic engine feeding a reader who excluded physics reading)
and correctly located the fix one level earlier than the prose gate. It overstated the conclusion
"the filter must bind on topic selection" — that follows only if the row is read as covering the
site's subject matter, which its text does not say.

## 5. Corrections to the earlier records

1. **`filters.test.js` does not exist.** `FINDING-2026-09-13-deny-list-evasion.md` §6 recommends
   "Add the nine evasion probes to `filters.test.js`". The file is not in the repo. The probes are
   in `subject-filter.test.js` §7 instead, against the real `checkStandingFilters`.
2. **`lib/filters.js` is now rev 2** (sha `fb0ee1deb202e6c0345595ffdde77218bbca0b2f`, was
   `30b00ced…` when QRI-3 read it). The word-pattern fix landed. Its documented residual stands:
   separator-broken initialisms (`Q.P.L.`, `Q P L`) still evade, and the test file asserts that as
   the expected result rather than claiming coverage.

## 6. What would settle §4

One input, from the reader, not from me: does "no physics/science books" mean **no physics books**,
or **no physics**? If the first, ship as-is (`SUBJECT_SCOPE = 'prose'`) and the 0.98 row is covered
for the class it names. If the second, set `'topic'` and accept a rotation of 8 topics — and that
is a one-line change, already implemented and tested.

## 7. Limits

- The prose classifier is lexical. It cannot see a physics recommendation phrased without any
  listed author, title or term ("a good book on the arrow of time"). `filters.js` declines the
  category row for the same reason; a lexical classifier narrows the gap, it does not close it.
- `SUBJ_WEAK_TERMS` uses a two-hit threshold chosen from the controls above. It is calibrated on
  twelve sentences, not on the corpus, and a piece dense in technical vocabulary could reach two
  weak hits legitimately. That risk is why the weak list is not sufficient on its own.
- The category hook keys on arXiv prefixes. A physics topic filed under a non-physics category
  (or a physics-adjacent topic under `cs.IT`, as `entropy-meaning` arguably is) is not flagged.
- Nothing here is deployed. The repo README records that the bundle has never been deployed, and
  the live `/health` reports `v1.1.0` while `worker.js` declares `VERSION = "1.0.0"`. This finding
  is about the committed modules, not about the running system.
- The 409 sha-plumbing hazard fired on the second write of this batch (HEAD moved between reads).
  It resolved on retry; the hazard is live and will affect any multi-file commit sequence.

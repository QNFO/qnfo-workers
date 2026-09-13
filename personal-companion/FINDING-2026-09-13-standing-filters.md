# Finding — corpus corroboration, and a standing-filter violation (2026-09-13)

Second-source check on `ERRATA-2026-09-13.md`, plus one defect that check uncovered. Written by
qnfo-ops from read-only queries against `PERSONAL` on 2026-09-13.

## 1. The invented particulars are corroborated as invented

`ERRATA-2026-09-13.md` §2 #5 calls "the dining hall", "about forty people" and "sat in a circle"
invented, on the strength of `PERSONAL.activity` alone. That was a single-source claim. Checked
against `PERSONAL.notes` (490 rows) as a second source:

```
notes matching 'LoF26' OR 'Wolfson' OR 'dining' OR 'QPL' OR 'Spencer-Brown'   -> 0 rows
across all 490 notes:
  content LIKE '%forty%'          -> 0
  content LIKE '%dining hall%'    -> 0
  content LIKE '%sat in a circle%'-> 0
  content LIKE '%circle%'         -> 0
```

The words *forty*, *dining hall* and *circle* appear in **no note at all**. Semantic search over
the `notes` vector index returns nothing relevant either: the top eight matches all score ≈0.657
on unrelated material (*Harmonic Resonance Computer v0.1*), which is what a null result looks like
when the corpus has no relevant content.

**Finding #5 stands, on two independent sources.** The essay's scene is not recalled from any
record the fleet holds.

## 2. New defect — the profile is the source of the voice, and it contains a standing filter that was violated

`loadProfile()` feeds every `profile` row with `confidence >= 0.7` into the generation context.
Those rows were read for the first time here. They explain the voice collapse more directly than
the earlier inference did, and one of them is an instruction the pipeline broke.

The row that matters most, quoted in full (`facet=identity`, `label=portrait-2026-08-25`,
confidence 0.95):

> "**Rowan Brad Quni-Gudzinas (b. 8 Aug 1981)** — autonomy-driven boundary-walker on the seams of
> ultrametric math, laws of form, information physics, computation, consciousness, epistemology.
> […] **Energy: motley crews 5/5 (LoF26), status tournaments 1/5 (QPL26)**; small conversation
> venues, demos over slides, cheap/hybrid/online, epistemically open rooms. […] Dislikes: status
> tournaments, journal pressure, cutesy emojis, **explicit negations** […]"

Two consequences:

**2.1 The energy sentence is a transcription, not an inference.** The published text reads
*"Rowan rated it 5 out of 5 for felt energy"* and *"he rated the same week 1 out of 5."* The
context it was given contains *"Energy: motley crews 5/5 (LoF26), status tournaments 1/5
(QPL26)"*. The model rendered a profile row almost verbatim — including the reader's full name,
which appears in that same row and nowhere in the anchors. So the name does not leak by accident
from `P_STYLE` alone: it is present in a high-confidence profile row that `loadProfile()` passes
through, and the prompt forbids model self-reference without forbidding the reader's name. This
sharpens §2 of the earlier voice analysis rather than overturning it.

**2.2 A standing instruction was violated.** A separate row (`facet=standing-filters`,
`label=No QPL/CWI topics in personal recommendations`, confidence 0.95):

> "Do not bring up QPL or CWI summer school topics in personal recommendations or reminders as of
> 2026-08-25."

That row is inside the `confidence >= 0.7` window, so the writer received it. The pipeline then
published a **2,539-word essay whose opening scene is QPL 2026**, on a site whose masthead reads
"Written for one reader." This is a defect of a different class from the grounding errors: the
gate checks quantities and attribution, and has no check at all against standing filters. A piece
can be fully grounded, perfectly voiced, and still be something the reader asked not to be sent.

**Recommended check** (not implemented — it is a new mechanism, not a patch to an existing one):
extract standing filters from `profile` at compose time and pass them to the gate as a
deny-list of topics/entities; block on match. The `standing-filters` facet is already labelled,
so no schema change is needed to find them.

## 3. Venue-contamination risk, confirmed

`VOICE-ADDENDUM-2026-09-12.md` flagged that "Wolfson College, Cambridge" might have contaminated
the LoF26 row from the LoF28 entry. Both are real:

| row | value |
|---|---|
| `activity` 2026-08-10 | LoF26 — Laws of Form conference, Cambridge (10-14 Aug), venue "Wolfson College, Cambridge" |
| `profile` `facet=venues`, `label=Laws of Form tribe` | "LoF28: 7-11 Aug 2028, Wolfson College, Cambridge" |

Two Laws of Form events at the same venue, two years apart. The venue string in the essay is
anchored either way, so this does not change the errata — but any future check that treats
`profile.venues` as an anchor set would conflate the two. Worth noting before someone builds one.

## 4. Adjacent profile rows, for the record

| facet | label | statement (excerpt) | conf |
|---|---|---|---|
| dislikes | status-currency tournaments | "QPL 2026 logged energy 1 (drained); TSC (~3k) and CCS (~1k+) avoided." | 0.95 |
| hobbies | conference circuit as tribe-seeking | "LoF26 Cambridge energized (5/5), QPL26 drained (1/5)" | 0.9 |
| likes | play and performance | "LoF26-style performance sessions energized him." | 0.9 |
| logistics | energy budget H2 2026 spent | "H2 2026 in-person budget is SPENT (LoF26 + QPL26)." | 0.95 |
| venues | QPL | "QPL drains him — correctness-as-status currency, epistemic rigidity (energy 1, 2026)." | 0.95 |

The `logistics` row is worth the deploy actor's attention for a different reason: it records that
the in-person budget was spent on exactly these two events, which makes *"The two events cost
roughly the same in travel and time"* (errata §2 #4) read as a claim the profile actively argues
against, not merely one no row supports.

## 5. What this changes

- Errata §2 #5: upgraded from single-source to **two-source**. The particulars are invented.
- Errata §2 #1: the mechanism is now identified in the context, not inferred from the prompt —
  the name and the energy values are in `profile` row `portrait-2026-08-25`.
- New open item: **standing filters are not enforced by the gate.** The pipeline sent a QPL
  essay to a reader who had asked not to be sent QPL material.
- Nothing here is applied. `ops_d1_query` is SELECT/WITH only and no write path to `PERSONAL` is
  exposed on this endpoint.

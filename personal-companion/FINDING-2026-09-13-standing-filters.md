# Finding — corpus corroboration, and two standing-filter defects (2026-09-13)

Second-source check on `ERRATA-2026-09-13.md`, plus two defects that check uncovered. Written by
qnfo-ops from read-only queries against `PERSONAL` on 2026-09-13.

## 1. The invented particulars are corroborated as invented

`ERRATA-2026-09-13.md` §2 #5 calls "the dining hall", "about forty people" and "sat in a circle"
invented, on the strength of `PERSONAL.activity` alone. That was a single-source claim. Checked
against `PERSONAL.notes` (490 rows) as a second source:

```
notes matching 'LoF26' OR 'Wolfson' OR 'dining' OR 'QPL' OR 'Spencer-Brown'   -> 0 rows
across all 490 notes:
  content LIKE '%forty%'           -> 0
  content LIKE '%dining hall%'     -> 0
  content LIKE '%sat in a circle%' -> 0
  content LIKE '%circle%'          -> 0
```

The words *forty*, *dining hall* and *circle* appear in **no note at all**. Semantic search over
the `notes` vector index returns nothing relevant either: the top eight matches all score ≈0.657
on unrelated material (*Harmonic Resonance Computer v0.1*), which is what a null result looks like
when the corpus has no relevant content.

**Finding #5 stands, on two independent sources.** The essay's scene is not recalled from any
record the fleet holds.

## 2. All three standing filters — and a structural conflict in the sharpest one

`loadProfile()` feeds every `profile` row with `confidence >= 0.7` into the generation context.
The `standing-filters` facet holds three rows:

| label | conf | kind |
|---|---|---|
| No QPL/CWI topics in personal recommendations | 0.95 | restriction |
| **No physics/science books in reading recommendations** | **0.98** | restriction |
| agent-owned implementation decisions | 1.00 | autonomy grant |

The third is not a restriction. It reads: *"Implementation details (which scripts to schedule,
which syncs to wire, canonicality maintenance, pipeline mechanics) are agent-owned decisions:
audit and answer them 100% autonomously. Never ask the user user-irrelevant questions. Ask only
for genuinely user-gated items: money, personal taste, life go/no-go choices."* It is what
authorises autonomous remediation of the pipeline and reserves only money, taste and life
go/no-go — which is why this audit is in scope and the deploy decision is not.

**The second row is the sharper defect.** Quoted in full:

> "Explicitly does NOT want to read James Gleick (The Information) or Carlo Rovelli (The Order of
> Time), and wants to stay away from physics/science books generally in reading-list
> recommendations. Excludes physics, cosmology, and science-popularization titles regardless of
> prior list annotations."

`worker.js` `TOPICS` — the hardcoded 14-entry rotation that drives anchor fetching — contains:

| topic id | arXiv category | seam |
|---|---|---|
| landauer-biology | cond-mat.stat-mech | the thermodynamics of erasure |
| decoherence-epistemics | quant-ph | quantum decoherence |
| bremermann-economics | quant-ph | Bremermann's limit |
| symmetry-craft | cond-mat.mtrl-sci | crystallographic point groups |
| kuramoto-ensemble | nlin.PS | coupled oscillators |
| entropy-meaning | cs.IT | Shannon entropy |

`fetchArxiv(cat)` pulls preprints from exactly those categories into the anchors, and the topic is
chosen by `pool[(n + off) % pool.length]` — day-of-month modulo 14. A physics topic therefore
recurs on a fixed cadence and will be selected regardless of the filter.

So the conflict is **structural and forward-looking**: a reading-recommendation site, for a reader
who has excluded physics and science-popularization reading at 0.98 confidence, whose topic engine
is a physics-preprint fetcher with a day-modulo rotation that never consults the filter.

No published piece is yet a physics reading recommendation — the realised violation is QPL, on
id=8 (§3) — but the mechanism is aimed squarely at the filter. `loadProfile()` does hand the
filter row to the writer, so the writer is told and writes the topic anyway: **the filter must
bind on topic selection, not on prose generation.**

## 3. New defect — the QPL filter was violated, in one piece

The row *"Do not bring up QPL or CWI summer school topics in personal recommendations or
reminders as of 2026-08-25"* (confidence 0.95) sits inside the `confidence >= 0.7` window, so the
writer received it. The pipeline then published a **2,539-word essay whose opening scene is QPL
2026**, on a site whose masthead reads "Written for one reader."

Confinement, `instr(body_md,'QPL')` across all seven pieces:

| id | 6 | 7 | **8** | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|
| `QPL` position | 0 | 0 | **352** | 0 | 0 | 0 | 0 |

One piece. This is a different class of defect from the grounding errors: the gate checks
quantities and attribution, and has **no check at all** against standing filters. A piece can be
fully grounded, perfectly voiced, and still be something the reader asked not to be sent.

Recommended mechanism (not implemented — it is new, not a patch to an existing check): read the
`standing-filters` facet at compose time and pass it to the gate as a topic/entity deny-list,
blocking on match. The facet is already labelled, so no schema change is needed. For the physics
row the same mechanism applies one level earlier — at `pickTopic()`, before anchors are fetched.

## 4. The voice mechanism, located rather than inferred

Earlier records inferred the name leak from `P_STYLE`. It is in the context directly. Profile row
`facet=identity`, `label=portrait-2026-08-25`, confidence 0.95, opens:

> "**Rowan Brad Quni-Gudzinas (b. 8 Aug 1981)** — autonomy-driven boundary-walker on the seams of
> ultrametric math, laws of form, information physics, computation, consciousness, epistemology.
> […] **Energy: motley crews 5/5 (LoF26), status tournaments 1/5 (QPL26)**; small conversation
> venues, demos over slides, cheap/hybrid/online, epistemically open rooms. […]"

The published text reads *"Rowan rated it 5 out of 5 for felt energy."* That is a near-verbatim
rendering of a profile row the writer was handed — name, values and all. So the name does not leak
from `P_STYLE` alone: it is present in a high-confidence profile row that `loadProfile()` passes
through, and the prompt forbids model self-reference without forbidding the reader's name.

## 5. Venue contamination risk, confirmed

`VOICE-ADDENDUM-2026-09-12.md` flagged that "Wolfson College, Cambridge" might have contaminated
the LoF26 row from the LoF28 entry. Both are real:

| row | value |
|---|---|
| `activity` 2026-08-10 | LoF26 — Laws of Form conference, Cambridge (10-14 Aug), venue "Wolfson College, Cambridge" |
| `profile` `facet=venues`, `label=Laws of Form tribe` | "LoF28: 7-11 Aug 2028, Wolfson College, Cambridge" |

Two Laws of Form events at the same venue, two years apart. The venue string in the essay is
anchored either way, so this does not change the errata — but any future check that treats
`profile.venues` as an anchor set would conflate the two.

## 6. Adjacent profile rows, for the record

| facet | label | statement (excerpt) | conf |
|---|---|---|---|
| dislikes | status-currency tournaments | "QPL 2026 logged energy 1 (drained); TSC (~3k) and CCS (~1k+) avoided." | 0.95 |
| hobbies | conference circuit as tribe-seeking | "LoF26 Cambridge energized (5/5), QPL26 drained (1/5)" | 0.9 |
| likes | play and performance | "LoF26-style performance sessions energized him." | 0.9 |
| logistics | energy budget H2 2026 spent | "H2 2026 in-person budget is SPENT (LoF26 + QPL26)." | 0.95 |
| venues | QPL | "QPL drains him — correctness-as-status currency, epistemic rigidity (energy 1, 2026)." | 0.95 |

The `logistics` row matters for a second reason: it records that the in-person budget was spent on
exactly these two events, which makes *"The two events cost roughly the same in travel and time"*
(errata §2 #4) read as a claim the profile actively argues against, not merely one no row supports.

## 7. What this changes

- Errata §2 #5: upgraded from single-source to **two-source**. The particulars are invented.
- Errata §2 #1: the mechanism is now identified in the context rather than inferred from the prompt.
- **New open item A:** standing filters are unenforced by the gate — the QPL essay is the
  realised instance, confined to id=8.
- **New open item B:** the `TOPICS` rotation conflicts structurally with the 0.98-confidence
  physics exclusion, and will select physics topics on a day-modulo cadence.
- Nothing here is applied. `ops_d1_query` is SELECT/WITH only and no write path to `PERSONAL` is
  exposed on this endpoint.

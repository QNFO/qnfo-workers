# Apply order, revision 2 — QRI-4 supersedes QRI-2's body steps (2026-09-13)

Author: qnfo-ops. **Supersedes `sql/APPLY-ORDER-2026-09-13.md`**, which was written before
`sql/QRI-4-body-corrections-verified-2026-09-13.sql` existed. It changes no SQL. Read this before
running anything in this directory.

## 1. The order is QRI-1 → QRI-4 → QRI-3

| step | file | what it does |
|---|---|---|
| 1 | `sql/QRI-1-corrections-2026-09-13.sql` | tags `quality_json` (`gate_reason`, `errata`, `errata_at`), reclassifies feedback provenance |
| 2 | `sql/QRI-4-body-corrections-verified-2026-09-13.sql` | corrects `body_md` (the reader-visible text) + recomputes `word_count` |
| 3 | `sql/QRI-3-feedback-provenance-2026-09-13.sql` | the provenance partition, if QRI-1's version was not applied |

**Do not run `QRI-2`.** Its steps 1–4 are superseded by QRI-4, which applies the same three
replacement spans with one correction: it retains "a status tournament", a phrase the record supports
(`events.evt-qpl26.notes` = "motive currency = status"; `profile` `dislikes.status-venues`, conf 0.95)
and which QRI-2 deleted. `QRI-1b` must not be run at all — its own header says so.

## 2. Why QRI-1 still goes first — and the rule now generalises

`APPLY-ORDER-2026-09-13.md` documented that `QRI-2` step 4 sets `gate = 'blocked-grounding'`
**unconditionally**, while `QRI-1` step 1 is **guarded**:

```sql
WHERE id = 8 AND COALESCE(json_extract(quality_json, '$.gate'), '') <> 'blocked-grounding'
```

Run the unconditional file first and QRI-1's guard evaluates
`'blocked-grounding' <> 'blocked-grounding'` → false, so the whole withdrawal record — `gate_reason`,
`errata`, `errata_at` — is skipped **without error**. Two successful scripts, one audit row that never
received its errata.

That hazard was written about QRI-2. **It applies identically to QRI-4**, whose step 4 also sets
`gate = 'blocked-grounding'` unconditionally. The general rule is therefore:

> Any file that sets `$.gate = 'blocked-grounding'` unconditionally must run **after**
> `QRI-1` step 1. Today that means QRI-2 and QRI-4.

Guard truth table (from APPLY-ORDER, unchanged): current `$.gate` = `'passed'` (the live value on all
7 pieces) → QRI-1 fires; `'blocked-grounding'` → it does not; absent/NULL → it fires.

## 3. NEW HAZARD — running QRI-2 and then QRI-4 corrupts `word_count` by 8

This is the reason this revision exists. If an operator follows the old apply order (QRI-1 → QRI-2) and
then also applies QRI-4:

1. QRI-2 replaces span B with its **37-word** text and writes `word_count = 2503`.
2. QRI-4 step 2 is guarded by `instr(body_md,'Five days later') > 0` → the span is already gone, so the
   statement **no-ops silently**.
3. QRI-4 step 3 is guarded by `instr(body_md,'QPL') = 0 AND instr(body_md,'dining hall') = 0` → both
   true → it **fires**, writing `word_count = 2511`.

Result: QRI-2's 2503-word body carrying a 2511-word count. An 8-word lie in the one column whose whole
purpose is to be exact, produced by two scripts that each reported success. The guards do not catch it
because they test *tokens that are absent either way*, not *which replacement text was applied*.

**Decision rule if QRI-2 has already run:**

- To get QRI-4's text: restore the original spans first (they are preserved verbatim in
  `quality_json.$.qri2_before_s1/s2` and `$.qri4_before_s1/s2`), then run QRI-4 in full.
- To keep QRI-2's text: do **not** run QRI-4 step 3. Set `word_count = 2503` (verified correct for
  QRI-2's text) and run only QRI-4 step 4's tagging.
- Never mix: one body text, one word count, and the count must be the one derived for *that* text.

## 4. Verified figures — take these, not the earlier ones

| applied text | `word_count` | `length(body_md)` | status |
|---|---|---|---|
| unmodified (live now) | 2539 | 15517 | verified live 2026-09-13 |
| QRI-2's text (no "status tournament") | **2503** | **15276** | verified — QRI-2's figures are right |
| QRI-3's stated pair | 2504 | 15278 | **FALSIFIED** by 1 word / 2 chars |
| **QRI-4's text (this directory's recommendation)** | **2511** | **15323** | verified, two counters agreeing |

Method: worker.js's own `wordCount()` algorithm transcribed and run alongside a `/\S+/g` counter, on
spans verified boundary-safe (each begins and ends on non-whitespace, so no token merges across a
replacement). Per-span deltas: A 49→31 w, B 54→45 w (QRI-4) / 54→37 w (QRI-2), C 4→3 w.

## 5. Pre-flight before any file

```
SELECT length(body_md) AS len, word_count,
       instr(body_md,'Five days later') AS five, instr(body_md,'QPL') AS qpl
  FROM companion_pieces WHERE id = 8;
```

Expected on an untouched row: `len 15517, word_count 2539, five 332, qpl 352`. Any other value means a
file has already run — reconcile against §4 before continuing, and check `quality_json` for
`$.qri2_at` / `$.qri4_at` to learn which.

## 6. What none of these files do

They correct **one row**. **None of them prevents the next piece from repeating the defect.** That
needs a deploy of the five-module gate bundle with `runGate()` wired at the insert site, which qnfo-ops
cannot do — no deploy route, and `ops_d1_query` is SELECT/WITH-only across every bound D1.

Still open, unchanged: the physics/science **category** filter (conf 0.98) has no enforcement;
`lib/filters.js` covers only the entity deny-list. Whether that exclusion should constrain topic
selection at all is an intent decision reserved to the reader, not an implementation detail.

Also open and newly relevant: the `unverifiedNames()` validator stalled the 06:01–06:06Z publication
cycle outright (three attempts rejected on conceptual vocabulary, then `failed — no piece survived the
gate`). Correcting id=8 does not touch that.

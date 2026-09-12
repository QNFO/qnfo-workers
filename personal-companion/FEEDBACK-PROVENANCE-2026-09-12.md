# personal-companion — feedback provenance defect (2026-09-12)

Author: qnfo-ops (read-only D1 inspection; repo write only). Status: **evidence + spec, NOT deployed.**
Companion to `VOICE-ADDENDUM-2026-09-12.md` and `GROUNDING-PATCH-2026-09-12.md`.
Filed on the default branch because this endpoint has no branch-creation tool and
`github_file_write` requires an existing branch (`GitHub 404: Branch ... not found`).

## Finding: 42 of 45 "reader reactions" are machine-written

`PERSONAL.companion_feedback` — 45 rows, 8 distinct slugs:

| state | rows |
|---|---|
| slug absent from `companion_pieces` (orphan) | **42** |
| slug present (live) | 3 — id 43 serial `06c5a8cc` "good"; id 44 essay `3c148bcc` "good"; id 45 essay `3bf32c8a` "flat" |

Inter-arrival analysis over the stored `created_at` values (run_code, 2026-09-12):

| ids | n | span | rate |
|---|---|---|---|
| 1–6 | 6 | 132 ms | 0.026 s per signal |
| 7–12 | 6 | 51 ms | 0.010 s per signal |
| 13–42 | 30 | 724 ms | **41.4 signals per second** |
| 43–45 | 3 | 59 min 11 s | minutes apart |

42 of 45 signals were written inside three sub-second bursts totalling 907 ms. The three
signals on live pieces arrive minutes apart. No human reading 2 400–2 500-word essays emits
30 verdicts in 724 ms: the burst rows are a machine writer. The isolated 43–45 spacing is
consistent with a human on the live page.

The triples are not a fixed cycle — six distinct good/no/flat triples across the seven 3-row
windows — so the machine source is not a constant replay either. Consistent with randomised
or model-generated signals. **Source not identified:** no code path for the signal writer was
readable (production v1.1.0 source is not in this repo), and the site exposes no public
feedback endpoint (`/api/feedback` -> HTTP 404), so the writer is internal.

## Why it matters

`loadContinuity()` reads the newest 12 rows by `id DESC` and emits them to the writer under the
heading **"HOW HE REACTED (this is the strongest signal you have)"**.

Newest 12 = ids 34–45 → **9 machine/orphan rows + 3 live rows**. Three quarters of the block
labelled as the reader's strongest reaction is not the reader. (It was 10 of 12 before id 45
arrived at 13:12:58.467Z.)

## Recommended change (not applied)

1. **Join strictly.** Replace the `LEFT JOIN` (which falls back to rendering raw slugs) with
   `JOIN companion_pieces p ON p.slug = f.slug` — an orphan signal is not evidence about a
   piece that exists.
2. **Rate-limit.** Discard or quarantine signals arriving faster than humanly plausible for the
   piece's `word_count` (e.g. within 30 s of publish, or more than one per 10 s).
3. **Record provenance.** Add `source` to `companion_feedback` (`human` | `probe` | `unknown`)
   and label the continuity block from it. Do not print "HE REACTED" over machine rows.
4. Until 1–3 hold, do not describe that block as the strongest signal.

## Supporting observation

The piece carrying the factual errors (id 8, "The Understimulated Interval") received "flat"
(id 45, 13:12:58.467Z) — after the erroneous lede was published. The only gate-accepted piece
(id 9, "The Walker's Argument", `verdict: accept`) received "good".

## Related exposure (same surface, same day)

`GET https://reading.q08.org/api/pieces` -> HTTP 200, no key, returning all 4 pieces **including
full `anchor_json` and `quality_json`** (the internal topic/bridge scaffolding and the critic's
verdict text). The masthead still reads "Private."; `authorized()` fails open when
`COMPANION_KEY` is unset.

## Reproduce (read-only)

```
SELECT f.id, f.slug, f.signal, f.created_at,
       CASE WHEN p.slug IS NULL THEN 'orphan' ELSE 'live' END
FROM companion_feedback f LEFT JOIN companion_pieces p ON p.slug = f.slug
ORDER BY f.id;
```

Then compute consecutive-timestamp gaps over `created_at`; bursts are separated by > 5 s.

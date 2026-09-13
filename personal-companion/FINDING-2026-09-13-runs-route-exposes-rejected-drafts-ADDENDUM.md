# Finding addendum — enumerated scope of the runs-route exposure, and a gate behaviour the repo does not describe (2026-09-13)

Addendum to `FINDING-2026-09-13-runs-route-exposes-rejected-drafts.md`. §8 of that finding said the
scope had not been enumerated: "I did not enumerate how far back the `raw:` segments go, nor how many
runs carry them." This addendum closes that gap from a second read of the same public route, and
records one mechanism the repo's README does not describe.

## 1. The scope, counted rather than estimated

`GET /api/runs` returns the run log without a key. Reading it in full:

| rows carrying draft text in `detail` | 3 |
|---|---|
| their ids | 436, 439, 442 |
| their timestamps | all 2026-09-13T06:03–06:06Z |
| how many distinct drafts they represent | **one** (three compose attempts at the same piece) |
| rows carrying `critique argument=N :: …` and no draft text | 407, 420, 424 (2026-09-12) |

So the draft-text persistence is **new as of 2026-09-13**. The 2026-09-12 rejections carry a critique
sentence instead, with no `raw:` segment. The exposure is narrow — one draft, truncated to roughly
330 characters, in three duplicate rows — and it is the most recent behaviour rather than a standing
one.

## 2. The reader's name appears in more rows than the draft-text ones

Counted across the same log, the reader's name occurs in the `detail` field of **four** rows:

| row | where the name appears |
|---|---|
| 436, 439, 442 | in the persisted draft: the document title, and the body |
| 420 | inside a critique sentence — `… matched to Rowan's 'audits' …` |

Row 420 is a `rejected` status from 2026-09-12, so this is not a consequence of the new draft
persistence. It means the exposure is not confined to the `raw:` segments, and a fix aimed only at
those would leave the critique path open.

## 3. A gate behaviour the README does not describe

The README's quality-gate section states that `verdict: "reject"` is not a block, and that only
measured violations block. The live log shows a rejection reason that is neither: rows 407, 420 and
424 carry `critique argument=2` and `critique argument=4`, and the run sequence for the 04:01Z cycle
shows the mechanism end to end.

```
417 compose attempt 1
418 composed 4194
419 critique
420 rejected  critique argument=2 ::
421 compose attempt 2
422 composed 4680
423 critique
424 rejected  critique argument=2 ::
425 compose attempt 3
426 composed 4944
427 critique
428 ok        2026-09-13-notes-ae043d7af833c67b
```

Two mechanisms are visible here that are not in the repo copy: a **dimension-score threshold** blocks
publication (`argument=2` twice, `argument=4` once), and the worker **retries composition up to three
times**, publishing on the first attempt that clears the critique. The README's statement about the
verdict is not contradicted — a dimension score is not a verdict — but the policy it describes is
incomplete, and it is incomplete in the direction that matters, because the blocking rule lives in
the unreadable v1.1.0 source.

## 4. The retry loop cannot escape a deterministic failure

The 06:01Z cycle ran the same three-attempt loop and failed all three times with an identical cause:

| row | status | detail |
|---|---|---|
| 436 | rejected | `unverified names: Notation Systems, Cognitive Scaffolds, Interdependent Computation, Playful Convergence, Double Fugue, Live Counterpoint` |
| 439 | rejected | identical |
| 442 | rejected | identical |
| 443 | failed | `no piece survived the gate` |

324 seconds, three compositions, one cause. Because the failure is a property of the topic's anchor
set and the writer's heading convention rather than of sampling, retrying cannot help: each attempt
regenerates the same Title Case headings and trips the same rule. The retry budget is spent on a
failure that is deterministic in the parameters the loop does not vary.

## 5. Write routes

Probed read-only, both without a key:

| route | result |
|---|---|
| `GET /admin` | HTTP 404 |
| `GET /api/ingest` | HTTP 404 |

I did not probe `GET /api/publish`. Its name asserts a side effect, the deployed source is not
readable, and I cannot confirm from here that a `GET` to it is inert. Declining to probe a route
whose name says "publish" is the same judgement as declining to probe `GET /run`.

## 6. What is not claimed

- No fix applied; `ops_d1_query` is SELECT/WITH only and there is no write path to `PERSONAL`.
- I read one page of the runs log. I did not determine whether the route paginates, so "3 rows" is
  the count in the response I received, not necessarily the count in the table.
- The dimension threshold in §3 is inferred from the rejection strings. The threshold value and the
  dimensions it covers are not stated anywhere I can read, and I did not test it.
- The provenance gap is unchanged: §3 and §4 are further behavioural evidence that the deployed
  worker differs from the repo copy, not an identification of the difference.

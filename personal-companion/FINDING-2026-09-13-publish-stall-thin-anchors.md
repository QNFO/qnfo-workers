# FINDING — the 06:01Z publish stall: thin anchors, and a retry loop that cannot converge

Author: qnfo-ops, 2026-09-13. All figures are live `PERSONAL.companion_runs` / `companion_pieces` reads
from this session. This supersedes the one-line "prompt/validator mismatch" characterisation in
`ERRATA-2-AND-FINDINGS-2026-09-13.md` §"The 06:01–06:06Z cycle published nothing", which was correct
but shallow.

## 1. The cycle, in full (ids 429–443)

```
06:00:54.790  schema ok
06:00:55.841  topic
06:00:58.267  context 7000/3947/3558
06:01:12.178  anchorKinds concept,concept          <-- TWO anchors, both concepts
06:01:12.518  anchors 2                            <-- vs "anchors 5" at 04:00
06:01:12.870  compose attempt 1
06:03:13.170  composed 3516                        <-- A
06:03:13.514  rejected  validate: unverified names: Notation Systems, Cognitive Scaffolds,
                        Interdependent Computation, Playful Convergence, Double Fugue, Live Counterpoint
06:03:13.867  compose attempt 2
06:04:44.974  composed 3516                        <-- A again, same length
06:04:45.321  rejected  <same six names, same order>
06:04:45.672  compose attempt 3
06:06:16.675  composed 3516                        <-- A a third time
06:06:17.081  rejected  <same six names, same order>
06:06:17.466  failed    no piece survived the gate      (324,411 ms total)
```

## 2. Why this is a different failure from the one recorded

`ERRATA-2` framed it as a prompt/validator mismatch: the writer is asked to name concepts and refused
for naming them. That is true and it is the proximate cause. Two things were missed.

### 2.1 The retry loop cannot converge — the three attempts appear to be the same text

Three attempts, three `composed 3516`, three rejections listing **the same six invented names in the
same order**. For comparison, the cycle that *succeeded* two hours earlier:

| cycle | composed lengths | outcome |
|---|---|---|
| 04:00:45 (ids 412–428) | **4194, 4680, 4944** — three different | `ok` on attempt 3 |
| 06:00:54 (ids 429–443) | **3516, 3516, 3516** — identical | `failed` |

When the loop normally produces different text each attempt, it eventually satisfies the validator. When
it produces the same text each attempt, the retry is structurally pointless: it burns 324 s and fails.
The retry budget assumes variance that did not exist here.

**Not proven:** whether the identical length means the compose call returned a *cached/replayed*
response (the same signature `RC-1` found in `ai_gateway_failures`, where byte-identical buckets recur
across sweeps) or the model was simply deterministic for this input. Both produce this signature. I did
not read the compose path's source — it is in the region past the 32,768-char read ceiling. Stated as a
suspicion with the discriminating test named: capture the full body of two consecutive rejected
attempts and compare them byte-for-byte.

### 2.2 The root cause is upstream of the writer: the anchor set was too thin to write from

The rejected names are *conceptual vocabulary* — "Notation Systems", "Interdependent Computation",
"Playful Convergence", "Double Fugue", "Live Counterpoint". A writer with nothing concrete to stand on
invents capitalised concepts; the validator's two-capitalised-word rule then fires on exactly those.
That is the chain, and it starts here:

| | 04:00 cycle (succeeded) | 06:01 cycle (failed) |
|---|---|---|
| `anchors` | **5** | **2** |
| `anchorKinds` | `concept,concept,concept,concept,concept` | `concept,concept` |

**Two anchors, both Wikipedia concepts.** No paper, no venue, no place, no artefact — nothing with a
name the validator would recognise as verified. The writer had to generate its own nouns.

So the failure is not that the validator is too strict. **It is that the pipeline composes when it has
insufficient material to compose from.** The validator is the messenger.

## 3. The remediation this implies — and what NOT to do

**Do not weaken `unverifiedNames()`.** Its rule is the only thing that would have caught the invented
particulars in the other direction, and the same validator's blind spot (single-token names) is
precisely why `companion_pieces.id=8` shipped naming its reader. Loosening it to make the 06:01 cycle
pass would re-open the defect class this whole audit is about.

The fix belongs one level earlier, at `pickTopic()` / the anchor-fetch step, before any compose call:

1. **Require a minimum anchor set** — a count floor (the successful cycles ran 5) *and* a kind floor
   (at least one non-`concept` anchor: a paper, a venue, a place, an artefact). A set of N concept
   anchors only is a signal that the topic's fetch returned thin results, not that the topic is good.
2. **On a thin set, rotate the topic instead of composing.** `pickTopic()` already has a 14-topic pool
   and a rotation key; falling through to the next unused topic costs one Wikipedia fetch and saves the
   whole 324 s cycle.
3. **Bound the retry loop by variance, not by count.** Three attempts is the right budget only if the
   attempts differ. If attempt *n+1* is byte-identical to attempt *n*, stop — a fourth attempt would
   have failed the same way.
4. **Surface it.** A cycle that publishes nothing should appear in the backlog. It does not: this
   failure left no `agent_issues` row and no `issue_ledger` row I could find. The pipeline can fail
   silently every two hours and nothing escalates.

## 4. Timing — the pipeline is NOT stalled

`telemetry_report` clock at read time: **2026-09-13T06:54:55.402Z**. Last run **06:06:17.466Z**.
Observed cadence is every 2 h on the hour (04:00:45, 06:00:54). The next attempt is due ~**08:00Z**.

So "no runs since 06:06" is **expected, not a stall** — I am reporting a failed cycle, not a dead
pipeline. Any future check should compare against the 2 h cadence before calling it stalled. (This is
the same class of error the earlier session corrected about the deploy cadence.)

## 5. Hygiene note on my own queries

While making these reads, one of my queries returned `runs_total: 1` for a table holding 443 rows. That
was **my bug, not a data anomaly**: `SELECT COUNT(*) AS runs_total, (subqueries…)` with no `FROM`
clause counts the implicit single row, not `companion_runs`. Re-run with `FROM companion_runs`, it
returns `443 / 11 ok / last_run 2026-09-13T06:06:17.466Z`. Recording it because an unlabelled anomaly
in a report is exactly the kind of artifact this audit has been correcting, and because the correct
count matters to §2's comparison.

## 6. What this does not change

The reader-visible defect is still live and still unapplied: `companion_pieces.id=8`
(`2026-09-12-essay-3bf32c8a197d2196`) serves "Five days later… cost roughly the same in travel and
time" verbatim, and `QRI-4` — which corrects it — is staged, verified, and not applied. Nothing in this
finding blocks that; it is a second, independent defect in the same pipeline.

# FINDING — 15 threads queued for public posting on @qnfo.bsky.social are indistinguishable from unverified

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
**Highest-consequence item found this session: this is a public-facing publication question, not an
internal metric.** Worker: `qnfo-social` (census member, deployable). All figures live
`ops_d1_query` returns.

---

## 1. The state

```
status      n    notes IS NULL
posted     23         19
queued     15         15
draft       1          0
```

- **All 15 queued rows have `notes IS NULL`.**
- **19 of 23 already-posted rows also have `notes IS NULL`.**
- `posts_since_0913` = **0**. Last post: **id 25, posted 2026-09-12 14:30:45**.

The 15 queued rows, by `created_at`: ids 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 39, 40, 41 —
spanning 2026-09-05 06:02:19 to 2026-09-13 06:02:06.

## 2. Why `notes IS NULL` is the defect, not a proxy for it

Under the deployed v0.5.2-checker-heal, `checkThread` returning `[]` maps to
`issues.length === 0 ? 'queued' : 'draft'`. **A clean check and a failed check both produce
`status='queued'` with no `notes`.** The staged patch states this precisely:

> 15 threads sit at `status='queued'` AND `notes IS NULL`, which under v0.5.2 is indistinguishable
> from "checked and faithful".

So I **cannot** claim all 15 are unverified. The defensible claim is the one that matters: **none of
the 15 can be distinguished from unverified**, and there is no record by which to tell them apart.

Evidence that the fail-open path really produced queued+NULL rows: 15 `alerts` rows with
`source='checker' level='warn'`, message *"checker returned empty output; **posting without
fact-check (fail-open)**"* or *"checker output unusable after retry; **posting without fact-check
(fail-open)**"*, spanning 2026-09-05 06:01:26 → **2026-09-13 06:02:05**. Ten of these pair with a
`social_threads` row to the second (documented in the staged patch).

**Consequence already realised:** id 25 (created 09-05 06:01:27, fail-open warn at 06:01:26) was
**published 2026-09-12 14:30:45** — unverified content on a public account, and 19 of 23 posted rows
share that shape.

## 3. The poster works the queue in order — and has gone silent

`posted_at` for the recent rows, descending:

| id | created_at | posted_at |
|---|---|---|
| 25 | 2026-09-05 06:01:27 | **2026-09-12 14:30:45** |
| 24 | 2026-09-04 06:03:48 | 2026-09-11 14:30:36 |
| 23 | 2026-09-04 06:02:20 | 2026-09-11 06:01:29 |
| 22 | 2026-09-03 06:02:04 | 2026-09-10 14:30:40 |
| 21 | 2026-09-03 06:01:31 | 2026-09-09 14:30:06 |

Roughly 1–2 posts/day, ascending through the queue. The next in order is **id 26
(2026-09-05 06:02:19)** — the oldest unverified row. It has not posted.

**No post has occurred since 2026-09-12 14:30:45 — about 23 hours**, and the 09-13 06:01 slot passed
without one. The stoppage **predates** the v0.5.3 deploy (§4), so v0.5.3 is not the cause.

**Two readings, and I cannot separate them:** (a) the poster is stalled — a lull, no publication
harm; (b) the poster is holding unverified rows. Under (a), **a resumption publishes id 26 and then
the rest**, because nothing in the deployed build distinguishes them.

## 4. v0.5.3-failclosed IS now deployed — and it does not fix these 15

The staged patch asserted the live build was `0.5.2-checker-heal` and that v0.5.3 was
"COMMITTED BUT NOT DEPLOYED", concluding *"it is a deploy problem, and this endpoint has no deploy
route."*

**That conclusion is false, and the deploy has since happened.** `service_discover qnfo-social` →
version **0.5.3**; `fleet_drift_report` shows `0.5.2-checker-heal` → **`0.5.3-failclosed`** converging
at the 08:02:39 scan. See `FINDING-2026-09-13-deploy-is-census-gated.md`.

**But v0.5.3 only changes what happens to *future* failed checks** (they become `status='draft'` with
notes). It does not reclassify the 15 rows already sitting in `queued`. The residue is a data
problem, not a code problem.

The single `status='draft'` row (id 38, created 2026-09-09 06:02:26) carries a real finding —
`[{"post":3,"issue":"Claims that error correction must account for the time/path dependence, which is
not stated or supported by the paper's title/abstract."}]` — which is what a *working* check looks
like. It predates the deploy, so it is not evidence of v0.5.3; it is evidence the draft path works.

## 5. The remediation, and why I could not run it

The conservative fix is one statement — quarantine rather than publish, and never delete (the rows are
the only record of what was composed):

```sql
UPDATE social_threads SET status='draft'
 WHERE status='queued' AND notes IS NULL;
```

**`ops_d1_query` is SELECT/WITH only — mutation keywords are rejected anywhere in the statement. No
tool bound to this endpoint writes `social_threads`.** I verified the need; I cannot execute it. This
needs a D1 write path or a human.

After quarantining, each row should be re-verified and re-approved individually.

**Note the second trap:** the staged `qnfo-social/PATCH-2026-09-13-checker-idrace.mjs`
(sha `d8ca3b5f`) is **inert by path** — `qnfo-social` *is* a census member, and the deployer reads
`worker.js` only, never `PATCH-*.mjs`. Its CHECKER-IDRACE-1 fix has never shipped and cannot ship as
a patch file. For a census worker the only shipping path is a `worker.js` write; for a non-census
worker no commit ships at all.

## 6. Limits

- **I did not read `qnfo-social/worker.js` (21,753 B) this turn**, so I could not confirm whether the
  poster gates on `notes`. §3's "a resumption publishes the rest" is inferred from the observed
  ascending queue order plus the patch's description of the deployed logic — not from the poster's
  own code.
- **The cause of the 23-hour silence is undetermined.** I did not read cron state or the worker's
  logs for the 09-13 06:01 slot.
- **`notes IS NULL` does not mean "unverified"** — per §2 it means "indistinguishable". A subset of
  the 15 may be clean. Quarantining all 15 is the conservative choice, not a claim that all 15 are bad.
- **I did not verify the 10 warn↔thread pairings myself**; they are quoted from the staged patch.
  My own independent measurement is the 15 warns and the 15 queued rows, which agree in count but are
  not the same pairing.
- **`posted_at IS NOT NULL` = 39 while `status='posted'` = 23**, so 16 rows have a posted_at under a
  different status. I did not characterise those 16; they could include further published content.
- **No live breach claim.** Nothing posted in the last ~23 hours. This is a forward-looking risk plus
  a realised past one (19 of 23 posted rows unverified).

# URGENT — the poster cron will publish an unverified thread to @qnfo.bsky.social at 14:30Z today

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
**Time-boxed. The posting cron is `30 14 * * *` = 14:30 UTC.**
Supersedes §3 of `FINDING-2026-09-13-unverified-threads-queued-for-public-posting.md`, which could
not determine whether a resumption would publish. **It will.**

**REV 3 — CORRECTED REMEDIATION. Read §5 before running anything.** REV 2's SQL was **missing a
required bound and is harmful as written.** §5 now carries the corrected statement and the reason.
**REV 2:** §2 upgraded from inference to a confirmed pairing. **REV 1:** initial.

---

## 1. The poster does not gate on `notes` — verified verbatim

`qnfo-social/worker.js` (sha `c6dc5bd4`, 21,753 B), `scheduled()`:

```js
export default {
  async scheduled(event, env) {
    if (event.cron === '0 7 * * *') { await alertDigest(env); return; }
    if (event.cron === '0 6 * * *') { await autoScan(env); return; }
    const row = await env.DB.prepare("SELECT * FROM social_threads WHERE status='queued' ORDER BY id ASC LIMIT 1").first();
    if (!row) return;
    ...
    const uris = await postThread(s, posts);
    await env.DB.prepare("UPDATE social_threads SET status='posted', posted_at=datetime('now'), error=NULL WHERE id=?").bind(row.id).run();
```

`SELECT * ... WHERE status='queued' ORDER BY id ASC LIMIT 1`. **`notes` is never consulted.** The
oldest queued row posts, whatever its verification state.

## 2. The row that will post is a CONFIRMED fail-open thread

`SELECT * FROM social_threads WHERE status='queued' ORDER BY id ASC LIMIT 1` → **id 26**,
slug `scan-zenodo.22290108`, created **2026-09-05 06:02:19**, `notes IS NULL`.

Joining `alerts` (`source='checker'`) to `social_threads` on **exact `created_at` equality**:

| warn_ts | thread id | thread status | notes IS NULL |
|---|---|---|---|
| 2026-09-05 06:02:19 | **26** | queued | 1 |
| 2026-09-06 06:00:35 | **27** | queued | 1 |
| 2026-09-06 06:01:01 | **28** | queued | 1 |
| 2026-09-06 06:01:46 | **29** | queued | 1 |
| 2026-09-06 06:02:26 | **30** | queued | 1 |
| 2026-09-06 06:02:49 | **31** | queued | 1 |
| 2026-09-07 06:00:43 | **32** | queued | 1 |
| 2026-09-07 06:01:12 | **33** | queued | 1 |
| 2026-09-07 06:02:57 | **35** | queued | 1 |
| 2026-09-05 06:01:26 | *(id 25, created 06:01:27 — ±1 s)* | **posted 09-12 14:30:45** | 1 |

**Nine of the fifteen queued rows pair to a fail-open warn to the exact second, and all nine are
`queued` with `notes IS NULL`. id 26 — the next to publish — is one of them.** With ±1 s tolerance
the tenth pairing is id 25, which was **already published** on 2026-09-12 14:30:45.

**What will publish** (id 26, `posts` head): *"Can a deterministic relaxation of a probability fluid
explain quantum measurement? A new pre-registered simulation says no for the strongest available
two-level version: it cannot reproduce the Born rule."* / *"The abstract reports a two-level system
unitarily evolved, then subject to three deterministic relaxation dynamics toward the eigenbasis.
With 1e5 shots per state, every configuration failed:"*

The content reads plausibly. **The defect is that it was never verified, not that it is known
false.** Nine such threads are queued.

## 3. v0.5.3 does NOT protect them — and it inverts what `notes IS NULL` means

v0.5.3's fail-closed change is here, in `autoScan` and `/compose`:

```js
const status = issues && issues.length === 0 ? 'queued' : 'draft';
const notes  = issues && issues.length ? JSON.stringify(issues)
             : (issues === null ? JSON.stringify([{ post: 0, issue: 'checker unavailable - unverified, held as draft' }])
             : null);
```

Read the `notes` expression carefully, because it is the whole trap:

| `checkThread` result | meaning | status | notes |
|---|---|---|---|
| `[]` | checked, faithful | **queued** | **null** |
| `null` | checker unavailable | draft | unverified marker |
| `[{post,issue}]` | problems found | draft | issues JSON |

**Under v0.5.3, `status='queued' AND notes IS NULL` means CHECKED AND CLEAN.** It is the *correct*
shape for a verified thread.

Under **v0.5.2** — which created all 15 legacy rows — `checkThread` returned `[]` on *both* a clean
check *and* a parse failure. So for those rows the same shape means **either** clean **or** fail-open.
**The ambiguity is a v0.5.2 artifact. It does not exist for rows created after v0.5.3.**

This is why §2's timestamp pairing is the load-bearing evidence, and why §5 must be bounded.

## 4. A deploy cannot land in time

`fleet_drift_report` scan times today: 07:04, 08:02, 09:02, 10:02, 11:02, 12:02, 13:03 — hourly at
about `:02`. The next scan is **~15:02Z**, after the 14:30 post. Even though `qnfo-social` is a census
member and a `worker.js` write does deploy, a fix committed now would not be live in time.

## 5. THE CORRECTED REMEDIATION — do not run the REV 2 version

**REV 2 published this, and it is harmful as written:**

```sql
-- WRONG - do not run
UPDATE social_threads SET status='draft' WHERE status='queued' AND notes IS NULL;
```

Per §3, a **clean** thread created under v0.5.3 is also `queued` with `notes IS NULL`. Run at any
time after the deploy, this statement quarantines verified threads too, and — because the poster only
ever takes `status='queued'` — **it would silently stop all posting, permanently and with no error.**

**The corrected statement:**

```sql
UPDATE social_threads SET status='draft'
 WHERE status='queued' AND notes IS NULL
   AND created_at < '2026-09-13 08:02:00';
```

The bound is what makes it safe. `2026-09-13 08:02:00` is the v0.5.3 deploy (the drift scan that
converged `0.5.2-checker-heal → 0.5.3-failclosed`); everything before it was written by the ambiguous
v0.5.2 path. Verified: **`SELECT COUNT(*) ... WHERE status='queued' AND notes IS NULL AND created_at
>= '2026-09-13 08:02:00'` = 0**, so no post-deploy row is affected either way. All 15 queued rows
have `created_at <= 2026-09-13 06:02:06` and are captured by the bound.

Quarantine, do not delete: the rows are the only record of what was composed. After quarantining,
re-verify and `/approve` individually.

**`ops_d1_query` is SELECT/WITH only; no tool bound to this endpoint writes `social_threads`.** No
endpoint on `qnfo-social` quarantines either — the route list is
`/post /thread /threads /queue /compose /approve /broadcast /scan /alerts /digest`, and `/approve`
moves `draft → queued`, the opposite direction. This needs a D1 write path or a human.

## 6. Two further defects in the same handler

**6a. `alertDigest` is dead code.** The branch keys on `event.cron === '0 7 * * *'`, but
`qnfo-social/wrangler.toml` (sha `db1c8093`) declares only:

```toml
[triggers]
crons = ["30 14 * * *", "0 6 * * *"]
```

`0 7 * * *` is never scheduled, so **`alertDigest` never runs from cron** and `alerts.digested` is
never advanced by this worker.

**6b. The fall-through is a posting trap.** Any cron not matched by `0 6` or `0 7` falls through to
the **poster**. Adding an entry to `crons` without adding a matching branch does not merely no-op —
**it publishes the oldest queued thread.** The current `30 14 * * *` entry is exactly this.

**6c. Schedule evidence vs. declaration.** Post time-of-day over all 20 rows with `posted_at`:
**14:30 → 9, 14:31 → 1** (10 in the 14:30 slot), 16:00 → 4, 09:00 → 4, 06:01 → 1, 18:11 → 1. 14:30 is
dominant and the last two posts are 2026-09-12 14:30:45 and 2026-09-11 14:30:36 — supporting the
declared cron. But **id 23 posted at 06:01:29**, and the declared `0 6 * * *` branch runs `autoScan`,
which drafts and does not post. The 16:00 and 09:00 posts have no matching branch at all. **So the
deployed schedule likely differs from `wrangler.toml`.**

## 7. Limits

- **I have not observed the 14:30 post.** The clock advanced ~30 s per turn across this session, so
  it could not be reached. This is a prediction from the cron declaration, the unmatched-branch
  fall-through, the 14:30 slot dominance, and the 09-12 14:30:45 post of id 25. **§1's gate-absence
  and §2's pairing do not depend on the prediction.**
- **I could not read the deployed cron schedule** (no tool). §6c is direct evidence that it differs
  from the canonical toml, which could shift the timing.
- **The §2 pairing is exact-second equality on `created_at`.** Six warns do not pair this way. So
  **9 confirmed is a floor, not a total** — and the 6 unpaired queued rows are not cleared by the
  absence of a pairing.
- **`notes IS NULL` on a queued row is not intrinsically evidence of failure** — per §3 it is also
  what a *clean* check writes, under both v0.5.2 and v0.5.3. §2's conclusion rests on the timestamp
  coincidence alone.
- **The content of id 26 is not known-false.** Only the first ~400 characters of `posts` were read,
  and no claim was checked against the paper.
- **I cannot verify whether another actor quarantines these rows before 14:30.** This document states
  what the code does, not what will certainly occur.
- **REV 2's §5 was wrong and this revision corrects it.** The omission was mine: the staged patch
  (`qnfo-social/PATCH-2026-09-13-checker-idrace.mjs`) carried the `created_at <` bound and I dropped
  it when restating the statement. That is the seventh self-correction of this session, and the first
  where the error was in a *recommended action* rather than a description.

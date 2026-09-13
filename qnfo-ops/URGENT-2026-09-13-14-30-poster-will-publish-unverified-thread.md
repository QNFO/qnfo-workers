# URGENT — the poster cron will publish an unverified thread to @qnfo.bsky.social at 14:30Z today

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
**Time-boxed. Server time at write: 2026-09-13T14:05:21.692Z. The posting cron is `30 14 * * *` =
14:30 UTC.**
Supersedes §3 of `FINDING-2026-09-13-unverified-threads-queued-for-public-posting.md`, which could
not determine whether a resumption would publish. **It will.**

**REV 2:** §2 upgraded from inference to a **confirmed pairing** — 9 of the 15 queued rows match a
fail-open warn to the second, including the row about to publish. §7 updated accordingly.

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
`queued` with `notes IS NULL`. id 26 — the next to publish — is one of them.** With a ±1 s tolerance
the tenth pairing is id 25, which was **already published** on 2026-09-12 14:30:45.

This is no longer "indistinguishable": for these rows, the warn timestamp and the thread's
`created_at` coincide, and each warn reads *"posting without fact-check (fail-open)"*. The `[]`
return from a failed check was written as `status='queued', notes=NULL` — the same shape a genuinely
clean check produces, which is exactly why the deployed build cannot tell them apart.

**What will publish** (id 26, `posts` head): *"Can a deterministic relaxation of a probability fluid
explain quantum measurement? A new pre-registered simulation says no for the strongest available
two-level version: it cannot reproduce the Born rule."* / *"The abstract reports a two-level system
unitarily evolved, then subject to three deterministic relaxation dynamics toward the eigenbasis.
With 1e5 shots per state, every configuration failed:"*

The content reads plausibly. **The defect is that it was never verified, not that it is known
false.** Nine such threads are queued.

## 3. v0.5.3 does NOT protect them

v0.5.3's fail-closed change is here, in `autoScan` and `/compose`:

```js
const status = issues && issues.length === 0 ? 'queued' : 'draft';
```

That governs **rows being created**. The poster's `SELECT` is untouched by the version bump. **The
poster has no gate at all, so no version of the checker can protect an already-queued row.** Note
also the `notes` expression's shape: `issues === []` (clean) → `notes = null`; `issues === null`
(checker unavailable) → the "unverified" marker + `draft`. v0.5.3 can distinguish them **only at
insert time**.

## 4. A deploy cannot land in time

`fleet_drift_report` scan times today: 07:04, 08:02, 09:02, 10:02, 11:02, 12:02, 13:03 — hourly at
about `:02`. The next scan is **~15:02Z**, after the 14:30 post. Even though `qnfo-social` is a census
member and a `worker.js` write does deploy, a fix committed now would not be live in time.

## 5. The only fix that works before 14:30 — and I cannot run it

```sql
UPDATE social_threads SET status='draft'
 WHERE status='queued' AND notes IS NULL;
```

`ops_d1_query` is SELECT/WITH only; **no tool bound to this endpoint writes `social_threads`.** No
endpoint on `qnfo-social` quarantines either — the route list is
`/post /thread /threads /queue /compose /approve /broadcast /scan /alerts /digest`, and `/approve`
moves `draft → queued`, the opposite direction.

Quarantine, do not delete: the rows are the only record of what was composed. After quarantining,
re-verify and `/approve` individually.

## 6. Two further defects found in the same handler

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
**it publishes the oldest queued thread.** The current `30 14 * * *` entry is exactly this. This is
load-bearing and undocumented in the file.

## 7. Limits

- **I have not observed the 14:30 post.** This is a prediction from the cron declaration, the
  unmatched-branch fall-through, and the 09-12 14:30:45 post of id 25 — the same cron firing the same
  way. Strong inference, not observation. **The §1 gate-absence and the §2 pairing do not depend on
  this prediction.**
- **I could not read the deployed cron schedule** (no tool); I relied on `wrangler.toml`, which is
  canonical but — as `qnfo-signal-loop` demonstrated — not necessarily what is deployed. If the
  deployed schedule differs, the timing shifts.
- **The §2 pairing is exact-second equality on `created_at`.** Six warns do not pair this way; they
  may correspond to threads created a second later (as id 25's does) or to runs whose row was
  suppressed. So **9 confirmed is a floor, not a total** — and conversely, the 6 unpaired queued rows
  are not cleared by the absence of a pairing.
- **`notes IS NULL` on a queued row is not intrinsically evidence of failure** — per §3 it is also
  what a *clean* check writes. §2's conclusion rests on the timestamp coincidence, not on the column
  alone. For the 6 rows without a matching warn, "indistinguishable" is still the correct word.
- **The content of id 26 is not known-false.** Only the first ~400 characters of `posts` were read,
  and no claim was checked against the paper.
- **I cannot verify whether another actor quarantines these rows before 14:30.** If a session or human
  runs the UPDATE, the post will not happen. This document states what the code does, not what will
  certainly occur.

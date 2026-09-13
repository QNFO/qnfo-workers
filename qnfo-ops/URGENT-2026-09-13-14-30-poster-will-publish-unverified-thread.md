# URGENT — the poster cron will publish an unverified thread to @qnfo.bsky.social at 14:30Z today

Date: 2026-09-13 · Author: qnfo-ops / ops-exec
**Time-boxed. Server time at write: 2026-09-13T14:05:21.692Z. The posting cron is `30 14 * * *` =
14:30 UTC — about 25 minutes after this was written.**
Supersedes §3 of `FINDING-2026-09-13-unverified-threads-queued-for-public-posting.md`, which could
not determine whether a resumption would publish. **It will.**

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

## 2. The oldest queued row is unverified

`SELECT * FROM social_threads WHERE status='queued' ORDER BY id ASC LIMIT 1` → **id 26**, created
**2026-09-05 06:02:19**, `notes IS NULL`. It is the row the 14:30 cron will post.

## 3. v0.5.3 does NOT protect it

v0.5.3's fail-closed change is here, in `autoScan` and `/compose`:

```js
const status = issues && issues.length === 0 ? 'queued' : 'draft';
```

That governs **rows being created**. The poster's `SELECT` is untouched by the version bump. So the
15 legacy rows remain indistinguishable and remain eligible. **My previous finding's §4 said v0.5.3
"does not fix these 15" — this is the mechanism, and it is stronger than I stated: the poster has no
gate at all, so no version of the checker can protect an already-queued row.**

## 4. A deploy cannot land in time

`fleet_drift_report` scan times today: 07:04, 08:02, 09:02, 10:02, 11:02, 12:02, 13:03 — hourly at
about `:02`. The next scan is **~15:02Z**, i.e. **after** the 14:30 post. Even though `qnfo-social` is
a census member and a `worker.js` write does deploy, a fix committed now would not be live in time.

## 5. The only fix that works before 14:30 — and I cannot run it

```sql
UPDATE social_threads SET status='draft'
 WHERE status='queued' AND notes IS NULL;
```

`ops_d1_query` is SELECT/WITH only; **no tool bound to this endpoint writes `social_threads`.** There
is no endpoint on `qnfo-social` that quarantines either — the route list is
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
never advanced by this worker. (`alerts.digested` is a TEXT column that elsewhere holds `'auto'` — a
separate confusion, noted earlier this session.)

**6b. The fall-through is a posting trap.** Any cron that is not `0 6` or `0 7` falls through to the
**poster**. So adding a new entry to `crons` without adding a matching branch does not merely no-op —
**it publishes the oldest queued thread.** The current `30 14 * * *` entry is exactly this: it is not
matched by any branch, so it posts. This is load-bearing and undocumented in the file.

## 7. Limits

- **I have not observed the 14:30 post.** This is a prediction from the cron declaration, the
  unmatched-branch fall-through, and the 09-12 14:30:45 post of id 25 — which is the same cron
  firing the same way. It is a strong inference, not an observation.
- **I could not read the deployed cron schedule** (no tool); I relied on `wrangler.toml`, which is
  canonical but — as `qnfo-signal-loop` demonstrated — not necessarily what is deployed. If the
  deployed schedule differs, the timing shifts. The *gate absence* in §1 does not depend on this.
- **I did not read id 26's `posts` body**, so I cannot say what claims it makes. It is
  unverified-by-absence-of-record, not demonstrated-false.
- **`notes IS NULL` means "indistinguishable", not "unverified"** — a subset of the 15 may be clean.
  Quarantining all 15 is the conservative action, not an assertion that all 15 are bad.
- **I cannot verify whether any other actor quarantines these rows before 14:30.** If another session
  or a human runs the UPDATE, the post will not happen. This document states what the code does, not
  what will certainly occur.

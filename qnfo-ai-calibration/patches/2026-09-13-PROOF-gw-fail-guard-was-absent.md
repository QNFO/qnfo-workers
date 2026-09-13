# PROOF — the gw-fail dedup guard was NOT in force on 2026-09-11T13:30:46Z

Date: 2026-09-13 (qnfo-ops / ops-exec)
Upgrades: `patches/2026-09-13-CORRECTION-shadowed-source.md` §2.3 from inference to dated proof.

## Claim

The 7-row gw-fail burst at 2026-09-11T13:30:46Z (ids 654–660, span 9,972 ms) was filed by code
that had **neither** of the two dedup guards present in the current canonical. The regression was
real; the canonical has since been corrected.

## The measurement that settles it

`agent_issues` rows:

| id | title | status | created_at | updated_at |
|---|---|---|---|---|
| 489 | `[gw-fail] 400 @cf/qwen/qwen3.8-27b` | resolved | 1788703212598 | **1788865624000** |
| 654 | `[gw-fail] 400 @cf/qwen/qwen3.8-27b` | open | **1789133446488** | 1789283871998 |

Row 489's title is **byte-identical** to row 654's. 489 was updated to `resolved` at
`1788865624000`.

```
burst time - 489 resolution = 1789133446488 - 1788865624000 = 267,822,488 ms = 3.099 days
```

**Row 489 was `resolved` 3.1 days before row 654 was filed.** The current canonical's guard is:

```js
var dispo = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE title LIKE ?1 AND status IN ('wontfix','closed','resolved') LIMIT 1").bind("%" + b.model + "%").first();
if (dispo) continue;
```

With `b.model = "@cf/qwen/qwen3.8-27b"`, that LIKE matches 489's title exactly and its status is in
the list ⇒ `dispo` is truthy ⇒ `continue` ⇒ **654 cannot be created.**

The second guard, in `fileIssue()` — `SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open'`
— cannot explain it either: no row with that title was `open` at the time (489 was `resolved`).

Both guards fail to explain 654's existence ⇒ **neither was in force.**

## Corroborating details

- Cluster 482/483/484: `1788681613411 → 1788681616019` = **2,608 ms** — a second burst.
- Newest gw-fail row is 670 at `1789214453581` (≈2026-09-12T12:00:53Z), a **single** row.
- No gw-fail rows in the ~21 h since, across ~42 half-hourly sweeps.
- 654/660/670 share `updated_at = 1789283871998` — all three touched by the same later pass.
- Row 482's `updated_at` is the **text** value `"2026-09-06 08:15:33"` while 489's is an **integer**
  epoch. That is the same `created_at`/`updated_at` type mixing that makes date comparisons on this
  table unreliable. Do not build guards on `updated_at` comparisons here without casting.

## What this does and does not establish

**Does:** the dedup guard was absent or broken in the code running at 2026-09-11T13:30:46Z.
**Does not:** which artifact sha was deployed then, or when `3624a4da` landed. No deploy record for
this worker has been read, and `main` is being written by other automation concurrently.

## Consequence

The P0 item "revert the gw-fail regression" is **already satisfied in the canonical**. Close it as
fixed-by-canonical. The remaining action is verifying that the *deployed* version matches the
canonical — not another revert. Note that a verification loop cannot be closed from qnfo-ops: there
is no deploy or artifact-inspection tool here.

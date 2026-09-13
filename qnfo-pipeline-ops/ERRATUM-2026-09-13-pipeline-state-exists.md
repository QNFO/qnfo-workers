# ERRATUM — `pipeline_state` DOES exist in live D1

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox client session).
Supersedes the *"NOTE ON DEPLOYMENT"* paragraph in `qnfo-pipeline-ops/worker.js` (sha `a7580136`).

## The wrong claim

The v0.5.5 header comment in `worker.js` states:

> NOTE ON DEPLOYMENT: the live build is NOT this source. `pipeline_state` does not exist in live D1,
> yet `ensureSchema()` below creates it on first run - therefore the deployed build predates v0.5.4,
> and every drift comparison made against this file has been comparing the repo to itself.

The middle clause is **false**.

## The measurement

```
SELECT name FROM sqlite_master WHERE name IN ('pipeline_state', ...)
-> pipeline_state   (present)

SELECT * FROM pipeline_state ORDER BY rowid DESC LIMIT 15
-> rowCount: 0
```

The table **exists** in live `qnfo-audit` D1 and holds **zero rows**.

## Why the conclusion survives, and is now better supported

The conclusion — *the live build predates the v0.5.4 dedup* — still holds. It now rests on three
independent checks instead of one false premise:

| # | check | result |
|---|---|---|
| 1 | Live alerts still emit the literal `"-> agent_issues dup"` | **YES** — alerts ids 1103, 1104, 1107, 1108, 1111, 1112, 1115, 1116 on 2026-09-13 at 10:00:59 / 11:00:59 / 12:00:59 / 13:00:59 / 14:01:20. v0.5.3 wraps that emit in `if (r.inserted)`, so a duplicate ticket must be **silent**. It is not. |
| 2 | Is `pipeline_state` written? | **NO** — the table exists with **0 rows**. v0.5.4 writes `summary_fp` on every emit; the summary alert still fires hourly. The write path is not executing. |
| 3 | Are the rows called "terminal" actually failed? | **NO** — `research_queue` source_id 45 = `queued` (attempt 3), 51 = `researching` (attempt 4), 40 = `pending` (attempt 12); **all three carry `error: NULL` and `recover_count: 0`**. The repo query (`status='failed' AND recover_count>=2`) cannot select them. |

Check 2 is the one that *replaces* the false premise: an **empty** table is stronger evidence than a
**missing** table. A missing table could mean "never created"; an existing-but-empty table means the
schema path ran and the write path did not — which is exactly the v0.5.3→v0.5.4 gap.

## What to change in `worker.js`

Replace the false clause with the measured one. Suggested text:

> NOTE ON DEPLOYMENT: the live build is NOT this source. `pipeline_state` EXISTS in live D1 but holds
> 0 rows, so v0.5.4's fingerprint write has never executed, while the summary alert still fires hourly
> (verified 2026-09-13). Live alerts also still emit `"-> agent_issues dup"`, which v0.5.3 gates on
> `r.inserted`. Therefore the deployed build predates v0.5.3, and every drift comparison made against
> this file has been comparing the repo to itself.

## Consequence for the reader

Anyone who trusted the original sentence would have gone looking for a **missing table** — and, finding
it present, concluded the build was current and the dedup was simply ineffective. The correct next
action (deploy) would have been skipped. This is why the erratum exists rather than a silent edit:
the wrong premise pointed at the wrong remediation.

## Also corrected in the same pass

`research_queue` rows 45 and 51 are labelled `terminal research failure` by the live build every hour
while carrying `error: NULL`. A terminal *failure* without an error is a contradiction. Guarded patcher
committed: `apply-terminal-error-guard.mjs` (commit `bd4c5991`), which adds
`AND error IS NOT NULL AND TRIM(error) <> ''` to `terminalFailures()` and refuses to write on anchor
ambiguity.

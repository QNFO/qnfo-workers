# VERIFICATION 3 — two of my own audit claims are wrong; the deployed revision is unresolved

Date: 2026-09-13, same session. Corrects `FLEET-ERROR-AUDIT-2026-09-13.md` §3 H5 and §0/§7.

## 1. CORRECTED — `ai_model_health` has 5 degraded rows, not 1

My audit reported "1 degraded" from `SELECT * FROM ai_model_health LIMIT 20`. **The table has 25
rows; `LIMIT 20` truncated before the `@cf/*` namespace and returned only the internal-id rows,
all of which are `ok`.** Live:

```
SELECT status, COUNT(*) c FROM ai_model_health GROUP BY status;
  -> ok 20, degraded 5

SELECT COUNT(*) total, SUM(model_id LIKE '@cf/%') cf, SUM(model_id NOT LIKE '@cf/%') internal
FROM ai_model_health;
  -> total 25, cf_rows 5, internal_rows 20
```

The five degraded rows:

| model_id | status | gateway_failures |
|---|---|---|
| `@cf/qwen/qwen3.8-27b` | degraded | 1371 |
| `@cf/zai-org/glm-5.2` | degraded | 0 |
| `@cf/qwen/qwen2.5-coder-32b-instruct` | degraded | 0 |
| `@cf/google/gemma-4-26b-a4b-it` | degraded | 0 |
| `@cf/baai/bge-base-en-v1.5` | degraded | 0 |

**Consequence: the `MODEL-DEGRADED` ticket titles were accurate and my H5 was an artefact of my
own query.** The two-namespace split (20 internal ids all `ok`, 5 `@cf/*` ids all `degraded`) is
the GW-DEGRADE-2 CF-id mapping doing its job — and it is exactly the trap a `LIMIT` on a table
whose ordering is not semantic will spring. I reported a truncation as a finding.

Remaining real inconsistency: ticket 689's title lists **4** models; the table has **5** degraded.
`@cf/baai/bge-base-en-v1.5` is degraded but omitted from the ticket, so the escalation
under-reports by one.

## 2. CORRECTED — a string-comparison artefact in my own query

I reported "0 rearm alerts since 12:00". The filter was
`created_at >= '2026-09-13T12:00'`. `alerts.created_at` is written in **two formats** —
`'2026-09-13 14:01:22'` (space) by `qnfo-pipeline-ops`, and ISO `T` form by other producers.
In string comparison `' '` (0x20) sorts **below** `'T'` (0x54), so the predicate silently
excluded **every** pipeline-ops row. Re-run with the space form:

```
2026-09-13 14:01:22  research pipeline: failed=2 stalled=0 published=19 recovered=0 vqErr=1 rearmed=0 rTerm=0 intake=cleared terminal=2
2026-09-13 13:16:00  ... intake=escalated terminal=2
2026-09-13 12:16:00  ... intake=escalated terminal=2
```

This is **the same defect class canonical v0.5.5 documents for `agent_issues`** (four distinct
`typeof` combinations for `created_at`/`updated_at`, so "any date-range predicate on this table
is not well-defined"). I reproduced it in my own analysis of a sibling table while auditing it.

## 3. Alert trend — flat, not improving

`alerts`, source `qnfo-pipeline-ops`, by day:

| 09-03 | 09-04 | 09-06 | 09-07 | 09-08 | 09-09 | 09-10 | 09-11 | 09-12 | 09-13* |
|---|---|---|---|---|---|---|---|---|---|
| 50 | 107 | 34 | 106 | 42 | 93 | **166** | 151 | 110 | **72** |

\* partial day to 14:08Z. At 72 in 14.1h the pace is **5.1/h → ~123/day**, against 110 for the
full previous day. **The storm is not declining; it is flat at ~110–125/day.** Peak was 09-10.

## 4. Tickets 687/688 may now be stale, like 677

At 14:08Z `research_queue` had `failed 2`. At ~14:22Z:

```
SELECT status, COUNT(*) c FROM research_queue GROUP BY status;
  -> published 19, ensemble-draft 3, queued 2, pending 1     # no failed rows
```

The two failed rows became `queued` — consistent with `recoverFailed()`, which is **silent by
design** (it emits no alert, unlike `rearmTerminal()`). So `TERMINAL research failure 45/51`
(issues 687/688) currently have **no triggering condition**: the rows are queued, not failed.
They are candidates for auto-close on the next drain, exactly as 677's premise went stale.

## 5. UNRESOLVED — which revision is actually deployed

`pipeline_state` is absent from live D1 (`D1_ERROR: no such table`), and `ensureSchema()` creates
it on the first run of a `*/15` cron. So the deployed build **is not canonical v0.5.4+** — that
part is solid.

But the deployed build's **summary cadence is ~60 minutes** (12:16, 13:16, 14:01), whereas the
pre-v0.5.4 source emits the summary **unconditionally on every run** — every 15 minutes, i.e.
12:16, 12:31, 12:46, 13:01, 13:16…

**Neither revision explains the observation.** The deployed build is therefore neither canonical
nor the pre-v0.5.4 source I can read. Something in production already throttles the summary by
some other mechanism that exists in no source I have. I cannot name the live revision.

This weakens §1's conclusion in `VERIFICATION-2` only in scope, not in direction: the fix is
still not live, but "predates v0.5.4" should be read as **"is not this source"**, not as a
specific older version.

## 6. Unchanged

H1 (fix not live), H2 (40/40 masked `v2-drain` rows), H3 (`version_queue` id=18), H4, H6–H10,
the P0 credential exposure, the falsified "496 stuck `new`", and the `ops_issue_run` token gate.

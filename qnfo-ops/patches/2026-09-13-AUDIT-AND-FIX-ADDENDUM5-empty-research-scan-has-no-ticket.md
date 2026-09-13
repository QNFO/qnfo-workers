# ADDENDUM 5 — the research scan went empty; the fleet's biggest live problem has NO ticket

Date: 2026-09-13T14:50Z · Author: qnfo-ops / ops-exec
Extends: ADDENDUM 4 §3 (the `ai_queries` silence — now explained)
Status: **new finding.** This is the most consequential result of the audit.

---

## 1 — The scan stopped finding papers, and then stopped running

`research_scan_log`, `job='research-scan'`, newest 8 rows:

| scan id | ts | papers returned |
|---|---|---|
| `scan-mtziyj8x` | **2026-09-13T08:00:58Z** | **`[]` — ZERO** |
| — | 2026-09-12 | **no row at all** |
| — | 2026-09-11 | **no row at all** |
| `scan-mtv8mpnm` | 2026-09-10T08:00:45Z | 10 |
| `scan-mttt6woo` | 2026-09-09T08:00:48Z | 10 |
| `scan-mtsdqj6i` | 2026-09-08T08:00:23Z | 10 |
| `scan-mtqyai9v` | 2026-09-07T08:00:15Z | 10 |
| `scan-mtpiuimx` | 2026-09-06T08:00:09Z | 10 |

Ten papers per day, every day, from 09-02 through 09-10. Then **two days with no scan row**, then a
scan that returned an **empty list**. arXiv publishes continuously, so zero is not a plausible
result — it is a failure that was recorded as success.

`scan_state.last_scanned = 2026-09-13T05:21:25.042827+00:00` — something did run at 05:21Z, so the
08:00 `[]` is not simply "the cron is off".

## 2 — Everything downstream stopped in the same window

| signal | last healthy | state now |
|---|---|---|
| `research_scan_log` papers | 2026-09-10 (10 papers) | `[]` on 09-13; no rows 09-11/09-12 |
| `research_queue` new intake | 2026-09-10T21:11:05Z | **nothing for 3 days** |
| `research_queue` published | created 2026-09-08T10:01:28Z | **no new publication in 5 days** |
| `pipeline-supervisor` events | 96/day through 09-10, 59 on 09-11 | **zero since 2026-09-11T14:30:12Z** |
| `ai_queries` | burst 06:25–07:32 today, 217 rows | **nothing since 07:32:18Z** |

Stuck rows in `research_queue`:

| id | status | stage | created | note |
|---|---|---|---|---|
| `ENSEMBLE-001-writer-a/b/c` | `ensemble-draft` | `reconciled` | 2026-09-08 11:57 | 3 legs produced, **never promoted** — stuck 5 days |
| `9e5dd9e1-…` | `pending` | `ensemble` | 2026-09-09T08:21:31Z | `claimed_at` **NULL** — never picked up, 4 days |
| `8506ba43-…` | `failed` | `ensemble` | 2026-09-10T08:12:24Z | re-claimed **09-13T09:20:59Z**, failed again |
| `44c884d7-…` | `failed` | `ensemble` | 2026-09-10T21:11:05Z | re-claimed **09-13T08:30:59Z**, failed again |

Two important details:

1. **`ENSEMBLE-001-writer-a/b/c` are the three legs**, and they *did* succeed on 09-08 — sitting at
   `stage='reconciled'` ever since. So the ensemble machinery worked on 09-08 and broke by 09-10.
   This is a real, bounded window in which to look for the change.
2. The two failures were **re-claimed today** (08:30Z, 09:20Z) and failed identically. The pipeline is
   still trying, and still getting `0/3 legs`.

## 3 — The causal chain, stated as inference

```
research-scan returns [] / stops running
        ↓  (no new candidates)
research_queue gets no new intake after 09-10
        ↓
no new drafts; ENSEMBLE-001 legs stuck at 'reconciled' since 09-08
        ↓
no new publication after 09-08
```

Every arrow is inferred from **timestamps**, not from reading the pipeline's control flow. The
ordering is consistent and the endpoints are each measured; the mechanism between them is not.

## 4 — The finding that matters most

**This is the fleet's largest live failure, and the ticket backlog does not mention it.**

Of the 12 open `agent_issues`: 7 are a replay artifact, 1 is a namespace artifact, 1 is the advisor
counting itself, 1 is self-healing, and 2 are the downstream ensemble symptom. **Zero tickets
describe the empty scan, the two missing scan days, the 4-day-unclaimed pending row, or the 3 legs
stuck at `reconciled` for 5 days.**

Meanwhile `fleet_status` reports **every probed service healthy** (12/12 with `/health` 200). The
stall is invisible to both instruments: health probes ask "does this worker answer?", and the
advisor files tickets from health state. A pipeline that runs, answers 200, and returns nothing
satisfies both.

**That is the actual defect class here, and it is not in the backlog:** the fleet has no detector
for *silent zero-output*. Every signal above had to be found by hand, in a different table, from a
question that started as "why is `ai_queries` quiet?"

## 5 — Recommended actions

1. **Investigate the empty scan first.** It is upstream of everything else. Specifically: why did
   09-11 and 09-12 have no `research_scan_log` row, and why did 09-13 return `[]`? A scan that
   swallows its own error as an empty list is the prime suspect, and it would explain both.
2. **Add a zero-output alarm** — `research-scan` returning 0 papers when the trailing 7-day mean is
   10 must page. This is the missing detector, and it is a small change.
3. **Unstick `9e5dd9e1-…`** (`pending`, `claimed_at` NULL, 4 days) and the 3 `reconciled` legs.
4. Then re-attempt the ensemble failures — with a working scan there will be fresh items to test on.
5. The RC-1/RC-2 fixes remain worth doing (they clear 8 tickets) but they are **cosmetic next to
   this**.

## 6 — Limits

- I read no pipeline control flow. §3 is a timestamp ordering, not a traced mechanism. The scan
  could be a *symptom* of the same upstream break as the ensemble failures rather than their cause.
- `payload='[]'` is my reading of the column as "the result set". If the scan logs an empty payload
  on a path that also writes results elsewhere, the "zero papers" conclusion weakens.
- The 09-11/09-12 gaps could be log-write failures rather than missed runs — I cannot distinguish
  "did not run" from "ran and did not log" from this table alone.
- `pipeline-supervisor`'s 96-events/day rhythm stopping is consistent with the stall but I did not
  read what those events are.
- All reads are single-replica (ADDENDUM 3 §6), so the exact timestamps may be slightly stale.
- This is the **seventh** self-correction/extension in this session. The difference here is that it
  came from following my own open question rather than from being contradicted — which is the first
  time that has happened today.

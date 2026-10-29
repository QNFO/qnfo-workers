# LOOP EXECUTOR ACCOUNTS FOR NOTHING — why fleet errors never resolve
**2026-09-13T15:1xZ** — qnfo-ops

## The answer to "why do these never get permanently fixed"
The deployed dashboard **v1.5.1** exposes `/api/loop`, which self-reports its executor
telemetry. Fetched live.

```
last_execute:          2026-09-13T14:16:52.542Z
last_execute_summary:  scanned 25, executed 0, failed 0, needs_human 0, no_action 0
```

**25 items scanned. Zero placed in any outcome bucket. 25 items vanish from the accounting.**

This is the same non-reconciling-counter pattern as issue 715.

## The per-signal ledger
Every one of the 8 tracked signals shows the identical stall:

| field | value (all 8 signals) |
|---|---|
| `attempts` | **1** |
| `dispatch_state` | `dispatched` |
| `last_action` | `stale-escalated` |
| `last_verified` | **null** |
| `closed_at` | **null** |
| `occurrences` | **87 – 127** |

Detect -> dispatch once -> never verify -> mark stale-escalated -> re-detect forever.

`last_summary`: `tracked 8, created 0, cleared 0, escalated 0, dispatched 0, reopened 0`.
The sync does nothing either.

## The complete picture
| stage | state |
|---|---|
| detector | **works** — 8 signals tracked, occurrences climbing to 127 |
| dispatcher | **works** — `dispatch_state: dispatched` |
| executor | **absent** — scanned 25, executed 0, accounted 0 |
| `fleet_issue_dispatch` | 34 rows, all `queued`, `exec_attempts` sum 5, **zero transitions** |

## Fourth producer-without-consumer instance today
1. `fleet_improvements` — 75 rows (31 proposed + 44 approved), no drain
2. `fleet_issue_dispatch` — 34 queued, 0 transitions
3. `agent_issues` — drain processed 21, closed **0**
4. `/api/loop` executor — scanned 25, executed 0

## The invariant that must hold
```
executed + failed + needs_human + no_action == scanned
```
Until that holds, **no alert on this fleet can be permanently resolved** — nothing
detected is ever verified as fixed. That is the mechanical reason the user-visible
complaint is correct.

## The 3 err-class signals currently stuck
- Ops AI gateway — occurrences **127**
- Queue version_queue — occurrences **87**
- 1 worker with 24h errors — occurrences **93**

## Census corrections applied this session
Two internal contradictions in `fleet_worker_census` (written by a concurrent session
at 14:25:55) were flagged in place, not overwritten:

1. **6 of 35 PRODUCTIVE rows have `req24 IS NULL`** — `qnfo-gateway`, `qnfo-email`,
   `qnfo-memory-mcp`, `qnfo-tools-mcp`, `qnfo-ai-search`, `qnfo-proof`. A PRODUCTIVE
   verdict with no measurement is the same defect class as the 15 UNMEASURED rows in
   the superseded census.
2. **`osf-integrity-check` is PRODUCTIVE at req24=1** while **`qnfo-impact` is
   DAILY-ONLY at req24=1** — same measured value, two opposite verdicts. The
   daily-cron reading is the defensible one.

Flags were appended to the `reason` column so the original judgment is preserved.

## Method note
All figures read live from `/api/loop`, `/api/actions` and the dashboard root on
2026-09-13 between 14:16Z and 15:1xZ. The dashboard's state is cached at
`generated_at 2026-09-13T14:16:39.546Z`, so figures dated later than that come from
`agent_issues` / `fleet_issue_dispatch` directly, not from the cached board.

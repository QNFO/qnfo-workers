# FIX-ORDERING HAZARD — do not deploy the repo registry.js
**2026-09-13T15:0xZ** — qnfo-ops

## The trap
Issue 741 says probe coverage fell from 82 names to 10 at `2026-09-12T09:15:45Z`.
The obvious fix is "deploy the repo `registry.js` — it has 44 health_probes."

**That fix would cause a worse blind spot.**

## Verified counts
| source | scheduled | health_probes |
|---|---|---|
| repo `registry.js` (v4, captured 2026-09-12T06:38Z) | **27** | **44** |
| deployed dashboard **v1.5.1** (live, self-reported) | **40** | **10** |

The deployed scheduled roster is a **strict superset** of the repo's — set difference
`in_repo_not_measured` is empty, so every repo-scheduled worker is already measured.

## What deploying the repo registry would destroy
Set difference (measured-but-not-in-repo-scheduled), 13 workers:

| worker | req24 |
|---|---|
| qnfo-ai | **1656** |
| fleet-exec | **1462** |
| personal-companion | 543 |
| idea-hub | 224 |
| jnl-pipeline | 145 |
| qnfo-observability | 143 |
| qnfo-fleet-control | 109 |
| qnfo-autopilot | 33 |
| ai-health-prober | 23 |
| qnfo-signal-loop | 22 |
| companion-hub | 5 |
| audit-hub | 5 |
| radar-hub | 2 |

**4,372 of 8,698 measured req/24h = 50.3% of measured fleet traffic** — including
the single busiest worker in the fleet (`qnfo-ai`).

## Correct procedure
1. **Do not** deploy the repo `registry.js`. It is stale on both axes: older in
   scheduled coverage, newer only in probes. It is not a safe source of truth.
2. Take the **deployed** registry (v1.5.1) as the base and **add back** the 34 missing
   health_probes.
3. Verify with two independent checks, before and after:
   - `fleet_probe_log` distinct names per hour must exceed **80**
   - `worker_activity_daily` must still report **40** workers per snapshot

The naive fix trades a 10-name probe blind spot for a 13-worker measurement blind
spot covering half the fleet's traffic.

## Method note
Counts derived by set difference over the repo registry's 27 scheduled entries and the
40 workers in `worker_activity_daily` (2026-09-13 snapshot), computed in `run_code` and
reproducible. The deployed registry itself is not readable from the ops endpoint — the
40/10 figures are the deployed dashboard's own self-reported totals at
`/api/actions` and its root page, both fetched 2026-09-13T14:16Z.

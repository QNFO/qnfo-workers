# CORRECTION ADDENDUM — 2026-09-13T14:35Z
Supersedes two claims in `2026-09-13-FLEETWIDE-PRODUCTIVITY-CONSOLIDATION.md`.

## Correction 1: the prober did NOT die
The parent document described a "Monitoring collapse" with 73 names "frozen". The freeze is real. The inference that the prober stopped was **wrong**.

**Verified:** `fleet_probe_log` has exactly one writer, `source=qnfo-fleet-dashboard`, 21,068 rows, last write **2026-09-13T14:16:31Z** — it is writing continuously.

## Correction 2: it is a COVERAGE collapse, not a liveness collapse
Hourly name counts:

| hour (UTC) | rows | distinct names |
|---|---|---|
| 2026-09-12T06 | 411 | 81 |
| 2026-09-12T07 | 366 | 81 |
| 2026-09-12T08 | 324 | 81 |
| 2026-09-12T09 | 218 | **82** |
| 2026-09-12T10 | 50 | **10** |
| 2026-09-12T11 | 50 | **10** |
| 2026-09-12T12 -> 2026-09-13T14 | 40/hour | **10 every hour** |

The transition is discrete, inside the 09:00 hour, at **2026-09-12T09:15:45Z** — the identical timestamp on all 73 frozen rows. **27 consecutive hours pinned at exactly 10 names.**

**Current roster (last 2h, with transport):** qnfo-ai (binding), qnfo-kaizen (binding), qnfo-ops (binding), qnfo-outreach (binding), qnfo-paper-reviser (binding), qnfo-social (binding), personal-api (binding), qnfo-fleet-dashboard (self), qnfo.org (http), papers.qnfo.org (http).

**Consequence:** 43 of 55 workers have no liveness probe. The 15 workers reported as UNMEASURED in `worker_activity_daily` are the same blind spot, not a separate defect.

## Mechanism: NOT determined
`qnfo-fleet-dashboard/registry.js` (version 4, `captured_at 2026-09-12T06:38:13Z`) holds **44 health_probes, none carrying a `binding` field** — so the repo registry would emit `transport=http` for all 44. The deployed build emits `transport=binding` for 7. **The repo registry is not what is deployed.**

Two candidate mechanisms, both consistent with the data:
1. `liveScripts()` returned a ~10-name script list, so the `liveSet` filter dropped 34 of 44 probes.
2. The deployed registry was cut to bindings-only.

Not separable from this endpoint: I cannot read the deployed registry, and `r2:qnfo-canonical` is not a bound bucket.

## Consequence for the census
Every **UNMEASURED** verdict in `fleet_worker_census` is contingent on this gap. Close it, verify coverage returns above 80 names, then re-run the census before acting on any retirement recommendation.

## Also corrected: issue 705 title
Amended to remove the self-contradiction created earlier — the body carries the correction that the phantom-496 retraction was wrong (496 rows, 42-second burst, all `score IS NULL`), while the title still read "REFUTED". Title now matches the body.

# RETRACTION — the "acute monitor outage" was FALSE
**2026-09-13T14:3xZ** — qnfo-ops

## What I claimed
That `qnfo-fleet-dashboard` had stopped writing at `2026-09-13T14:16:31Z`, missed
four consecutive `*/15` cron fires, and left the fleet in a ~69-minute total
monitoring blackout. Filed as issue 753 and committed as
`audits/2026-09-13-ACUTE-monitor-silent.md`.

**Both the issue and that document are withdrawn.** The commit `3160aad5` stands in
history but its content is false.

## Why it was wrong
**I assumed the current UTC time was ~15:2xZ. It was 14:30Z.**

An attachment header in my context read `Current date and time: 2026-09-13 15:16 (UTC+02:00)`.
I treated **15:16 as UTC**. It is **13:16 UTC**. Every elapsed-time figure I computed
was inflated by exactly two hours.

## The actual facts
| check | result |
|---|---|
| true time (`strftime('%Y-%m-%dT%H:%M:%SZ','now')`) | **2026-09-13T14:30:10Z** |
| newest probe row before my test | 2026-09-13T14:16:31.350Z |
| **real gap** | **13.5 minutes = ONE normal `*/15` interval** |
| `GET /api/refresh` | **200**, `generated_at` advanced 14:29:48 → 14:30:00 |
| `fleet_dashboard_state.updated_at` | advanced 14:16:39.546Z → **14:30:00.350Z** |
| `fleet_probe_log` after refresh | **+20 rows**, newest **14:29:58.605Z** |

**The prober was healthy throughout.** My own refresh calls triggered real, persisted
rebuilds. There was no outage, no missed fire, and no blackout.

## What still stands — verified with the corrected clock
**Probe coverage collapse (issue 741), clock-independent:**

| hour (UTC) | distinct names |
|---|---|
| 2026-09-12T06 / T07 / T08 | 81 / 81 / 81 |
| 2026-09-12T09 | **82** |
| 2026-09-12T10 → 2026-09-13T14 | **10 — every single hour, 26 consecutive hours** |

**Filing rate (sharpened, not weakened):**
- **79 issues filed in the last 60 minutes**
- **All 52 open issues were created within the last 20 minutes** — the entire open
  backlog is under 20 minutes old

## What is withdrawn
- The acute-outage framing
- The "four consecutive missed fires" count
- The "~69 minutes of blackout" figure
- The claim that nothing detected it

## The lesson, stated plainly
I computed an elapsed-time claim from an **assumed** clock instead of reading the clock.
A single query would have prevented it. Any time-based claim must be grounded in a
measured timestamp, not an inferred one — and a timezone-bearing timestamp must be
converted before use.

## Incidental useful result
`/api/refresh` on `qnfo-fleet-dashboard` is a working, unauthenticated **GET** trigger
that rebuilds and persists fleet state (~8s). That is a usable manual recovery lever for
this monitor — discovered by accident while chasing a bug that did not exist.

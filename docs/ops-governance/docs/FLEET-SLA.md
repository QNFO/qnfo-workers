# Fleet SLA / Level-of-Service Policy (2026-09-06)

User directive 2026-09-06: no open row may idle to a far-future due date; establish a
systemwide severity->time-to-resolution SLA and accelerate all rows.

## Severity tiers (time-to-resolution, from open date)
- SEV1 blocker (system down / security / data loss): 24 hours
- SEV2 regression (user-visible broken feature, wrong output): 72 hours (3 days)
- SEV3 enhancement / backlog / improvement: 7 days (default for agent next_action rows)
- SEV4 optional / research / nice-to-have: 14 days

## Hard cap
No open register row carries a due date more than 14 days out, EXCEPT:
- calendar-bound items that fire on a natural schedule (weekly kaizen report, quarterly
  RESTORE-DRILL, Q3 portfolio rebalance) - these are tracked by their cron, never "waiting
  on a human";
- external-event-gated items (IOCPh acceptance notification) - tracked by the event, not idle;
- rate-limited drains (BACKLOG-DRAIN 329 Zenodo records at ~18/day) - re-scoped to a running
  checkpoint, not a wall-clock completion of the full backlog.

## Acceleration rule
Every open agent-owned row whose due was previously > 2026-09-13 is pulled to 2026-09-13
(7-day SEV3 cap), unless it falls in one of the exempt classes above.

## Enforcement
Row 95 (kaizen weekly executor-coverage audit) verifies each open row has a dated cloud
trigger / durable-job executor. v_waiting_on_human must stay 0 (USER-FREE-RESOLUTION-1).

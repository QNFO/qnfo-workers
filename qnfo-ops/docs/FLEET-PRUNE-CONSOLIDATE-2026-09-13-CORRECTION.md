# CORRECTION to FLEET-PRUNE-CONSOLIDATE-2026-09-13.md — the prune was REVERTED

Written 2026-09-13 ~14:33Z by the same qnfo-ops session that produced the parent document.

## What the parent document claims

Section **P2 — Prune executed and verified** states that `venue-radar-scan` was disabled:

- `UPDATE fleet_tasks SET enabled=0 WHERE id='venue-radar-scan'` → changes 1
- `UPDATE fleet_crons SET enabled=0 WHERE id=3` → changes 1
- "Verified by read-back at 14:28:49: both `enabled=0`."

That read-back was accurate **at the moment it was taken**. It is **no longer true.**

## What is actually true now

Read-back at ~14:33Z:

```
kind  name              enabled  updated_at
task  venue-radar-scan  1        2026-09-13 14:28:49
cron  venue-radar-scan  1        2026-09-13 14:30:31
```

Both rows are **enabled=1**. The `fleet_crons` row was rewritten at **14:30:31**, which is *after* my final `enabled=0` write at 14:28:49.

## Sequence of observations on the same two rows

| time | observed | actor |
|---|---|---|
| ~14:27:0x | `enabled=0` written, `changes=1` returned | this session |
| 14:27:56 | `fleet_tasks.enabled=1` | unknown external writer |
| 14:28:18 | `fleet_crons.enabled=1` | unknown external writer |
| 14:28:49 | `enabled=0` on both | this session (re-issued) |
| **14:30:31** | **`fleet_crons.enabled=1` again** | **unknown external writer** |

## Conclusion

**The prune did not hold. It is not durable.** Editing `fleet_tasks` / `fleet_crons` through `ops_d1_write` cannot reliably disable scheduled work, because at least one other writer re-enables these rows within roughly two minutes. The same table showed a `demo-heartbeat` row vanishing and being re-created at 14:27:35 by a concurrent writer.

Therefore:

- The parent document's claim that 120+ scheduled no-op fires/day were removed by this prune is **withdrawn**. Those fires continue.
- `venue-radar-scan` still fails at 06:45 daily with `unsupported step type: venue`. The fix must be a **code change in `fleet-exec`** — implement the `venue` step type, or remove the task from the dispatcher config — not SQL.
- `worker_consolidation` for `venue-radar-scan` has been updated to `action=FIX`, `status=REVERTED`.

## What DID hold

- `worker_dod` (55 rows) and `worker_consolidation` (18 rows) — new tables, no competing writer, verified present.
- `service_registry` version corrections for qnfo-ops (2.15.10), qnfo-backlog-exec (1.2.8) and qnfo-gateway (3.6.1) — read back correctly.
- The `qnfo-ddocs-indexer` v1.0.1 fix (commit `141b48ae`, 9/9 unit tests pass) — a repo commit, not a D1 row, so no race applies.

## Method note

The parent document was written from read-backs taken *before* this reversion was observed. The lesson is structural: **a single read-back is not verification for a table with a concurrent writer.** Verification of this class of change requires two reads separated by longer than the competing writer's period — roughly >2 minutes here — which no single-turn check satisfies.

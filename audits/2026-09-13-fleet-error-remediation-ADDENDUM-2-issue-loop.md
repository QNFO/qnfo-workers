# ADDENDUM 2 — the issue loop closes issues whose condition it keeps observing

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox session).
Third document in the series: `…-remediation.md`, `…-ADDENDUM-structural.md`, this file.

The second addendum measured the stall: `fleet_issue_dispatch`, 34 rows, all `queued`, 5 total
`exec_attempts`. This one identifies the mechanism that produces it. Every value is a tool return
from this session.

## 1. The executor is running, not stalled

`fleet_loop_meta`, read this session:

| key | value |
|---|---|
| `last_sync` | `2026-09-13T14:16:51.286Z` |
| `last_execute` | `2026-09-13T14:16:52.542Z` |
| `last_execute_summary` | `{"scanned":25,"executed":0,"failed":0,"needs_human":0,"no_action":0}` |
| `last_summary` | `{"tracked":8,"created":0,"cleared":0,"escalated":0,"dispatched":0,"reopened":0}` |

**`scanned: 25`, and the four outcome buckets sum to `0`.** Not 25 no-ops — zero of everything.
The counters do not reconcile with the scan size, so an entire no-op sweep is indistinguishable from
a healthy quiet one. A loop that scans 25 items and reports nothing in any bucket has no way to fail
loudly.

## 2. Closure is decoupled from the condition

`fleet_issue_loop`, 34 rows:

| state | n | `closed_at` oldest | `last_seen` newest |
|---|---|---|---|
| `gh_state='cleared'`, `dispatch_state='dispatched'` | **24** | `2026-09-12T10:31:02Z` | **`2026-09-13T13:46:15Z`** |
| `gh_state='open'`, `dispatch_state='dispatched'` | 10 | `2026-09-13T04:31:33Z` | `2026-09-13T14:16:45Z` |

**24 issues were marked `cleared` on 2026-09-12 and were still being observed ~27 hours later.**
Their `last_seen` reaches `2026-09-13T13:46:15Z`. Nothing reopened them.

`miss_streak` distribution:

| `miss_streak` | rows |
|---|---|
| **93** | **23** |
| 3 | 1 |
| 1 | 2 |
| 0 | 8 |

23 rows sit at the maximum observed value, 93. Across the table: 25 rows have `closed_at` set, 26
have `miss_streak > 0`. So closure is not a terminal state — the loop closes, keeps missing, and
never reopens. One row is even `gh_state='open'` *with* a `closed_at`.

## 3. What this explains

This is the mechanism behind every other stall recorded in this series:

1. A condition is detected, dispatched, and closed on a single miss.
2. The condition persists. `miss_streak` climbs to 93. Nothing reopens.
3. Because the loop considers the item closed, `fleet_issue_dispatch` accumulates rows in
   `queued` — 34 of them over ~28 hours — with 5 total `exec_attempts`.
4. Because the sweep reports `scanned=25, executed=0` with non-reconciling counters, none of this is
   visible from the loop's own telemetry.

It also explains the two closures I verified directly: issue #648
(`ALERT-STORM-DETECTED qnfo-pipeline-ops`) closed while the storm reached 802 criticals, and issue
699 closed while `idea_proposals` was byte-identical.

## 4. Recommended changes (not executed — the loop's source is not reachable from here)

1. **Close on sustained absence, not a single miss.** Require N consecutive clean sweeps.
2. **Reopen automatically** when `miss_streak` exceeds a threshold. A row at 93 should not be
   `cleared`.
3. **Assert `scanned === executed + failed + needs_human + no_action`.** Any sweep where the buckets
   do not sum to the scan size is a defect, not a quiet period. This single assertion would have
   surfaced the entire class.

## Failure modes against this addendum

- I read `fleet_loop_meta` and `fleet_issue_loop`, **not the loop's source**, so I cannot say whether
  `miss_streak` means "expected but absent" or "present but unmatched". Both readings fit the data,
  and the recommendation in §4.2 assumes the former.
- `last_execute_summary` is a single snapshot of one sweep. I did not sample it over time, so I
  cannot distinguish "always scans 25, executes 0" from "scanned 25 once".
- The 34-row count, the `miss_streak` histogram and the `fleet_loop_meta` values were read at
  different instants with at least two writers active. They are not a consistent snapshot.
- I did not attempt to reset `miss_streak` or reopen the 24 `cleared` rows. Mutating loop state
  without reading the loop's source could suppress a real signal, and reopening 24 rows by hand would
  be treating the symptom the loop is supposed to treat.

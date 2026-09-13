# FINDING — the fleet's detect → dispatch → execute → close loop is broken at stage 3, evidenced from raw rows

Date: 2026-09-13T15:2xZ · Author: qnfo-ops / ops-exec
Method: raw rows from `fleet_issue_loop`, `fleet_issue_dispatch`, `fleet_improvements`,
`fleet_deploys`, `agent_issues` via `ops_d1_query`. This is the systemic answer to "what prevents
full-stack integration and deployment", derived from data rather than from the filed tickets that
describe the same thing (#708, #713, #714, #715).

## 1. The chain, and the exact row that shows each stage

```
detect ──► dispatch ──► execute ──► close ──► deploy
  OK         OK           BROKEN     BROKEN    CONSTRAINED
```

**Stage 1 — detect: WORKS.** `openBacklog` moved **0 → 4 → 11 → 21** during a single session.

**Stage 2 — dispatch: RECORDS.** `fleet_issue_dispatch` holds remediation rows with a
`suggested_action`, an `owner`, and a `target`.

**Stage 3 — execute: BROKEN.** This is the decisive row set. All three sampled rows show:

| field | value |
|---|---|
| `state` | **`queued`** |
| `exec_state` | **`executed`** |
| `exec_attempts` | **`0`** |
| `exec_result` | `executed HTTP 200 138ms :: {"ok":true,"worker":"qnfo-research-exec","version":"0.8.1","drained":[]}` |

Three separate contradictions in one row:
- `state` is still `queued` although `exec_state` says `executed` — **the state machine never
  transitions**, so the row is neither done nor eligible for retry;
- `exec_attempts` is **0** after an execution — **the counter was never incremented**, so retry and
  backoff logic has nothing to act on;
- the execution returned **HTTP 200 with `"drained":[]`** — a successful *call* that did nothing. The
  dispatcher treats transport success as remediation success.

A third row reads `exec_state: "needs-human"` with `exec_attempts: 0` — routed out of automation on
first contact, never retried.

**Stage 4 — close: BROKEN, and in the worst direction.** `fleet_issue_loop` rows show:

| field | value |
|---|---|
| `gh_state` | **`cleared`** |
| `closed_at` | `2026-09-12T11:01:12.876Z` |
| `last_seen` | `2026-09-12T09:47:18.203Z` |
| `miss_streak` | **`93`** |

The row is marked **cleared and closed**, while `last_seen` is **~27 h stale** and the reconciler has
**missed it 93 times**. A `miss_streak` of 93 is the opposite of a cleared condition — it is 93
consecutive observations of absence. The ledger records closure on a signal that has not been
re-observed for over a day.

**Stage 5 — deploy: CONSTRAINED.** Independently established this session
(`FINDING-2026-09-13-deploy-path-is-single-file-only.md`): the canonical upload carries **one file**,
so every multi-module worker (e.g. `qnfo-observability` importing `./fleet.js`) is permanently
unhealable, and every worker whose source exceeds 32,768 chars is unreachable from an ops endpoint.
`fleet_deploys` shows 51 of 76 attempts are unbounded hourly retries of two dead targets, and the
healer's last action was a **failure** (14:04:01).

## 2. Why the stages fail together rather than separately

The five failures are not independent — they compose into a loop that cannot correct itself:

- Stage 3 never advances `state`, so nothing reaches stage 4 as *completed*; stage 4 instead closes
  rows on a stale `gh_state` flag.
- Stage 4 closing rows that are still broken **removes them from the queue that stage 3 reads**, so
  the remediation that would have fixed them is never dispatched again.
- Stage 5 can't carry the fix for any worker that isn't single-file and small, so even a correctly
  executed remediation may be undeployable.

The net effect: **the detection surface is far larger than the repair surface.** Issues accumulate
faster than they can be closed, and the mechanism that is supposed to close that gap is itself the
thing that is stuck. `fleet_improvements` shows the same shape — a register where entries reach
`status:"done"` by *table-creation and endpoint-addition* (ids 1–3 are all "table created /
endpoints added / v0.4.0 deployed") rather than by the improvement being consumed.

## 3. Why this reframes this session's own work

The v1.3.0 reaper was committed to a deploy trigger and then sat **unobserved** because the only
actor that can promote it is an hourly cron. That is stage 5 behaving exactly as predicted. In a
fleet where stage 3 advanced state and stage 4 closed on evidence, a committed-but-undeployed fix
would be detected as drift and remediated. Here it is invisible to a loop that closes on a stale
flag.

**The single highest-value repair is stage 3**: make `exec_attempts` increment and make `state`
transition on execution — and, critically, stop treating HTTP 200 with an empty payload as success.
That is a small change with a large blast radius, and it is the precondition for everything else
being fixable.

## 4. Limits

- I sampled **3 rows each** from `fleet_issue_loop`, `fleet_issue_dispatch`, and
  `fleet_improvements`. The `state=queued` / `exec_state=executed` / `exec_attempts=0` pattern is
  consistent across all three dispatch rows I read, but I did not aggregate the whole table, so I
  cannot state what fraction of rows share it. #713's "34 remediations" figure is the ticket's, not
  mine.
- `miss_streak: 93` is read from three rows that may share a single scan epoch; whether 93 is
  per-row history or a global counter is unresolved.
- I did not read the code that writes these tables (`fleet_issue_dispatch` / `fleet_issue_loop`
  producers live in workers past the 32,768-char read cap), so "never transitions" is inferred from
  the persisted state, not from the control flow.
- The stage-5 constraint is established from `fleet_deploys` errors and repo module layout, not from
  the deployer's source.

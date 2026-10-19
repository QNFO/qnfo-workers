# Measured architecture constraints — 2026-10-19

Self-reference record. Every figure below is a live measurement taken by qnfo-ops on
2026-10-19, not an inference. The point of this file is to stop the fleet re-deriving
these four constraints from scratch, and to name which of them make the backlog
structurally un-drainable until changed.

## 1. The planner gate sits at steady-state WIP

`qnfo-code-orchestrator` 0.18.25-plan-wip-superseded-1 (live, 191054 bytes):

- `worker.js:2545` — `const PLAN_WIP = 12;`
- `worker.js:2711` — returns `planned: false` when `wip >= PLAN_WIP`
- `worker.js:592` — `CODE_TASK_DONE = ["merged","closed","superseded","publish_failed","needs_human","failed","reverted"]`

Measured WIP at 08:0xZ: **12 exactly** (8 queued + 1 branch_pushed + 2 published + 1 ready).
`12 >= 12` blocks. `issue_plans` took **10 rows in 24h, every one `outcome=not-code`,
zero planned**.

`PLAN_WIP` was raised 6 → 12 in 0.18.3 when `TICK_LANES` went 4 → 8 and
`MAX_OPEN_TASKS` 20 → 48. It was never scaled with them. With 8 lanes plus retries,
12 in flight is the normal steady state, so the planner only runs when the loop is
nearly idle — i.e. the gate is self-defeating. `MAX_OPEN_TASKS` (48) already bounds
the queue, so `PLAN_WIP` is both redundant and stricter than the real cap.

## 2. The two WIP counters disagree, so the recovery path cannot fire

| Component | WIP reported | Ceiling | Behaviour |
|---|---|---|---|
| `qnfo-code-orchestrator` gate | 12 | `PLAN_WIP` 12 | blocked |
| `qnfo-evolve` `/tick` | 9 | `wip_ceiling` 12 | `parked: []` |

`qnfo-evolve` does not count `branch_pushed`/`published`. So `WIP-RECOVERY-1` never
reaches its ceiling while the planner gate is closed: both components report healthy and
the deadlock is permanent. This is the failure mode that hides behind two green `/health`
probes.

Interim mitigation applied 2026-10-19T08:03Z:

- `ops_config.evolve_wip_ceiling` 12 → 8 (backup `backup:evolve_wip_ceiling:20261019`;
  revert = set it back to 12)
- new `fleet_tasks` `evolve-wip-recovery` (type `http`, POST `/tick`) scheduled by
  `fleet_crons` `evolve-wip-recovery-10m` (`*/10`), so recovery runs continuously
  instead of once a day

This is a workaround. The durable fix is one WIP definition read by both components.

## 3. Ownership blocks the largest issue class

All 50 open `METRIC-TRIGGER` issues attribute to a `metric_registry` owner.
**41 of 50 are owned by control-plane workers:**

| Owner | Breached metrics |
|---|---|
| qnfo-fleet-control | 33 |
| qnfo-code-orchestrator | 4 |
| qnfo-ops | 3 |
| qnfo-ai | 1 |
| loop-fixable (8 other workers) | 9 |

`worker.js:2552` — "workers that never auto-merge are never planned";
`PLAN_DENY_WORKERS = PLAN_CONTROL_PLANE.filter(w => PLAN_LOOP_CANARIED.indexOf(w) < 0)`.
`qnfo-evolve` reports the same wall from the other side:
`blocked: ["qnfo-code-orchestrator:queue:code-task-stalled", "qnfo-fleet-control:queue:issue-unremediated"]`.

The fleet therefore *detects* its own stall and is *forbidden* to remediate it.
47 of the 50 still read `state=MEASURED`, so closing them would be fake backlog
reduction and was not done.

## 4. File-claim serialization, not tick rate, is the throughput ceiling

`work_claims` rows for `kind=code-loop` carry **`expires_at: null`** — they never expire.
`qnfo-research-exec/worker.js` carried four simultaneous claims; the earliest
(`ct_im100060`, `branch_pushed`/`step=done`) deferred three other tasks behind it for the
life of its claim. Event evidence:
`code-task.claim-held: ct_im99937 file:qnfo-research-exec/worker.js held by ...ct_im100060; step deferred`.

Two claims were held by tasks already at `published` and were released by qnfo-ops on
2026-10-19 (`work_claims` ids 3391, 3397), one of which had blocked `ct_im2926` on
`qnfo-paper-explainer/README.md` since 2026-10-18 12:17Z.

Consequence: adding ticks cannot help when N tasks serialize on one file. Throughput is
bounded by (hot files) × (claim hold time), not by cron cadence.

## 5. Yield, not cadence

`code_tasks` over the measured window: **102 failed vs 94 merged** (~52% failure).
Dominant failure classes: merge-runner goal review (14), suites-fail-after-edit (10),
Workers AI 3046 timeouts (7), model returned no ```file block (5).
Tick cadence is already `*/2` with 8 lanes; the loop is not starving for ticks.

## Counter-evidence to the "tick faster" premise

The premise that faster ticking clears the backlog is **not supported** by the
measurements above. The loop has spare tick capacity and a 52% failure rate; the queue is
blocked by (a) a gate at steady-state WIP, (b) a recovery path whose counter disagrees
with the gate, (c) ownership of 41/50 of the largest class by workers the loop may not
change, and (d) per-file claim serialization. Faster ticks would increase the rate at
which tasks are created and deferred, not the rate at which issues close.

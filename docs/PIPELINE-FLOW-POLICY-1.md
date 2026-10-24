# PIPELINE-FLOW-POLICY-1

Status: adopted 2026-10-24 (ops endpoint, evidence-backed). Supersedes ad-hoc interaction between
POOL-BOUND-1, RESEARCH-RECOVER/PARKED-REGROUND-1, LEAN-WIDTH-1 and COST-SUSTAIN-1.

## 1. The measured problem

Two queues, one shared illusion of "backlog".

| Queue | Waiting (live exit) | Parked (no live exit) | Total |
|---|---|---|---|
| research_queue | 194 queued (185 past 180-min SLA) + 53 deferred | 644 (592 POOL-BOUND-1 evictions, 44 poison at recover_count=3, 8 revise-eligible) | 891 |
| agent_issues | 293 open (110 with no doer >3h, 239 unprobed >60m) | 10 code_tasks needs_human | 306 unified (+8 issue_ledger, +5 task_dod_register) |

Seven-day flow (2026-10-18 .. 2026-10-24): **490 arrivals, 83 published, 249 parked.**
Drain ratio 17% of inflow. Half of every day's arrivals is parked, not processed.

### 1.1 Why parked is not triage

`POOL-BOUND-1` parks rows to hold the deferred pool under `research_deferred_max` (default 60).
On 2026-10-19 one event parked 239 rows ("deferred pool 299 over research_deferred_max 60").
The rearm is a **level** trigger — `room = pbMax/2 - pool.length` — so rows return only when the
pool falls below 30. Continuous inflow pins the pool at 44-53, so the rearm never fires.
592 items of already-triaged work are therefore frozen and invisible to the drain.

### 1.2 Why the drain is narrow

`LEAN-WIDTH-1` halves research width (12 -> 6) while `workers_ai_run_rate_usd` exceeds its $95/30d cap.
The run-rate metric is a 7-day trailing average, so it still carries the pre-throttle spike
(2026-10-19: 5.04M neurons, $55.31) after the throttle has already worked
(2026-10-24: $3.55). Engage is fast, release is 168h — permanently lean after a single spike.

### 1.3 The arithmetic nobody reconciled

Measured unit cost, 7 days: $179.09 / 83 published = **$2.16 per paper** (~315k neurons/paper).
Declared Workers AI cap: **$95/30d = $3.17/day**. Fundable publish rate:
`P = 95 / (30 x 2.16) = 1.47 papers/day`.
Inflow is ~70/day. The pipeline admits **~47x** what the budget can fund, then parks the excess.
891 queued items at 1.47/day is **606 days** of work. The backlog is not a pipeline defect;
it is an admission defect.

## 2. Rules

**R1 — One anchor.** The monthly budget `B` is the only anchor. Everything else is derived:
`P = B / (30 x C)` where `C` = cost per published paper; `A = 3P` (daily admission);
`pool_bound = 10P`; `rearm_per_day = min(A, 24)`.
No knob may be set independently of `B`.

**R2 — Bound intake, never triaged work.** Excess work waits in `intake` with a `due_at`.
`POOL-BOUND-1` may evict un-triaged intake only. A row that has consumed a model call
(has a draft or sections) may be deferred, never parked.

**R3 — Park is bounded, not terminal.** Every parked row carries `revive_at` and a reason.
Revival is **rate-based** (`rearm_per_day` by priority), not level-based. After 3 failed
revivals a row is archived with its reason, not parked forever.

**R4 — One cost source of truth.** Cap decisions use `cost_daily`
(GraphQL `aiInferenceAdaptiveGroups`, $0.011/1k neurons, 10k/day free) — the only path that
shows the 2026-10-19 spike. `cf_analytics` ($37.76/30d) and `ai_spend_ledger` ($44.03/30d)
under-report that day by 5-13x and must not drive throttling. Every cost metric names its window.

**R5 — Hysteresis on width.** Engage lean at 7-day run rate > cap; release at 48-hour run rate
< cap. A throttle that cannot release is a stop.

**R6 — Every state has an exit.** No state without (owner, SLA, automatic exit):

| State | SLA | Automatic exit |
|---|---|---|
| queued | 180 min | claim -> researching |
| deferred | due_at | due -> queued |
| parked | revive_at | rate rearm |
| needs_human | 24 h | owner card with closing probe |
| open issue | 3 h to doer | doer + probe, or archive with reason |

**R7 — The fold gate must be satisfiable.** `qnfo-lifecycle/worker.js` is a 203KB hand-maintained
copy of `qnfo-backlog-exec/worker.js`. A copy maintained by hand is guaranteed to drift — it just
did, turning main red (14/15) and failing every code task that touches either file. The host must
be generated from the member by a sync step, or the invariant must compare a marked region.

## 3. Definition of Done and two paths (SLA-AND-PATHS-1)

| Stage | DoD | Path A | Path B |
|---|---|---|---|
| drain | queued count falls, published rises | research-exec leased stage | `ops_research_kick` sync (verified this turn, ok:true) |
| park revival | parked count falls monotonically | rate rearm in fleet-control | manual bounded requeue |
| code change | suite green on the branch | code loop merge | `cf_worker_deploy` + repo commit |
| cost | measured spend under cap | cost_daily GraphQL | metered ai_spend_ledger cross-check |

## 4. Applied in this change

- Fold gate repair (one line, `qnfo-lifecycle/worker.js:149`): host copy now carries
  `close_channel='auto:backlog-exec'`. Verified `15 passed, 0 failed` (was `14 passed, 1 failed`).
- This policy file.

## 5. Not applied, and why

- Width release (6 -> 12): requires R5 in code; releasing on the current 7-day metric would
  re-breach the $95 cap within hours.
- Budget change: raising the cap is a spending decision; surfaced, not taken.
- Backlog drain (`ops_issue_run`): owner-gated; requires explicit affirmation in the owner's message.

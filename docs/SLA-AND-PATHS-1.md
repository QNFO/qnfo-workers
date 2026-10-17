# SLA-AND-PATHS-1 — every step carries an SLA and more than one path to done

Doctrine (owner directive, 2026-10-17): **every step and every process shall carry an SLA and multiple
execution / remediation / workaround paths to a successful definition of done.**

This file states the rule, then applies it to the remediation pipeline, which is the worked example that
motivated it: on 2026-10-17 that pipeline had exactly one path for writing evidence, that path failed, and the
whole loop went open-circuit with no second route to closure.

## 1. The rule

For each step, four things must exist and be machine-readable:

| Field | Requirement |
|---|---|
| **SLA** | A time budget with a measurement and a breach action. Not "as soon as possible". |
| **DoD predicate** | A condition a machine can evaluate, not prose. The step is done when the predicate is true. |
| **Paths** | At least two, independent at the failure point: **A** primary execution, **B** automated remediation or bypass, **C** manual workaround that a person or session can run. |
| **Path-count check** | A detector that fires when the live healthy path count drops below two. Losing the second path is itself an incident, filed before the primary fails. |

Corollary: a step whose only path runs through a component that can fail as a unit is a single point of failure
and must be recorded in `spof_registry`, not merely believed redundant.

## 2. Applied: the remediation pipeline

| # | Step | SLA | DoD predicate | A (primary) | B (automated fallback) | C (manual workaround) |
|---|---|---|---|---|---|---|
| 1 | Probe executes | due time + 20 min | a verdict is computed and `last_verdict` is not `probe-error` | worker tick `remediationContractsTick` | CI consumer `remediation_consumer.py` on `workflow_run` | `node`/`wrangler` invocation of the same probe SQL |
| 2 | Evidence is persisted | 2 min after verdict | a row exists in `v_remediation_evidence_all` for `(class, verified_at)` | `INSERT INTO remediation_verifications` | **`INSERT INTO remediation_evidence`** (trigger-free sink, live since 2026-10-17) | session inserts into `remediation_evidence` with `path='C:session'` |
| 3 | Close / reopen decided | within the same tick | `agent_issues.status` changed **and** the deciding row's id is recorded | D1 triggers `autoclose_ins/_upd`, `reopen_on_relapse_d1` | worker evaluates the same predicate in code against `v_remediation_evidence_all` | session closes/opens with `issue_triage.close_evidence` naming the evidence row |
| 4 | Closure is durable | 24 h without relapse | contract holds a pass streak of `RT_HOLD_D` (7 d) | hold-and-recheck in the tick | trigger re-open on a later fail row | `fm-closure-relapse-unreopened` detector files the issue |
| 5 | Backlog drains | 120 min per issue (`SLA-120M`) | `issues_open_over_120m = 0` | issue loop | backlog-exec drain | owner card when the loop stalls twice |

### Consequence for the live outage

Step 2 has **one** live path today: path A fails with `triggers nested too deep` (issue 2794), so the pipeline
stops at step 2 and steps 3–5 are unreachable.

**Path B is now live and proven:**

```sql
-- succeeds while the same values are refused by remediation_verifications
INSERT INTO remediation_evidence (issue_id, class, transport, expected, observed, pass, verifier, path)
VALUES (NULL, 'zz-path-b-test', 'd1-query', 'ok', 'ok', 1, 'diagnostic', 'B:evidence-table');
DELETE FROM remediation_evidence WHERE class = 'zz-path-b-test';
```

`v_remediation_evidence_all` unions both sources, so a reader does not need to know which path carried the row.
Verified 2026-10-17: create, index and view applied; the insert above returned `changes = 1` while the identical
insert into `remediation_verifications` returned `7500: triggers nested too deep`.

**Shipped (qnfo-fleet-control 0.33.6-evidence-fallback wrote it; 0.33.7-sla-paths-readers makes it count; plus
`scripts/remediation_consumer.py`, 2026-10-17):** path B is now a writer whose rows are read, not a sink.

| Requirement | Where it now lives |
|---|---|
| Path A tried first | the tick's own insert; `verificationFallback()` in each catch |
| Fall through to B on refusal | `verificationFallback()`: identical row into `remediation_evidence` with `path='B:evidence-table'` |
| Same for the CI consumer | `record_verification()` in `scripts/remediation_consumer.py`, `path='B:consumer'` |
| Readers see either path | `rtPassStreakDays`, `rtReopenOnRelapse` and the consumer's hold/reopen reads all read `v_remediation_evidence_all` |
| Step 3 also has a second path | `rtCloseOnVerifiedEvidence()` — when the row went to B, a 7-day pass streak closes the issue in code with `close_evidence` naming the evidence row (the trigger only ever watched A) |
| Regression guard | `qnfo-fleet-control/sla-paths.test.mjs` (28 checks: refusal reproduced with the production message, fallback row intact, verdict survives, readers count B, degraded close sets evidence, healthy A writes nothing to B, consumer carries the same path) and `remediation-evidence-fallback.test.mjs` (0.33.6 conformance) |

Measured at 2026-10-17T16:12Z, immediately before the patch: `INSERT INTO remediation_evidence` returned
`changes=1`; the identical insert into `remediation_verifications` returned
`400 7500 triggers nested too deep`, with `issue_id NULL` and `pass=0` — so the refusal is a property of the
trigger graph, not of the row, and no writer could have succeeded.

## 3. Path-count check (the meta-requirement)

A process with two paths on paper and one in practice is worse than one path, because it is believed safe.
The check is a metric, not a review:

Counting rows is the wrong instrument. A fallback is never used while the primary works, so "a B row in the last
hour" reports the fallback dead by construction — the same decorative-green failure the directive exists to stop.
Liveness is **availability**:

- each path stamps a heartbeat in `path_liveness` when it carries a row;
- path B is drilled once a day (`zz-path-drill` row written and deleted) so its availability is proven rather than
  assumed;
- A is live within 6 h, B within 30 h (a daily drill plus slack);
- `v_path_health` exposes `a_last_ok`, `a_live`, `b_last_ok`, `b_live` in one row.

The tick reads it, reports `evidence_paths_live` in every result, and files `SINGLE-PATH-1: evidence persistence has
fewer than two live paths` (deduped on the open title) when the count is below two — with the two counts and both
remediation routes in the body. Measured in `sla-paths.test.mjs`: refused A + writing B reports 1 and files the
incident; healthy A + drilled B reports 2 and files nothing.

## 4. Existing steps that do not meet the rule

Found during the 2026-10-17 audit and not yet remediated:

| Step | Missing |
|---|---|
| Evidence persistence | **closed 2026-10-17** — A + B writers, union readers, code-side closure, drill (this file, `0.33.4`) |
| `code-read` contract verification | one runner (`remediation-consumer.yml`), cancelled by concurrency; no B and no C |
| Fleet deploy | `canonical-deploy` only; a raw `PUT /content` skips the lock, the ledger and the schedules (documented in the workflow header) |
| Owner queue delivery | one channel (dashboard card); no email fallback when the dashboard is down |
| Zenodo publication | one API path; the errata publisher has a fallback, the referee loop does not |

## 5. Enforcement

- A process may not be recorded as `active` in `v_failure_mode_status` without an SLA and two named paths.
- The nightly self-audit reports the count of steps with fewer than two live paths; that count is the metric
  `single_path_steps`, target 0, warning above 3.
- Owner-facing rule: if a step cannot get a second path, its single path is registered in `spof_registry` and
  appears on the dashboard's Reliability row rather than being declared resilient.

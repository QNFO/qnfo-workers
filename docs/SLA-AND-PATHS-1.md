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

**Still required to make path B load-bearing:** the worker tick and the CI consumer must write to
`remediation_evidence` when the primary insert throws (already wrapped in `0.33.3` — extend the catch to fall
through to path B), and step 3's code path must read `v_remediation_evidence_all` instead of the base table.
Until that ships, path B is a sink with no writer, which does not meet the rule.

## 3. Path-count check (the meta-requirement)

A process with two paths on paper and one in practice is worse than one path, because it is believed safe.
The check is a metric, not a review:

```sql
-- live healthy paths for evidence persistence; below 2 is an incident
-- A counts only if an insert into remediation_verifications succeeds inside the last hour
-- B counts only if remediation_evidence has a writer (row newer than 1 h with path LIKE 'B:%')
```

File as `SINGLE-PATH-1` when the count is below two, with the step name in the title.

## 4. Existing steps that do not meet the rule

Found during the 2026-10-17 audit and not yet remediated:

| Step | Missing |
|---|---|
| Evidence persistence | path A only (this file) |
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

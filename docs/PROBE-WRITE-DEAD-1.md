# PROBE-WRITE-DEAD-1 — the remediation verifier cannot write evidence

Filed: 2026-10-17T15:5xZ · owner: qnfo-fleet-control maintainer · severity: high · pillar: autonomy

## Symptom

`INSERT INTO remediation_verifications` fails for **every** row with:

```
D1 error 7500: triggers nested too deep: SQLITE_ERROR
```

Consequences, in order:

1. The remediation tick can still run probes and set `last_verdict`, but **no evidence row is written**.
2. `remediation_verification_autoclose_ins/_upd` and `remediation_reopen_on_relapse_d1` act on inserted rows.
   With no rows, **nothing closes and nothing reopens**. The loop is open-circuit.
3. `tick_runs.verify` reads 0 remediation_verifications rows per hour, so the fleet's own tick-sequence
   metric degrades too.

Last successful evidence row: `remediation_verifications.verified_at = 2026-10-17 15:08:58`.
Rows by minute around the stop: 14:40 → 257, 14:41 → 43, 14:50 → 55, 15:08 → 12, then **nothing**.

## Reproduction (no data dependency)

```sql
-- fails, issue_id NULL and a class with no contract
INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verifier)
VALUES (NULL, 'zz-probe-test', 'd1-query', 'ok', 'ok', 1, 'diagnostic');
-- fails the same way
INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verifier)
VALUES (NULL, 'zz-probe-test', 'd1-query', 'ok', 'pending: 9 failures (target <= 3)', 0, 'diagnostic');
-- succeeds
DELETE FROM remediation_verifications WHERE class = 'zz-probe-test';
```

Verified twice on 2026-10-17 (15:48Z and 15:5xZ). Because the failing row references no contract and no issue,
the explosion is in a trigger **program**, not in data-dependent recursion.

## What is already ruled out

| Ruled out | Evidence |
|---|---|
| The worker version | Fails identically on 0.34.2, on 0.33.2 after rollback, and on 0.33.3 |
| A schema change today | `migration_runs` shows no migration after 2026-10-14T12:29Z |
| My trigger edit (15:15Z) | Failure began 15:08:58, before it; and the reproduction has no contract/issue to cascade through |
| The transport/evidence guards | Both raise named messages; this is a depth error, not a guard message |
| Data-dependent recursion via `agent_issues` | `issue_id` is NULL in the reproduction, so no `agent_issues` row matches |

## Candidate mechanism (unconfirmed)

`remediation_verifications` → (autoclose) `issue_triage` → `triage_close_sync_issue_ins` → `agent_issues`
→ `agent_issues_superseded_contracts_upd` / `agent_issues_birth_contract_ins` → `remediation_contracts`
→ `contract_probe_templates_v2*_loop` (four INSERT triggers that UPDATE `remediation_contracts` again)
→ recursive trigger update on the same table.

Trigger counts by table: `agent_issues` 31, `remediation_contracts` 14, `issue_triage` 8,
`remediation_verifications` 7. A chain of that depth can exceed D1's trigger depth limit.
**This is a hypothesis, not a measurement** — it does not explain why the same graph accepted inserts at
15:08:58.

## Required fix (in order)

1. Confirm which trigger body raises the depth error: drop `remediation_verification_autoclose_ins` and
   `remediation_reopen_on_relapse_d1` on a scratch database, re-run the reproduction, then bisect the
   `contract_probe_templates_v2*_loop` family. Do **not** bisect on production.
2. Break the cycle: the four `contract_probe_templates_v2*_loop` triggers all run `AFTER INSERT ON
   remediation_contracts` and `UPDATE remediation_contracts`; make them mutually exclusive (single template
   chooser) or gate the UPDATE with `WHEN OLD.status IS NOT NEW.status`.
3. Re-run the reproduction until it returns a row id.
4. Only then re-enable close/reopen verification and watch one tick.

## Do not do

- Do not close issues to clear the backlog while the verifier is down. `fm-closure-without-disposition`
  (1,155 issues closed without evidence) is the exact failure this would reproduce at scale.

## Re-land after the write path is healthy

`qnfo-fleet-control` 0.34.0 `MEASURED-PENDING-1` (worker half) is rolled back but proven correct in isolation
(17/17 classifier cases, live SQL twin returning 35,302 vs 33,710 rows). The SQL half is already live in the
triggers (`migrations/2026-10-17-measured-pending-triggers.sql`). Re-land the worker half only after step 3,
together with `scripts/remediation_consumer.py`'s matching predicate.

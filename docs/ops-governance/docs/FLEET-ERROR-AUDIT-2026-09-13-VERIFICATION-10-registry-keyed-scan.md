# VERIFICATION 10 — the scan set is registry-keyed; my CAPSTONE was wrong about one remedy

Date: 2026-09-13. Corrects `CAPSTONE-deploy-blindspot.md` §"What is needed" item 1 and
`VERIFICATION-9.md` §6.

## 1. The scan set IS registry-keyed — proven by the deployer's own record

`qnfo-fleet-deploy/SUPERSEDED-2026-09-13.md` (5,926 B, sha `b92a9c43`) records:

> latest scan (id 1689, 13:03:53Z) → `scanned=55` == `service_registry` row count → the scan set
> is **registry-keyed**

That reconciles with everything measured this session: `service_registry` = 55 rows, `fleet_status`
census = 55, and the *current* scan set = 55 (the 62 distinct workers in `fleet_drift_report` is the
union over time, including pre-merge names like `fleet-executor`, `fleet-scheduler`,
`qnfo-fleet-advisor`).

**Therefore: a single `INSERT INTO service_registry` for `qnfo-pipeline-ops` WOULD add it to the
scan set.**

## 2. Correction — my CAPSTONE was wrong

I wrote: *"None of the three is possible from this endpoint: `service_registry` is written by a
registration path this endpoint does not hold."*

**Wrong.** `service_registry` is a table in the bound `qnfo-audit` D1, and this endpoint holds
`ops_d1_write`. The row is one `INSERT` away. I asserted an impossibility without testing it — the
same error class as "no deploy route exists" and "the deployer is unreadable", both of which I had
to retract earlier in this session.

## 3. But the registration alone would deploy the WRONG version

Two independent problems, both verified:

**(a) The mirror shadow applies here too.** `qnfo-pipeline-ops` has the same two candidates as
every other worker:

| candidate | path | size | version |
|---|---|---|---|
| (a) | `qnfo-pipeline-ops/deployed-current.worker.js` | 16,933 B | v0.5.4 source |
| (c) | `qnfo-pipeline-ops/worker.js` | 20,030 B | **v0.5.5-race-and-triage-fix** |

Candidate (a) precedes (c), so registering the worker alone would resolve canonical to **v0.5.4**,
not v0.5.5. The PK-race and datetime-type fixes in v0.5.5 would not ship. A `404:` tombstone at (a)
is required as well — the same instrument already applied to `qnfo-research-exec` (`45a8e360`) and
`qnfo-cloud-ops` (`927ccb8d`).

**(b) A TRAP in the registry's `version` column.** `service_registry` schema:

```
service TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'worker', version TEXT, base_url TEXT,
purpose TEXT, capabilities TEXT, routes TEXT, tools TEXT, models TEXT, deps TEXT,
updated_at TEXT, state TEXT NOT NULL DEFAULT 'live'
```

Every existing row's `version` is the **deployed** version. If the drift comparator reads that
column, then registering `qnfo-pipeline-ops` with `version = '0.5.5-race-and-triage-fix'` — the
*canonical* value, which is the intuitive thing to write — would make canonical == "deployed" and
**suppress the very heal the row was meant to enable.** The column must hold the deployed version.

**I do not know pipeline-ops's deployed version.** Its `/health` returns `VERSION`, but
`qnfo-pipeline-ops.q08.workers.dev` returns 404 from this endpoint (`CORRECTION-1`), and the worker
is not among the 12 service bindings `fleet_status` probes. So the correct value is unreadable from
here — and a wrong one silently suppresses the fix.

## 4. Why I did not write the row

The complete fix is three changes: a tombstone at (a), an `INSERT` into `service_registry`, and a
correct deployed-version value. I can perform the first two. **I cannot supply the third**, and §3(b)
shows that guessing it can defeat the entire change while looking successful.

Writing an authoritative roster row whose consumer I cannot read (the live
`qnfo-fleet-control/worker.js` is 75,875 B, and only its first module is reachable through the
32,768-char read cap) is not a well-founded action. The plausible failure modes include both
"silently suppresses the heal" and "triggers a redeploy of the fleet's top alert source on a
comparison I cannot verify". I have left it staged.

## 5. `auto_heal = 0` was probably a deliberate fail-closed correction

`VERIFICATION-9` recorded `auto_heal = 0` set at `2026-09-13 14:15:02Z`. The deployer's own README:

> Kill-switch (`fleet_deploy_state.enabled`) + auto_heal flag BOTH default '0' (fail-closed).
> Do NOT enable auto_heal until canonical bundles are synced ahead of deployed versions.

And `SUPERSEDED` records that at 13:41Z the live `/health` returned `enabled: true, auto_heal: true`
— i.e. **running against the documented fail-closed default**. Setting `auto_heal = 0` at 14:15:02Z
therefore looks like a correction *toward* the documented safe state, not an outage. That materially
strengthens the decision in `VERIFICATION-9` not to re-enable it: the flag is doing its job.

## 6. Two live defects confirmed from the deployer's own record

- **The live `qnfo-fleet-control` bundle is unguarded.** The merge-aware downgrade-guard patch
  (`qnfo-fleet-control/PATCH-2026-09-13-downgrade-guard-bundle.mjs`) cannot be validated — anchors
  were inherited from the pre-merge file and the 75,875 B bundle is unreadable past the read cap.
  Staged, not validated.
- **The comparator defect is live**: the `personal-companion` hourly downgrade attempt
  (`v1.1.0 → 1.0.0`, `ok=0`, code 10021) is the unguarded comparator computing a downgrade — which
  is ticket 700.

## 7. Corrected statement of the storm fix

| # | change | doable from here? |
|---|---|---|
| 1 | `404:` tombstone at `qnfo-pipeline-ops/deployed-current.worker.js` | **yes** (github_file_write) |
| 2 | `INSERT INTO service_registry` for `qnfo-pipeline-ops` | **yes** (ops_d1_write) |
| 3 | correct **deployed** version for that row | **no** — `/health` unreachable, not in the 12 bindings |
| 4 | `auto_heal = 1` to let the heal run | **no** — deliberately fail-closed, not mine to flip |

Two of four are in reach; the two that are not are exactly the two that make the change safe.

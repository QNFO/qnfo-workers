# SLA metrics: what each figure counts (SLA-METRICS-1, SLA-STAGES-1)

Charter pillar: autonomy. Measured on qnfo-audit on 2026-10-19 (counts only). Files:
`migrations/2026-10-19-sla-metrics-disjoint.sql`, `migrations/2026-10-19-sla-stage-columns.sql`; suites
`migrations/sla-120m-disjoint.test.mjs`, `migrations/sla-stage-columns.test.mjs`.

## 1. sla_breaches_over_120m counts each item once

`v_sla_over_120m.total_over_120m` (metric `sla_breaches_over_120m`, trigger 5929, issue 99950; read by qnfo-fleet-control's 10-minute
SLA tick and the dashboard KPI) is the number of distinct items past 120 minutes. Before SLA-METRICS-1 it was a sum of
drill-down columns, and some columns counted rows another column already counted.

| Term in the sum | Counted twice because | Rows on 2026-10-19 09:35Z |
|---|---|---|
| `issues_without_doer_3h` | every such issue is an open issue older than 120 minutes, so it is inside `issues_open_over_120m` | 71 of 165 |
| `content_items_over_sla` with `research_queued_180m` | a queued research row past 120 minutes is a `v_content_pipeline` row past its stage SLA | 151 of 155 |
| `content_items_over_sla` with `research_review_error` | a research row in review for 60 minutes is a content row past its review SLA | 3 of 8 |
| `content_items_over_sla` with `research_held_over_sla`, `research_claims_over_120m` | same shape | 0 |
| `triage_gap` with `issues_open_over_120m` | an untriaged open issue older than 120 minutes is an aged issue (`triage_gap` has no age) | 0 |
| `code_tasks_stalled` with `code_tasks_queued_over_120m` | a queued task idle for 120 minutes is stalled and queued over 120 | 0 |

Result: **before 811, after 586** (a distinct-key count of the same populations, computed independently by `fm-sla-metric-overlap`,
also reads 586). 225 rows, 28 percent, were counted twice. The value in `metric_history` steps down by that amount at the first
10-minute tick after the migration applies. **That step is a change of definition, not remediation**: no queue got shorter. The
`decision_log` row of the migration says so (INTEGRITY-GUARDS-1), and nothing may be closed on the strength of the drop.

How the total is built now:

* `v_sla_overlap_120m` (new, one row) counts the rows two terms share: `research_in_content_over_sla`, `triage_gap_in_open_120m`,
  `code_tasks_stalled_and_queued_120m`. Its predicates are the ones the named `v_stuck_summary` columns use.
* `v_sla_over_120m` has the same columns in the same order as before (the dashboard lists every numeric column as a class, and
  qnfo-fleet-control reads `total_over_120m`, `issues_open_over_120m`, `oldest_open_issue_min` by name). Only the `total_over_120m`
  expression changed: it leaves out `issues_without_doer_3h` and subtracts the three overlaps. Every drill-down column keeps its value,
  so issue 99950 can still read each class.
* `issues_without_doer_3h` is dropped from the total rather than subtracted because it is contained in `issues_open_over_120m`.
  `v_issue_age.age_min` is whole minutes, so an issue between 120.0 and 121.0 minutes old is in the first set and not yet in the
  second; the total leaves out at most the issues filed in one minute. The `fm-view-alias-capture` probe asserts the containment
  (`issues_without_doer_3h <= issues_open_over_120m`).

Detectors (both checked hourly by the remediation consumer):

* `fm-view-alias-capture` follows the new total and still compares `issues_open_over_120m` with a direct count of `v_issue_age`.
* `fm-sla-metric-overlap` (failure mode `sla-metric-overlap`) counts distinct items by key over the five populations that can overlap
  and adds the terms that are not items; `total_over_120m` minus that must be 0. It reads 225 on the old view and 0 on the new one. A
  new term that repeats an item fails it.

### What did not change, and why

* `stuck_items_over_sla` (trigger 3059, issue 2971) is untouched. Its seven terms read seven different tables or statuses and are
  disjoint (re-checked row by row), so it has no double count of its own. It overlaps `sla_breaches_over_120m` only because both are
  headlines. Removing a term would silence a detector, and `queue_sla_tick_10m` reads `research_queued_180m` and `issues_without_doer_3h`
  by name, so no `v_stuck_summary` column is renamed or removed. (Its registered `formula` text says "all columns except
  issues_unprobed_60m"; the trigger sums seven. That wording drift is not touched here.)
* No threshold, trigger target, cap or hold changes, and no `control_registry` or `queue_sla` row is added: the change adds no queue and no hold.
* The ratchets on triggers 5929 (565), 5937 (215), 5944 (190) and 362 (260), set out of band on 2026-10-18 (`REDERIVE-2026-10-18`
  in their notes), are not in any file on main and are not changed here. 5929 was set from the inflated total; at 586 it still hits.
  Whether 0 is the right target for a metric the issue generators refill is an owner decision for `control_registry`, not part of this
  change. A side table with an expiry would have no consumer (`evaluateMetricTriggers` reads `analytics_metric_triggers.threshold`), so none was created.
* Closing issue 99950 needs its trigger to stop hitting and its contract to pass; the migration closes nothing.

## 2. v_sla_compliance names the stage and the trend

`v_sla_compliance` keeps its nine columns, the `state` and `queue_state` rules and `sla_min = 120`, and appends three columns:

| Column | code-task-merge | research-publish |
|---|---|---|
| `propose_wait_minutes` | `created_at` to `pr_opened_at` | `created_at` to `COALESCE(claimed_at, created_at)` |
| `work_minutes` | `pr_opened_at` to `merged_at` (the merge lane) | published minus claim, equal to `step_minutes` |
| `recent_24h_minutes` | mean created-to-finish of rows that finished in the last 24 hours, NULL when none | same |

Measured 2026-10-19 09:30Z on the 69 code tasks merged in 7 days: end-to-end 402.9 minutes (breach), of which the wait before a
pull request exists is 368.2 and the merge lane 34.7. The 46 merges of the last 24 hours average 511.7 minutes because a backlog created
on 2026-10-18 is still draining through them. Research-publish: 118 publishes, wait before claim 4628.1, work 168.7. So the minutes are
spent before a PR exists (the propose and verify retries), not in the merge lane; `recent_24h_minutes` turns a day after a regression
turns instead of a week.

The closing probe of issue 2827 (class `issue-2827`) now measures the SLA. It reads `ok` when the issue is closed, or when the process
contract worklist is empty and both `state` and `queue_state` of `code-task-merge` are `ok`; `no-merges-in-window` when nothing merged
(never a pass on an empty window); `dod-worklist-nonzero` while a DoD is still intent; and `pending: code-task-merge ...` with the split
otherwise. It stays pending until the 2026-10-18 backlog leaves the 7-day window (about 2026-10-25) and new tasks keep merging in about an hour.

## 3. Reading the figures

```sql
SELECT total_over_120m FROM v_sla_over_120m;                       -- distinct items past 120 minutes
SELECT * FROM v_sla_overlap_120m;                                  -- rows two terms share (subtracted)
SELECT process, queue_minutes, propose_wait_minutes, work_minutes, recent_24h_minutes, state, queue_state FROM v_sla_compliance;
```

The overlap detector is the `verify_probe` of `remediation_contracts` class `fm-sla-metric-overlap`; it must read `observed = 0`.

## 4. Rollback

Each migration keeps what it replaced in `bak_20261019_sla_metrics_disjoint` and `bak_20261019_v_sla_compliance` (`kind`, `k`, `v`);
the `Rollback:` header of each file names the rows to restore. No table other than the two backups is created.

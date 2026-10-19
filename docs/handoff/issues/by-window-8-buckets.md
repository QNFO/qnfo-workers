# COST-FEED-7D-WINDOW-1: /api/cost by_model_7d and by_worker_7d sum 8 UTC day buckets (today partial) under a 7d label, with est_usd unlabelled as list price

priority: medium
code_task_path: qnfo-fleet-dashboard/worker.js
code_anchor: FROM ai_call_counters WHERE day >= date('now', '-7 days') GROUP BY worker
anchor_count_on_main: 1

## Description (as drafted for the agent_issues row)

Charter pillar: cost (honest measurement of spend). Child of owner task 100148 (dashboard figures audit, row "spend: 7-day model and worker breakdown window", skeptic-confirmed 2026-10-19).

DEFECT. GET https://fleet.qnfo.org/api/cost serves by_model_7d and by_worker_7d from COST_FEED_SQL in qnfo-fleet-dashboard/worker.js (main 2f46254b, dashboard 1.51.2-standby-proof-1, lines 5023-5024; costFeedData at 5027). Both queries filter `day >= date('now', '-7 days')` with no upper bound. That is today (a partial UTC day) plus the 7 days before it, so 8 UTC buckets under a "7d" label. The same endpoint's run_rate comes from v_cost_run_rate, which uses complete days only (date < today), so the two parts of one answer use different windows. Separately, est_usd = neurons x 0.011 / 1000 is the list price with no deduction of the 10,000 neurons/day free tier that the ledger (cost_daily workers_ai note "10k/day free, $0.011/1k") and the run-rate do deduct, and nothing in the body says so.

MEASURED (re-confirmed 2026-10-19 13:14-13:16Z, read-only):
- DISPLAYED, live GET /api/cost at 13:15:50Z (revision 17fbda86): by_worker_7d 15 workers sum 13,260,979 neurons, est_usd 145.8707 (by_model_7d 16 models 13,260,981 / 145.8709). Top row qnfo-research-exec 9,801,009 neurons, est_usd 107.8111.
- SOURCE, qnfo-audit.ai_call_counters with the dashboard's own predicate: MIN(day) 2026-10-12, MAX(day) 2026-10-19, COUNT(DISTINCT day) = 8, 13,246,051 neurons at 13:14Z, of which today's partial day is 3,182,942 (24 percent).
- SOURCE, 7 complete UTC days 2026-10-12..2026-10-18: 10,063,109 neurons, list price 110.69. The displayed 7d total is therefore +31.8 percent too high. qnfo-research-exec: 7,347,497 complete-day neurons (list 80.82) against 9,801,009 displayed (+33.4 percent; 2,469,516 of it is today's partial day).
- Free tier size: 7 days x 10,000 neurons = 70,000 neurons = 0.77 USD (0.7 percent of 110.69). The window is the material error; the missing label is the honesty gap. The free tier is account-wide, so splitting it per worker or per model would be arbitrary: label, do not deduct.
- Ledger cross-check: cost_daily workers_ai for the same 7 complete days sums 95.8625 (after free tier, from GraphQL neurons; for example 2026-10-18 3,588,444 neurons -> 39.3629 = (3,588,444 - 10,000) x 0.011/1000). The worker counters differ from the GraphQL neurons by -4 percent to +29 percent per day (10-17 counters 1,784,128 vs ledger 1,403,892; 10-18 4,646,180 vs 3,588,444). That basis gap is a different defect; this issue only has the feed say which basis it shows.

LEVER (one file, qnfo-fleet-dashboard/worker.js, near COST_FEED_SQL and costFeedData):
1. Add `var COST_WINDOW_SQL = "day >= date('now', '-7 days') AND day < date('now')";` above COST_FEED_SQL and use it in the WHERE of by_model_7d and by_worker_7d (7 complete UTC days, same window as v_cost_run_rate and fleet_ai_run_rate_30d_usd).
2. Add `MIN(day) AS first_day, MAX(day) AS last_day` to the by_worker_7d select list.
3. In costFeedData after the SQL loop, derive from those rows (never from the intent): `out.window_7d = { first_day, last_day, span_days, includes_today, label }` where first_day is the minimum first_day, last_day the maximum last_day, span_days the day count between them inclusive, includes_today is last_day >= today's UTC date, and label is `span_days + " complete UTC days"` when includes_today is false, else `span_days + " UTC days including partial today"`; all null when the rows are empty (a blind part must not publish a window).
4. Add `out.est_usd_basis = "worker counters (ai_call_counters) at list price, before the 10,000 neurons/day free tier"` and `out.free_tier_neurons_per_day = 10000`. Keep est_usd, the column names and schema_version fleet-cost/v1, so qnfo-ops and other readers are unaffected.
Do not add a third SQL key to COST_FEED_SQL: cost-feed.test.mjs asserts `blind.length === 2` for a missing ai_call_counters table.
Verified on a scratch copy of main (not committed): with this lever the existing 14 assertions of qnfo-fleet-dashboard/cost-feed.test.mjs pass unchanged; a fixture of 9 daily rows gives window_7d {"first_day":"2026-10-12","last_day":"2026-10-18","span_days":7,"includes_today":false,"label":"7 complete UTC days"} and 7 days of neurons; the old predicate with the label code gives "8 UTC days including partial today", and `day > date('now','-7 days')` gives "7 UTC days including partial today", so neither a label-only change nor a relabel passes the probe.

DEFINITION OF DONE: (a) live /api/cost carries window_7d.label "7 complete UTC days", includes_today false, est_usd_basis, and a by_worker_7d neuron total within about 1 percent of the complete-day SQL sum (about 10.06M today, not 13.26M); (b) cost-feed.test.mjs gains assertions in the same PR: a row dated today is excluded from both parts, the label reads "N complete UTC days", est_usd_basis is present, and the blind case keeps window_7d null; (c) VERSION bumped as a patch above the highest core on main and the open PRs (qnfo-fleet-dashboard 1.52.0 is claimed by the unmerged HA-DEGRADED-READ-1 work, so take the next number above whatever is highest when you bump), deployed-current.worker.js identical to worker.js; (d) the runtime-probe below passes after the canonical deploy.

runtime-probe: {"url": "https://fleet.qnfo.org/api/cost", "status": 200, "contains": "7 complete UTC days", "absent": "including partial today"}
code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js
code-anchor: FROM ai_call_counters WHERE day >= date('now', '-7 days') GROUP BY worker

## Closing probe

```sql
(runtime/code probes are lines of the description)
```

Result when drafted: FAIL (as required). GET https://fleet.qnfo.org/api/cost returned 200 at 2026-10-19 13:15:50Z (revision 17fbda86); the body contains no "7 complete UTC days" (grep -c = 0), and has no window_7d, est_usd_basis or free_tier fields, so the contains check fails. The same GET shows the defect values: by_worker_7d 13,260,979 neurons / 145.8707 against 10,063,109 neurons / 110.69 for the 7 complete days. Prototype check on a scratch copy of main (not committed): the lever gives "7 complete UTC days" and passes; the old predicate gives "8 UTC days including partial today" and fails; `day > date('now','-7 days')` gives "7 UTC days including partial today" and fails the absent check.

## Notes

Read-only: nothing was written to the repo, D1 or GitHub; the only files written are scratch copies and a prototype in /tmp/claude-0/-home-user-qnfo-workers/4cceb28f-9cdc-5c6e-a011-7ca1d1e22017/scratchpad/ (dash-main.js, cost-live.json, proto/).

Defect re-confirmed on origin/main 2f46254bffe87cfcba770559be49a4ac6ad2876e (fetched this session; equals the worktree HEAD): COST_FEED_SQL.by_model_7d and by_worker_7d are at qnfo-fleet-dashboard/worker.js lines 5023-5024 (the skeptic's 5018-5019 was 1.51.1), costFeedData at 5027, the route at 2750. Anchor text counted with node over the file from origin/main: exactly 1 occurrence (the by_model twin is also exactly 1; the shorter `WHERE day >= date('now', '-7 days')` occurs 2 times, so it is not usable).

Duplicate check, none found: (1) agent_issues with status open/monitoring/in_progress/claimed matching COST-FEED, COST_FEED_SQL, by_worker_7d, by_model_7d, "8 buckets", COST-FEED-7D, or /api/cost with free tier: 0 rows. Only related rows are closed 100071 DASHBOARD-COST-FEED-1 (the feed's birth, closed) and the open parent 100148 (owner task, this audit). (2) Open PRs via the GitHub REST API: only 2905 and 2901 (RESEARCH-EXEC-PARSE-1, qnfo-research-exec), unrelated. (3) The HA-DEGRADED-READ-1 commit 7055eda0 in /home/user/qnfo-workers/.claude/worktrees/wf_5800c44f-4df-1 touches qnfo-fleet-dashboard/worker.js (1.51.1 -> 1.52.0, rum/human-audience code) but its diff contains no COST_FEED, by_worker_7d, by_model_7d or cost-window text, so it does not cover this defect; it only competes for the VERSION number and the mirror. (4) code_tasks on qnfo-fleet-dashboard/worker.js not finished: ct_im100097 and ct_im100071, both status publish_failed (old, other defects), none active.

Live claims at 13:14Z (work_claims released_at IS NULL and unexpired): 0 on qnfo-fleet-dashboard/*. Other live claims are on other paths (session_01JADz8u... on qnfo-code-orchestrator, migrations/, qnfo-social, qnfo-github-steward, scripts/; session_01QpQv19... on qnfo-fleet-control, personal-companion, q08-signal-engine, idea-hub, migrations/ files, and issue:100148/100149/100150/100151 until about 14:19Z). The code loop should still take `file:qnfo-fleet-dashboard/worker.js` before it edits.

Why the d1-query probe field is empty: the defect is code on the dashboard worker and no D1 table observes the fix (a SELECT on ai_call_counters with the old predicate would never pass after the fix, and one with the new predicate passes already), so the only honest closing probe is the runtime-probe line, which the PROBE-BIRTH-RUNTIME-1 trigger turns into the runner-https contract. The response is pretty-printed JSON; the probe uses no JSON punctuation, so formatting changes do not matter.

Priority medium: the figure is 31.8 percent high on an open read feed that qnfo-ops and loops use when remediating spend, but no budget gate or money movement depends on it (BUDGET-SOFT-ROUTE-1: caps steer, never stop). Aging raises it one level per 24 h as usual.

Not in this issue (separate rows of the same audit): counter vs GraphQL ledger neuron gap (-4 percent to +29 percent per day), run-rate extrapolation caveats (owner_gateway 2 days divided by 7, direct_providers constant 450/day), the pageview rows. A failure_modes row (fm-cost-feed-window-bucket: day-bucket predicate with no upper bound under a fixed-length label) and its detector contract belong with the fix per the anti-fragile rules; the runtime-probe above is its detector until that row is written, and the migration for it is a separate D1 change, not part of the one-file code task.

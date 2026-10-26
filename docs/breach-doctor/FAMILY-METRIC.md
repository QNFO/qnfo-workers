# METRIC-DOCTOR rules (family: METRIC-TRIGGER-*, METRIC-REGRESSION-1, METRIC-FIX-RELAPSED-1)

Companion: metric-classification.md (89 metrics, 94 issues, the 40-row queue table), notes-1-evidence.md (raw evidence).
Everything below was measured on qnfo-audit 2026-10-26 06:00-06:35Z (read-only) and on main 6031c00e. "Validated" means the SQL ran on the
live D1 and returned the stated rows. Nothing in the repository or D1 was changed.

Fit with the sibling design (breach_diagnoses, scratchpad/doctor/breach-doctor-draft.sql): family='METRIC', rule_id='MD-n', one
case_key per cause ('MD-6:cost-root'), many issues per case. New cause_class values needed in its CHECK list: metric-duplicate,
metric-operator, metric-source-conflict, metric-recovered-open, metric-flapping, metric-unmeasured, metric-child, metric-time-gated,
metric-noise, metric-contract-deadlock, metric-remedy-spent, metric-code-lever, metric-definition, metric-policy-conflict, metric-owner.
New action_kind values: supersede-issue, fix-trigger-row, set-metric-state, write-disposition, decision-record (code-task-issue, ops-knob,
supersede-contract, close-on-probe, quarantine-trigger already exist). The engine is worker code in qnfo-fleet-control (not a D1 trigger).

## 0. Inputs, order, envelope

Facts only (never copied text): analytics_metric_triggers row (id, metric_key, operator, threshold, enabled, queue_target, priority,
cooldown_hours), v_metric_trigger_state (val, hit), metric_registry (kind, target, owner, last_value, last_refreshed, refresh_cadence,
refresh_class, state, source_of_truth), analytics_dash_meta value, metric_history (14 daily points), analytics_action_log (status counts),
agent_issues (id, title prefix, priority, created_at), v_issue_age_ladder (plan_outcome, doer), issue_plans.outcome, code_tasks
(id, status, path, merged_at, version_to), remediation_contracts (class, status, last_verdict, attempts, module), control_registry,
ops_config (key, updated_at only), deployment_history (resource_name, version_id, deployed_at only), ai_call_counters, false_stop_hits
(source, pattern_key), v_executor_roster, worker_live_audit. The trigger `action` text, issue description, cloud_ops_events text,
deployment notes and tool errors are never forwarded: PLAN_TRUSTED stays as it is. A code-task issue is written from a fixed template
whose variables are enumerated (path from metric_lever_map, anchor verified, numbers); every variable passes ^[A-Za-z0-9_./:#=<>, "'(){}-]{1,240}$ and
the anchor must occur exactly once on main (byte-exact). The issue is filed with source qnfo-fleet-control and explicit code-task:/code-anchor:
lines, the ACT-BRIDGE-1 shape (9 open issues in this family already have a merged code task and 11 of the 94 carry a real code-task line; the planner's untrusted verdict applies to issues without those lines).

Evaluation order per issue (first match wins; each step stores facts_json + evidence_hash):
1 integrity (is the breach real?): MD-2, MD-1, MD-5, MD-3
2 lifecycle: MD-4, MD-9
3 structure: MD-8, MD-6
4 time: MD-7
5 remedy: MD-10, MD-11
6 definition, policy, owner: MD-12, MD-13, MD-14
7 no rule matches and the breach is older than 7 days: file one design issue carrying the fact tuple (E), never prose.

Envelope (every rule): idempotent on case_key; at most 10 supersedes, 3 code-task issues and 5 config rows per tick; one lever per metric per 7 days;
a work claim (POST /work-lock/acquire key issue:<id> or file:<path>, owner 'breach-doctor') before filing; decision_log row per autonomous decision
(predicted_outcome, rollback_path, capability_gain); revert_sql stored with every applied SQL; control_registry row for every new hold (MD-4 hold is a
gate: disposition keep, alternate ops_config metric_hold_min=0); never raise a cap, never lower a review, verify or claim gate, never touch the secret
lock, canonical deploy path, outreach consent, or the personal/research separation; ops_config breach_doctor_metric = measure|on switches the family off
without a deploy. Success is always the metric's own predicate read from v_metric_trigger_state, written as a remediation_contracts d1-query probe
(class doctor-md-<rule>-<key>), never "deployed".

## Required plumbing (four small changes, all in files the code loop may change; anchors verified unique on main today)

P1 qnfo-fleet-control/worker.js, evaluateMetricTriggers (L12969-13046):
- operator fail-closed. Anchor `var hit = op === "gt" ? v > thr : op === "lte" ? v <= thr : op === "lt" ? v < thr : op === "eq" ? v === thr : v >= thr;` (1 match, L12981).
  Accept gt, gte, lt, lte, eq and the symbols > >= < <= ==; any other operator is unreadable (pushed to out.unreadable), not gte. Same CASE in v_metric_trigger_state
  (migration) and ilTriggerHit (L8435-8440, anchor `function ilTriggerHit(tp, value) {`, 1).
- dedupe on the trigger id. Anchor `var title = "METRIC-TRIGGER-" + t.id + "-" + String(t.metric_key).toUpperCase().replace(/[^A-Z0-9]+/g, "-") + ": " + String(t.title || t.action || "").slice(0, 80);` (1)
  and the lookup that follows (`var open = await db.prepare("SELECT id, status FROM agent_issues WHERE lower(trim(title)) = lower(trim(?1))`, 1): look up
  `title LIKE 'METRIC-TRIGGER-<id>-%'` so an edited trigger title cannot open a second issue.
- hysteresis. Anchor `var TRIGGER_RECOVERY_MIN = 60;` (1, L12962) becomes max(60, 3 x refresh cadence minutes, hold_min column); the reopen (anchor
  `await db.prepare("UPDATE agent_issues SET status='open', updated_at=?2 WHERE id=?1 AND status IN ('monitoring','closed')").bind(open.id, Date.now()).run();`, 1)
  waits reopen_gap_min after the last close unless the value is worse than at close by 25%.
- covered-by-parent. Before filing/reopening, skip when metric_deps names an active parent whose trigger issue is open (or dated disposition live), and count
  such a trigger as ticketed in the breaches_without_ticket step. Without this the reopener (161 reopens in 7 d) undoes every supersede within two hours.
- unreadable value: anchor `if (v == null || !isFinite(v)) { out.unreadable.push(t.metric_key); continue; }` (1, L12978): write analytics_action_log status 'unreadable'
  so MD-5 sees it.
P2 qnfo-fleet-control/worker.js, improvementEvaluate: anchors `var IL_REGRESS_PCT = 0.15;` (1) and `var base = Math.max(Math.abs(b), 1e-9);` (1, L8493): skip
  IL_SELF_SET {improvement_rate_7d, metric_regressions_7d, fix_hold_rate_30d, fix_target_hold_rate_30d, metrics_in_breach, open_agent_issues}; require
  |a-b| >= max(3 units for counts, 0.05 for ratios) and prior mean >= 1 for counts; rates need n and a Wilson interval that excludes the target (MD-8);
  closeBlockedByContract (L8604) must not defer a close whose evidence is 'superseded by' or 'early warning' (MD-9).
P3 one migration (APPLY-BY: ci, DB qnfo-audit, Rollback and BACKUP lines): tables metric_deps, metric_lever_map, metric_dispositions; analytics_metric_triggers
  columns hold_min, reopen_gap_min, parent_trigger_id; operator normalisation (MD-2); v_metric_trigger_state CASE; v_executor_roster fix (MD-12); honest
  registry states (MD-5); the MD-12 threshold/target rows. Check first that the code loop's merge scope accepts migrations/; if not, the rows are written at runtime by the
  engine (analytics_metric_triggers and metric_registry are config rows fleet-control already writes at runtime) and only the two view changes ride a session.
P4 anchor audit as a standing step: before any code-task issue, count occurrences on main; the doctor also re-checks the anchors in existing trigger actions: today
  786's `if (path === "/api/f") {` has 0 matches in q08-signal-engine/worker.js (stale), trigger 9 has a path and no anchor, 537/5394/5916 are valid (1 each).

## MD-1 duplicate open issue per trigger id
Trigger (validated, 3 rows: trigger 354 -> 99924,100226; 409 -> 99928,100225; 8888 -> 100088,1000015):
```sql
WITH oi AS (SELECT a.id issue_id, a.created_at, CASE WHEN a.title GLOB 'METRIC-TRIGGER-[0-9]*' THEN CAST(substr(a.title,16,instr(substr(a.title,16),'-')-1) AS INTEGER)
  ELSE (SELECT t.id FROM analytics_metric_triggers t WHERE t.enabled=1 AND instr(lower(a.title),'metric-trigger: '||lower(t.metric_key))=1 ORDER BY t.id DESC LIMIT 1) END tid
  FROM agent_issues a WHERE a.status='open' AND substr(a.title,1,14)='METRIC-TRIGGER')
SELECT tid, count(*) n, group_concat(issue_id) ids FROM oi WHERE tid IS NOT NULL GROUP BY tid HAVING n>1;
```
Diagnosis metric-duplicate. Cause: COST-BUDGET-RECALIBRATION-1 edited the title of triggers 354 ($10 to $95) and 409 ($15 to $95) and the dedupe key is the whole title (L13016-13017);
the third is a manual issue (source owner-chat) for a trigger that already had its own.
Action supersede-issue: keep the highest priority, then the lowest id; the other gets issue_triage.close_evidence "superseded by <keep>: same trigger <tid>", status closed,
close_channel auto:breach-doctor/MD-1, issue_lifecycle event superseded with the successor id; successor priority raised to the max of the two.
Safety: both open, same trigger id, successor not itself pending close. Verify: the trigger SQL returns 0 rows. Clears 3 (99924, 99928, 1000015). Prevention: P1 dedupe.

## MD-2 operator outside the evaluator's set
Trigger (validated, 4 rows: 13797, 14017, 14018, 14085, all operator '>'; 14018 and 14085 flip from hit to clear):
```sql
SELECT t.id, t.metric_key, t.operator, t.threshold, s.val, s.hit hit_now,
  CASE t.operator WHEN '>' THEN s.val > t.threshold WHEN '<' THEN s.val < t.threshold WHEN '>=' THEN s.val >= t.threshold WHEN '<=' THEN s.val <= t.threshold WHEN '==' THEN s.val = t.threshold END hit_if_read_as_written
FROM analytics_metric_triggers t LEFT JOIN v_metric_trigger_state s ON s.id=t.id WHERE t.enabled=1 AND t.operator NOT IN ('gt','gte','lt','lte','eq');
```
Diagnosis metric-operator: both the evaluator (L12981) and the view treat an unknown operator as >=, so '>' with val 0 and threshold 0 is a hit (prd_funnel_monitor_stale, personal_calendar_delivery_over_120m).
Action fix-trigger-row: copy the rows to a bak table, set operator to the canonical word (known symbols only; any other string disables the trigger and files one issue), re-read the view.
Close the artifact issues with close_evidence "operator '>' was evaluated as >=; read as written the value 0 > 0 is false" (no hold needed: it was never a breach).
Verify: probe SELECT '0', CAST(hit AS TEXT) FROM v_metric_trigger_state WHERE id IN (14018,14085); and a standing probe that no enabled trigger has an operator outside the set. Clears 2 (1000217, 1000234); 14017 (456 > 0) stays a real breach.

## MD-3 trigger reads a different source than the registry
Trigger (validated, 1 row: seo_sitemap_urls meta 348 vs registry 704):
```sql
SELECT s.id, s.metric_key, m.value meta_v, r.last_value reg_v, r.last_refreshed, r.refresh_cadence
FROM v_metric_trigger_state s JOIN analytics_dash_meta m ON m.key=s.metric_key JOIN metric_registry r ON r.metric=s.metric_key
WHERE s.hit=1 AND CAST(m.value AS REAL) <> CAST(r.last_value AS REAL);
```
Diagnosis metric-source-conflict (the view reads records, then meta, then registry). Re-measure from the metric's own source_of_truth with a read-only GET and compare: here
GET https://papers.qnfo.org/sitemap.xml returned 348 <loc> (345 paper pages + 3 hub pages) at 06:10Z, so the trigger's source is right and the registry (704, daily refresh at 10-25T09:45Z)
is stale, which also puts a false 704 into metric_history for 10-25 and 10-26. If the live read agreed with the registry, the shadowing meta row would be the defect.
Action set-metric-state: rewrite the registry value from the live read, mark the history point, and supersede the same-quantity duplicate indexed_surface (1518, 348, issue 1000228) by 1000215 (MD-1 style, evidence: both read the same sitemap).
The real breach then goes to MD-11/MD-13: the sitemap lost about 356 paper URLs on 2026-10-25 (701 to 348). The diagnosis tuple to collect: papers per status in the papers D1 through its
worker (published, distributed, external_preprint are the statuses handleSitemap lists, L3293-3335), status-change timestamps, actor; also the gateway cron step reader-report is stalled
115 h (watchmaker_index). Cause is unproven here (LIVING_PAPER is not readable from qnfo-audit). Clears 1 (1000228).

## MD-4 recovered-but-open and flapping (hysteresis)
Trigger (validated, 6 rows at 06:20Z: 2577/1238, 2226/3443, 1838/413 (NULL), 2840/4502, 99921/8559, 100376/9900; portfolio_drift 2972 was in the set 10 minutes earlier):
```sql
SELECT oi.issue_id, oi.tid, s.metric_key, s.val, s.hit FROM (SELECT id issue_id, CAST(substr(title,16,instr(substr(title,16),'-')-1) AS INTEGER) tid
  FROM agent_issues WHERE status='open' AND title GLOB 'METRIC-TRIGGER-[0-9]*') oi LEFT JOIN v_metric_trigger_state s ON s.id=oi.tid WHERE COALESCE(s.hit,0)<>1;
SELECT trigger_id, sum(status='recovered') rec_7d, sum(status='relapsed') rel_7d FROM analytics_action_log WHERE fired_at >= datetime('now','-7 days') GROUP BY trigger_id HAVING rec_7d>=2;
```
The second query (validated) finds 29 triggers with 127 recoveries in 7 days (portfolio_drift 20 recoveries and 30 relapses, tracker_drift 16/31, breaches_without_ticket 16/23, trigger 1820 on
external_referred_pageviews_7d 10/15). issue_lifecycle on METRIC-TRIGGER issues in 7 d: opened 36, reopened 161, dispositioned 209, closed 3.
Diagnosis: recovered-open (clear now, streak not yet long enough) or flapping (>= 2 recoveries in 7 d). Cause: the streak is a fixed 60 minutes (L12962) and the first re-hit reopens the closed twin (L13018-13027);
a metric that oscillates inside an hour or two is closed and reopened all day, which is the numerator of closure_branching_ratio_24h (0.514) and of fix_hold_rate_30d (0.5324).
Action: (a) recovered-open with the value clear for hold = max(60 min, 3 x refresh cadence, 6 h if flapping, 24 h if the metric refreshes daily): close with close_evidence naming the last 3 readings (R: 2226, 2577, 2840, 2972, 100376, 99921);
(b) flapping: set hold_min and reopen_gap_min on the trigger row (write-disposition, revert_sql stored) and file the P1 code-task once. Safety: hold applies only to closing, never to filing; a worse-than-25% re-hit reopens at once;
control_registry row 'metric-trigger-recovery-hold' (gate, keep, alternate ops_config metric_hold_min=0). Verify: reopened events per 7 d on METRIC-TRIGGER issues < 20 (now 161) and closure_branching_ratio_24h <= 0.2 (now 0.514).
Clears 6 now; removes the churn behind 100407 (RR-parent) and half of fix_hold_rate_30d.

## MD-5 blind, unmeasured or stale metric
Trigger (validated): 13 enabled triggers have hit NULL (7 are metrics whose registry row says state MEASURED with last_value and last_refreshed NULL: errata_confirm_stalled, research_stage_stalled, publish_rate_ratio_24h, post_deploy_error_workers, research_budget_member_share, program_focus_closed_24h, program_focus_without_doer;
q08_forecast_void_share, reply_velocity_60m_share_30d, substantive_reply_share_30d, paper_math_browser_fail_pages, owner_question_answer_rate_14d, credibility_events_90d are UNMEASURED or n/a);
v_metric_staleness_verdict: 8 NEVER_REFRESHED, 9 STALE (including fleet_cost_bound_month_usd, whose breach 352.76 was last refreshed 10-25T08:45Z, 21 h on an hourly metric).
```sql
SELECT s.id, s.metric_key, r.state, r.last_value, r.last_refreshed, r.refresh_cadence, r.refresh_class FROM v_metric_trigger_state s LEFT JOIN metric_registry r ON r.metric=s.metric_key WHERE s.hit IS NULL;
SELECT metric, verdict, age_hours FROM v_metric_staleness_verdict WHERE verdict <> 'FRESH';
```
Diagnosis metric-unmeasured; the writer is named from refresh_class/source_of_truth/owner. Five of the NULL rows are */10 metrics registered 2026-10-26 whose writers are fleet_tick D1 triggers (the heartbeat was dead 04:42-06:06Z; the sibling design moves writers to worker code).
Action set-metric-state: set state UNMEASURED where last_value and last_refreshed are NULL (registry state is not a verdict); re-run the writer through its own allowlisted route; for an open breach issue on a metric unmeasured more than 7 d (1838, 570 h), supersede it with one MEASUREMENT-GAP issue naming the writer and a probe "last_value is not NULL".
Verify: hit IS NOT NULL for the row, verdict FRESH. Clears 1 issue (1838 to a successor), unblinds 13 triggers. A breach that cannot be measured is not a breach and not green: it is reported as blind, which is what metrics_in_breach should show next to the count.

## MD-6 parent and child (metric_deps)
Table metric_deps(child_metric, parent_metric, relation, check_sql, active, created_at). A child is superseded only when a numeric check holds; "shared cause by hypothesis" is not a dependency. Seeds with their checks (live numbers):
- sum-of: sla_breaches_over_120m 2705 = issues_open_over_120m 431 + content_items_over_stage_sla 2272 + cadence_overdue_over_120m 5 = 2708 (overlap term 3).
- same-quantity: fleet_ai_run_rate_30d_usd (409, 753) and workers_ai_run_rate_usd (3687, 660): both are 30 x [(mean daily neurons - 10000) x $0.011/1k + non-Workers-AI router spend] over the last 7 full days, different readers; workers_ai_cost_30d_usd (354) is the 30-day window of the same neurons; fleet_cost_run_rate_usd (3688) adds the plan and gateway; monthly_cost_run_rate_usd (3689) adds the unverified owner-stated 450; external_impact_per_dollar (1519) divides the cost by reach.
- ratio-of: q08_neurons_per_published_piece_7d (384,266) = q08 neurons 7 d (1,152,799 from ai_call_counters) / pieces published (3.0); so it is q08_gate_pass_rate_7d (0.012) in disguise; q08_verified_votes_7d and q08_hours_since_last_piece follow the same piece count.
- same-population: open_agent_issues 437, issues_open_over_120m 431, open_issues_without_doer_120m 353, issues_over_24h_no_doer 289, issue_mttr_h_30d, mttr_h_7d, issue_drain_ratio_24h, issue_auto_close_2h_share_24h, driver_drain_24h, stuck_items_over_sla 400 (= issues_unprobed_60m 391 + the research queue term), issues_unprobed_60m 387, issues_without_next_action 213: one backlog, 12 triggers. Root = issues_over_24h_no_doer (the owner directive 2026-10-20, issue 100301).
- caused-by: human_wait_oldest_min 669, human_actions_open 7, owner_dispatched_items_7d 2 = the 7 code_tasks with status needs_human (the dashboard /api/human lists 7 items, all source code-loop; human_actions has 0 non-terminal rows).
- window-of: tick_* metrics = the fleet_tick gap (MD-7), code_goal_success_rate_30d / code_task_success_rate_30d / code_pr_merge_share_7d / fleet_authored_pr_share_7d = the code loop's yield (141 failed + 20 publish_failed tasks).
- caused-by (families outside this one): issues_unprobed_60m, issues_without_next_action, runtime_verified_share_24h, goals_unevaluated (11 goal-dod-v1 contracts 'deferred' with 300+ attempts) to the PROBE family; spof_alternates_untested_24h to CHAOS-DRILL-FAILED-1; failure_modes_recurring (49 recurring) to the fm detectors.
Action supersede-issue (child to the parent's open issue, successor id recorded, close_evidence carries the check numbers) plus metric_deps.active=1, which P1 uses to keep the child from being refiled or reopened and to count it as ticketed.
Safety: the parent issue is open, has a doer or a live dated disposition, and its priority is raised to at least the child's. Verify: the parent's own probe; breaches_without_ticket stays 0. Clears 32 (RR-parent list in metric-classification.md).

## MD-7 time-gate by replay
Trigger: the metric name carries a window (_Nd, _24h, _30d) and a past event sits inside it. Diagnosis metric-time-gated only if the replay clears: recompute the metric's window from its daily driver series at the latest-day level and find the date the threshold is crossed.
Linear screen (validated), days to clear at the last-3-day slope: owner_dispatch_7d 1.5, runtime_verified_share_24h 2.7, code_task_superseded_share_30d 3.0, code_task_success_rate_30d 4.5, research_neurons_per_publication_7d 5.8, papers_live_failing_release_gate 7.5, fleet_authored_pr_share_7d 7.6.
Replay refuses the cost chain: neurons per day (ai_call_counters) were 0.75M (10-14..16), 1.78M, 4.65M, 5.45M, 4.22M, 2.13M (10-17..21, research-exec 3.5-4.2M), then 0.67M, 0.71M, 1.06M, 1.13M (10-22..25). The burst leaves the 7-day windows by about 10-29, but the floor is
0.7-1.13M/day = $230-370 per 30 days against a $95 threshold (about 4.8x the $78 target), so 3687, 409, 3688, 3689, 354 do NOT clear by waiting; they are class B/C with a lever (MD-11), not W. New consumers since 10-23: qnfo-ops 11k to 205-274k/day (glm-5.3-flash, 441 calls/day on 10-25), errata-hub 83k to 183k (kimi-k2.6), qnfo-code-orchestrator 154k to 289k.
The tick metrics are time-gated by a closed incident: fleet_tick has no rows between 04:32:44Z and 06:06:58Z (9 of 144 slots = 93.75 = tick_completion_24h 93.8); the 24 h window clears about 2026-10-27T06:07Z.
Action write-disposition: metric_dispositions(metric, kind 'time-gated', until, probe, evidence) with expiry = projected date + 1 day; the issue stays open (no silent drop), carries the date, and TRIGGER-RECOVERY or the expiry probe closes it. If the date passes with the metric still hit, the rule re-runs and routes to MD-10.
Control: metric_dispositions with expiry is the ANTIFRAGILE-1 shape (reason + expiry). Expected: 11 issues carry a dated disposition (W).

## MD-8 regression and relapse gating
Applies to METRIC-REGRESSION-1 and METRIC-FIX-RELAPSED-1. Close with early-warning evidence (the loop already does this for file:false findings) when any holds; P2 stops the refiling.
- self-set: the loop evaluates its own outputs: improvement_rate_7d (100572), metric_regressions_7d (63, issue 100495), metrics_in_breach (2323), plus fix_hold_rate_30d and open_agent_issues (2957, covered by trigger issue 1798).
- zero baseline: rel = (a-b)/max(|b|,1e-9) (L8493) turns one failing worker into a regression: worker_health_failure_rate 0 to 0.0294 (1 of 34; cloudflare-mcp 404), fleet_journeys_failing 2 to 3-4.
- small n: outreach_reply_rate_30d 1.2 (111 first contacts, 97 unique, about one reply; Wilson 95% interval about 0.03%-6%, contains the target 2) in both 100304 and 100282; attention_decision_efficacy_30d 0 of 8 judged (its own target says "once at least 20 decisions have reached a judged outcome").
- duplicate of a family that has its own issues: fleet_journeys_failing (registry target says trigger-exempt, the runners file FLEET-JOURNEY-FAILED-1).
Validated numbers above. Verify: the registry metric stays on the evaluable list only when n >= 20 (rates) or prior mean >= 1 (counts). Clears 8 (2323, 100495, 100572, 100304, 100282, 100286, 100573, and 2957 with MD-9).

## MD-9 close deadlock (contract fails, loop defers)
Trigger (validated, 6 rows): open METRIC-REGRESSION-1/RELAPSED issue whose active contract has last_verdict fail or deferred:
```sql
SELECT a.id, c.class, c.last_verdict, c.attempts FROM agent_issues a JOIN remediation_contracts c ON c.issue_id=a.id
WHERE a.status='open' AND (a.title LIKE 'METRIC-REGRESSION-1:%' OR a.title LIKE 'METRIC-FIX-RELAPSED-1:%') AND c.status IN ('active','holding') AND c.last_verdict IN ('fail','deferred');
```
-> 2323 (fail, 646 attempts), 2957 (fail, 347), 100281/100282/100285/100286 (issue-N-BACKFILL-1, deferred 235-238). improvementLoopTick defers every close while such a contract fails (closeBlockedByContract, L8604; run 588 close_deferred=1),
and a regression/self-aggregate probe can only pass at the target (0), so the supersede close can never happen. Action supersede-contract (status superseded, reason and successor stored) then the normal close with evidence. Clears 2 directly (2323, 2957), unblocks the 4 relapse issues.

## MD-10 remedy spent: replace, do not repeat
Trigger (validated): the same remedy text for more than 7 days, and merged code tasks that did not move the metric.
- 67 triggers breaching with an action log: 49 older than 7 d, 42 of them with one distinct action string since the first firing; 23 older than 14 d, 20 unchanged. 9 of the 67 carry an explicit code-task line (5 real: 9, 537, 786, 5394, 5916; 4 only mention the word).
- merged code tasks on open breaching issues (value at merge day -> now): q08_verified_votes_7d 1 (10-03) -> 18 (10-10) -> 3; q08_gate_pass_rate_7d 0.060 -> 0.012; fleet_ai_run_rate_30d_usd 474 -> 753; workers_ai_run_rate_usd 411 -> 660; false_stops_7d 4 -> 11; roster_members_degraded 6 -> 3; papers_live_failing_release_gate 127 -> 85; fleet_graph_findings_warn 64 -> 64; idea_topic_concentration_30d 0.88 -> 0.493 (worked).
Diagnosis metric-remedy-spent when a merged code task is older than 7 d and the metric moved less than 20% of the gap toward its threshold, or the same lever text has run 7 d. (Only 786 qualifies by the strict 7-day cut at 06:30Z; the 10-19 tasks pass the line within 24 h.)
Action: record the spent lever in metric_dispositions (kind lever-spent, code task id, value before/after), pick the next lever from metric_lever_map for that metric, and rewrite analytics_metric_triggers.action from the template (this is the METRIC-CLOSED-LOOP-1 instruction made executable). If no further lever exists: class E, one design issue with the fact tuple.
The ladder's doer test is fixed in the same change: doer = a code_tasks row not in a terminal state, or a live claim; the text 'code-task:' in a description is not a doer, and a merged-but-breaching task shows as 'remedy spent'.
Wrong-target example: false_stops_7d hits are ops_ai_log (qnfo-ops) conditional-offer 5, menu 3, narration 1 and chatbox_conversations 1; the merged task edited qnfo-ai/worker.js. emitter_map {ops_ai_log: qnfo-ops/worker.js} gives the next path. Likewise ROSTER-MEMBERS-DEGRADED's merged task edited qnfo-ai-calibration while the cause is the roster view (MD-12).

## MD-11 code-lever issue (class B) and the lever library
Template (fixed text, enumerated variables): `[metric-doctor MD-11] <metric> <value> vs <op> <threshold>, breaching since <day>; lever <lever_id> (<n>th, previous: <ids>).` then lines `code-task: repo=qnfo-workers path=<path>`, `code-anchor: <anchor>` (must occur exactly once on main, checked by a raw read of the file at filing time), `code-probe: {"paths":["<path>"],"contains"|"absent":"<text>"}` chosen so it fails today (checked), and `runtime-probe`/d1 probe on the metric's own predicate. If the anchor count is not 1 the issue is not filed and the lever row is marked stale (that is the current state of trigger 786).
Lever library (metric_lever_map seeds; every path allowlisted):
- ops_agent_empty_answers_7d (100122): qnfo-ops/worker.js, anchor `let finalized = false;` (1 match, L6920; finalize() closure at L6922).
- fix_hold_rate_30d, closure_branching_ratio_24h, trigger flapping (99927): qnfo-fleet-control/worker.js, P1 anchors.
- breach/regression gating (P2): same file, `var IL_REGRESS_PCT = 0.15;`, `var base = Math.max(Math.abs(b), 1e-9);`.
- false_stops_7d (99940): emitter_map lookup, qnfo-ops/worker.js (the prompt/reply template block; anchor chosen and verified at filing time).
- attention_channels_stopped (100019): qnfo-fleet-dashboard/worker.js attentionScorecard, minimum judged outcomes before STOP (all 8 recorded decisions are outcome flat; efficacy target says 20); ops_config attention_channel_share is rewritten daily, so no config shortcut.
- watchmaker_index (99909): reader-report (cron:qnfo-gateway, stalled 115 h, cadence 1 h): dispatch the gateway cron step; if it does not run, code-task on qnfo-gateway; the code-task-merge term is the 7 needs_human tasks (MD-6).
- cadence_overdue_over_120m (3003): per producer, compare the declared interval_min with the median gap of its last 7 days of runs; gap > 3x interval = the declared interval is wrong (correct it by migration, MD-12), otherwise restart the producer. Today: q08.org (2867 min, child of the q08 gate), qnfo-social 1187, continuity_snapshot 889, personal-companion 859, idea-hub 473.
- papers_queued_over_120m (2604): qnfo-social drainRollup, structured held reason enum (substack held:no-channel etc.) from cloud_ops_events kind social-run status/job only.
- cf_changelog_open_proposals_14d (100388): the decision pass of CF-CHANGELOG-LOOP-1 on the 7 open proposals (the trigger's own SELECT), decided by the cheapest capable model, recorded in decision_log.
- fleet_graph_findings_warn (100084): one code-task per finding kind (scripts/fleet_graph.mjs or the owning worker), the single merged task moved 86 to 64 and nothing since.
- workers_ai_run_rate_usd and the cost chain (99937): lean routing at the breach per BUDGET-SOFT-ROUTE-1 (cheapest capable model, one leg, smaller batches), starting with the 10-25 top lines: qnfo-ops glm-5.3-flash 174k neurons/441 calls, errata-hub kimi-k2.6 159k/207 calls, qnfo-code-orchestrator ladder kimi-k2.7-code 146k/44 calls, qnfo-research-exec gpt-oss-120b review 64k/88 calls; each with a per-request fallback and an automatic revert (OWNER-STANDING-GRANT-1 shape). Never a lower cap, never a skipped run.
- worker_health_failure_rate (1000240): the one non-excluded failing worker (cloudflare-mcp 404, selfstate-probe up=0) through the canonical deploy path; re-probe.
- seo_sitemap_urls (1000215): diagnosis tuple first (MD-3), then the lever the tuple names.

## MD-12 definition fixes by recorded migration with its measurement
Each row is changed only with the measurement in the migration note, a Rollback line and a BACKUP table (MIGRATION-RUNNER-1); the metric stays measured, the target is never loosened to hide a breach.
- v_executor_roster (A2): worker rows require service_registry.kind='worker'; kind='member' rows take the host's probe (qnfo-backlog-exec is a member of qnfo-lifecycle since 2026-10-06, BACKLOG-FOLD-1, probe 404 NOT_DEPLOYED by design); a row with no worker_live_audit row is healthy NULL (unmeasured), not 0; the repository name 'qnfo-workers' is not a worker. Measured now: 6 degraded rows = qnfo-backlog-exec x3 capabilities, voice-stt, qnfo-workers, qnfo-agents (WRANGLER-ONLY, no probe row) = 4 executors = roster_members_degraded 4; 13 'worker:' pseudo-capabilities are single-executor by construction (roster_capabilities_single_executor 174).
  Probe: roster_members_degraded = 0 and no kind member row in the worker branch. Clears 99941.
- research_deferred_pool trigger 5394: threshold 120 was set before ops_config research_deferred_max went 120 to 400 (2026-10-24 14:25Z); set it to 0.75 x research_deferred_max (300); pool 171. Probe: threshold = 0.75 x the key. Clears 99943.
- breaches_without_ticket: count only triggers with queue_target agent_issues (6123 routes to alerts on purpose, 124 'dispatched' digest rows), or give 6123 an issue and let MD-6 attach it to the needs_human parent. Locate the writer through metric_write_audit_log. Clears 100088.
- ops_tool_budget_bail_7d: separate by reason: chat-scope bails are 183 of 213 (interactive budget), prompt-cap 28 (control ops-job-prompt-cap, keep), tool-budget-exhausted 2; add ops_tool_budget_bail_rate_7d = unregistered-reason bails / chat+job runs, target keeps 0 on the count of unregistered reasons. Clears 100496.
- breach_code_task_pct (7.5, target 30): issue 1000038 measured that 53 of 62 breaching triggers cannot have a code lever; honest target = share of breaching triggers whose lever class is code, about 12 of 68 (17.6) once MD-11 runs; set target >= 15, trigger lt 10 unchanged. The metric then moves by the doctor's own work. RR-lever 99926.
- prd_funnel_missing_transitions (14017, born at 448): add a since-column (items older than 120 min and created after the monitor's birth) or ratchet the threshold at the birth value with a backfill task for the owning publication loop; never set it to hide the count. RR-lever 1000216.
- registry honesty: state UNMEASURED where last_value and last_refreshed are NULL (7 rows) and where state is OK with a value far from target (open_agent_issues 437 vs 0, subscribers_growth_monthly 0 vs +10).
- priority map (validated): triggerIssuePriority (L12950) maps integer priority >= 9 critical, >= 7 high, >= 5 medium, below 5 low. Of 214 enabled triggers 106 (49%) have an integer below 5 and file as low, among them the owner-directive SLA and cost triggers (5929, 5937, 9901, 3059, 3060, 3687, 3688, 3689, 5915, 5916, 4650, 8558); 31 map high, 9 critical, 58 medium, and 10 hold text priorities (9, 10, 387, 5079-5081 'medium'; 8, 388, 409, 13797 'high'). The family's issue priorities are therefore mostly age-bumped, not decided. The doctor sets issue priority from its own table (directive weight, magnitude, age), and the migration normalises the column.

## MD-13 policy conflict (two live controls disagree): decide and record
Trigger: the breach starts within 48 h after an ops_config/fleet_budget change whose key is in metric_lever_map.ops_keys, and a control_registry row or ops_config note names a different directive for the same key. Validated on fleet_cost_bound_month_usd (1000155): research_daily_neurons 360000 to 600000 at 2026-10-24 14:59:20Z (PIPELINE-FLOW-POLICY-1: 54 research-budget holds that day) and code_loop_daily_calls 100 to 140 (10-24 15:10Z); the bound went 262 (10-24) to 353 (10-25 08:45Z): +240k neurons x $0.011/1k x 30 = +$79 plus the call cap = +$91. v_cost_forecast: fleet MTD $304.44 of $300, pace_30d $289.48, forecast $362.33.
Decision under DECISION-AUTOPROCEED-1 (recommended option, reversible): do NOT revert the cap, because BUDGET-SOFT-ROUTE-1 says a budget steers models and never stops work and a lower cap reintroduces the holds; apply the MD-11 lean-routing lever on the top consumers, re-measure the forecast in 24 h, and revert only if the forecast stays above budget with routing in place. The decision_log row carries predicted_outcome (forecast <= 300 within 72 h), reach_gain 0, rollback_path and surfaces_tested. Clears 0 now; moves 1000155 to RR-lever with a dated probe on v_cost_forecast.forecast_month_usd.

## MD-14 owner boundary
Identity-bound items in this family: the AI Gateway spend limit (gateway_cap_30d_usd 180, owner threshold 150, live cap 200; the migration text says the lever is the owner's) and the owner-stated direct-provider figure (450 per 30 d, unverified) and owner-client gateway spend ($228 MTD), which are money in the owner's accounts. The doctor never changes them and never raises a cap to clear a breach; it writes control_registry 'gateway-spend-limit' (cap, keep, owner-bound, evidence) and closes 100494 with that disposition. No IDENTITY-BOUND card is needed: nothing in the 94 waits on the owner. Not in this family: GA4/GSC (gsc_verified is not breaching).

## Verification map (the metric's own probe per class)
A1 hit IS NOT NULL / verdict FRESH; A2 hit = 0 under the corrected predicate and the definition migration present in migration_runs; A3 the surviving issue open and count(open issues per trigger id) = 1; A4/A5 the metric removed from the evaluable set and no refile in 24 h; A6 the metric's predicate at the disposition's expiry; B the lever's code-probe contains/absent plus the metric predicate for 2 refreshes; C the parent's probe; D the control_registry row exists; E a design issue with a doer and a probe.

## Expected effect (94 issues now, 90 at the 05:45Z baseline)
R 25 (MD-1 3, MD-2 2, MD-3 1, MD-4 6, MD-8 8 of which 2323 and 2957 also need MD-9, MD-12 4, MD-14 1), RR-parent 32 (MD-6), RR-lever 16 (MD-5 1, MD-11 12, MD-12 2, MD-13 1), W 11 (MD-7), S 10 (design, fleet decides).
Resolved or rerouted automatically 73 of 94 (71 of 90): 25 closed with evidence, 32 closed as superseded by the open parent, 16 kept open with a verified lever. 11 more carry a dated disposition and clear by themselves; 10 are design items. Owner cards 0.
Phasing: with D1 writes only (no deploy) the doctor can close about 11 issues (MD-1 3, MD-4 6, MD-9 2) and fix data rows, but the evaluator would reopen the superseded children in about two hours; with P1+P2 deployed (two tasks on one file, serial under the work claim, CODE-LOOP-CONTROL-PLANE-1 allows the file, canary and revert apply) the rest hold. Metrics in breach (68 hits) falls by the artifact fixes (5: 14018, 14085, 4991, 5394, 8888) and by six time-gated metrics that clear on their own within days (3452, 3528, 4989, 3454, 2935, 10931): about 68 to 57. The rest are real (cost floor, q08 gate, sitemap, content queue, backlog, code-loop yield, reach) and need the family doctors and the design items.

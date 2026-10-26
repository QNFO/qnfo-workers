# Metric-breach family: classification of every distinct metric (89) and the 94 open issues

Measured 2026-10-26 06:00-06:35Z on qnfo-audit (35e2e573-92f3-46ac-83c6-22f6429fc5e5), read-only; code read at main 6031c00e
(qnfo-fleet-control 0.47.0). The live state moves: the fleet_tick heartbeat resumed at 06:06:58Z and at 06:11:13Z four closed
METRIC-TRIGGER issues were reopened (2875, 99921, 99936, 100088), so the family is 94 now (90 at 05:45Z).

Family now: METRIC-TRIGGER-<id>-* 75 (10 critical, 7 high, 58 medium), METRIC-TRIGGER: breaches_without_ticket 1,
METRIC-REGRESSION-1 14, METRIC-FIX-RELAPSED-1 4. Plans: not-code 67, none 20, invalid 2, untrusted 3, refused 1, queued 1.
Distinct metrics behind them: 89 = 68 breaching triggers (v_metric_trigger_state hit=1) + 6 triggers not hit with an open issue
+ 12 regression-only metrics + 3 relapse-only metrics.

Classes (primary class per metric; sub-type in the table)

| class | meaning | metrics | share |
|---|---|---|---|
| A | measurement artifact (see sub-types) | 30 | 34% |
| B | a lever the fleet can pull (file or key named) | 12 | 13% |
| C | consequence of another breach (parent named) | 35 | 39% |
| D | owner identity or money input | 1 | 1% |
| E | genuinely needs a design change or an undiagnosed cause | 11 | 12% |

A sub-types: A1 unmeasured 1; A2 wrong operator, target, threshold, unit or definition 8; A3 duplicate of another breach 2;
A4 aggregate or self-referential 3; A5 noise, small n, flapping, or recovered-but-open 10; A6 time-gated window (the value is true,
a past event inside the window holds it, it clears by itself on a date) 6.

Issue outcomes if the rules in metric-doctor-rules.md run (94 issues now; the 90-issue baseline in brackets)

| outcome | meaning | 94 | 90 |
|---|---|---|---|
| R | resolved: closed with close_evidence (artifact fixed, duplicate, recovered, self-aggregate, small n) | 25 | 23 |
| RR-parent | rerouted: superseded by the open parent that carries the work, successor id recorded | 32 | 32 |
| RR-lever | rerouted: stays open with a verified lever (code-task with unique anchor, config row, migration, decision record) | 16 | 16 |
| W | time-gated: dated disposition with expiry and the metric's own probe, no action, clears by itself | 11 | 9 |
| S | design item: fleet decides, no owner (E class) | 10 | 10 |

Resolved or rerouted automatically: 73 of 94 (R 25 + RR 48), 71 of 90. With W: 84 of 94, 80 of 90. Owner cards: 0.

## Full table (metric | trigger | open issues | class.sub | parent or lever | outcome)

### A artifacts (30)
| metric | trig | issues | class | cause or lever | out |
|---|---|---|---|---|---|
| credibility_events_90d | 413 | 1838 | A1 | value NULL (UNMEASURED: OpenAlex readings incomplete), trigger cannot fire, issue open 570 h | RR-lever (measurement-gap successor naming the writer) |
| breach_code_task_pct | 379 | 99926 | A2 | target 30 unreachable (issue 1000038: 53 of 62 breaching triggers have no code lever); the doctor itself is the lever | RR-lever (target migration + doctor) |
| roster_members_degraded | 4991 | 99941 | A2 | v_executor_roster counts qnfo-backlog-exec (FOLDED member, kind member, probe 404 NOT_DEPLOYED), qnfo-workers (repository name), voice-stt and qnfo-agents (no probe row) as degraded; the merged fix edited qnfo-ai-calibration (wrong target) | R (view fix) |
| research_deferred_pool | 5394 | 99943 | A2 | trigger gt 120 vs ops_config research_deferred_max 400 (raised 10-24); pool 171 < cap | R (threshold = cap) |
| breaches_without_ticket | 8888 | 100088, 1000015 | A2+A3 | counts trigger 6123 (queue_target alerts, a digest route) as ticketless; 1000015 duplicates 100088 | R |
| prd_funnel_missing_transitions | 14017 | 1000216 | A2 | born in breach (448 on day one, 456 now): monitor counts history | RR-lever (ratchet + backfill task) |
| prd_funnel_monitor_stale | 14018 | 1000217 | A2 | operator '>' read as >=: 0 >= 0 hits | R |
| personal_calendar_delivery_over_120m | 14085 | 1000234 | A2 | operator '>' read as >=: 0 >= 0 hits | R |
| ops_tool_budget_bail_7d | - | 100496 | A2 | counts by-design bails: 183 chat-scope, 28 prompt-cap (control ops-job-prompt-cap, keep), 2 real | R (count unregistered reasons, as rate) |
| indexed_surface | 1518 | 1000228 | A3 | same quantity as seo_sitemap_urls (348 = live sitemap) | R (supersede by 1000215) |
| fleet_journeys_failing | - | 100573 | A3 | registry target says trigger-exempt, runners file FLEET-JOURNEY-FAILED-1 (3 open); 2 to 3-4 is small n | R |
| metrics_in_breach | - | 2323 | A4 | self-referential count; contract issue-2323 fails (646 attempts) and blocks the loop's own close | R |
| metric_regressions_7d | - | 100495 | A4 | count of the other regressions (63) | R |
| improvement_rate_7d | - | 100572 | A4 | share computed by the loop that files the issue | R |
| workers_idle_7d | 4994 | 2819 | A5 | 0..2 flapping | W |
| workers_bp_findings_open | 5079 | 2758 | A5 | 0..2 flapping, children are WORKERS-BP-DEBT-1 issues | W |
| tracker_drift | 8559 | 99921 | A5 | 16 recoveries and 31 relapses in 7 d; value 0 now | R after hold |
| outreach_reply_rate_30d | - | 100304, 100282 | A5 | 111 first contacts (97 unique), about 1 reply; Wilson interval contains target 2; regression and relapse issues duplicate | R, R |
| attention_decision_efficacy_30d | - | 100286 | A5 | 0 of 8 judged; the metric's own target says n < 20 is noise | R (NULL below the gate) |
| idea_topic_concentration_30d | 1238 | 2577 | A5 | recovered 0.88 to 0.493 after the merged fix; open while clear | R after hold |
| autonomy_rate_7d | 3443 | 2226 | A5 | 0.962 >= 0.95, streak opened 06:11Z | R after hold |
| audits_stale | 4502 | 2840 | A5 | 0, 3 relapses in 3 d | R after hold |
| portfolio_drift | 8581 | 2972 | A5 | 20 recoveries and 30 relapses in 7 d | R after hold |
| code_prs_unmerged_over_120m | 9900 | 100376 | A5 | 0, relapsed twice | R after hold |
| code_task_superseded_share_30d | 2935 | 99932 | A6 | 0.28 to 0.11 in 18 d, 0.10 in about 3 d | W |
| owner_dispatch_7d | 3454 | 99934 | A6 | window of session-filed owner cards, 7 of 14 closed at birth; below 5 by about 10-28 | W |
| research_neurons_per_publication_7d | 10931 | 100464 | A6 | 7 d window holds the 10-19..21 burst; 66k to 47k; revise-noop fix queued 10-24 | W |
| tick_completion_24h | 3452 | 2875 | A6 | fleet_tick gap 04:32:44-06:06:58Z = 9 of 144 slots = 93.75 | W until about 10-27 06:07Z |
| tick_slot_coverage_24h | 3528 | 99936 | A6 | same gap, 0.94 | W |
| tick_sequence_completion_24h | 4989 | 2861 | A6 | same gap, 0.833; history shows ratios above 1.0 (1.042) | W |

### B levers (12)
| metric | trig | issues | lever (file or key) | out |
|---|---|---|---|---|
| ops_agent_empty_answers_7d | 9 | 100122 | code-task qnfo-ops/worker.js, anchor `let finalized = false;` (1 match, L6920) | RR-lever |
| watchmaker_index | 357 | 99909 | reader-report cron stalled 115 h (cron:qnfo-gateway) + code-task-merge needs_person 7 | RR-lever |
| fix_hold_rate_30d | 388 | 99927 | hysteresis in qnfo-fleet-control (anchors `var TRIGGER_RECOVERY_MIN = 60;`, the reopen UPDATE line) | RR-lever |
| cf_changelog_open_proposals_14d | 1204 | 100388 | decision pass on 7 open proposals (the action's SELECT) | RR-lever |
| attention_channels_stopped | 1867 | 100019 | min-sample gate on STOP in qnfo-fleet-dashboard attentionScorecard (8 decisions, all outcome flat) | RR-lever |
| workers_ai_run_rate_usd | 3687 | 99937 | cost root: lean routing per BUDGET-SOFT-ROUTE-1 (not a lower cap); merged 10-19 fix did not move it | RR-lever |
| false_stops_7d | 4982 | 99940 | emitter is ops_ai_log (qnfo-ops: conditional-offer 5, menu 3), the merged task edited qnfo-ai; next lever path qnfo-ops/worker.js | RR-lever |
| papers_live_failing_release_gate | 5916 | 99949 | remedy working: 127 to 85 since the 10-20 merge | W |
| cadence_overdue_over_120m | 6050 | 3003 | 5 producers overdue (q08, idea-hub, qnfo-social, personal-companion, continuity_snapshot): compare declared interval to actual gap, restart or correct interval | RR-lever |
| papers_queued_over_120m | 6116 | 2604 | qnfo-social rollup held reasons | RR-lever |
| fleet_graph_findings_warn | 9262 | 100084 | merged fix moved 86 to 64, flat since; next lever per finding kind | RR-lever |
| worker_health_failure_rate | - | 1000240 | one worker, cloudflare-mcp (404, selfstate-probe up=0); 0 baseline makes 1 of 34 a regression | RR-lever |

### C consequences (35)
| metric | trig | issues | parent | out |
|---|---|---|---|---|
| open_agent_issues | 362 | 1798, (2957 R) | root backlog 100301 (issues_over_24h_no_doer) | RR-parent |
| issues_open_over_120m | 5937 | 99920 | backlog root | RR-parent |
| open_issues_without_doer_120m | 5944 | 2570 | backlog root | RR-parent |
| issue_mttr_h_30d | 410 | 99914 | backlog root | RR-parent |
| mttr_h_7d | 3464 | 99935 | backlog root | RR-parent |
| issue_drain_ratio_24h | 5708 | 99944 | backlog root | RR-parent |
| issue_auto_close_2h_share_24h | 5795 | 99945 | backlog root | RR-parent |
| driver_drain_24h | - | 1000245 | backlog root | RR-parent |
| issues_over_24h_no_doer | 9901 | 100301 | ROOT: closes when the per-family doctors clear their unowned issues | S |
| stuck_items_over_sla | 3059 | 2971 | issues_unprobed_60m (391 of 400) | RR-parent |
| issues_unprobed_60m | 3060 | 2522 | probe family (189 orphans, PROBE-NEEDED-1) | RR-parent |
| issues_without_next_action | 1959 | 99915 | probe family | RR-parent |
| runtime_verified_share_24h | 2038 | 2684 | probe family | RR-parent |
| goals_unevaluated | 9162 | 100069 | probe family (11 goal-dod-v1 contracts 'deferred' 300+ attempts) | RR-parent |
| session_dependent_issues_open | 2934 | 99916 | not-code and untrusted families | RR-parent |
| sla_breaches_over_120m | 5929 | 99950 | sum of issues_open_over_120m 431 + content_items_over_stage_sla 2272 + cadence 5 = 2708 vs 2705 | RR-parent |
| idea_to_publish_h_p50_7d | 8558 | 100138 | content_items_over_stage_sla (p50 89 to 125 h while the queue rose 456 to 2231) | RR-parent |
| fleet_ai_run_rate_30d_usd | 409 | 100225, 99928 (R dup) | workers_ai_run_rate_usd (same quantity) | RR-parent |
| workers_ai_cost_30d_usd | 354 | 100226, 99924 (R dup) | workers_ai_run_rate_usd (30 d window) | RR-parent |
| fleet_cost_run_rate_usd | 3688 | 3015 | workers_ai_run_rate_usd (+ plan + gateway) | RR-parent |
| monthly_cost_run_rate_usd | 3689 | 99938 | fleet_cost_run_rate_usd (+ gateway + owner-stated 450, unverified: the D part) | RR-parent |
| external_impact_per_dollar | 1519 | 100222 | cost root (numerator) | RR-parent |
| q08_neurons_per_published_piece_7d | 538 | 99930 | q08_gate_pass_rate_7d (1.153M neurons / 384k = 3 pieces in 7 d) | RR-parent |
| q08_verified_votes_7d | 786 | 1893 | q08 gate (merged 10-03 fix took it 1 to 18, it decayed to 3 as pieces stopped) | RR-parent |
| q08_hours_since_last_piece | - | 100518 | q08 gate | RR-parent |
| failure_modes_recurring | 3072 | 3002 | 49 recurring failure modes, each its own fm detector | RR-parent |
| spof_alternates_untested_24h | 5182 | 2613 | CHAOS-DRILL-FAILED-1 family (2 probes not passing) | RR-parent |
| code_goal_success_rate_30d | 4650 | 99939 | code-loop failure families (141 failed, 20 publish_failed tasks) | RR-parent |
| code_pr_merge_share_7d | 9899 | 100300 | CODE-MERGE-REFUSED-1 / CODE-LOOP-EXHAUSTED-1 | RR-parent |
| code_task_success_rate_30d | 378 | 99925 | code-loop families, +0.007 a day | W |
| fleet_authored_pr_share_7d | 10908 | 100460 | code-loop families, 0.21 to 0.325 | W |
| human_wait_oldest_min | 6123 | 100574 (regression only) | 7 code_tasks status needs_human (human_actions has 0 non-terminal rows) | RR-parent |
| human_actions_open | - | 100542 | same 7 needs_human tasks | RR-parent |
| owner_dispatched_items_7d | 3529 | 2376 | same 7 needs_human tasks | RR-parent |
| closure_branching_ratio_24h | 9510 | 100407 | trigger close/reopen churn (161 reopens in 7 d) | RR-parent |

### D owner (1)
| metric | issues | note | out |
|---|---|---|---|
| gateway_cap_30d_usd | 100494 | the AI Gateway spend limit is the owner's money control (150 to 180 on 10-17, equals trigger threshold 180); the doctor records a control_registry disposition and never changes it | R |

### E design or undiagnosed (11)
| metric | trig | issues | why | out |
|---|---|---|---|---|
| worker_count | 344 | 99923 | 36 live scripts vs cap 30, consolidation wave | S |
| q08_gate_pass_rate_7d | 537 | 99929 | gate rejects 98.8% of drafts; three code-tasks merged (10-03, 10-19) and it fell 0.063 to 0.012 | S |
| unverified_blocker_claims | 3061 | 3001 | 29 untested claims (9 to 28 in 9 d), no red-team executor | S |
| spofs_total | 3077 | 99933 | 12 registered SPOFs, honest registration raises it | S |
| roster_capabilities_single_executor | 4992 | 2447 | 174 vs ratchet 158; 13 of them are 'worker:' pseudo-capabilities | S |
| content_items_over_stage_sla | 5915 | 99948 | 2272 items over SLA, 1294 in stage 'correct' (errata-hub intake) vs a capped drain | S |
| fleet_cost_bound_month_usd | 10930 | 1000155 | policy conflict: PIPELINE-FLOW-POLICY-1 raised research_daily_neurons 360k to 600k (10-24 14:59Z, +$91 bound) vs the monthly budget; stale 21 h | RR-lever (decision record + lean routing) |
| seo_sitemap_urls | 13748 | 1000215 | live sitemap has 348 URLs (345 paper pages) vs 704; cause unproven (papers status in LIVING_PAPER not readable here) | RR-lever (diagnose then code-task) |
| subscribers_growth_monthly | - | 100281 | 0 for 14 d vs +10; registry state says OK | S |
| external_referred_pageviews_7d | - | 100550 | 390 to 59 in 10 d while social_posts_7d rose 24 to 71 and outreach_human_clicks_7d reads 695: two reach measures disagree 12x | S |
| social_engagement_rate_30d | - | 100285 | 64 likes over 2545 Bluesky snapshots, shown as 0 | S |

## The 40 first in queue order (PRIORITY-QUEUE-1: critical, high, medium, then oldest first)
| # | issue | pri | trig | metric | value vs rule | age h | class | parent or lever | out |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2226 | crit | 3443 | autonomy_rate_7d | 0.962 vs lt 0.95, cleared | 404 | A5 | recovered-open | R |
| 2 | 99909 | crit | 357 | watchmaker_index | 2 vs gt 0 | 184 | B | reader-report stalled 115 h | RR-lever |
| 3 | 99925 | crit | 378 | code_task_success_rate_30d | 0.47 vs lt 0.5 | 184 | C | code-loop families | W |
| 4 | 99934 | crit | 3454 | owner_dispatch_7d | 8 vs gt 5 | 184 | A6 | window, closed-at-birth cards | W |
| 5 | 100088 | crit | 8888 | breaches_without_ticket | 1 vs gt 0 | 166 | A2 | trigger 6123 route alerts | R |
| 6 | 100222 | crit | 1519 | external_impact_per_dollar | 0.0249 vs gt 0.012 | 158 | C | cost root | RR-parent |
| 7 | 100225 | crit | 409 | fleet_ai_run_rate_30d_usd | 753 vs gt 95 | 157 | C | cost root | RR-parent |
| 8 | 100226 | crit | 354 | workers_ai_cost_30d_usd | 296 vs gt 95 | 157 | C | cost root | RR-parent |
| 9 | 100464 | crit | 10931 | research_neurons_per_publication_7d | 46.7k vs gt 20k | 112 | A6 | window | W |
| 10 | 1000155 | crit | 10930 | fleet_cost_bound_month_usd | 352.8 vs gt 300 | 21 | E | cap decision 10-24 | RR-lever |
| 11 | 2376 | high | 3529 | owner_dispatched_items_7d | 2 vs gt 0 | 333 | C | 7 needs_human | RR-parent |
| 12 | 2875 | high | 3452 | tick_completion_24h | 93.8 vs lt 95 | 200 | A6 | heartbeat gap | W |
| 13 | 99924 | high | 354 | (old-title twin of 100226) | - | 184 | A3 | duplicate | R |
| 14 | 99926 | high | 379 | breach_code_task_pct | 7.5 vs lt 10 | 184 | A2 | unreachable target | RR-lever |
| 15 | 99927 | high | 388 | fix_hold_rate_30d | 0.532 vs lt 0.8 | 184 | B | hysteresis | RR-lever |
| 16 | 99928 | high | 409 | (old-title twin of 100225) | - | 184 | A3 | duplicate | R |
| 17 | 1000215 | high | 13748 | seo_sitemap_urls | 348 vs lt 703 | 12 | E | sitemap lost 356 papers | RR-lever |
| 18 | 1798 | med | 362 | open_agent_issues | 437 vs gt 260 | 573 | C | backlog root | RR-parent |
| 19 | 1838 | med | 413 | credibility_events_90d | NULL vs lt 2 | 570 | A1 | unmeasured | RR-lever |
| 20 | 1893 | med | 786 | q08_verified_votes_7d | 3 vs lt 5 | 550 | C | q08 gate | RR-parent |
| 21 | 2447 | med | 4992 | roster_capabilities_single_executor | 174 vs gt 158 | 327 | E | ratchet drift | S |
| 22 | 2522 | med | 3060 | issues_unprobed_60m | 387 vs gt 10 | 296 | C | probe family | RR-parent |
| 23 | 2570 | med | 5944 | open_issues_without_doer_120m | 353 vs gt 190 | 289 | C | backlog root | RR-parent |
| 24 | 2577 | med | 1238 | idea_topic_concentration_30d | 0.493 vs gt 0.5 | 288 | A5 | remedy worked | R |
| 25 | 2604 | med | 6116 | papers_queued_over_120m | 8 vs gt 0 | 280 | B | rollup held reasons | RR-lever |
| 26 | 2613 | med | 5182 | spof_alternates_untested_24h | 2 vs gt 0 | 277 | C | chaos drill family | RR-parent |
| 27 | 2684 | med | 2038 | runtime_verified_share_24h | 9.1 vs lt 10 | 239 | C | probe family | RR-parent |
| 28 | 2758 | med | 5079 | workers_bp_findings_open | 2 vs gt 0 | 207 | A5 | flap | W |
| 29 | 2819 | med | 4994 | workers_idle_7d | 2 vs gt 0 | 206 | A5 | flap | W |
| 30 | 2840 | med | 4502 | audits_stale | 0 vs gt 0 | 205 | A5 | recovered-open | R |
| 31 | 2861 | med | 4989 | tick_sequence_completion_24h | 0.833 vs lt 0.9 | 202 | A6 | heartbeat gap | W |
| 32 | 2971 | med | 3059 | stuck_items_over_sla | 400 vs gt 0 | 186 | C | unprobed 391 | RR-parent |
| 33 | 2972 | med | 8581 | portfolio_drift | 0 vs gt 0 | 186 | A5 | recovered-open | R |
| 34 | 3001 | med | 3061 | unverified_blocker_claims | 29 vs gt 0 | 185 | E | no executor | S |
| 35 | 3002 | med | 3072 | failure_modes_recurring | 51 vs gt 0 | 185 | C | 49 fm detectors | RR-parent |
| 36 | 3003 | med | 6050 | cadence_overdue_over_120m | 5 vs gt 0 | 185 | B | per producer | RR-lever |
| 37 | 3015 | med | 3688 | fleet_cost_run_rate_usd | 695 vs gt 160 | 185 | C | cost root | RR-parent |
| 38 | 99914 | med | 410 | issue_mttr_h_30d | 11.67 vs gt 2 | 184 | C | backlog root | RR-parent |
| 39 | 99915 | med | 1959 | issues_without_next_action | 213 vs gt 0 | 184 | C | probe family | RR-parent |
| 40 | 99916 | med | 2934 | session_dependent_issues_open | 19 vs gt 0 | 184 | C | untrusted/not-code | RR-parent |

## Remedy history (what remedy_efficacy_30d and the action log say)
- remedy_efficacy_30d reads 0.52 (target >= 0.5) since REMEDY-EFFICACY-PER-TRIGGER-1 (one vote per trigger); fix_hold_rate_30d 0.5324
  (139 judged, 74 held), fix_target_hold_rate_30d 0.4173. improvement_loop_runs id 588 lists 20 relapses; guard_rcs relapsed 4 times.
- Of 67 breaching triggers with an action log: 49 have been breaching more than 7 days and 42 of those still carry the day-one remedy text
  (distinct action strings per trigger = 1); 23 for more than 14 days, 20 with the same text. The METRIC-CLOSED-LOOP-1 replace-after-7-days
  rule is not executed by anything.
- 9 open issues have a merged code task: 1893 (merged 10-03; 1 to 18 to 3), 2577 (10-17; 0.88 to 0.493, worked), 99929 (10-19; 0.060 to 0.012),
  99928 (10-19; 281/474 to 753), 99937 (10-19; 411 to 660), 99940 (10-19; false stops 4 to 11, wrong worker edited), 99941 (10-19; 6 to 3, wrong
  target), 99949 (10-20; 127 to 85, working), 100084 (10-20; 64 flat). Two moved their metric clearly, two partly, five did not.
- v_issue_age_ladder reports doer = 'code-task line' when the description merely contains the text 'code-task:' (12 of the 94; 2570 only
  mentions it in prose, 2 have no anchor line, 5 were planned not-code or refused). The merged-but-breaching ones are not doers, they are spent remedies.

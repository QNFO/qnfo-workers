-- BREACH-ONE-MEANING-1 (2026-10-26, charter pillar autonomy). Owner, 2026-10-26 08:30Z: "Why do so many things need me? ... 71 breaches across the
-- fleet. This is not autonomy ... Is this even machine readable? ... audit all of it and really deep dive into durable fixes."
-- Measured at 08:35Z: v_metric_trigger_state had 70 hits (the dashboard said 71) and the owner queue said "10 things need you".
--   - All 10 owner-queue items were code_tasks rows in status needs_human (the code loop could not verify or merge its own change). The owner
--     can do nothing with them, and HUMAN-ITEMS-AUTOMATIC-1 (owner 2026-10-20) says they are the fleet's; that migration added only a detector.
--     They alone hold human_wait_oldest_min (818 min) red.
--   - 2 hits are false: four triggers use '>' and v_metric_trigger_state knows only gt/gte/lt/lte/eq, so '>' fell to its ELSE branch (>=) and a
--     value of 0 against threshold 0 read as a breach (prd_funnel_monitor_stale, personal_calendar_delivery_over_120m).
--   - 6 hits are the same fact counted twice: three partial cost run rates beside the all-billing run rate, and two "issue with no doer"
--     counts plus a 30-day MTTR beside the owner-directive metrics that already measure them.
--   - papers_live_failing_release_gate counts published papers that have not passed the release gate. Since the owner's 2026-10-26 06:35
--     directive the gate never withdraws a paper (pub-gate-v4-no-withdraw, PR 4298); a weak paper stays live and goes to the revision loop, so
--     224 is the intended state and the trigger asks for the opposite of the owner's rule.
-- WHAT THIS FILE CHANGES
--   1. v_metric_trigger_state reads '>', '>=', '<', '<=', '=' as gt, gte, lt, lte, eq; a trigger writes new rows in the word form.
--   2. Code tasks never wait on the owner: a task the loop sets to needs_human is set to failed in the same statement, its reason kept and
--      prefixed "HUMAN-ITEMS-AUTOMATIC-1" (revert line in the text). failed is a terminal state the loop already handles like needs_human
--      (merge-runner refusal sweep, CODE-LOOP-EXHAUSTED-1, the issue's own replan). ops_config human_items_auto_route = off stops it.
--   3. Duplicate and contradicted triggers are disabled (enabled 0, note names the metric that keeps the meaning); every metric is still
--      measured. Nothing about money changes: thresholds and caps are untouched.
--   4. breach_causes + metric_breach_cause + v_breach_by_cause: every metric in breach mapped to one root cause in plain words, with the lever
--      and the doer, machine-readable for the dashboard refactor. A breach with no mapping reads cause 'unmapped' (metric breaches_unmapped).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_breach_one_meaning_view
-- Rollback: DROP TRIGGER IF EXISTS code_task_needs_human_to_fleet_upd; DROP TRIGGER IF EXISTS code_task_needs_human_to_fleet_ins; DROP TRIGGER IF EXISTS metric_trigger_operator_words_ai; DROP TRIGGER IF EXISTS metric_trigger_operator_words_au; UPDATE analytics_metric_triggers SET enabled = 1, operator = b.operator, notes = b.notes FROM bak_20261026_breach_one_meaning_triggers b WHERE analytics_metric_triggers.metric_key = b.metric_key; UPDATE code_tasks SET status = 'needs_human' WHERE id IN (SELECT id FROM bak_20261026_breach_one_meaning_tasks); DROP VIEW IF EXISTS v_breach_by_cause; then recreate v_metric_trigger_state from bak_20261026_breach_one_meaning_view.sql.
-- spof-review: no cron, binding or credential; two triggers on code_tasks status, two on analytics_metric_triggers, one view rewrite.

CREATE TABLE IF NOT EXISTS bak_20261026_breach_one_meaning_view AS SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_metric_trigger_state';
CREATE TABLE IF NOT EXISTS bak_20261026_breach_one_meaning_triggers AS SELECT metric_key, operator, enabled, notes FROM analytics_metric_triggers
  WHERE operator NOT IN ('gt', 'gte', 'lt', 'lte', 'eq')
     OR metric_key IN ('fleet_ai_run_rate_30d_usd', 'fleet_cost_run_rate_usd', 'workers_ai_run_rate_usd', 'open_issues_without_doer_120m',
                       'issues_without_next_action', 'issue_mttr_h_30d', 'papers_live_failing_release_gate');
CREATE TABLE IF NOT EXISTS bak_20261026_breach_one_meaning_tasks AS SELECT id, status, last_error, updated_at FROM code_tasks WHERE status = 'needs_human';

-- 1. Operators.
DROP VIEW IF EXISTS v_metric_trigger_state;
CREATE VIEW v_metric_trigger_state AS
WITH raw AS (
  SELECT t.id, t.metric_key, t.title,
    CASE trim(t.operator) WHEN '>' THEN 'gt' WHEN '>=' THEN 'gte' WHEN '<' THEN 'lt' WHEN '<=' THEN 'lte' WHEN '=' THEN 'eq' WHEN '==' THEN 'eq' ELSE t.operator END AS operator,
    t.threshold, t.owner, t.queue_target, t.priority,
    COALESCE(
      CASE WHEN t.source_table = 'records' THEN (SELECT CASE WHEN rtrim(trim(x.value), '% ') <> '' AND rtrim(trim(x.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(x.value), '% ') AS REAL) END FROM analytics_dash_records x WHERE x.metric = t.metric_key) END,
      (SELECT CASE WHEN rtrim(trim(m.value), '% ') <> '' AND rtrim(trim(m.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(m.value), '% ') AS REAL) END FROM analytics_dash_meta m WHERE m.key = t.metric_key),
      (SELECT CASE WHEN rtrim(trim(r.last_value), '% ') <> '' AND rtrim(trim(r.last_value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(r.last_value), '% ') AS REAL) END FROM metric_registry r WHERE r.metric = t.metric_key)
    ) AS val
  FROM analytics_metric_triggers t WHERE t.enabled = 1
)
SELECT id, metric_key, title, operator, threshold, owner, queue_target, priority, val,
  CASE WHEN val IS NULL THEN NULL
       WHEN operator = 'gt' THEN val > threshold
       WHEN operator = 'lte' THEN val <= threshold
       WHEN operator = 'lt' THEN val < threshold
       WHEN operator = 'eq' THEN val = threshold
       ELSE val >= threshold END AS hit
FROM raw;

UPDATE analytics_metric_triggers SET operator = CASE trim(operator) WHEN '>' THEN 'gt' WHEN '>=' THEN 'gte' WHEN '<' THEN 'lt' WHEN '<=' THEN 'lte' ELSE 'eq' END
WHERE trim(operator) IN ('>', '>=', '<', '<=', '=', '==');
DROP TRIGGER IF EXISTS metric_trigger_operator_words_ai;
CREATE TRIGGER metric_trigger_operator_words_ai AFTER INSERT ON analytics_metric_triggers
WHEN trim(NEW.operator) IN ('>', '>=', '<', '<=', '=', '==')
BEGIN
  UPDATE analytics_metric_triggers SET operator = CASE trim(NEW.operator) WHEN '>' THEN 'gt' WHEN '>=' THEN 'gte' WHEN '<' THEN 'lt' WHEN '<=' THEN 'lte' ELSE 'eq' END WHERE id = NEW.id;
END;
DROP TRIGGER IF EXISTS metric_trigger_operator_words_au;
CREATE TRIGGER metric_trigger_operator_words_au AFTER UPDATE OF operator ON analytics_metric_triggers
WHEN trim(NEW.operator) IN ('>', '>=', '<', '<=', '=', '==')
BEGIN
  UPDATE analytics_metric_triggers SET operator = CASE trim(NEW.operator) WHEN '>' THEN 'gt' WHEN '>=' THEN 'gte' WHEN '<' THEN 'lt' WHEN '<=' THEN 'lte' ELSE 'eq' END WHERE id = NEW.id;
END;

-- 2. Code tasks go back to the fleet, never to the owner queue.
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('human_items_auto_route', 'on',
  'BREACH-ONE-MEANING-1 2026-10-26: on = a code task set to needs_human is set to failed with its reason (HUMAN-ITEMS-AUTOMATIC-1); off = the old needs_human owner-queue path');
UPDATE code_tasks SET status = 'failed', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  last_error = substr('HUMAN-ITEMS-AUTOMATIC-1: returned to the fleet, not the owner (was needs_human; revert: status needs_human): ' || COALESCE(last_error, ''), 1, 2000)
WHERE status = 'needs_human';
DROP TRIGGER IF EXISTS code_task_needs_human_to_fleet_upd;
CREATE TRIGGER code_task_needs_human_to_fleet_upd AFTER UPDATE OF status ON code_tasks
WHEN NEW.status = 'needs_human' AND COALESCE((SELECT value FROM ops_config WHERE key = 'human_items_auto_route'), 'on') <> 'off'
BEGIN
  UPDATE code_tasks SET status = 'failed',
    last_error = substr('HUMAN-ITEMS-AUTOMATIC-1: returned to the fleet, not the owner (was needs_human; revert: status needs_human): ' || COALESCE(NEW.last_error, ''), 1, 2000)
  WHERE id = NEW.id;
END;
DROP TRIGGER IF EXISTS code_task_needs_human_to_fleet_ins;
CREATE TRIGGER code_task_needs_human_to_fleet_ins AFTER INSERT ON code_tasks
WHEN NEW.status = 'needs_human' AND COALESCE((SELECT value FROM ops_config WHERE key = 'human_items_auto_route'), 'on') <> 'off'
BEGIN
  UPDATE code_tasks SET status = 'failed',
    last_error = substr('HUMAN-ITEMS-AUTOMATIC-1: returned to the fleet, not the owner (was needs_human; revert: status needs_human): ' || COALESCE(NEW.last_error, ''), 1, 2000)
  WHERE id = NEW.id;
END;

-- 3. One meaning per metric. The metric stays measured; only its duplicate breach is removed.
UPDATE analytics_metric_triggers SET enabled = 0, notes = COALESCE(notes, '') || ' | BREACH-ONE-MEANING-1 2026-10-26: disabled as a duplicate; ' ||
  CASE metric_key
    WHEN 'fleet_ai_run_rate_30d_usd' THEN 'a partial run rate (Workers AI + router) inside monthly_cost_run_rate_usd, which keeps the projected-spend meaning'
    WHEN 'fleet_cost_run_rate_usd' THEN 'a partial run rate (Cloudflare + gateway) inside monthly_cost_run_rate_usd, which keeps the projected-spend meaning'
    WHEN 'workers_ai_run_rate_usd' THEN 'a partial run rate (Workers AI) inside monthly_cost_run_rate_usd, which keeps the projected-spend meaning'
    WHEN 'open_issues_without_doer_120m' THEN 'issues_over_24h_no_doer (owner directive 2026-10-20) keeps the issue-with-no-doer meaning'
    WHEN 'issues_without_next_action' THEN 'issues_over_24h_no_doer (owner directive 2026-10-20) keeps the issue-with-no-doer meaning'
    WHEN 'issue_mttr_h_30d' THEN 'mttr_h_7d (doctrine section 24 headline) keeps the repair-time meaning'
    WHEN 'papers_live_failing_release_gate' THEN 'contradicts the owner directive 2026-10-26 06:35 (pub-gate-v4-no-withdraw: a weak paper stays live and is revised); output quality is read from v_output_quality_by_surface'
  END
WHERE metric_key IN ('fleet_ai_run_rate_30d_usd', 'fleet_cost_run_rate_usd', 'workers_ai_run_rate_usd', 'open_issues_without_doer_120m',
                     'issues_without_next_action', 'issue_mttr_h_30d', 'papers_live_failing_release_gate');

-- 4. Root causes, machine-readable.
CREATE TABLE IF NOT EXISTS breach_causes (
  cause_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  plain TEXT NOT NULL,
  lever TEXT NOT NULL,
  doer TEXT NOT NULL,
  needs_owner INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE IF NOT EXISTS metric_breach_cause (
  metric_key TEXT PRIMARY KEY,
  cause_key TEXT NOT NULL,
  note TEXT
);
INSERT OR REPLACE INTO breach_causes (cause_key, title, plain, lever, doer, needs_owner) VALUES
 ('spend', 'AI spend above the ceiling',
  'The fleet spends more on AI than the USD 300 a month the owner set on 2026-10-21; the 7-day run rate is about twice that.',
  'Cheaper models first (BUDGET-SOFT-ROUTE-1) and fewer review cycles per paper; raising the ceiling is the owner''s decision (money).',
  'qnfo-ai router, qnfo-research-exec, q08-signal-engine', 1),
 ('issue-backlog', 'Open issues pile up faster than they close',
  'About 380 issues are open. Most are one-off findings that no loop owns and that have no automatic check, so nothing closes them.',
  'Give every issue family a doer and a closing probe at birth (TOOL-ISSUE-SELFCLOSE-1 did this for tool failures); fold meta-tickets (ISSUE-HYGIENE-1).',
  'qnfo-fleet-control, issue-meta-fold, remediation consumer', 0),
 ('code-loop', 'The code loop finishes too few of its tasks',
  'About half of code tasks fail: empty model replies, no verifier for some file types, files too large without an anchor, scope refusals.',
  'Empty-reply retry (EMPTY-REPLY-NOTHINK-1, live), .sql verifier (SQL-VERIFY-1, in progress), anchors from the planner for large files.',
  'qnfo-code-orchestrator', 0),
 ('owner-routing', 'Fleet work was shown as the owner''s',
  'Code tasks the loop could not finish were put on the owner queue as "needs you". The owner cannot act on them.',
  'BREACH-ONE-MEANING-1: such tasks go back to the fleet automatically; only money, credentials, legal acts and the owner''s own accounts reach the owner.',
  'qnfo-audit trigger code_task_needs_human_to_fleet', 0),
 ('publishing', 'Papers move through the pipeline too slowly',
  'Publishing fell from about 89 a day to under 10 when the research budget ran out each morning; queues behind it (social, DOIs, errata) back up.',
  'Spend the daily research budget on the stages that publish (fewer review loops), drain queued papers in roll-ups, fix errata at the source.',
  'qnfo-research-exec, qnfo-social, qnfo-lifecycle', 0),
 ('heartbeat', 'Scheduled loops miss some of their runs',
  'The 10-minute fleet heartbeat ran out of memory early on 2026-10-26 and some hourly steps did not run, so tick and cadence metrics dipped.',
  'Heavy steps moved off the heartbeat (PR 4295); the 24-hour windows recover as the gap ages out.',
  'qnfo-fleet-control', 0),
 ('structure', 'Long-standing structural debt',
  'Counts of things the fleet has registered as debt: more workers than the cap of 30, single points of failure, graph drift, recurring failure modes.',
  'Retire or fold idle workers, build the second path for each single point of failure, fix graph drift at the cause.',
  'qnfo-fleet-control', 0),
 ('measurement', 'The metric itself was wrong',
  'A threshold, operator or duplicate that showed red when nothing was wrong.',
  'Fixed in the metric definition (BREACH-ONE-MEANING-1).',
  'qnfo-audit', 0);
INSERT OR REPLACE INTO metric_breach_cause (metric_key, cause_key) VALUES
 ('fleet_ai_run_rate_30d_usd','spend'),('fleet_cost_bound_month_usd','spend'),('workers_ai_cost_30d_usd','spend'),('fleet_cost_run_rate_usd','spend'),
 ('monthly_cost_run_rate_usd','spend'),('workers_ai_run_rate_usd','spend'),('external_impact_per_dollar','spend'),
 ('research_neurons_per_publication_7d','spend'),('q08_neurons_per_published_piece_7d','spend'),
 ('open_agent_issues','issue-backlog'),('issues_open_over_120m','issue-backlog'),('issues_over_24h_no_doer','issue-backlog'),
 ('issues_unprobed_60m','issue-backlog'),('issues_without_next_action','issue-backlog'),('open_issues_without_doer_120m','issue-backlog'),
 ('issue_auto_close_2h_share_24h','issue-backlog'),('issue_drain_ratio_24h','issue-backlog'),('issue_mttr_h_30d','issue-backlog'),
 ('mttr_h_7d','issue-backlog'),('stuck_items_over_sla','issue-backlog'),('sla_breaches_over_120m','issue-backlog'),
 ('session_dependent_issues_open','issue-backlog'),('unverified_blocker_claims','issue-backlog'),('breach_code_task_pct','issue-backlog'),
 ('remedy_efficacy_30d','issue-backlog'),('fix_hold_rate_30d','issue-backlog'),('program_focus_closed_24h','issue-backlog'),
 ('goals_unevaluated','issue-backlog'),
 ('code_goal_success_rate_30d','code-loop'),('code_pr_merge_share_7d','code-loop'),('code_task_success_rate_30d','code-loop'),
 ('code_task_superseded_share_30d','code-loop'),('fleet_authored_pr_share_7d','code-loop'),('pr_open_over_10m','code-loop'),
 ('workers_bp_findings_open','code-loop'),
 ('human_wait_oldest_min','owner-routing'),('owner_dispatch_7d','owner-routing'),('owner_dispatched_items_7d','owner-routing'),
 ('false_stops_7d','owner-routing'),
 ('papers_queued_over_120m','publishing'),('publish_rate_ratio_24h','publishing'),('idea_to_publish_h_p50_7d','publishing'),
 ('content_items_over_stage_sla','publishing'),('papers_live_failing_release_gate','publishing'),('papers_with_open_high_errata_pct','publishing'),
 ('research_deferred_pool','publishing'),('golden_run_complement_share_30d','publishing'),('prd_funnel_missing_transitions','publishing'),
 ('q08_gate_pass_rate_7d','publishing'),('q08_verified_votes_7d','publishing'),('attention_channels_stopped','publishing'),
 ('tick_sequence_completion_24h','heartbeat'),('tick_slot_coverage_24h','heartbeat'),('tick_completion_24h','heartbeat'),
 ('crons_unobserved','heartbeat'),('cadence_overdue_over_120m','heartbeat'),('watchmaker_index','heartbeat'),
 ('runtime_verified_share_24h','heartbeat'),('ops_agent_empty_answers_7d','heartbeat'),
 ('worker_count','structure'),('spofs_total','structure'),('spof_alternates_untested_24h','structure'),
 ('roster_capabilities_single_executor','structure'),('roster_members_degraded','structure'),('workers_idle_7d','structure'),
 ('fleet_graph_findings_warn','structure'),('failure_modes_recurring','structure'),('cf_changelog_open_proposals_14d','structure'),
 ('prd_funnel_monitor_stale','measurement'),('personal_calendar_delivery_over_120m','measurement');

DROP VIEW IF EXISTS v_breach_by_cause;
CREATE VIEW v_breach_by_cause AS
SELECT COALESCE(c.cause_key, 'unmapped') AS cause_key,
  COALESCE(c.title, 'Breach with no root cause recorded') AS title,
  COALESCE(c.plain, 'A metric in breach that no row of metric_breach_cause maps; map it to a cause or fix the metric.') AS plain,
  COALESCE(c.lever, 'Map the metric in metric_breach_cause.') AS lever,
  COALESCE(c.doer, 'qnfo-fleet-control') AS doer,
  COALESCE(c.needs_owner, 0) AS needs_owner,
  COUNT(*) AS breaches,
  group_concat(s.metric_key || '=' || s.val, ', ') AS metrics
FROM v_metric_trigger_state s
LEFT JOIN metric_breach_cause m ON m.metric_key = s.metric_key
LEFT JOIN breach_causes c ON c.cause_key = m.cause_key
WHERE s.hit = 1
GROUP BY 1, 2, 3, 4, 5, 6;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, last_value, last_refreshed, state)
VALUES ('breaches_unmapped', 'system', 'guard', 'metrics in breach (v_metric_trigger_state.hit = 1) with no metric_breach_cause row (v_breach_by_cause cause unmapped)',
  'qnfo-audit.v_breach_by_cause', '0 at registration (BREACH-ONE-MEANING-1)', '0', 'qnfo-fleet-control', 'qnfo-fleet-control', 'hourly',
  CAST((SELECT COALESCE(SUM(breaches), 0) FROM v_breach_by_cause WHERE cause_key = 'unmapped') AS TEXT), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED');
INSERT OR IGNORE INTO metric_authorship (metric, formula, authored_by, authored_at, probation_until, graduation)
VALUES ('breaches_unmapped', 'metrics in breach with no metric_breach_cause row', 'BREACH-ONE-MEANING-1', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+120 minutes'), 'holds a value at its first hourly refresh');
INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-breach-unmapped', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COALESCE(SUM(breaches), 0) FROM v_breach_by_cause WHERE cause_key = ''unmapped'') AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'BREACH-ONE-MEANING-1', 'failure-mode detector: a new breach needs a cause row in metric_breach_cause', 'qnfo-fleet-control'
WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'fm-breach-unmapped');
INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-code-task-owner-routed', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''needs_human'') AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'BREACH-ONE-MEANING-1', 'failure-mode detector: a code task is waiting on the owner queue', 'qnfo-code-orchestrator'
WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'fm-code-task-owner-routed');
INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'code-task-owner-routed', 'a code task the loop could not finish is shown to the owner as "needs you"',
  'needs_human was a terminal code_tasks status read by the dashboard owner queue; HUMAN-ITEMS-AUTOMATIC-1 (2026-10-20) added only a detector',
  'triggers code_task_needs_human_to_fleet_upd/_ins set it to failed with its reason, which the loop and the issue replan already handle',
  'fm-code-task-owner-routed', 'fm-code-task-owner-routed', '2026-10-26', NULL,
  'any code_tasks row in status needs_human', 'owner queue "10 things need you", human_wait_oldest_min 818', 'the owner''s attention'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'code-task-owner-routed');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session_01RdDA76KLvqYHYBjL9C2be5', 'a breach is worth showing only when it is real, counted once, and names its cause',
  'operator words in v_metric_trigger_state, code tasks never routed to the owner, 7 duplicate or contradicted triggers disabled, v_breach_by_cause (BREACH-ONE-MEANING-1)',
  '70 hits and 10 owner items at 08:35Z; 2 false (operator), 6 duplicates, 1 contradicting the owner gate directive, 10 owner items all code tasks',
  'applied', 'analytics_metric_triggers, code_tasks status, v_metric_trigger_state readers',
  'the Rollback line of migrations/2026-10-26-breach-one-meaning.sql', 'the owner queue holds only identity-bound items; every breach names one cause',
  'owner queue 0 code tasks and breaches 70 -> about 60 within 1 h, every one mapped to a cause', 'live D1 read of v_metric_trigger_state and the owner queue sources'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'BREACH-ONE-MEANING-1') > 0);

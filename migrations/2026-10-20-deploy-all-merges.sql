-- DEPLOY-ALL-MERGES-1, MERGE-RELIABILITY-1 and ISSUE-AGE-24H-1 (2026-10-20, charter pillars core and autonomy; agent_issues 100298, 100299).
-- Owner directives 2026-10-20, verbatim: "The system shall always clear all open issues server-side automatically within 24 hours. The system
-- shall always fix and redeploy all merge failures automatically." and "The system shall always deploy all merges automatically."
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS deploy_merge_age_tick; DROP VIEW IF EXISTS v_issue_age_ladder; DROP VIEW IF EXISTS v_merge_reliability; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('merges_undeployed_over_60m', 'code_pr_merge_share_7d', 'code_prs_unmerged_over_120m', 'issues_over_24h_no_doer'); DELETE FROM metric_registry WHERE metric IN ('merges_undeployed_over_60m', 'code_pr_merge_share_7d', 'code_prs_unmerged_over_120m', 'issues_over_24h_no_doer'); DELETE FROM remediation_contracts WHERE class IN ('fm-merge-not-deployed', 'fm-issue-no-doer-24h'); DELETE FROM failure_modes WHERE fm_key IN ('merge-not-deployed', 'issue-no-doer-24h'); DELETE FROM ops_config WHERE key IN ('OWNER_DIRECTIVE_2026_10_20_DEPLOY_ALL_MERGES_1', 'issue_age_replan'); the issue_plans rows re-armed are listed in issue_age_replans (planned_at_was) and may be restored from it.
-- spof-review: no new cron, binding or credential; the refresh rides the fleet_tick heartbeat (two producers) like every other computed metric.
--
-- WHAT WAS READ (qnfo-audit, 2026-10-20 05:30Z)
--   deploy   deploy_drift_cf tracked 24 workers, all in sync, and recorded 8 more as "skip": the six control-plane workers and the two container
--            workers. A merge to one of those whose canonical run was cancelled or failed had no second runner and no metric. qnfo-fleet-control
--            0.42.0 (same PR) makes them targets: it dispatches canonical-deploy.yml workers=<name> (canary and revert on the runner) or the
--            container worker's own workflow. merges_undeployed_over_60m counts every worker whose main VERSION has been ahead of live for more
--            than 60 minutes (45-minute grace + one 10-minute tick + margin), whichever runner owns it.
--   merges   code_tasks, goals whose first pull request opened 7 days to 120 minutes ago: 120 goals, 107 merged (0.892). Green to merge was
--            under 5 minutes for 102 of 103 merged tasks with green_since; open to merge averaged 27 minutes. The merge lane itself is fast; the
--            loss is pull requests that never merge, so the reliability metric is goal-level (a re-proposed or rebased task that merges counts)
--            and its companion counts the code loop's pull requests still unmerged 120 minutes after opening.
--   issues   141 open, 81 older than 24 h. 118 open issues have no doer: issue_plans says untrusted for 74 (a loop-filed family whose text the
--            planner may not turn into code, PLAN_TRUSTED, unchanged on purpose) and not-code for 44, and a not-code verdict is not looked at
--            again for PLAN_RECHECK_DAYS = 7 days, so an issue whose text or code changed waits a week for a second decision.
-- WHAT THIS FILE ADDS
--   1. v_issue_age_ladder: every open issue with its age, its doer (code-task line, live code task, live work claim, or none), the planner's
--      verdict and reason, and its rung of the 24-hour ladder (4 h, 8 h, 16 h, 24 h). The 24 h rung with no doer is the breach.
--   2. issues_over_24h_no_doer (target 0): open issues older than 24 h that nothing is acting on. The trigger's action names the lever per verdict.
--   3. Daily re-plan: on the fleet_tick heartbeat, an open issue older than 24 h whose not-code or invalid verdict is older than 24 h is re-armed
--      for the planner (issue_plans.planned_at moved before the 7-day recheck line, the old value kept in issue_age_replans), at most 12 a tick,
--      once a day per issue. Untrusted verdicts are not re-armed: re-reading untrusted text decides the same. ops_config issue_age_replan = off.
--   4. merges_undeployed_over_60m (target 0), code_pr_merge_share_7d (target >= 0.95), code_prs_unmerged_over_120m (target 0), v_merge_reliability.
--   5. failure modes merge-not-deployed and issue-no-doer-24h with their detector contracts.

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('OWNER_DIRECTIVE_2026_10_20_DEPLOY_ALL_MERGES_1', '{"id":"DEPLOY-ALL-MERGES-1","date":"2026-10-20","directives_verbatim":["The system shall always clear all open issues server-side automatically within 24 hours.","The system shall always fix and redeploy all merge failures automatically.","The system shall always deploy all merges automatically."],"measured_by":["issues_over_24h_no_doer (target 0)","issues_open_over_24h (target 0)","merges_undeployed_over_60m (target 0)","code_pr_merge_share_7d (target >= 0.95)","code_prs_unmerged_over_120m (target 0)"],"limits_unchanged":"the interrupt gate, harness permission checks, the secret lock, live work claims, required checks never bypassed, PLAN_TRUSTED and the code loop merge scope"}', 'owner directives 2026-10-20 (DEPLOY-ALL-MERGES-1, ISSUE-AGE-24H-1, MERGE-RELIABILITY-1)'),
 ('issue_age_replan', 'on', 'ISSUE-AGE-24H-1: off stops the daily re-plan of not-code issues older than 24 h (migrations/2026-10-20-deploy-all-merges.sql)');

CREATE TABLE IF NOT EXISTS issue_age_replans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  issue_id INTEGER NOT NULL,
  outcome_was TEXT,
  planned_at_was TEXT,
  age_h REAL
);
CREATE INDEX IF NOT EXISTS idx_issue_age_replans_issue ON issue_age_replans (issue_id, ts);

CREATE VIEW IF NOT EXISTS v_issue_age_ladder AS
WITH n AS (SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS now_iso),
o AS (
  SELECT a.id, a.title, a.priority, a.source, ROUND((n.now_ms - a.created_at) / 3600000.0, 1) AS age_h,
    CASE WHEN instr(COALESCE(a.description, ''), 'code-task:') > 0 THEN 'code-task line'
         WHEN EXISTS (SELECT 1 FROM code_tasks k WHERE k.goal LIKE '[issue #' || a.id || ']%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human')) THEN 'live code task'
         WHEN EXISTS (SELECT 1 FROM work_claims w WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id) AND w.released_at IS NULL AND w.expires_at > n.now_iso) THEN 'live work claim'
         ELSE NULL END AS doer,
    p.outcome AS plan_outcome, p.planned_at, substr(COALESCE(p.detail, ''), 1, 200) AS plan_reason
  FROM agent_issues a CROSS JOIN n LEFT JOIN issue_plans p ON p.issue_id = a.id
  WHERE a.status = 'open'
)
SELECT id, substr(title, 1, 120) AS title, priority, source, age_h, doer, plan_outcome, planned_at, plan_reason,
  CASE WHEN age_h >= 24 THEN '24h' WHEN age_h >= 16 THEN '16h' WHEN age_h >= 8 THEN '8h' WHEN age_h >= 4 THEN '4h' ELSE 'new' END AS rung,
  CASE WHEN age_h >= 24 AND doer IS NULL THEN 1 ELSE 0 END AS breach
FROM o;

CREATE VIEW IF NOT EXISTS v_merge_reliability AS
WITH g AS (
  SELECT goal, MIN(pr_opened_at) AS first_pr, MAX(CASE WHEN merged_at IS NOT NULL THEN 1 ELSE 0 END) AS merged,
    MIN(merged_at) AS first_merge, MAX(CASE WHEN deployed_at IS NOT NULL THEN 1 ELSE 0 END) AS deployed
  FROM code_tasks GROUP BY goal HAVING first_pr IS NOT NULL
)
SELECT
  (SELECT COUNT(*) FROM g WHERE first_pr > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND first_pr < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS goals_7d,
  (SELECT SUM(merged) FROM g WHERE first_pr > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND first_pr < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS merged_7d,
  (SELECT ROUND(1.0 * SUM(merged) / MAX(1, COUNT(*)), 3) FROM g WHERE first_pr > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND first_pr < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS merge_share_7d,
  (SELECT ROUND(AVG((julianday(first_merge) - julianday(first_pr)) * 1440), 1) FROM g WHERE merged = 1 AND first_merge > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS open_to_merge_avg_min_7d,
  (SELECT COUNT(*) FROM code_tasks WHERE pr_url IS NOT NULL AND merged_at IS NULL AND status IN ('published', 'pr_open', 'branch_pushed')
     AND COALESCE(pr_opened_at, updated_at) < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS prs_unmerged_over_120m,
  (SELECT COUNT(*) FROM deploy_drift_cf WHERE state IN ('wait', 'due', 'dispatched', 'deployed') AND drift_since IS NOT NULL
     AND drift_since < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS workers_undeployed_over_60m;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('merges_undeployed_over_60m', 'operational', 'target',
  'workers whose main VERSION has been ahead of the live VERSION for more than 60 minutes (deploy_drift_cf state wait, due, dispatched or deployed with drift_since older than 60 minutes), control-plane and container workers included since qnfo-fleet-control 0.42.0',
  'qnfo-audit.deploy_drift_cf (DEPLOY-DRIFT-CF-1, DEPLOY-ALL-MERGES-1)', '0 of 24 tracked on 2026-10-20 05:30Z; 8 control-plane and container workers were untracked',
  '0 (owner directive 2026-10-20: the system shall always deploy all merges automatically)', 'qnfo-fleet-control', 'trigger gt 0', '*/10', '> 0', '> 3', NULL, NULL, 'MEASURED', 'computed'),
 ('code_pr_merge_share_7d', 'operational', 'target',
  'goal-level: of the code-loop goals whose first pull request opened 7 days to 120 minutes ago, the share that merged (any task of the goal: a rebased or re-proposed task that merges counts)',
  'qnfo-audit.code_tasks via v_merge_reliability (MERGE-RELIABILITY-1)', '0.892 (107 of 120) on 2026-10-20 05:30Z',
  '>= 0.95 (owner directive 2026-10-20: the system shall always fix and redeploy all merge failures automatically)', 'qnfo-fleet-control', 'trigger lt 0.95', '*/10', '< 0.95', '< 0.8', NULL, NULL, 'MEASURED', 'computed'),
 ('code_prs_unmerged_over_120m', 'operational', 'target',
  'code-loop pull requests (code_tasks with pr_url, not merged, status published, pr_open or branch_pushed) opened more than 120 minutes ago',
  'qnfo-audit.code_tasks via v_merge_reliability (MERGE-RELIABILITY-1)', 'first refresh after apply',
  '0 (owner directive 2026-10-20: merge failures are fixed and redeployed automatically; no SLA exceeds 120 minutes)', 'qnfo-fleet-control', 'trigger gt 0', '*/10', '> 0', '> 5', NULL, NULL, 'MEASURED', 'computed'),
 ('issues_over_24h_no_doer', 'operational', 'target',
  'open agent_issues older than 24 h with no code-task line, no unfinished code task for [issue #id] and no live work claim (v_issue_age_ladder.breach)',
  'qnfo-audit.agent_issues, code_tasks, work_claims, issue_plans via v_issue_age_ladder (ISSUE-AGE-24H-1)', 'first refresh after apply (81 open issues older than 24 h on 2026-10-20 05:30Z)',
  '0 (owner directive 2026-10-20: the system shall always clear all open issues server-side automatically within 24 hours)', 'qnfo-fleet-control', 'trigger gt 0', '*/10', '> 0', '> 30', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS deploy_merge_age_tick AFTER INSERT ON fleet_tick
BEGIN
  INSERT INTO issue_age_replans (issue_id, outcome_was, planned_at_was, age_h)
    SELECT id, plan_outcome, planned_at, age_h FROM v_issue_age_ladder l
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'issue_age_replan'), 'on') <> 'off'
      AND l.age_h >= 24 AND l.doer IS NULL AND l.plan_outcome IN ('not-code', 'invalid')
      AND l.planned_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
      AND NOT EXISTS (SELECT 1 FROM issue_age_replans r WHERE r.issue_id = l.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
    ORDER BY l.age_h DESC LIMIT 12;
  UPDATE issue_plans SET planned_at = '2000-01-01T00:00:00Z', detail = substr('ISSUE-AGE-24H-1 re-plan (was ' || outcome || ' at ' || planned_at || '): ' || COALESCE(detail, ''), 1, 600)
    WHERE issue_id IN (SELECT issue_id FROM issue_age_replans WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 minutes'))
      AND outcome IN ('not-code', 'invalid') AND planned_at <> '2000-01-01T00:00:00Z';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT COUNT(*) FROM v_issue_age_ladder WHERE breach = 1) AS TEXT)
    WHERE metric = 'issues_over_24h_no_doer';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT workers_undeployed_over_60m FROM v_merge_reliability) AS TEXT)
    WHERE metric = 'merges_undeployed_over_60m';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT COALESCE(merge_share_7d, 1) FROM v_merge_reliability) AS TEXT)
    WHERE metric = 'code_pr_merge_share_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT prs_unmerged_over_120m FROM v_merge_reliability) AS TEXT)
    WHERE metric = 'code_prs_unmerged_over_120m';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'merges_undeployed_over_60m', 'Merged code not deployed within 60 minutes', 'registry', 'gt', 0, 1,
  'Pillar core (owner directive 2026-10-20: the system shall always deploy all merges automatically). Read which: SELECT dir, worker, main_version, live_version, state, drift_since, last_action, last_action_at FROM deploy_drift_cf WHERE drift_since < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes''). Levers in order: (1) last_action deploy-failed: read the error, fix its cause in qnfo-ops /ops/deploy or the worker (a CF API refusal is usually the bundle or a binding), and the next tick retries after 60 minutes; (2) last_action dispatched for a control-plane or container worker: read that workflow run; a canary revert lowers main, so a run that keeps failing is the defect to fix; (3) no action and state due: the route preflight or the run block (cloud_ops_events kind deploy-drift-cf) says why. Done when merges_undeployed_over_60m reads 0.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'DEPLOY-ALL-MERGES-1 (migrations/2026-10-20-deploy-all-merges.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'merges_undeployed_over_60m');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'code_pr_merge_share_7d', 'Code-loop pull requests that never merge', 'registry', 'lt', 0.95, 2,
  'Pillar autonomy (owner directive 2026-10-20: merge failures are fixed and redeployed automatically). Read the unmerged goals: SELECT goal, MAX(merge_note), MAX(last_error) FROM code_tasks WHERE pr_opened_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') GROUP BY goal HAVING MAX(merged_at) IS NULL. Group by the merge note or error prefix; the largest class is the next fix in qnfo-fleet-control cmDecide or scripts/conflict_repair.py (stale base: CODE-LOOP-STALE-VERSION-1 and REBASE-REQUEUE-1; conflict: CONFLICT-REPAIR-INPLACE-1; mirror or version guard: regenerate by script). Each class fixed gets a failure_modes row and detector. Done when code_pr_merge_share_7d reads 0.95 or more.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'MERGE-RELIABILITY-1 (migrations/2026-10-20-deploy-all-merges.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'code_pr_merge_share_7d');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'code_prs_unmerged_over_120m', 'Code-loop pull requests unmerged after 120 minutes', 'registry', 'gt', 0, 2,
  'Pillar autonomy (owner directive 2026-10-20: merge failures are fixed and redeployed automatically). Read them: SELECT id, pr_url, merge_state, merge_note, green_since, pr_opened_at FROM code_tasks WHERE pr_url IS NOT NULL AND merged_at IS NULL AND status IN (''published'', ''pr_open'', ''branch_pushed'') ORDER BY pr_opened_at. For each, the merge note names the refusal: a conflict is repaired in place by conflict-repair.yml on the next push to main, a stale base is requeued by the merge runner, a red check is the task''s own failure (cmRefuseTask). A class with no automatic path gets one in qnfo-fleet-control with its failure mode. Done when code_prs_unmerged_over_120m reads 0.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'MERGE-RELIABILITY-1 (migrations/2026-10-20-deploy-all-merges.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'code_prs_unmerged_over_120m');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'issues_over_24h_no_doer', 'Open issues older than 24 h with no doer', 'registry', 'gt', 0, 1,
  'Pillar autonomy (owner directive 2026-10-20: all open issues are cleared server-side automatically within 24 hours). Read them by verdict: SELECT plan_outcome, COUNT(*), MIN(id) FROM v_issue_age_ladder WHERE breach = 1 GROUP BY plan_outcome. Levers by verdict: (1) untrusted (a loop-filed family): the filing loop closes its own notice when its condition clears, or files it with a probe that does; build that in the filing worker, one family at a time, largest first (v_issue_family_throughput); (2) not-code naming a control-plane worker: a session change by PR; (3) not-code with no worker: the issue is a goal or a metric threshold, so it names its metric probe and stays open with that probe, or moves to goals with the successor id; (4) no plan: the planner has not reached it (code_plan_daily_cap, code_plan_wip). Never closed without close_evidence. Done when issues_over_24h_no_doer reads 0.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'ISSUE-AGE-24H-1 (migrations/2026-10-20-deploy-all-merges.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'issues_over_24h_no_doer');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('merge-not-deployed',
  'a merged change to a control-plane or container worker stays behind main with nothing to notice it',
  'DEPLOY-DRIFT-CF-1 (the Cloudflare-side second deploy runner) skipped control-plane and container workers outright, so when their canonical-deploy or container workflow run was cancelled, skipped or failed, no loop measured or redeployed them',
  'DEPLOY-ALL-MERGES-1 (qnfo-fleet-control 0.42.0): those workers are deploy-drift targets; past the 45-minute grace the tick dispatches canonical-deploy.yml workers=<name> or the container worker''s workflow, once per main VERSION an hour',
  'fm-merge-not-deployed: no deploy_drift_cf row behind main for more than 60 minutes, and no control-plane or container worker recorded as skipped',
  'fm-merge-not-deployed', '2026-10-20', 100298,
  'a canonical-deploy run for a control-plane worker is cancelled by a burst of merges, or a container workflow fails',
  '8 deploy_drift_cf rows read "skip" on 2026-10-20 05:30Z: qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard, qnfo-ai, qnfo-gateway, qnfo-observability, qnfo-code-orchestrator, qnfo-containers-pilot',
  'the control plane, the code loop and every merge to them'),
 ('issue-no-doer-24h',
  'an open issue passes 24 hours with nothing acting on it',
  'the planner records untrusted or not-code and does not look again for 7 days (PLAN_RECHECK_DAYS); a loop-filed notice with no self-closing probe waits for a session',
  'ISSUE-AGE-24H-1: v_issue_age_ladder names each such issue with its verdict; not-code and invalid verdicts older than 24 h are re-planned daily; issues_over_24h_no_doer files the levers per verdict',
  'fm-issue-no-doer-24h: v_issue_age_ladder has no row with breach = 1',
  'fm-issue-no-doer-24h', '2026-10-20', 100299,
  'an issue whose planner verdict is untrusted or not-code and whose filing loop does not close it',
  '118 of 141 open issues had no doer on 2026-10-20 05:30Z (74 untrusted, 44 not-code), 81 were older than 24 h',
  'every open issue; the owner directive of 2026-10-20');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to) VALUES
 ('fm-merge-not-deployed', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM deploy_drift_cf WHERE (state IN (''wait'', ''due'', ''dispatched'', ''deployed'') AND drift_since IS NOT NULL AND drift_since < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) OR state LIKE ''skip: control-plane%'') AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'DEPLOY-ALL-MERGES-1', 'failure-mode detector', 'qnfo-fleet-control'),
 ('fm-issue-no-doer-24h', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_issue_age_ladder WHERE breach = 1) AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'ISSUE-AGE-24H-1', 'failure-mode detector', 'qnfo-fleet-control');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01PzViV5mKHujgukcPrHsfAE',
  'deploying every merge needs a runner for every worker, and the control-plane and container workers already have one that canaries: their own workflow, dispatched; an issue is cleared within 24 h only when something acts on it, so the measure is issues older than 24 h with no doer',
  'DEPLOY-ALL-MERGES-1: deploy-drift-cf dispatches the owning workflow for control-plane and container workers behind main; MERGE-RELIABILITY-1: goal-level merge share and unmerged-PR metrics; ISSUE-AGE-24H-1: v_issue_age_ladder, issues_over_24h_no_doer, daily re-plan of not-code verdicts',
  'qnfo-audit 2026-10-20 05:30Z: 8 deploy_drift_cf rows skip (control plane, containers); 107 of 120 code goals merged in 7 days; 118 of 141 open issues without a doer (74 untrusted, 44 not-code), 81 older than 24 h',
  'migration merged; qnfo-fleet-control 0.42.0 deployed through the canonical path',
  'up to 2 workflow dispatches per 10-minute tick for workers already behind main; up to 12 planner re-arms a tick (the planner keeps its own daily cap); four metric triggers',
  'the Rollback header; ops_config deploy_drift_cf = off and issue_age_replan = off stop each without a deploy',
  'every merged worker reaches live through a runner, and every issue older than 24 h with no doer is named with its verdict and lever',
  'merges_undeployed_over_60m reads 0 within 120 minutes of apply; issues_over_24h_no_doer falls below 81 within 24 h',
  'none', 'deploy_drift_cf, code_tasks, issue_plans, work_claims, agent_issues (read-only counts); deploy-drift-cf.test.mjs; migrations/deploy-all-merges.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'DEPLOY-ALL-MERGES-1:%');

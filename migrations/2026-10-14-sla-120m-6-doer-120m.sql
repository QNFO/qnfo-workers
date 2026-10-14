-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_doer_120m
-- Rollback: DROP TRIGGER IF EXISTS autonomy_selfheal_tick; then run the sql column of bak_20261014_doer_120m (kind 'trigger', the AUTONOMY-SELFHEAL-SCORE-1 trigger as it was); UPDATE analytics_metric_triggers SET enabled = 1 WHERE metric_key = 'open_issues_without_doer_24h'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'open_issues_without_doer_120m'; DELETE FROM metric_registry WHERE metric = 'open_issues_without_doer_120m'
-- spof-review: no new single point of failure; the metric is computed by the existing fleet_tick heartbeat (two producers) like every other computed metric
--
-- SLA-120M-6 DOER-120M-1 (charter pillar autonomy). Owner directive 2026-10-14, verbatim: "All SLAs systemwide across the fleet shall be
-- measured in 10-minute intervals/resolution, never hours or days. No SLA shall ever exceed 120 minutes and action shall commence
-- immediately >120 minutes to audit and remediate all such failure modes and their root causes."
-- open_issues_without_doer_24h (AUTONOMY-SELFHEAL-SCORE-1) was the one issue SLA still measured in days and refreshed hourly (64 at
-- 2026-10-14 04:10Z). SLA-120M-2 moved issue age to issues_open_over_120m; SLA-120M-5 (PR 1254) caps trigger cooldowns. This file:
--   open_issues_without_doer_120m  open issues older than 120 minutes that nothing acts on (no code-task line, no unfinished code task,
--                                  no live work claim), refreshed on every fleet_tick insert (the 10-minute heartbeat), not hourly;
--   its trigger (gt 10, cooldown 2 h) carries the same four levers; the 24 h trigger is disabled and its metric kept for history;
--   autonomy_selfheal_score reads the 120-minute count; the trigger body is otherwise unchanged (backup holds the old one).
CREATE TABLE IF NOT EXISTS bak_20261014_doer_120m AS
  SELECT 'trigger' AS kind, name, sql FROM sqlite_master WHERE type = 'trigger' AND name = 'autonomy_selfheal_tick'
  UNION ALL SELECT 'metric_trigger', metric_key, CAST(enabled AS TEXT) FROM analytics_metric_triggers WHERE metric_key = 'open_issues_without_doer_24h';
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('open_issues_without_doer_120m', 'operational', 'target',
  'open agent_issues older than 120 minutes with no code-task: line, no code_tasks row for [issue #id] outside failed/closed/superseded/needs_human, and no live unreleased work_claims row on the issue',
  'qnfo-audit.agent_issues, code_tasks, work_claims (SLA-120M-6, replaces open_issues_without_doer_24h)', 'first refresh after apply',
  '0 (owner directive 2026-10-14: no SLA exceeds 120 minutes; an issue with no doer never closes on its own)', 'qnfo-fleet-control', 'trigger gt 10', '10m', '> 5', '> 30', NULL, NULL, 'MEASURED', 'computed');
DROP TRIGGER IF EXISTS autonomy_selfheal_tick;
CREATE TRIGGER autonomy_selfheal_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at <= (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000
        AND instr(COALESCE(a.description, ''), 'code-task:') = 0
        AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.goal LIKE '[issue #' || a.id || ']%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human'))
        AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id) AND w.released_at IS NULL
                          AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS TEXT)
  WHERE metric = 'open_issues_without_doer_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at <= (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
        AND instr(COALESCE(a.description, ''), 'code-task:') = 0
        AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.goal LIKE '[issue #' || a.id || ']%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human'))
        AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id) AND w.released_at IS NULL
                          AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS TEXT)
  WHERE metric = 'open_issues_without_doer_120m';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(DISTINCT a.id) FROM agent_issues a JOIN remediation_contracts c ON c.issue_id = a.id AND c.status IN ('active', 'holding')
      WHERE a.status = 'open' AND (COALESCE(c.last_verdict, '') IN ('vacuous-probe-result', 'probe-not-machine-executable', 'probe-error', 'probe-same-account-host')
            OR instr(c.verify_probe, 'THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ') > 0)) AS TEXT)
  WHERE metric = 'contracts_unexecutable_open';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(CAST(ROUND((julianday('now') - julianday(MAX(verified_at))) * 1440) AS INTEGER), 9999) FROM remediation_verifications
      WHERE verifier LIKE 'qnfo-fleet-control/remediation-tick%') AS TEXT)
  WHERE metric = 'remediation_tick_age_min';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(CASE WHEN COALESCE(a.close_channel, '') NOT LIKE 'session%' AND COALESCE(a.close_channel, '') NOT LIKE 'claude%'
                                   AND COALESCE(a.close_channel, '') NOT LIKE 'issue-triage%'
                                   AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id
                                                   AND (COALESCE(t.owner, '') LIKE 'session%' OR COALESCE(t.owner, '') LIKE 'claude%'))
                              THEN 1 ELSE 0 END) / MAX(1, COUNT(*)), 3)
      FROM agent_issues a WHERE a.status IN ('closed', 'resolved') AND a.updated_at > (CAST(strftime('%s', 'now') AS INTEGER) - 604800) * 1000) AS TEXT)
  WHERE metric = 'server_side_close_share_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST(ROUND(100.0 * (
        MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'autonomy_rate_7d'), 0)))
      + MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'server_side_close_share_7d'), 0)))
      + MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'issue_auto_close_2h_share_24h'), 0)))
      + MIN(1.0, MAX(0.0, COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'issue_drain_ratio_24h'), 0) / 1.5))
      + MIN(1.0, MAX(0.0, (120.0 - COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'remediation_tick_age_min'), 120)) / 100.0))
      + MAX(0.0, 1.0 - COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'contracts_unexecutable_open'), 10) / 10.0)
      + MAX(0.0, 1.0 - COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = 'open_issues_without_doer_120m'), 0)
                       / MAX(1.0, (SELECT COUNT(*) FROM agent_issues WHERE status = 'open')))
    ) / 7.0, 1) AS TEXT)
  WHERE metric = 'autonomy_selfheal_score';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'open_issues_without_doer_120m', 'Self-heal gap: open issues older than 120 minutes that nothing acts on', 'registry', 'gt', 10, 2,
  'Pillar autonomy (owner directive 2026-10-13: open issues 0). Read them: SELECT a.id, a.priority, a.source, substr(a.title, 1, 80) FROM agent_issues a WHERE a.status = ''open'' AND a.created_at <= (CAST(strftime(''%s'', ''now'') AS INTEGER) - 7200) * 1000 AND instr(COALESCE(a.description, ''''), ''code-task:'') = 0 ORDER BY a.created_at. Levers in order: (1) a METRIC-TRIGGER issue: write its fix into analytics_metric_triggers.action with the code-task: and code-anchor: lines (ACT-BRIDGE-1) so the next breach carries a doer, and add the same lines to the open issue; (2) a defect in one file: add code-task: repo=qnfo-workers path=<file> and code-anchor: to the issue; (3) a control-plane file the code loop does not plan: name the session or loop that holds it and take the work claim; (4) a roadmap item or report: move it to goals or objective_space and supersede the issue with the successor id (never wontfix, INTEGRITY-GUARDS-1). Done: open_issues_without_doer_120m <= 10 at two refreshes (10-minute resolution, SLA-120M-6).',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'SLA-120M-6 (migrations/2026-10-14-sla-120m-6-doer-120m.sql), replaces the 24 h trigger'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'open_issues_without_doer_120m');
UPDATE analytics_metric_triggers SET enabled = 0, notes = COALESCE(notes, '') || ' [superseded by open_issues_without_doer_120m, SLA-120M-6]'
WHERE metric_key = 'open_issues_without_doer_24h' AND enabled = 1;
UPDATE metric_registry SET target = target || ' [superseded by open_issues_without_doer_120m, SLA-120M-6]', refresh_cadence = '10m'
WHERE metric = 'open_issues_without_doer_24h' AND instr(COALESCE(target, ''), 'SLA-120M-6') = 0;
UPDATE metric_registry SET formula = replace(formula, 'open_issues_without_doer_24h', 'open_issues_without_doer_120m'), refresh_cadence = '10m'
WHERE metric = 'autonomy_selfheal_score' AND instr(formula, 'open_issues_without_doer_24h') > 0;
INSERT INTO fleet_tick (source) VALUES ('migration:sla-120m-6');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01AEEBcczeW1o2nKSUBtXnUL', 'an issue with no doer is an SLA breach once it is older than 120 minutes, and the count must refresh at the 10-minute heartbeat, not hourly',
  'SLA-120M-6: open_issues_without_doer_120m (10-minute refresh, trigger gt 10, cooldown 2 h) replaces open_issues_without_doer_24h in its trigger and in autonomy_selfheal_score',
  'metric_registry 2026-10-14 04:10Z: open_issues_without_doer_24h 64, refreshed hourly; issues_open_over_120m 105 at 04:31Z',
  'merged through the canonical path (migration runner)', 'one fleet_tick trigger recreated (writes metric_registry only), one metric and one trigger row', 'the Rollback header',
  'the doer gap is measured at 120 minutes and 10-minute resolution', 'open_issues_without_doer_120m is refreshed within 10 minutes of every fleet_tick and its trigger files once while it reads above 10',
  'none', 'd1:metric_registry, analytics_metric_triggers, sqlite_master(autonomy_selfheal_tick); migrations: sla-120m-2, sla-120m-5 (PR 1254)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-120M-6:') = 1);

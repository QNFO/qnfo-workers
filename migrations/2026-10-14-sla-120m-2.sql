-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_sla_120m_2
-- Rollback: recreate trigger antifragile_tick_10m from bak_20261014_sla_120m_2 (kind 'trigger'); restore content_stages.sla_min and analytics_metric_triggers.threshold/enabled from the same table (kinds 'content_stage', 'metric_trigger'); DELETE FROM analytics_metric_triggers WHERE metric_key = 'issues_open_over_120m'; DELETE FROM metric_registry WHERE metric = 'issues_open_over_120m'
--
-- SLA-120M-2 (charter pillar autonomy). Owner directive 2026-10-14, verbatim: "All SLAs systemwide across the fleet shall be
-- measured in 10-minute intervals/resolution, never hours or days. No SLA shall ever exceed 120 minutes and action shall commence
-- immediately >120 minutes to audit and remediate all such failure modes and their root causes."
-- SLA-120M-1 (migrations/2026-10-14-sla-120m.sql, qnfo-fleet-control 0.30.0) capped queue_sla, the stuck views and sla_registry.
-- This file covers the SLAs it did not reach (read 2026-10-14 04:10Z):
--   issue age      antifragile_tick_10m measured issues_open_over_24h (age_h >= 24, 80 of 113 open) and escalated an issue's
--                  priority once per 24 h. Now: issues_open_over_120m counts open issues older than 120 minutes from age_min
--                  (104 of 113 now), refreshed every 10 minutes, with its trigger; the escalation runs at 120 minutes and repeats
--                  every 120 minutes (to high, never critical, as before). issues_open_over_24h is still written for history; its
--                  trigger is disabled, superseded by the 120-minute one (two triggers on one signal would file it twice).
--   content stages content_stages.sla_min reached 1440 (triage, queued, distribute, correct), 720 (revise) and 360 (research,
--                  draft, review). Every non-terminal stage is capped at 120 minutes; content_items_over_stage_sla reads them.
--   repair time    the triggers on mttr_h_7d (gt 24) and issue_mttr_h_30d (gt 48) fire at 2 hours (= 120 minutes; the metrics
--                  keep their hour unit, so their history stays comparable).
-- Unchanged on purpose: freshness checks of daily loops (continuity_snapshot_age_h <= 26, cf_changelog_audit_age_h; a daily run
-- cannot be fresher than its cadence, and 24 h + 2 h detects a missed run within 120 minutes of its due time); rate windows
-- (issue_drain_ratio_24h, 7- and 30-day rates), which are not SLAs; human_wait_oldest_days, the owner's own response time on
-- identity-bound cards (non-identity-bound cards are already rerouted to the fleet by v_human_action_gate).
-- spof-review: no new trigger, cron or credential; antifragile_tick_10m is replaced in place and keeps its two fleet_tick producers.

CREATE TABLE IF NOT EXISTS bak_20261014_sla_120m_2 AS
  SELECT 'trigger' AS kind, name AS k, NULL AS a, NULL AS b, sql AS text FROM sqlite_master WHERE type = 'trigger' AND name = 'antifragile_tick_10m'
  UNION ALL SELECT 'content_stage', stage, sla_min, NULL, NULL FROM content_stages
  UNION ALL SELECT 'metric_trigger', metric_key, threshold, enabled, NULL FROM analytics_metric_triggers WHERE metric_key IN ('issues_open_over_24h', 'mttr_h_7d', 'issue_mttr_h_30d');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('issues_open_over_120m', 'operational', 'target',
  'open agent_issues older than 120 minutes (v_issue_age.age_min >= 120), refreshed every 10 minutes by antifragile_tick_10m',
  'qnfo-audit.agent_issues via v_issue_age (SLA-120M-2)', '104 of 113 open on 2026-10-14 04:10Z',
  '0 (owner directive 2026-10-14: no SLA exceeds 120 minutes, measured at 10-minute resolution)', 'qnfo-fleet-control', 'trigger gt 0', '*/10', '> 0', '> 20', NULL, NULL, 'MEASURED', 'computed');

DROP TRIGGER IF EXISTS antifragile_tick_10m;
CREATE TRIGGER antifragile_tick_10m AFTER INSERT ON fleet_tick
BEGIN
  INSERT INTO issue_age_bumps (issue_id, from_priority, to_priority, age_h)
    SELECT id, priority, CASE lower(priority) WHEN 'low' THEN 'medium' ELSE 'high' END, age_h FROM v_issue_age
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND age_min >= 120 AND lower(COALESCE(priority, 'medium')) IN ('low', 'medium', 'p3', 'p4', 'p5', 'trivial')
      AND (last_bump IS NULL OR last_bump < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes'));
  UPDATE agent_issues SET priority = (SELECT b.to_priority FROM issue_age_bumps b WHERE b.issue_id = agent_issues.id ORDER BY b.id DESC LIMIT 1),
      updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE status = 'open' AND id IN (SELECT issue_id FROM issue_age_bumps WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 minutes'));
  UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_blocker_claims) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'unverified_blocker_claims';
  UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_issue_age WHERE age_h >= 24) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'issues_open_over_24h';
  UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_issue_age WHERE age_min >= 120) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'issues_open_over_120m';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'issues_open_over_120m', 'SLA breach: open issues older than 120 minutes', 'registry', 'gt', 0, 1,
  'Pillar autonomy (owner directive 2026-10-14: no SLA exceeds 120 minutes; action starts at the first 10-minute tick past it). Read them oldest first: SELECT id, priority, age_min, substr(title, 1, 80) FROM v_issue_age WHERE age_min >= 120 ORDER BY age_min DESC. For each, in order: (1) a defect in one file: add code-task: and code-anchor: lines (ACT-BRIDGE-1) so the code loop opens the PR, which the lane merges about 20 minutes after it is green (PR-LANE-FAST-1); (2) a closing probe that cannot decide: rewrite the issue-<id> remediation contract to a probe on the definition of done; (3) a root cause shared by several issues: fix it once and supersede the duplicates with the successor id; (4) a roadmap item or report: move it to goals or objective_space and supersede (never wontfix, INTEGRITY-GUARDS-1). Record each root cause as a failure_modes row with an fm- detector. Done: issues_open_over_120m = 0 at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'SLA-120M-2 (migrations/2026-10-14-sla-120m-2.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'issues_open_over_120m');

UPDATE analytics_metric_triggers SET enabled = 0, notes = COALESCE(notes, '') || ' | SLA-120M-2 2026-10-14: superseded by issues_open_over_120m (no SLA exceeds 120 minutes)'
WHERE metric_key = 'issues_open_over_24h' AND enabled = 1;
UPDATE analytics_metric_triggers SET threshold = 2, notes = COALESCE(notes, '') || ' | SLA-120M-2 2026-10-14: threshold 2 h = 120 minutes (was ' || threshold || ' h)'
WHERE metric_key IN ('mttr_h_7d', 'issue_mttr_h_30d') AND threshold > 2;
UPDATE metric_registry SET target = '<= 2 h = 120 minutes (SLA-120M-2, owner directive 2026-10-14; was: ' || target || ')' WHERE metric IN ('mttr_h_7d', 'issue_mttr_h_30d') AND instr(COALESCE(target, ''), 'SLA-120M-2') = 0;
UPDATE metric_registry SET target = target || ' [superseded by issues_open_over_120m, SLA-120M-2]' WHERE metric = 'issues_open_over_24h' AND instr(COALESCE(target, ''), 'SLA-120M-2') = 0;

UPDATE content_stages SET definition = definition || ' [SLA-120M-2 2026-10-14: SLA ' || sla_min || ' -> 120 min]', sla_min = 120
WHERE sla_min > 120 AND COALESCE(terminal, 0) = 0;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius) VALUES
 ('sla-over-120m-outside-queue-sla', 'an SLA longer than 120 minutes lives outside queue_sla and sla_registry',
  'SLA-120M-1 capped queue_sla, the stuck views and sla_registry; the issue-age metric and escalation (24 h), content_stages (up to 1440 min) and the repair-time triggers (24 h, 48 h) carried their own thresholds',
  'SLA-120M-2: issue age at 120 minutes on the 10-minute tick, content stages capped, repair-time triggers at 2 h',
  'fm-sla-over-120m-outside-queue-sla: no non-terminal content stage and no enabled age or repair-time trigger above 120 minutes', 'fm-sla-over-120m-outside-queue-sla', '2026-10-14',
  'content_stages.sla_min 1440, a 24 h issue SLA, mttr triggers at 24 h and 48 h', 'an item can wait a day before any loop acts, against the owner directive');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status) VALUES
 ('fm-sla-over-120m-outside-queue-sla', NULL, 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM content_stages WHERE COALESCE(terminal, 0) = 0 AND sla_min > 120) + (SELECT COUNT(*) FROM analytics_metric_triggers WHERE enabled = 1 AND ((metric_key IN (''mttr_h_7d'', ''issue_mttr_h_30d'') AND threshold > 2) OR metric_key = ''issues_open_over_24h'')) + (SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND name = ''antifragile_tick_10m'' AND instr(sql, ''age_min >= 120'') = 0) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01AEEBcczeW1o2nKSUBtXnUL', 'an SLA is any time an item may wait before a loop acts; every one, wherever it lives, is at most 120 minutes at 10-minute resolution',
  'SLA-120M-2: issue age 24 h -> 120 min (metric, trigger, escalation); content_stages capped at 120 min; mttr triggers 24 h / 48 h -> 2 h',
  '2026-10-14 04:10Z: 104 of 113 open issues older than 120 minutes (80 older than 24 h); content stages at 360-1440 min; mttr_h_7d 343.8 h',
  'migration merged', 'priority escalation of open issues every 120 minutes (to high, never critical); one more metric trigger; content items read over SLA sooner',
  'the Rollback header; ops_config queue_sla_autofix = off stops the escalation without a deploy',
  'every item that waits past 120 minutes is measured within 10 minutes and has an action filed',
  'issues_open_over_120m <= 104 within 24 h', 'none', 'agent_issues, v_issue_age, content_stages, analytics_metric_triggers'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'SLA-120M-2:%');

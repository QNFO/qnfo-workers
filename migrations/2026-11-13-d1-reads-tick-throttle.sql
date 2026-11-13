-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261113_fleet_tick_triggers
-- Rollback: SELECT name, sql FROM bak_20261113_fleet_tick_triggers; -- drop each trigger below and re-run its saved `sql` row
-- spof-review: no new component. Fifteen existing metric-refresh triggers on the fleet_tick heartbeat move from every insert to the first
-- 10 minutes of each hour (the gate the 30 sibling triggers already carry). Measurement only: a metric is at most 60 minutes old, inside the 120-minute SLA.
--
-- D1-READS-COST-1 (owner, 2026-11-13, charter pillar cost): "it's now charging me for billions and billions of D1 rows." Measured with d1AnalyticsAdaptiveGroups over 7 days:
-- qnfo-audit read 9.46e9 rows, living-paper 1.78e9, qnfo-graph 0.38e9. An `INSERT INTO fleet_tick` read 119k to 861k rows each, because each insert fires ~67
-- AFTER INSERT triggers and 18 of them were ungated metric refreshes over heavy views. This file gates 15 (doctrine_tick_10m, audit_freshness_tick_10m and
-- cadence_overdue_tick_10m stay on the 10-minute cadence). Originals are in bak_20261113_fleet_tick_triggers (already created live on 2026-11-13).
-- Idempotent: DROP IF EXISTS then CREATE. Verified live 2026-11-13: 15 triggers carry the gate, 67 triggers remain on fleet_tick.
CREATE TABLE IF NOT EXISTS bak_20261113_fleet_tick_triggers AS SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'fleet_tick';

DROP TRIGGER IF EXISTS failure_modes_tick;
CREATE TRIGGER failure_modes_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_failure_mode_status WHERE status IN ('recurring', 'unprobed')) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'failure_modes_recurring';
END;

DROP TRIGGER IF EXISTS scorecard_v2_tick;
CREATE TRIGGER scorecard_v2_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT silent_drops FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'silent_drops';
  UPDATE metric_registry SET last_value = CAST((SELECT issues_unaccounted FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'issues_unaccounted';
  UPDATE metric_registry SET last_value = CAST((SELECT spofs_total FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'spofs_total';
  UPDATE metric_registry SET last_value = CAST((SELECT capabilities_acquired_7d FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'capabilities_acquired_7d';
  UPDATE metric_registry SET last_value = CAST((SELECT failure_modes_unprobed_pct FROM v_doctrine_scorecard_v2) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'failure_modes_unprobed_pct';
END;

DROP TRIGGER IF EXISTS issue_drain_ratio_tick;
CREATE TRIGGER issue_drain_ratio_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(event = 'dispositioned') / MAX(1, SUM(event IN ('opened', 'reopened'))), 3)
      FROM issue_lifecycle WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS TEXT)
  WHERE metric = 'issue_drain_ratio_24h';
END;

DROP TRIGGER IF EXISTS issue_auto_close_2h_tick;
CREATE TRIGGER issue_auto_close_2h_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(CASE WHEN EXISTS (
                 SELECT 1 FROM issue_lifecycle d JOIN agent_issues a ON a.id = d.issue_id
                 WHERE d.issue_id = o.issue_id AND d.event = 'dispositioned' AND d.ts >= o.ts
                   AND d.ts <= strftime('%Y-%m-%dT%H:%M:%SZ', o.ts, '+2 hours')
                   AND COALESCE(a.close_channel, '') NOT LIKE 'session%' AND COALESCE(a.close_channel, '') NOT LIKE 'claude%'
                   AND COALESCE(a.close_channel, '') NOT LIKE 'issue-triage%'
                   AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = d.issue_id
                                   AND (COALESCE(t.owner, '') LIKE 'session%' OR COALESCE(t.owner, '') LIKE 'claude%'))) THEN 1 ELSE 0 END) / MAX(1, COUNT(*)), 3)
      FROM issue_lifecycle o
      WHERE o.event IN ('opened', 'reopened')
        AND o.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-26 hours') AND o.ts <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours')) AS TEXT)
  WHERE metric = 'issue_auto_close_2h_share_24h';
END;

DROP TRIGGER IF EXISTS content_items_over_stage_sla_tick;
CREATE TRIGGER content_items_over_stage_sla_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COALESCE(SUM(over_sla), 0) FROM v_content_pipeline) AS TEXT)
  WHERE metric = 'content_items_over_stage_sla';
END;

DROP TRIGGER IF EXISTS journey_tick_age_refresh;
CREATE TRIGGER journey_tick_age_refresh AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET
    last_value = CAST(COALESCE((SELECT CAST((julianday('now') - julianday(MAX(ts))) * 1440 AS INTEGER) FROM journey_runs WHERE runner = 'cf'), 9999) AS TEXT),
    last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'journey_tick_age_min' AND EXISTS (SELECT 1 FROM journey_runs WHERE runner = 'cf');
END;

DROP TRIGGER IF EXISTS outreach_impact_tick;
CREATE TRIGGER outreach_impact_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(SUM(posts_7d), 0) FROM v_channel_impact_7d WHERE channel <> 'email') AS TEXT)
  WHERE metric = 'social_posts_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST(CAST((
      SELECT COALESCE(SUM(value), 0) FROM reach_signals WHERE source = 'utm' AND metric = 'clicks_human' AND date >= date('now', '-7 days') AND channel IN ('bluesky', 'mastodon', 'x', 'linkedin', 'substack', 'threads', 'email')) AS INTEGER) AS TEXT)
  WHERE metric = 'outreach_human_clicks_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM (SELECT 'bluesky' AS ch UNION SELECT CASE WHEN service = 'twitter' THEN 'x' WHEN lower(service) LIKE '%substack%' THEN 'substack' ELSE service END FROM social_channels WHERE connected = 1) a
      WHERE NOT EXISTS (SELECT 1 FROM v_channel_impact_7d v WHERE v.channel = a.ch AND v.posts_7d > 0)) AS TEXT)
  WHERE metric = 'social_channels_silent_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * COALESCE((SELECT SUM(value) FROM reach_signals WHERE source = 'utm' AND metric = 'clicks_human' AND date >= date('now', '-7 days') AND channel IN ('bluesky', 'mastodon', 'x', 'linkedin', 'substack', 'threads', 'email')), 0)
        / MAX(1, (SELECT COALESCE(SUM(posts_7d), 0) FROM v_channel_impact_7d)), 2)) AS TEXT)
  WHERE metric = 'outreach_clicks_per_post_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM outreach_log WHERE status IN ('sent', 'followup') AND sent_at >= datetime('now', '-7 days')) AS TEXT)
  WHERE metric = 'outreach_emails_sent_7d';
END;

DROP TRIGGER IF EXISTS publish_freshness_tick;
CREATE TRIGGER publish_freshness_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST(ROUND((julianday('now') - julianday((SELECT MAX(published_at) FROM research_queue WHERE published_at IS NOT NULL))) * 24, 1) AS TEXT)
  WHERE metric = 'papers_hours_since_last_publish';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST(ROUND((julianday('now') - julianday((SELECT MAX(created_at) FROM idea_proposals))) * 24, 1) AS TEXT)
  WHERE metric = 'ideas_hours_since_last_proposal';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST(ROUND((julianday('now') - julianday((SELECT MAX(published_at) FROM social_media_posts WHERE status = 'published'))) * 24, 1) AS TEXT)
  WHERE metric = 'social_hours_since_last_post';
END;

DROP TRIGGER IF EXISTS sla_definitions_120_tick;
CREATE TRIGGER sla_definitions_120_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM queue_sla WHERE sla_min > 120 OR sla_min % 10 <> 0 OR COALESCE(producer_cycle_min, cycle_min) > sla_min)
      + (SELECT COUNT(*) FROM content_stages WHERE sla_min IS NOT NULL AND (sla_min > 120 OR sla_min % 10 <> 0))
      + (SELECT COUNT(*) FROM sla_registry WHERE NOT (window GLOB '[0-9]*m' AND CAST(window AS INTEGER) BETWEEN 10 AND 120 AND CAST(window AS INTEGER) % 10 = 0))
      + (SELECT COUNT(*) FROM analytics_metric_triggers WHERE enabled = 1 AND (cooldown_hours > 2 OR cooldown_hours IS NULL))
      + (SELECT COUNT(*) FROM remediation_contracts WHERE status = 'active' AND expected_cadence_h > 2)
      + (SELECT COUNT(*) FROM cadence_sla WHERE sla_min > 120 OR sla_min % 10 <> 0)
      + (SELECT COUNT(*) FROM analytics_metric_triggers WHERE enabled = 1 AND metric_key IN ('papers_hours_since_last_publish',
          'ideas_hours_since_last_proposal', 'social_hours_since_last_post', 'cf_changelog_audit_age_h', 'continuity_snapshot_age_h')) AS TEXT)
  WHERE metric = 'sla_definitions_over_120m';
END;

DROP TRIGGER IF EXISTS paper_rollup_tick;
CREATE TRIGGER paper_rollup_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM dissemination_tracker WHERE action = 'queued' AND updated_at < datetime('now', '-120 minutes')) AS TEXT)
  WHERE metric = 'papers_queued_over_120m';
END;

DROP TRIGGER IF EXISTS ai_model_error_rate_tick;
CREATE TRIGGER ai_model_error_rate_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST(COALESCE((
      SELECT MAX(r) FROM (
        SELECT ROUND(1.0 * SUM(errors) / SUM(calls), 3) AS r
        FROM ai_call_counters
        WHERE day >= date('now', '-1 day')
        GROUP BY model
        HAVING SUM(calls) >= 20)), 0) AS TEXT)
  WHERE metric = 'ai_model_error_rate_max_1d';
END;

DROP TRIGGER IF EXISTS model_ab_judged_runs_tick;
CREATE TRIGGER model_ab_judged_runs_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST(
      (SELECT COUNT(*) FROM model_ab_runs WHERE verdict IN ('pass', 'regression') AND created_at >= datetime('now', '-7 days')) AS TEXT)
  WHERE metric = 'model_ab_judged_runs_7d';
END;

DROP TRIGGER IF EXISTS doctrine_headline_tick;
CREATE TRIGGER doctrine_headline_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT tick_completion_24h FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'tick_completion_24h';
  UPDATE metric_registry SET last_value = CAST((SELECT initiation_rate_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'initiation_rate_7d';
  UPDATE metric_registry SET last_value = CAST((SELECT owner_dispatch_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'owner_dispatch_7d';
END;

DROP TRIGGER IF EXISTS autonomy_selfheal_tick;
CREATE TRIGGER autonomy_selfheal_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND +a.created_at <= (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000
        AND instr(COALESCE(a.description, ''), 'code-task:') = 0
        AND CAST(a.id AS TEXT) NOT IN (SELECT substr(k.goal, 9, instr(k.goal, ']') - 9) FROM code_tasks k WHERE k.goal LIKE '[issue #%]%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human'))
        AND a.id NOT IN (SELECT w.issue_id FROM work_claims w WHERE w.issue_id IS NOT NULL AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        AND 'issue:' || a.id NOT IN (SELECT w.path FROM work_claims w WHERE w.path IS NOT NULL AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS TEXT)
  WHERE metric = 'open_issues_without_doer_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND +a.created_at <= (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
        AND instr(COALESCE(a.description, ''), 'code-task:') = 0
        AND CAST(a.id AS TEXT) NOT IN (SELECT substr(k.goal, 9, instr(k.goal, ']') - 9) FROM code_tasks k WHERE k.goal LIKE '[issue #%]%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human'))
        AND a.id NOT IN (SELECT w.issue_id FROM work_claims w WHERE w.issue_id IS NOT NULL AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
        AND 'issue:' || a.id NOT IN (SELECT w.path FROM work_claims w WHERE w.path IS NOT NULL AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS TEXT)
  WHERE metric = 'open_issues_without_doer_120m';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(DISTINCT a.id) FROM agent_issues a JOIN remediation_contracts c ON c.issue_id = a.id AND c.status IN ('active', 'holding')
      WHERE a.status = 'open' AND (COALESCE(c.last_verdict, '') IN ('vacuous-probe-result', 'probe-not-machine-executable', 'probe-error', 'probe-same-account-host')
            OR instr(c.verify_probe, 'THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ') > 0)) AS TEXT)
  WHERE metric = 'contracts_unexecutable_open';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(CAST(ROUND((julianday('now') - julianday((SELECT verified_at FROM remediation_verifications INDEXED BY idx_remediation_verifications_ts
      WHERE verifier LIKE 'qnfo-fleet-control/remediation-tick%' ORDER BY verified_at DESC LIMIT 1))) * 1440) AS INTEGER), 9999)) AS TEXT)
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

DROP TRIGGER IF EXISTS ai_waste_governor_tick_2;
CREATE TRIGGER ai_waste_governor_tick_2
AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT error_waste_usd_7d FROM v_ai_waste_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE metric = 'ai_error_waste_usd_7d' AND COALESCE(last_refreshed, '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes');
  UPDATE metric_registry SET last_value = CAST((SELECT unmetered_purposes_7d FROM v_ai_waste_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE metric = 'ai_unmetered_purposes_7d' AND COALESCE(last_refreshed, '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes');
  UPDATE metric_registry SET last_value = CAST((SELECT research_rows_over_4_cycles FROM v_ai_waste_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE metric = 'research_rows_over_4_cycles' AND COALESCE(last_refreshed, '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes');
  UPDATE metric_registry SET last_value = CAST((SELECT published_per_day_7d FROM v_ai_waste_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
    WHERE metric = 'research_published_per_day_7d' AND COALESCE(last_refreshed, '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes');
END;

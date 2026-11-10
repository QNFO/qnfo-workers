-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS tick_driver_roster_metrics_tick; DROP TRIGGER IF EXISTS tick_driver_roster_tick; DROP TRIGGER IF EXISTS output_quality_heavy_metrics2_tick; DROP TRIGGER IF EXISTS output_quality_heavy_metrics_tick; DROP TRIGGER IF EXISTS output_quality_heavy_tick; then re-create all four from bak_20261110_fleet_tick_depth_triggers (INSERT of its sql column via the runner), or from migrations that first defined them.
-- BACKUP: bak_20261110_fleet_tick_depth_triggers
-- CAUSE-MAPPED: registers no metric; it only splits two existing triggers so every fleet_tick / fleet_tick_heavy INSERT compiles again (D1 7500 'VIEWs and/or subqueries nested too deep').
-- FLEET-TICK-DEPTH-1: the compile depth of one trigger program grows with its statement count; tick_driver_roster_tick (15 statements) and
-- output_quality_heavy_tick (7 statements, two of them read v_output_quality_headline) each compile alone only below the limit, so a plain INSERT into fleet_tick / fleet_tick_heavy failed.
-- The statements are unchanged and keep their order; each trigger is split (the heavy one in three, so the two view reads sit in separate programs), so the tick still writes the same rows.

CREATE TABLE IF NOT EXISTS bak_20261110_fleet_tick_depth_triggers AS
  SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN ('tick_driver_roster_tick', 'output_quality_heavy_tick');

DROP TRIGGER IF EXISTS tick_driver_roster_tick;
DROP TRIGGER IF EXISTS tick_driver_roster_metrics_tick;
CREATE TRIGGER tick_driver_roster_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%'
BEGIN
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'reconcile', n > 0, n || ' fleet_tick rows in 65 min (reconcile_tick runs on each)'
    FROM (SELECT COUNT(*) AS n FROM fleet_tick WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes'));
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'pull', a + b > 0, a || ' code-task.intake events, ' || b || ' queue_pulls rows in 65 min'
    FROM (SELECT (SELECT COUNT(*) FROM cloud_ops_events WHERE job = 'qnfo-code-orchestrator' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes') AND kind LIKE 'code-task.intake%') AS a,
                 (SELECT COUNT(*) FROM queue_pulls WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b);
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'dispatch', a + b + c > 0, a || ' executor done events, ' || b || ' job runs, ' || c || ' code tasks touched in 65 min'
    FROM (SELECT (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'done' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS a,
                 (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'job-run' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b,
                 (SELECT COUNT(*) FROM code_tasks WHERE updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS c);
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'verify', n > 0, n || ' remediation_verifications rows in 65 min'
    FROM (SELECT COUNT(*) AS n FROM remediation_verifications WHERE verified_at > datetime('now', '-65 minutes'));
  INSERT OR IGNORE INTO tick_runs (tick_id, step, ok, evidence)
    VALUES (strftime('%Y-%m-%dT%H', 'now'), 'compare', 0, 'no calibration scorer row for this slot (CALIBRATION-SCORER-1 writes it)');
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'log', a + b > 0, a || ' decision_log rows, ' || b || ' issue_lifecycle rows in 65 min'
    FROM (SELECT (SELECT COUNT(*) FROM decision_log WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS a,
                 (SELECT COUNT(*) FROM issue_lifecycle WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b);
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'report', a + b > 0, a || ' fleet-observability-digest, ' || b || ' changelog-tick events in 65 min'
    FROM (SELECT (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'fleet-observability-digest' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS a,
                 (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'changelog-tick' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b);
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'probe', n > 0, n || ' fm- detector verdicts in 65 min'
    FROM (SELECT COUNT(*) AS n FROM remediation_verifications WHERE verified_at > datetime('now', '-65 minutes') AND class >= 'fm-' AND class < 'fm.');
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'refresh', n > 0, n || ' metric_registry rows refreshed in 65 min'
    FROM (SELECT COUNT(*) AS n FROM metric_registry WHERE replace(substr(COALESCE(last_refreshed, ''), 1, 19), 'T', ' ') > datetime('now', '-65 minutes'));
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    SELECT strftime('%Y-%m-%dT%H', 'now'), 'advance', a + b + c + d > 0, a || ' code tasks merged, ' || b || ' ok deploys, ' || c || ' goals changed, ' || d || ' evolve ticks in 65 min'
    FROM (SELECT (SELECT COUNT(*) FROM code_tasks WHERE merged_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS a,
                 (SELECT COUNT(*) FROM fleet_deploys WHERE ok = 1 AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS b,
                 (SELECT COUNT(*) FROM goals WHERE replace(substr(COALESCE(updated_at, ''), 1, 19), 'T', ' ') > datetime('now', '-65 minutes')) AS c,
                 (SELECT COUNT(*) FROM cloud_ops_events WHERE kind = 'evolve-tick' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-65 minutes')) AS d);
  INSERT OR REPLACE INTO tick_runs (tick_id, step, ok, evidence)
    VALUES (strftime('%Y-%m-%dT%H', 'now'), 'emit', 1, 'tick_runs written from fleet_tick ' || NEW.id || ' (' || NEW.source || ')');
END;
CREATE TRIGGER tick_driver_roster_metrics_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10' OR NEW.source LIKE 'migration:%'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * (SELECT COUNT(*) FROM (SELECT tick_id FROM tick_runs WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
                                              GROUP BY tick_id HAVING COUNT(*) = 11 AND SUM(ok) = 11))
             / MIN(24, MAX(1, CAST((julianday('now') - julianday((SELECT MIN(ts) FROM tick_runs))) * 24 AS INTEGER) + 1)), 3)) AS TEXT)
  WHERE metric = 'tick_sequence_completion_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * (SELECT COUNT(DISTINCT issue_id) FROM queue_pulls WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'))
             / MAX(1, (SELECT COUNT(*) FROM agent_issues WHERE status = 'open'
                         OR id IN (SELECT issue_id FROM queue_pulls WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')))), 3)) AS TEXT)
  WHERE metric = 'driver_drain_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(DISTINCT executor) FROM v_executor_roster WHERE healthy = 0) AS TEXT)
  WHERE metric = 'roster_members_degraded';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM (SELECT capability FROM v_executor_roster WHERE kind IN ('worker', 'model') AND capability NOT LIKE 'worker:%'
                                              GROUP BY capability HAVING SUM(healthy = 1) = 1)) AS TEXT)
  WHERE metric = 'roster_capabilities_single_executor';
END;

DROP TRIGGER IF EXISTS output_quality_heavy_tick;
DROP TRIGGER IF EXISTS output_quality_heavy_metrics_tick;
DROP TRIGGER IF EXISTS output_quality_heavy_metrics2_tick;
CREATE TRIGGER output_quality_heavy_tick AFTER INSERT ON fleet_tick_heavy
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(100.0 * (SELECT COUNT(DISTINCT target_ref) FROM internal_errata WHERE target_kind = 'paper' AND severity = 'high' AND status = 'open')
        / MAX(1, (SELECT COUNT(*) FROM quality_scores WHERE ts = (SELECT MAX(ts) FROM quality_scores WHERE ts < date('now')))), 1)) AS TEXT)
    WHERE metric = 'papers_with_open_high_errata_pct' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'));
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT (SELECT COUNT(*) FROM internal_errata WHERE target_kind = 'paper' AND severity = 'high' AND datetime(detected_at) >= datetime('now', '-7 days'))
           - (SELECT COUNT(*) FROM internal_errata WHERE target_kind = 'paper' AND severity = 'high' AND status IN ('resolved', 'closed', 'rejected') AND datetime(updated_at) >= datetime('now', '-7 days'))) AS TEXT)
    WHERE metric = 'errata_high_net_inflow_7d' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'));
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(AVG(b.score - a.score), 2) FROM quality_scores a JOIN quality_scores b ON b.slug = a.slug
        AND b.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts < date('now'))
        AND a.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts <= date((SELECT MAX(ts) FROM quality_scores WHERE ts < date('now')), '-7 days'))) AS TEXT)
    WHERE metric = 'paper_same_paper_score_delta_7d' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'))
      AND EXISTS (SELECT 1 FROM quality_scores a JOIN quality_scores b ON b.slug = a.slug
        AND b.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts < date('now'))
        AND a.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts <= date((SELECT MAX(ts) FROM quality_scores WHERE ts < date('now')), '-7 days')));
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(q.score >= 95) / COUNT(*), 3) FROM quality_scores q
        WHERE q.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts < date('now'))
          AND q.slug NOT IN (SELECT slug FROM quality_scores WHERE ts < date((SELECT MAX(ts) FROM quality_scores WHERE ts < date('now')), '-14 days'))) AS TEXT)
    WHERE metric = 'paper_new_score_saturation_14d' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'))
      AND EXISTS (SELECT 1 FROM quality_scores q
        WHERE q.ts = (SELECT MAX(ts) FROM quality_scores WHERE ts < date('now'))
          AND q.slug NOT IN (SELECT slug FROM quality_scores WHERE ts < date((SELECT MAX(ts) FROM quality_scores WHERE ts < date('now')), '-14 days')));
END;
CREATE TRIGGER output_quality_heavy_metrics_tick AFTER INSERT ON fleet_tick_heavy
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(ABS(catch_rate + false_positive_rate - 1) < 0.001) / COUNT(*), 3) FROM research_golden_runs WHERE created_at >= max('2026-10-27', datetime('now', '-30 days')) AND catch_rate > 0 AND catch_rate < 1) AS TEXT)
    WHERE metric = 'golden_run_complement_share_30d' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'))
      AND EXISTS (SELECT 1 FROM research_golden_runs WHERE created_at >= max('2026-10-27', datetime('now', '-30 days')) AND catch_rate > 0 AND catch_rate < 1);
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((SELECT worse FROM v_output_quality_headline) AS TEXT)
    WHERE metric = 'output_quality_outcomes_worse' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'));
END;
CREATE TRIGGER output_quality_heavy_metrics2_tick AFTER INSERT ON fleet_tick_heavy
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((SELECT unmeasured FROM v_output_quality_headline) AS TEXT)
    WHERE metric = 'output_quality_outcomes_unmeasured' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'));
END;

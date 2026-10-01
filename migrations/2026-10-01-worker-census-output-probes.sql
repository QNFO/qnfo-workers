-- WORKER-CENSUS-DISCRIMINATING-1 (#1618, 2026-10-01): executable per-worker output probes. The census (qnfo-fleet-control
-- workerCensus, daily) runs output_sql with the window tokens :since_iso / :since_sql / :since_date / :since_ms replaced
-- by the window start, and derives PRODUCTIVE / DAILY-ONLY / LOW-YIELD / FIRING-NO-OUTPUT / DEGRADED / UNMEASURED from
-- the 24h and 7d counts instead of writing "live" for every worker. Each probe counts the worker's own output rows in
-- qnfo-audit. Applied live. qnfo-cloud-ops tags its events with sub-job names (sitemap-ping, briefing, ...), never its own
-- name, and qnfo-lifecycle records its runs in audit_sessions, so their probes read those sources.
INSERT OR IGNORE INTO worker_output_contracts (worker, workflow, output, verify, state, updated_at) VALUES
  ('ai-health-prober', 'model availability probes (*/20; 1-token pings, 2h OK interval)', 'ai_model_health rows (status, last_probe_ts)', 'SELECT MAX(last_probe_ts) FROM ai_model_health', 'ACTIVE', datetime('now'));
ALTER TABLE worker_output_contracts ADD COLUMN output_sql TEXT;
UPDATE worker_output_contracts SET output_sql = CASE worker
  WHEN 'qnfo-research-exec' THEN 'SELECT COUNT(*) AS n FROM cloud_ops_events WHERE job=''qnfo-research-exec'' AND kind=''done'' AND status=''ok'' AND ts >= :since_iso'
  WHEN 'idea-hub' THEN 'SELECT COUNT(*) AS n FROM idea_proposals WHERE created_at >= :since_iso'
  WHEN 'qnfo-autonomy-scorer' THEN 'SELECT COUNT(*) AS n FROM autonomy_scores WHERE scored_at >= :since_date'
  WHEN 'qnfo-email' THEN 'SELECT COUNT(*) AS n FROM emails WHERE received_at >= :since_iso'
  WHEN 'qnfo-observability' THEN 'SELECT COUNT(*) AS n FROM worker_logs WHERE ingested_at >= :since_iso'
  WHEN 'qnfo-ops' THEN 'SELECT COUNT(*) AS n FROM ops_ai_log WHERE ts >= :since_iso'
  WHEN 'qnfo-deploy-guard' THEN 'SELECT COUNT(*) AS n FROM fleet_deploys WHERE ts >= :since_iso'
  WHEN 'fleet-exec' THEN 'SELECT COUNT(*) AS n FROM fleet_crons WHERE last_fired >= :since_iso'
  WHEN 'q08-signal-engine' THEN 'SELECT COUNT(*) AS n FROM signals WHERE source=''q08'' AND created_at >= :since_iso'
  WHEN 'personal-companion' THEN 'SELECT COUNT(*) AS n FROM signals WHERE source=''reading'' AND created_at >= :since_iso'
  WHEN 'qnfo-social' THEN 'SELECT COUNT(*) AS n FROM social_threads WHERE status=''posted'' AND posted_at >= :since_sql'
  WHEN 'ai-health-prober' THEN 'SELECT COUNT(*) AS n FROM ai_model_health WHERE last_probe_ts >= :since_ms'
  WHEN 'qnfo-fleet-control' THEN 'SELECT COUNT(*) AS n FROM cloud_ops_events WHERE job=''qnfo-fleet-control'' AND ts >= :since_iso'
  WHEN 'qnfo-backlog-exec' THEN 'SELECT COUNT(*) AS n FROM cloud_ops_events WHERE job=''qnfo-backlog-exec'' AND ts >= :since_iso'
  WHEN 'qnfo-lifecycle' THEN 'SELECT COUNT(*) AS n FROM audit_sessions WHERE agent LIKE ''qnfo-lifecycle%'' AND start_time >= :since_iso'
  WHEN 'qnfo-cloud-ops' THEN 'SELECT COUNT(*) AS n FROM cloud_ops_events WHERE job IN (''backfill'',''gtd-reconcile'',''loose-threads-sweep'',''outreach'',''overdue-guard'',''quality-score'',''research-scan'',''sitemap-ping'',''weekly'',''weekly-ops'',''worker-health'',''release-check'',''briefing'',''radar'',''visibility'',''email-triage'',''gmail-triage'',''board-sync'') AND ts >= :since_iso'
  WHEN 'qnfo-email-orchestrator' THEN 'SELECT COUNT(*) AS n FROM email_reply_queue WHERE updated_at >= :since_sql'
  ELSE output_sql END;

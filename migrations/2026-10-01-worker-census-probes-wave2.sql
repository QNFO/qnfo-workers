-- WORKER-CENSUS-PROBES-2 (#1618 follow-up, 2026-10-01). The first census run (08:00Z) returned 18 PRODUCTIVE and 23
-- UNMEASURED. This adds output probes for 12 more workers whose output lands in qnfo-audit.
-- Attribution:
--   - Each probed table has exactly one live writer, or the probe narrows a shared table to the worker's own rows:
--       intents: processed_at / triaged_at, which only the orchestrator sets.
--       kaizen_reports: session_id 'qnfo-kaizen-cron'.
--       paper_revision_log: created_at, set by the reviser; qnfo-research-exec only UPDATEs those rows.
--   - Timestamp formats match each column: sql 'YYYY-MM-DD HH:MM:SS', ISO, or epoch ms.
-- Workers whose output is served responses, R2 objects, or rows in another database stay UNMEASURED:
--   qnfo-ai-search, qnfo-archive, qnfo-containers-pilot, qnfo-gateway, qnfo-ipatent, qnfo-memory-mcp, qnfo-pdf,
--   qnfo-skill-sync, qnfo-outreach (qnfo-outreach DB), qnfo-agent-orchestrator, personal-api (personal-life DB).
-- Applied live.
UPDATE worker_output_contracts SET output_sql = CASE worker
  WHEN 'errata-hub' THEN 'SELECT (SELECT COUNT(*) FROM errata_actions WHERE created_at >= :since_sql) + (SELECT COUNT(*) FROM errata_queue WHERE updated_at >= :since_sql) AS n'
  WHEN 'qnfo-ai-calibration' THEN 'SELECT COUNT(*) AS n FROM ai_calibration_runs WHERE ts >= :since_ms'
  WHEN 'qnfo-intent-orchestrator' THEN 'SELECT COUNT(*) AS n FROM intents WHERE processed_at >= :since_iso OR triaged_at >= :since_iso'
  WHEN 'qnfo-kaizen' THEN 'SELECT (SELECT COUNT(*) FROM kaizen_reports WHERE session_id = ''qnfo-kaizen-cron'' AND created_at >= :since_sql) + (SELECT COUNT(*) FROM kaizen_candidates WHERE created_at >= :since_sql) AS n'
  WHEN 'qnfo-paper-indexer' THEN 'SELECT COUNT(*) AS n FROM citation_stats WHERE collected_at >= :since_iso'
  WHEN 'qnfo-paper-reviser' THEN 'SELECT COUNT(*) AS n FROM paper_revision_log WHERE created_at >= :since_sql'
  WHEN 'qnfo-ai' THEN 'SELECT COUNT(*) AS n FROM ai_queries WHERE ts >= :since_iso'
  WHEN 'qnfo-fleet-dashboard' THEN 'SELECT COUNT(*) AS n FROM fleet_probe_log WHERE ts >= :since_iso'
  WHEN 'calendar-api' THEN 'SELECT COUNT(*) AS n FROM calendar WHERE updated >= :since_sql'
  WHEN 'qnfo-infra' THEN 'SELECT COUNT(*) AS n FROM infra_state WHERE ts >= :since_iso'
  WHEN 'qnfo-subscribers' THEN 'SELECT COUNT(*) AS n FROM subscriber_digest_runs WHERE created_at >= :since_sql'
  WHEN 'qnfo-tools-mcp' THEN 'SELECT COUNT(*) AS n FROM mcp_log WHERE ts >= :since_iso'
  ELSE output_sql END
WHERE worker IN ('errata-hub','qnfo-ai-calibration','qnfo-intent-orchestrator','qnfo-kaizen','qnfo-paper-indexer','qnfo-paper-reviser',
  'qnfo-ai','qnfo-fleet-dashboard','calendar-api','qnfo-infra','qnfo-subscribers','qnfo-tools-mcp');

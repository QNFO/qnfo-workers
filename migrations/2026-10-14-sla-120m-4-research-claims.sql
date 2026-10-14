-- SLA-120M-4 (2026-10-14, pillar research). Owner directive: no SLA exceeds 120 minutes and action starts at once past 120 minutes.
-- A research_queue row in status researching whose claim is older than 120 minutes was measured nowhere: qnfo-research-exec
-- reclaimStaleResearching requeues it to stage ground only after 4 hours (and parks it after 3 recoveries). That 4-hour step is an
-- auto-fix that discards the run's progress, and 3 of 102 published runs since 2026-10-09 took 121-133 minutes from their last
-- claim (mean 70), so moving it to 120 would restart good runs. The SLA is measured instead: v_sla_over_120m adds
-- research_claims_over_120m, so metric sla_breaches_over_120m files the audit at the next 10-minute evaluation while the
-- auto-fix keeps its threshold (as for the auto-fixes in queue_sla_tick_10m).
-- spof-review: one view redefined (same columns plus one); no trigger, cron or credential.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_sla_120m_4
-- Rollback: DROP VIEW IF EXISTS v_sla_over_120m; -- then recreate it from bak_20261014_sla_120m_4

CREATE TABLE IF NOT EXISTS bak_20261014_sla_120m_4 AS SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_sla_over_120m';

DROP VIEW IF EXISTS v_sla_over_120m;
CREATE VIEW v_sla_over_120m AS
SELECT s.*, k.*, i.issues_open_over_120m, i.oldest_open_issue_min, c.content_items_over_sla, q.code_tasks_queued_over_120m, r.research_claims_over_120m,
  i.issues_open_over_120m + s.research_review_error + s.research_head_stalled + s.research_queued_180m + s.intents_pending
    + s.outreach_waiting + s.code_tasks_stalled + s.issues_without_doer_3h + s.zenodo_exit_pending_stalled + s.research_held_over_sla
    + s.triage_gap + s.contracts_cadence_drift + q.code_tasks_queued_over_120m
    + k.predictions_unscored_over_sla + k.doctrine_proposals_waiting + c.content_items_over_sla + r.research_claims_over_120m AS total_over_120m
FROM v_stuck_summary s, v_stuck_summary_kernel k,
  (SELECT COUNT(*) AS issues_open_over_120m, COALESCE(MAX(age_min), 0) AS oldest_open_issue_min FROM v_issue_age WHERE age_min > 120) i,
  (SELECT COALESCE(SUM(over_sla), 0) AS content_items_over_sla FROM v_content_pipeline) c,
  (SELECT COUNT(*) AS code_tasks_queued_over_120m FROM code_tasks WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-120 minutes')) q,
  (SELECT COUNT(*) AS research_claims_over_120m FROM research_queue WHERE status = 'researching' AND claimed_at IS NOT NULL
     AND claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) r;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_018jgELQUadN7Ybo1B3j77HY', 'an SLA starts remediation; an auto-fix that discards progress keeps its own threshold',
  'SLA-120M-4: v_sla_over_120m counts research claims older than 120 minutes; reclaimStaleResearching keeps its 4-hour requeue',
  'published runs since 2026-10-09: 102, mean 70 min from last claim to publish, 3 above 120 (max 133), none above 240',
  'migration merged', 'one view redefined', 'the Rollback header',
  'a research run longer than 120 minutes is a measured breach with an audit at the next 10-minute evaluation',
  'research_claims_over_120m reads 0 or 1 most ticks', 'none', 'research_queue, v_sla_over_120m'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-120M-4:') = 1);

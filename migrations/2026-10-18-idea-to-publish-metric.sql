-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key = 'idea_to_publish_h_p50_7d'; DELETE FROM metric_registry WHERE metric = 'idea_to_publish_h_p50_7d'
--
-- IDEA-TO-PUBLISH-METRIC-1 (qnfo-research-exec 0.18.38, pillar research). Owner directive 2026-10-18: idea to publication
-- under 100 hours. Baseline (2026-10-18 08:50Z, 69 papers published in 7 days): mean 131.5 h from idea_proposals.created_at,
-- 38 of 69 under 100 h; dashboard Little's-law wait 47.8 days (queue 485 / 71 published in 7 d). Producer: research-exec :00 tick.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES ('idea_to_publish_h_p50_7d', 'fleet', 'lagging',
 'median hours from idea_proposals.created_at (research_queue.created_at for non-proposal rows) to research_queue.published_at over rows published in the last 7 days',
 'qnfo-audit.research_queue JOIN idea_proposals; producer qnfo-research-exec ideaToPublishMetric (:00 tick)',
 'mean 131.5 h, 38/69 under 100 h (2026-10-18)', '< 100', 'qnfo-research-exec', 'qnfo-research-exec', 'hourly', '72-100', '> 100', 'MEASURED', 'computed');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'idea_to_publish_h_p50_7d', 'Idea to publication median above 100 hours', 'registry', 'gt', 100, 1,
 'Pillar research (owner directive 2026-10-18: idea to publication < 100 h). Read where rows wait: SELECT stage, state, COUNT(*), MAX(age_h) FROM v_content_pipeline WHERE property = ''papers.qnfo.org'' AND state IN (''waiting'',''active'') GROUP BY 1, 2; and stage churn: SELECT kind, COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind IN (''claim-reclaim'',''rerun-route'',''ai-error'') AND ts >= datetime(''now'',''-1 day'') GROUP BY 1. Fix the largest wait first. Done: the metric is under 100 at two refreshes.',
 'qnfo-research-exec', 'agent_issues', 2, 1, 'IDEA-TO-PUBLISH-METRIC-1 (migrations/2026-10-18-idea-to-publish-metric.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'idea_to_publish_h_p50_7d');

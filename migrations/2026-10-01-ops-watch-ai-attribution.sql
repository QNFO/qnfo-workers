-- OPS-AGENT-WATCH-1 and WORKERS-AI-ATTRIBUTION-1 (2026-10-01, #1680 #1696 #1681). Applied live.
-- The 7-day acceptance windows of #1680/#1696 become standing regression watches computed hourly by qnfo-fleet-control
-- (opsAgentWatchMetrics), and Workers AI attribution coverage is computed hourly (aiAttributionCoverage).
-- analytics_metric_triggers files a deduped agent_issue on breach.
ALTER TABLE ai_call_counters ADD COLUMN in_tok INTEGER DEFAULT 0;
ALTER TABLE ai_call_counters ADD COLUMN out_tok INTEGER DEFAULT 0;
ALTER TABLE ai_call_counters ADD COLUMN neurons REAL DEFAULT 0;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('ops_owner_turn_incomplete_pct_7d', 'S1', 'reliability', 'share (%) of ops_ai_log owner turns (agent-tools, job-workflow, chat) whose response contains INCOMPLETE:, window max(now-7d, 2026-10-01T04:35Z)', 'qnfo-audit.ops_ai_log', '0', '< 5', 'qnfo-ops', 'qnfo-fleet-control', 'hourly', '>= 2', '>= 5', 'MEASURED', 'computed'),
 ('ops_agent_empty_answers_7d', 'S1', 'reliability', 'count of ops_ai_log agent-tools rows with an empty response or ok=0, window max(now-7d, 2026-10-01T04:35Z)', 'qnfo-audit.ops_ai_log', '0', '0', 'qnfo-ops', 'qnfo-fleet-control', 'hourly', '>= 1', '>= 3', 'MEASURED', 'computed'),
 ('workers_ai_attribution_coverage_pct', 'S3', 'cost', 'hourly delta of SUM(ai_call_counters.neurons) / GraphQL aiInferenceAdaptiveGroups totalNeurons over the same interval (%)', 'qnfo-audit.ai_call_counters + CF GraphQL', '0', '>= 80', 'qnfo-fleet-control', 'qnfo-fleet-control', 'hourly', '< 80', '< 50', 'MEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes) VALUES
 ('ops_owner_turn_incomplete_pct_7d', 'OPS-AGENT-TOOL-BUDGET regression: owner turns ending INCOMPLETE >= 5%', 'registry', 'gte', 5, 'high', 'Re-open #1680 class: check durable-workflow auto-promotion and the interactive tool budget in qnfo-ops', 'qnfo-ops', 'agent_issues', 24, 1, 'OPS-AGENT-WATCH-1'),
 ('ops_agent_empty_answers_7d', 'OPS-AGENT-STREAM-EMPTY regression: empty agent-tools answers', 'registry', 'gte', 1, 'medium', 'Re-open #1696 class: check finalize() empty-answer guard in qnfo-ops', 'qnfo-ops', 'agent_issues', 24, 1, 'OPS-AGENT-WATCH-1'),
 ('workers_ai_attribution_coverage_pct', 'WORKERS-AI attribution coverage below 50%', 'registry', 'lt', 50, 'medium', 'A Workers AI consumer is not wrapped by __aiAttrEnv: find it from GraphQL neurons by model and add the wrapper (scripts/ai-attr-env-patch.py)', 'qnfo-fleet-control', 'agent_issues', 72, 1, 'WORKERS-AI-ATTRIBUTION-1');

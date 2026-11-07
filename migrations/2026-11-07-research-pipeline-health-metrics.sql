-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_research_pipeline_health; DELETE FROM metric_registry WHERE metric_key LIKE 'research_pipeline_%'; DELETE FROM analytics_metric_triggers WHERE metric LIKE 'research_pipeline_%';
-- BACKUP: None required (new monitoring only)

-- RESEARCH-PIPELINE-HEALTH-1: comprehensive health monitoring for the autonomous research pipeline (docs/AUTONOMOUS-RESEARCH-PIPELINE.md).
-- The pipeline has error recovery (markError, laneReenter, reclaimStaleResearching) but no health metrics to detect when recovery itself is failing.
-- This adds metrics for: stuck work (queued >24h), poison loops (terminal_rearms >5), claim leaks (researching >2h unclaimed), and stage distribution.
-- Each metric has a trigger that files agent_issues with code-task lines pointing to the recovery functions.

-- Pipeline health view: current state of research_queue with key health indicators
CREATE VIEW IF NOT EXISTS v_research_pipeline_health AS
SELECT
  COUNT(*) AS total_rows,
  SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
  SUM(CASE WHEN status = 'researching' THEN 1 ELSE 0 END) AS researching,
  SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) AS review,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
  SUM(CASE WHEN status = 'queued' AND created_at < datetime('now', '-24 hours') THEN 1 ELSE 0 END) AS stuck_queued_24h,
  SUM(CASE WHEN status = 'researching' AND claimed_at IS NULL THEN 1 ELSE 0 END) AS researching_unclaimed,
  SUM(CASE WHEN status = 'researching' AND claimed_at < datetime('now', '-2 hours') THEN 1 ELSE 0 END) AS stale_claims_2h,
  SUM(CASE WHEN CAST(terminal_rearms AS INTEGER) > 5 THEN 1 ELSE 0 END) AS poison_loops,
  SUM(CASE WHEN CAST(recover_count AS INTEGER) >= 3 THEN 1 ELSE 0 END) AS high_recover_count,
  MAX(CAST((julianday('now') - julianday(created_at)) * 24 AS INTEGER)) AS oldest_queued_hours,
  AVG(CASE WHEN status = 'completed' AND published_at IS NOT NULL 
       THEN CAST((julianday(published_at) - julianday(created_at)) * 24 AS REAL) 
       ELSE NULL END) AS avg_idea_to_publish_hours
FROM research_queue
WHERE status IN ('queued', 'researching', 'review', 'completed', 'failed');

-- Metric: Stuck queued work (items queued >24h without progress)
INSERT OR IGNORE INTO metric_registry (
  metric_key, metric_name, query, threshold_value, threshold_direction, 
  metric_unit, state, owner, category, created_at, updated_at
) VALUES (
  'research_pipeline_stuck_queued_24h',
  'Research items stuck queued >24h',
  'SELECT COALESCE(stuck_queued_24h, 0) AS value FROM v_research_pipeline_health',
  0,
  'above',
  'count',
  'active',
  'qnfo-research-exec',
  'pipeline',
  CAST(strftime('%s', 'now') AS INTEGER),
  CAST(strftime('%s', 'now') AS INTEGER)
);

INSERT OR IGNORE INTO analytics_metric_triggers (
  metric, threshold, direction, severity, owner, action, created_at
) VALUES (
  'research_pipeline_stuck_queued_24h',
  0,
  'above',
  'high',
  'qnfo-research-exec',
  'Research items queued for >24h without being claimed indicate the research executor is stalled or the claim logic is broken. Check reclaimStaleResearching and the research cron tick.

code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js
code-anchor: async function reclaimStaleResearching(env) {

Lever: Verify research cron is firing every 10min; check RESEARCH_BUDGET_USD hasn''t paused all work; inspect research_queue WHERE status=''queued'' ORDER BY created_at for error patterns.',
  CAST(strftime('%s', 'now') AS INTEGER)
);

-- CAUSE-MAPPED: pipeline (new metric family, standard cause for research worker issues)
INSERT OR IGNORE INTO metric_breach_cause (metric, cause, added_at)
VALUES ('research_pipeline_stuck_queued_24h', 'pipeline', CAST(strftime('%s', 'now') AS INTEGER));

-- Metric: Poison loops (items with terminal_rearms >5)
INSERT OR IGNORE INTO metric_registry (
  metric_key, metric_name, query, threshold_value, threshold_direction,
  metric_unit, state, owner, category, created_at, updated_at
) VALUES (
  'research_pipeline_poison_loops',
  'Research items in poison loops (terminal_rearms >5)',
  'SELECT COALESCE(poison_loops, 0) AS value FROM v_research_pipeline_health',
  0,
  'above',
  'count',
  'active',
  'qnfo-research-exec',
  'pipeline',
  CAST(strftime('%s', 'now') AS INTEGER),
  CAST(strftime('%s', 'now') AS INTEGER)
);

INSERT OR IGNORE INTO analytics_metric_triggers (
  metric, threshold, direction, severity, owner, action, created_at
) VALUES (
  'research_pipeline_poison_loops',
  0,
  'above',
  'critical',
  'qnfo-research-exec',
  'Ideas with terminal_rearms >5 are cycling through lane reentry without completing. This indicates the recovery logic (laneReenter, markError) is not fixing the underlying issue.

code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js
code-anchor: await laneReenter(env, row, { kind: "poison"

Lever: Query research_queue WHERE terminal_rearms >5 to identify the specific ideas and their error patterns; update laneReenter cooldown or add a hard termination after N cycles; file failure modes for recurring error signatures.',
  CAST(strftime('%s', 'now') AS INTEGER)
);

INSERT OR IGNORE INTO metric_breach_cause (metric, cause, added_at)
VALUES ('research_pipeline_poison_loops', 'pipeline', CAST(strftime('%s', 'now') AS INTEGER));

-- Metric: Stale claims (researching items claimed >2h ago)
INSERT OR IGNORE INTO metric_registry (
  metric_key, metric_name, query, threshold_value, threshold_direction,
  metric_unit, state, owner, category, created_at, updated_at
) VALUES (
  'research_pipeline_stale_claims_2h',
  'Research items with stale claims >2h',
  'SELECT COALESCE(stale_claims_2h, 0) AS value FROM v_research_pipeline_health',
  2,
  'above',
  'count',
  'active',
  'qnfo-research-exec',
  'pipeline',
  CAST(strftime('%s', 'now') AS INTEGER),
  CAST(strftime('%s', 'now') AS INTEGER)
);

INSERT OR IGNORE INTO analytics_metric_triggers (
  metric, threshold, direction, severity, owner, action, created_at
) VALUES (
  'research_pipeline_stale_claims_2h',
  2,
  'above',
  'medium',
  'qnfo-research-exec',
  'Researching items claimed >2h ago indicate the watchdog or claim release is not working. The stale claim reaper should release these.

code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js  
code-anchor: var staleClaim = "status=''researching'' AND claimed_at IS NOT NULL

Lever: Check reclaimStaleResearching runs every 10min; verify RESEARCH_CLAIM_STALE_MIN is not set too high; inspect cloud_ops_events for research-exec cron failures.',
  CAST(strftime('%s', 'now') AS INTEGER)
);

INSERT OR IGNORE INTO metric_breach_cause (metric, cause, added_at)
VALUES ('research_pipeline_stale_claims_2h', 'pipeline', CAST(strftime('%s', 'now') AS INTEGER));

-- Metric: High recovery count (items that have recovered >=3 times)
INSERT OR IGNORE INTO metric_registry (
  metric_key, metric_name, query, threshold_value, threshold_direction,
  metric_unit, state, owner, category, created_at, updated_at
) VALUES (
  'research_pipeline_high_recover_count',
  'Research items with recover_count >=3',
  'SELECT COALESCE(high_recover_count, 0) AS value FROM v_research_pipeline_health',
  5,
  'above',
  'count',
  'active',
  'qnfo-research-exec',
  'pipeline',
  CAST(strftime('%s', 'now') AS INTEGER),
  CAST(strftime('%s', 'now') AS INTEGER)
);

INSERT OR IGNORE INTO analytics_metric_triggers (
  metric, threshold, direction, severity, owner, action, created_at
) VALUES (
  'research_pipeline_high_recover_count',
  5,
  'above',
  'medium',
  'qnfo-research-exec',
  'Multiple items with recover_count >=3 suggest systematic errors that markError cannot resolve. These items are approaching the terminal rearm threshold.

code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js
code-anchor: async function markError(env, row, msg) {

Lever: Query research_queue WHERE recover_count >=3 to see error messages; add error-specific recovery routes in rerunRoute; increase recoverMax if errors are transient; file failure modes for recurring error signatures.',
  CAST(strftime('%s', 'now') AS INTEGER)
);

INSERT OR IGNORE INTO metric_breach_cause (metric, cause, added_at)
VALUES ('research_pipeline_high_recover_count', 'pipeline', CAST(strftime('%s', 'now') AS INTEGER));

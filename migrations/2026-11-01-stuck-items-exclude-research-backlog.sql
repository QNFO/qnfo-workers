-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_queue_sla_tick
-- Rollback: DROP TRIGGER IF EXISTS queue_sla_tick_10m; CREATE TRIGGER queue_sla_tick_10m AFTER INSERT ON fleet_tick BEGIN DELETE FROM research_review_seen WHERE id NOT IN (SELECT id FROM research_queue WHERE status = 'review'); INSERT OR IGNORE INTO research_review_seen (id, first_seen) SELECT id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM research_queue WHERE status = 'review'; INSERT INTO queue_sla_actions (stuck_type, n, note) SELECT 'research-review-error', COUNT(*), group_concat(substr(id, 1, 8), ',') FROM research_queue WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off' AND status = 'review' AND COALESCE(stage, '') <> 'publish' AND id IN (SELECT id FROM research_review_seen WHERE first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) HAVING COUNT(*) > 0; UPDATE research_queue SET status = CASE WHEN COALESCE(recover_count, 0) < 3 THEN 'queued' ELSE 'wontfix' END, stage = CASE WHEN COALESCE(recover_count, 0) < 3 THEN 'review' ELSE 'parked' END, claimed_at = NULL, recover_count = COALESCE(recover_count, 0) + 1, error = substr(CASE WHEN COALESCE(recover_count, 0) < 3 THEN 'QUEUE-SLA-2 requeued after 120 min in review (was stage ' || COALESCE(stage, '?') || '; re-dispatched at review): ' ELSE 'QUEUE-SLA-2 parked after 120 min in review and 3 re-dispatches (was stage ' || COALESCE(stage, '?') || '; revert: status review): ' END || COALESCE(error, ''), 1, 300) WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off' AND status = 'review' AND COALESCE(stage, '') <> 'publish' AND id IN (SELECT id FROM research_review_seen WHERE first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')); INSERT INTO queue_sla_actions (stuck_type, n, note) SELECT 'intent-untriaged', COUNT(*), group_concat(id, ',') FROM intents WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off' AND status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes') HAVING COUNT(*) > 0; UPDATE intents SET status = 'rejected', noise = 1, triaged_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), triage_decision = 'sla-noise', triage_rationale = 'QUEUE-SLA-1: untriaged for more than 60 minutes; closed as noise (revert: status pending)' WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off' AND status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes'); INSERT INTO queue_sla_actions (stuck_type, n, note) SELECT 'outreach-needs-email', COUNT(*), group_concat(id, ',') FROM outreach_queue WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off' AND status IN ('needs-email', 'needs-contact') AND datetime(created_at) < datetime('now', '-180 minutes') HAVING COUNT(*) > 0; UPDATE outreach_queue SET error = substr('QUEUE-SLA-1 skipped after 180 min (was ' || status || '; revert: that status). ' || COALESCE(error, ''), 1, 500), status = 'skipped-no-email' WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off' AND status IN ('needs-email', 'needs-contact') AND datetime(created_at) < datetime('now', '-180 minutes'); UPDATE metric_registry SET last_value = CAST((SELECT research_review_error + research_head_stalled + research_queued_180m + intents_pending + outreach_waiting + code_tasks_stalled + issues_without_doer_3h FROM v_stuck_summary) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'stuck_items_over_sla'; UPDATE metric_registry SET last_value = CAST((SELECT issues_unprobed_60m FROM v_stuck_summary) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'issues_unprobed_60m'; END; UPDATE metric_registry SET formula = 'Sum of v_stuck_summary columns except issues_unprobed_60m (its own metric): queue items past their queue_sla.sla_min plus open issues with no doer after 180 minutes (QUEUE-SLA-1).', target = '0' WHERE metric = 'stuck_items_over_sla'; UPDATE analytics_metric_triggers SET action = 'Pillar autonomy (QUEUE-SLA-1). Read SELECT * FROM v_stuck_summary and SELECT * FROM queue_sla: each non-zero column names a stuck type, its SLA in minutes and its automatic fix. If the type has a fix and queue_sla_actions shows it ran in the last 20 minutes, the fix did not clear it: find why (a status the fix does not match, a new failure shape) and widen the fix by migration. If ops_config queue_sla_autofix is off, say why on this issue and turn it back on. A stuck type with no automatic fix (research-head-stalled, code-task-stalled) gets one now: write the fix into queue_sla and the tick trigger by migration, with its revert in the row it changes. A new queue gets a queue_sla row and a v_stuck_summary column in the same PR that creates it. Definition of done: stuck_items_over_sla = 0 at two refreshes 10 minutes apart.' WHERE metric_key = 'stuck_items_over_sla';
-- QUEUE-SLA-METRIC-SCOPE-1: the backpressure-controlled ready queue is a managed backlog,
-- not a stuck item. Its pool/capacity remain monitored by research_deferred_pool and fm-unbounded-ready-queue.

CREATE TABLE IF NOT EXISTS bak_20261101_queue_sla_tick AS
SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at
FROM sqlite_master
WHERE type = 'trigger' AND name = 'queue_sla_tick_10m';

DROP TRIGGER IF EXISTS queue_sla_tick_10m;
CREATE TRIGGER queue_sla_tick_10m AFTER INSERT ON fleet_tick
BEGIN
  DELETE FROM research_review_seen WHERE id NOT IN (SELECT id FROM research_queue WHERE status = 'review');
  INSERT OR IGNORE INTO research_review_seen (id, first_seen)
    SELECT id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM research_queue WHERE status = 'review';
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'research-review-error', COUNT(*), group_concat(substr(id, 1, 8), ',') FROM research_queue
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND status = 'review' AND COALESCE(stage, '') <> 'publish'
      AND id IN (SELECT id FROM research_review_seen WHERE first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes'))
    HAVING COUNT(*) > 0;
  UPDATE research_queue SET
      status = CASE WHEN COALESCE(recover_count, 0) < 3 THEN 'queued' ELSE 'wontfix' END,
      stage = CASE WHEN COALESCE(recover_count, 0) < 3 THEN 'review' ELSE 'parked' END,
      claimed_at = NULL, recover_count = COALESCE(recover_count, 0) + 1,
      error = substr(CASE WHEN COALESCE(recover_count, 0) < 3
        THEN 'QUEUE-SLA-2 requeued after 120 min in review (was stage ' || COALESCE(stage, '?') || '; re-dispatched at review): '
        ELSE 'QUEUE-SLA-2 parked after 120 min in review and 3 re-dispatches (was stage ' || COALESCE(stage, '?') || '; revert: status review): ' END || COALESCE(error, ''), 1, 300)
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status = 'review' AND COALESCE(stage, '') <> 'publish'
    AND id IN (SELECT id FROM research_review_seen WHERE first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes'));

  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'intent-untriaged', COUNT(*), group_concat(id, ',') FROM intents
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')
    HAVING COUNT(*) > 0;
  UPDATE intents SET status = 'rejected', noise = 1, triaged_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
      triage_decision = 'sla-noise', triage_rationale = 'QUEUE-SLA-1: untriaged for more than 60 minutes; closed as noise (revert: status pending)'
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes');

  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'outreach-needs-email', COUNT(*), group_concat(id, ',') FROM outreach_queue
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND status IN ('needs-email', 'needs-contact') AND datetime(created_at) < datetime('now', '-180 minutes')
    HAVING COUNT(*) > 0;
  UPDATE outreach_queue SET error = substr('QUEUE-SLA-1 skipped after 180 min (was ' || status || '; revert: that status). ' || COALESCE(error, ''), 1, 500),
      status = 'skipped-no-email'
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status IN ('needs-email', 'needs-contact') AND datetime(created_at) < datetime('now', '-180 minutes');

  UPDATE metric_registry SET last_value = CAST((SELECT research_review_error + research_head_stalled + intents_pending + outreach_waiting + code_tasks_stalled + issues_without_doer_3h FROM v_stuck_summary) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'stuck_items_over_sla';
  UPDATE metric_registry SET last_value = CAST((SELECT issues_unprobed_60m FROM v_stuck_summary) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'issues_unprobed_60m';
END;

UPDATE metric_registry SET formula = 'Sum of true stuck columns in v_stuck_summary, excluding issues_unprobed_60m (its own metric) and research_queued_180m (controlled ready-queue backlog). Research backlog is healthy at or below research_ready_cap while RESEARCH-BACKPRESSURE-1 is active; its size and capacity failures are measured separately by research_deferred_pool and fm-unbounded-ready-queue. The target 0 applies to true stuck items only (QUEUE-SLA-1).',
    target = '0',
    last_value = CAST((SELECT research_review_error + research_head_stalled + intents_pending + outreach_waiting + code_tasks_stalled + issues_without_doer_3h FROM v_stuck_summary) AS TEXT),
    last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
WHERE metric = 'stuck_items_over_sla';
UPDATE analytics_metric_triggers SET action = 'Pillar autonomy (QUEUE-SLA-1). Read SELECT * FROM v_stuck_summary and SELECT * FROM queue_sla. The research_queued_180m column is a controlled backlog, excluded from this breach metric; assess its pool and ready-queue capacity through research_deferred_pool and fm-unbounded-ready-queue. For every other non-zero column, identify the stuck type, SLA and automatic fix. If its fix ran in the last 20 minutes, find why it did not clear the item. If queue_sla_autofix is off, record why and turn it back on. A stuck type with no automatic fix gets one by migration. A new queue gets a queue_sla row and v_stuck_summary column in the same PR. Definition of done: true stuck_items_over_sla = 0 at two refreshes 10 minutes apart.'
WHERE metric_key = 'stuck_items_over_sla';

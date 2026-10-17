-- QUEUE-SLA-2 (2026-10-17, owner directive "maximize autonomy and content publishing success"):
-- the 10-minute tick parked work instead of advancing it.
--
--  1. status='review' is also the publish queue (status='review' AND stage='publish'). A paper waiting more
--     than 60 minutes for its publish gate was marked wontfix/stage='parked' by a timer that was only meant
--     to catch a stuck review. The publish queue is gated by PUB-GATE-LOOP-1; it is now excluded here.
--  2. A review that took longer than 60 minutes was discarded (status wontfix). Slow work is not failed work.
--     A row over the 120-minute SLA (the fleet-wide SLA, SLA-120M) is now re-dispatched to status='queued',
--     stage='review' with recover_count+1, and the RESUME-STAGE-1 claim advances it at review instead of
--     re-drafting it. Only after 3 re-dispatches is it parked, so a genuinely hung row still stops consuming
--     slots.
--
-- Measured before the change: queue_sla_actions recorded 9 research-review-error runs over 11 items.
-- The intents, outreach and metric duties of this trigger are unchanged and reproduced verbatim.
--
-- Revert: recreate the definition in migrations/2026-10-14-sla-120m.sql (60 minutes, park on any review).

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

  UPDATE metric_registry SET last_value = CAST((SELECT research_review_error + research_head_stalled + research_queued_180m + intents_pending + outreach_waiting + code_tasks_stalled + issues_without_doer_3h FROM v_stuck_summary) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'stuck_items_over_sla';
  UPDATE metric_registry SET last_value = CAST((SELECT issues_unprobed_60m FROM v_stuck_summary) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'issues_unprobed_60m';
END;

UPDATE queue_sla SET sla_min = 120,
  definition = 'status review for 120 minutes by research_review_seen (time in review, not claim age or leftover error text); the publish queue (stage publish) is excluded, it is gated by PUB-GATE-LOOP-1 not by a timer',
  auto_fix = 'QUEUE-SLA-2 (2026-10-17): re-dispatch, never discard. A row over 120 min in review returns to status queued / stage review with recover_count+1 and the resume-stage claim advances it at review; only after 3 re-dispatches is it parked (status wontfix, stage parked). Prior behaviour parked every row at 60 min, including the publish queue. Revert: set status review in error text.'
WHERE stuck_type = 'research-review-error';

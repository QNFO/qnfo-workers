-- QUEUE-SLA-REVIEW-AGE-1 (2026-10-09, pillar research; doctrine revision 3, aging and no silent drop). queue_sla_tick_10m
-- (2026-10-08-10) parked every research_queue row in status review whose error was not null and whose claimed_at was more
-- than 30 minutes old. Neither field measures a stuck publish: claimed_at is set when the row is claimed at stage ground,
-- hours before it reaches publish, and verify->publish never clears error, so a row that failed an earlier attempt and then
-- passed carries the old text ("verify: unresolved after revision", "HOLD-RELEASE-1 ..."). Eleven papers that had passed
-- verify were parked as wontfix on arrival at publish; the publish failures of that window were the zenodo_enabled column
-- error that qnfo-research-exec 0.10.3 fixed (live 2026-10-09 07:37Z). This file:
--   1. keeps the eleven rows in bak_20261009_publish_rearm and re-arms them at status review, stage publish, error NULL;
--      claimed_at is set 12 hours back so they lead the in-flight list (oldest claim first) ahead of rows still researching;
--   2. measures time in review itself: research_review_seen records when the tick first saw a row in review, and the tick
--      parks only a row that has stayed in review for 60 minutes (four research-exec ticks, each of which takes the oldest
--      in-flight row first), whatever its error text; v_stuck_summary.research_review_error counts the same rows.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261009_publish_rearm
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-queue-sla-review-proxy'; UPDATE research_queue SET status = (SELECT b.status FROM bak_20261009_publish_rearm b WHERE b.id = research_queue.id), stage = (SELECT b.stage FROM bak_20261009_publish_rearm b WHERE b.id = research_queue.id), error = (SELECT b.error FROM bak_20261009_publish_rearm b WHERE b.id = research_queue.id) WHERE id IN (SELECT id FROM bak_20261009_publish_rearm) AND status = 'review'; then recreate queue_sla_tick_10m and v_stuck_summary from bak_20261009_queue_sla_sql.sql

CREATE TABLE IF NOT EXISTS bak_20261009_publish_rearm AS
SELECT id, status, stage, claimed_at, error, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM research_queue
WHERE status = 'wontfix' AND stage = 'parked' AND instr(error, 'QUEUE-SLA-1 parked after 30 min (was status review, stage publish') = 1;

CREATE TABLE IF NOT EXISTS bak_20261009_queue_sla_sql AS
SELECT name, type, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE name IN ('queue_sla_tick_10m', 'v_stuck_summary');

CREATE TABLE IF NOT EXISTS research_review_seen (id TEXT PRIMARY KEY, first_seen TEXT NOT NULL);

DROP TRIGGER IF EXISTS queue_sla_tick_10m;

DROP VIEW IF EXISTS v_stuck_summary;

CREATE VIEW v_stuck_summary AS
SELECT
  (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id
     WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error,
  (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0
     AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok'
       AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled,
  (SELECT COUNT(*) FROM research_queue WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-180 minutes')) AS research_queued_180m,
  (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending,
  (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact')
     AND datetime(created_at) < datetime('now', '-180 minutes')) AS outreach_waiting,
  (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted')
     AND datetime(updated_at) < datetime('now', '-180 minutes')) AS code_tasks_stalled,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 10800) * 1000
     AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status = 'active' AND c.verify_probe NOT LIKE 'needs%')
     AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
       AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h;

UPDATE research_queue SET status = 'review', stage = 'publish', claimed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-12 hours'), error = NULL
WHERE id IN (SELECT id FROM bak_20261009_publish_rearm) AND status = 'wontfix' AND stage = 'parked';

CREATE TRIGGER queue_sla_tick_10m AFTER INSERT ON fleet_tick
BEGIN
  DELETE FROM research_review_seen WHERE id NOT IN (SELECT id FROM research_queue WHERE status = 'review');
  INSERT OR IGNORE INTO research_review_seen (id, first_seen)
    SELECT id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM research_queue WHERE status = 'review';
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'research-review-error', COUNT(*), group_concat(substr(id, 1, 8), ',') FROM research_queue
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND status = 'review' AND id IN (SELECT id FROM research_review_seen WHERE first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes'))
    HAVING COUNT(*) > 0;
  UPDATE research_queue SET status = 'wontfix', stage = 'parked', claimed_at = NULL,
      error = substr('QUEUE-SLA-1 parked after 60 min in review (was stage ' || COALESCE(stage, '?') || '; revert: status review): ' || COALESCE(error, ''), 1, 300)
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status = 'review' AND id IN (SELECT id FROM research_review_seen WHERE first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes'));

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

UPDATE queue_sla SET definition = 'status review for 60 minutes by research_review_seen (time in review, not claim age or leftover error text)', sla_min = 60
WHERE stuck_type = 'research-review-error';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('queue-sla-review-proxy', 'the queue-SLA autofix parked publish-ready papers on arrival at publish', 'queue_sla_tick_10m judged a stuck publish by claimed_at (set at stage ground) and a non-null error (never cleared at verify->publish)', 'research_review_seen measures time in review (60 min); the eleven rows re-armed (2026-10-09-03-publish-rearm.sql)', 'no research_queue row parked with the old 30-min proxy text', 'fm-queue-sla-review-proxy', '2026-10-09', NULL, 'a paper passed verify after an earlier failed attempt', 'research_queue wontfix rows reading QUEUE-SLA-1 parked after 30 min (was status review, stage publish', 'every paper reaching publish');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-queue-sla-review-proxy', NULL, 'QUEUE-SLA-REVIEW-AGE-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status = ''wontfix'' AND instr(error, ''QUEUE-SLA-1 parked after 30 min (was status review, stage publish'') = 1) = 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'holding', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'claim age plus a non-null error marks a failing publish', 're-armed the eleven publish rows QUEUE-SLA-1 parked; the review rule now measures time in review (research_review_seen, 60 min)', 'eleven rows parked as wontfix at stage publish with errors left from earlier attempts; no paper published since 2026-10-06', 'publish-ready papers reach the publish stage; only a row stuck four ticks in review is parked', 'research_queue publish stage only', 'bak_20261009_publish_rearm, bak_20261009_queue_sla_sql and the Rollback line', 'the queue-SLA autofix measures time in a state instead of proxies'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 're-armed the eleven publish rows%');

-- SCHEDULED-AUDIT-REMEDIATE-1 (2026-10-09, pillar autonomy; owner request 2026-10-09 "Schedule regular audits and remediate as
-- needed to ensure continuous, automatic, autonomous system operation"). PR 835 (AUDIT-FRESHNESS-1) audits that the audit
-- loops keep running; this file and scripts/claim_reaper.py add the automatic remediations for the two stuck states a session
-- had to clear by hand on 2026-10-09, all on Cloudflare and the GitHub runner, no session or claude.ai schedule:
--   1. HOLD-EXPIRY-1: a research_queue row held with a revert line ("Revert: status review, stage publish") is released by
--      the 10-minute fleet tick after 6 hours held (ANTIFRAGILE-1: a hold needs a recorded reason and an expiry). Twelve
--      papers were held on 2026-10-09 for the in-house publish defect; PR 837's trigger releases them when 0.10.4 reports in,
--      and this is the second path if that never happens. research_hold_seen records when the tick first saw each row held;
--      v_stuck_summary gains research_held_over_sla and queue_sla the row research-held.
--   2. CLAIM-REAPER-1 (scripts/claim_reaper.py, hourly in remediation-consumer.yml): a work claim whose PR merged or closed
--      more than 30 minutes ago is released in work_claims and its deploy_locks lease ended (the claim on
--      qnfo-research-exec/worker.js stayed live 2 h after PR 826 merged). fm-claim-reaper-stalled watches its heartbeat.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261009_stuck_summary_v3
-- Rollback: DROP TRIGGER IF EXISTS research_hold_expiry_tick; DELETE FROM queue_sla WHERE stuck_type = 'research-held'; DELETE FROM remediation_contracts WHERE class = 'fm-claim-reaper-stalled'; recreate v_stuck_summary from bak_20261009_stuck_summary_v3

CREATE TABLE IF NOT EXISTS bak_20261009_stuck_summary_v3 AS
SELECT name, type, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE name = 'v_stuck_summary';

CREATE TABLE IF NOT EXISTS research_hold_seen (id TEXT PRIMARY KEY, first_seen TEXT NOT NULL);

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
       AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h,
  (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-180 minutes'))
     THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled,
  (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id
     WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-360 minutes')) AS research_held_over_sla;

CREATE TRIGGER IF NOT EXISTS research_hold_expiry_tick AFTER INSERT ON fleet_tick
BEGIN
  DELETE FROM research_hold_seen WHERE id NOT IN (SELECT id FROM research_queue WHERE status = 'held');
  INSERT OR IGNORE INTO research_hold_seen (id, first_seen)
    SELECT id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') FROM research_queue WHERE status = 'held';
  INSERT INTO queue_sla_actions (stuck_type, n, note)
    SELECT 'research-held', COUNT(*), group_concat(substr(q.id, 1, 8), ',') FROM research_queue q JOIN research_hold_seen h ON h.id = q.id
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
      AND q.status = 'held' AND instr(COALESCE(q.error, ''), 'Revert: status review, stage publish') > 0
      AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-360 minutes')
    HAVING COUNT(*) > 0;
  UPDATE research_queue SET status = 'review', stage = 'publish', claimed_at = NULL,
      error = substr('HOLD-EXPIRY-1 ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ': released after 6 h held (a hold needs an expiry). Was: ' || COALESCE(error, ''), 1, 500)
  WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'queue_sla_autofix'), 'on') <> 'off'
    AND status = 'held' AND instr(COALESCE(error, ''), 'Revert: status review, stage publish') > 0
    AND id IN (SELECT id FROM research_hold_seen WHERE first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-360 minutes'));
END;

INSERT OR IGNORE INTO queue_sla (stuck_type, queue, definition, cycle_min, sla_min, auto_fix, owner, summary_column) VALUES
 ('research-held', 'research_queue', 'status held for 6 hours by research_hold_seen', 10, 360,
  'research_hold_expiry_tick releases a row whose error carries "Revert: status review, stage publish" to review/publish; a hold without a revert line stays counted for a session or loop to disposition',
  'qnfo-audit fleet tick', 'research_held_over_sla');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('claim-reaper-stalled', 'merged work keeps its claim and blocks other sessions', 'a session stops without releasing its work claim; the claim lives until expiry (up to 2 h)', 'scripts/claim_reaper.py hourly in remediation-consumer.yml releases claims whose PR merged or closed 30+ min ago', 'a claim-reaper-run event within 3 h', 'fm-claim-reaper-stalled', '2026-10-09', NULL, 'the consumer workflow or the reaper step stops', 'a claim on a merged PR refuses acquires for hours', 'every session that needs the claimed file or issue');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-claim-reaper-stalled', NULL, 'CLAIM-REAPER-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''claim-reaper-run'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'')) THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'holding', 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'a hold and a claim end when someone remembers to end them', 'scheduled remediation: held research rows expire after 6 h by revert line; claims on merged or closed PRs are reaped hourly', '2026-10-09: 12 papers held for a defect; a claim stayed live 2 h after its PR merged while the defect it left blocked publishing', 'holds and claims end on their own', 'research_queue held rows; work_claims and deploy_locks work leases', 'the Rollback line', 'stuck holds and stale claims clear without a session'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'scheduled remediation: held research rows%');

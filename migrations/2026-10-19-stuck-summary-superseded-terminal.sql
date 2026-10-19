-- STUCK-SUMMARY-SUPERSEDED-TERMINAL-1 (2026-10-19, charter pillar autonomy; OWNER-NO-LOOSE-ENDS-1; found while landing PARKED-TASK-ISSUE-CLOSED-1,
-- reviewer finding 2026-10-19 from session_01QpQv19: moving a parked task to superseded trades the owner-queue false signal for one in v_stuck_summary).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_stuck_summary_view
-- Rollback: DROP VIEW IF EXISTS v_stuck_summary; CREATE VIEW v_stuck_summary AS SELECT (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error, (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0 AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled, (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id WHERE q.status = 'queued' AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-120 minutes')) AS research_queued_180m, (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending, (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact') AND (datetime(created_at) < datetime('now', '-120 minutes') OR COALESCE(attempts, 0) >= 3)) AS outreach_waiting, (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted') AND datetime(updated_at) < datetime('now', '-120 minutes')) AS code_tasks_stalled, (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m, (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000 AND COALESCE(a.description, '') NOT LIKE '%code-task:%' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%') AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h, (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled, (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS research_held_over_sla, (SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = 'open' AND t.issue_id IS NULL) AS triage_gap, (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND c.next_due_at IS NOT NULL AND datetime(c.next_due_at) > datetime('now', '+70 minutes')) AS contracts_cadence_drift, (SELECT COALESCE(CAST((julianday('now') - julianday(MIN(created_at))) * 1440 AS INTEGER), 0) FROM code_tasks WHERE status = 'queued') AS code_tasks_queued_oldest_min, (SELECT COUNT(*) FROM code_tasks WHERE status = 'ready_to_publish' AND julianday(updated_at) < julianday('now', '-120 minutes')) AS code_tasks_unpublished_120m; DELETE FROM remediation_contracts WHERE class = 'fm-stuck-summary-superseded-counted'; DELETE FROM failure_modes WHERE fm_key = 'stuck-summary-superseded-counted'
-- spof-review: none added. The view is read by the queue SLA tick, the stuck_items_over_sla metric and the stuck views; the change only removes one status from one count, and the detector fm-stuck-summary-superseded-counted is the second path (it reads the view text and the rows, not the view's number).
--
-- WHAT WAS WRONG (measured in qnfo-audit 2026-10-19 15:20Z, SELECT only)
-- v_stuck_summary.code_tasks_stalled counts code_tasks whose status is not one of ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted') and whose
-- updated_at is older than 120 minutes. 'superseded' is a terminal status (qnfo-code-orchestrator CODE_TASK_DONE, qnfo-deploy-guard, the dashboard's CODE_OUTCOME_SQL
-- reads it as "superseded (not a failure)") but it is not in that list, so every superseded task counts as a stalled queue item two hours after it ends: the view reads 5
-- now and all five are the five superseded code_tasks rows (status superseded, updated_at older than 120 minutes). That false count is part of stuck_items_over_sla
-- (255), and PARKED-TASK-ISSUE-CLOSED-1 would add seven more by moving the parked tasks of closed issues to superseded.
--
-- WHAT THIS FILE DOES
--   1. bak_20261019_stuck_summary_view keeps the live view text (the Rollback line restores it).
--   2. The view is recreated byte for byte as it is live, with one change: 'superseded' joins the terminal statuses of code_tasks_stalled.
--   3. failure mode stuck-summary-superseded-counted with detector fm-stuck-summary-superseded-counted: it reads 5 while the view text does not name 'superseded' and
--      superseded tasks older than 120 minutes exist, and 0 afterwards, whatever number the view shows.
--   4. decision_log row (append-only).

CREATE TABLE IF NOT EXISTS bak_20261019_stuck_summary_view AS
  SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'view' AND name = 'v_stuck_summary';

DROP VIEW IF EXISTS v_stuck_summary;

CREATE VIEW v_stuck_summary AS
SELECT
  (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id
     WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error,
  (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0
     AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok'
       AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled,
  (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id WHERE q.status = 'queued'
     AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-120 minutes')) AS research_queued_180m,
  (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending,
  (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact')
     AND (datetime(created_at) < datetime('now', '-120 minutes') OR COALESCE(attempts, 0) >= 3)) AS outreach_waiting,
  (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted', 'superseded')
     AND datetime(updated_at) < datetime('now', '-120 minutes')) AS code_tasks_stalled,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
     AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%')
     AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
       AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h,
  (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes'))
     THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled,
  (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id
     WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS research_held_over_sla,
  (SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = 'open' AND t.issue_id IS NULL) AS triage_gap,
  (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id
     WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND c.next_due_at IS NOT NULL
       AND datetime(c.next_due_at) > datetime('now', '+70 minutes')) AS contracts_cadence_drift,
  (SELECT COALESCE(CAST((julianday('now') - julianday(MIN(created_at))) * 1440 AS INTEGER), 0) FROM code_tasks WHERE status = 'queued') AS code_tasks_queued_oldest_min,
  (SELECT COUNT(*) FROM code_tasks WHERE status = 'ready_to_publish'
     AND julianday(updated_at) < julianday('now', '-120 minutes')) AS code_tasks_unpublished_120m;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('stuck-summary-superseded-counted',
  'a code task that ended as superseded is counted as a stalled queue item two hours later, so a finished task raises stuck_items_over_sla',
  'v_stuck_summary.code_tasks_stalled lists the terminal code_tasks statuses it ignores and left out superseded, a terminal status the loop, the deploy guard and the dashboard already use',
  'STUCK-SUMMARY-SUPERSEDED-TERMINAL-1 (migrations/2026-10-19-stuck-summary-superseded-terminal.sql): superseded joins the terminal statuses of code_tasks_stalled; the detector reads the view text and the rows',
  'no superseded code_tasks row older than 120 minutes exists while the view text does not name superseded',
  'fm-stuck-summary-superseded-counted', '2026-10-19', NULL,
  'a code task ends as superseded and the view still counts it',
  'v_stuck_summary.code_tasks_stalled equals the number of superseded tasks older than 120 minutes (5 on 2026-10-19) and stuck_items_over_sla carries them',
  'stuck_items_over_sla, the queue SLA tick and the stuck views; no merge or deploy is affected');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-stuck-summary-superseded-counted', NULL, 'STUCK-SUMMARY-SUPERSEDED-TERMINAL-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''superseded'' AND datetime(updated_at) < datetime(''now'', ''-120 minutes'') AND instr((SELECT sql FROM sqlite_master WHERE name = ''v_stuck_summary''), ''''''superseded'''''') = 0) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a terminal task status is terminal in every view that counts stalled work',
  'STUCK-SUMMARY-SUPERSEDED-TERMINAL-1: v_stuck_summary.code_tasks_stalled stops counting superseded code tasks (recreated byte for byte with one status added); detector fm-stuck-summary-superseded-counted',
  'qnfo-audit 2026-10-19 15:20Z: v_stuck_summary.code_tasks_stalled = 5 and code_tasks has exactly 5 rows with status superseded older than 120 minutes; CODE_TASK_DONE and CODE_OUTCOME_SQL treat superseded as terminal; session_01QpQv19 review of PARKED-TASK-ISSUE-CLOSED-1 named the trade',
  'migration merged', 'one view (v_stuck_summary, code_tasks_stalled column only), one failure mode and detector; stuck_items_over_sla falls by the superseded tasks it counted',
  'bak_20261019_stuck_summary_view and the Rollback header restore the old view text; the decision row stays (append-only)',
  'a finished code task no longer counts as a stalled queue item',
  'stuck_items_over_sla <= 250 within 2 h',
  'none',
  'd1:qnfo-audit sqlite_master and code_tasks (SELECT only); offline node:sqlite suite migrations/stuck-summary-superseded-terminal.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'STUCK-SUMMARY-SUPERSEDED-TERMINAL-1:') = 1);

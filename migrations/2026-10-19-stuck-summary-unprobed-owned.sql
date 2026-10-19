-- UNPROBED-OWNED-1 (2026-10-19, charter pillar autonomy; METRIC-TRIGGER-3060 issues_unprobed_60m; QUEUE-SLA-1; a double count in v_stuck_summary)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_stuck_summary_view_unprobed
-- Rollback: DROP VIEW IF EXISTS v_stuck_summary; CREATE VIEW v_stuck_summary AS SELECT (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error, (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0 AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled, (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id WHERE q.status = 'queued' AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-120 minutes')) AS research_queued_180m, (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending, (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact') AND (datetime(created_at) < datetime('now', '-120 minutes') OR COALESCE(attempts, 0) >= 3)) AS outreach_waiting, (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted', 'superseded') AND datetime(updated_at) < datetime('now', '-120 minutes')) AS code_tasks_stalled, (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m, (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000 AND COALESCE(a.description, '') NOT LIKE '%code-task:%' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%') AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h, (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled, (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS research_held_over_sla, (SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = 'open' AND t.issue_id IS NULL) AS triage_gap, (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND c.next_due_at IS NOT NULL AND datetime(c.next_due_at) > datetime('now', '+70 minutes')) AS contracts_cadence_drift, (SELECT COALESCE(CAST((julianday('now') - julianday(MIN(created_at))) * 1440 AS INTEGER), 0) FROM code_tasks WHERE status = 'queued') AS code_tasks_queued_oldest_min, (SELECT COUNT(*) FROM code_tasks WHERE status = 'ready_to_publish' AND julianday(updated_at) < julianday('now', '-120 minutes')) AS code_tasks_unpublished_120m; DELETE FROM remediation_contracts WHERE class = 'fm-unprobed-counts-owned-issues'; DELETE FROM failure_modes WHERE fm_key = 'unprobed-counts-owned-issues'
-- Rollback scope: the view only (the Rollback line restores it as migrations/2026-10-19-stuck-summary-superseded-terminal.sql leaves it) and the registry rows; the decision_log row stays (append-only).
-- ORDER: this file sorts after migrations/2026-10-19-stuck-summary-superseded-terminal.sql and recreates the same view with that file's 'superseded' terminal status kept, plus the one change below.
-- spof-review: none added. The view is read by the queue SLA tick and the metrics stuck_items_over_sla (which excludes this column) and issues_unprobed_60m; the detector fm-unprobed-counts-owned-issues is the second path.
--
-- MEASURED (qnfo-audit 2026-10-19 15:42Z, SELECT only). issues_unprobed_60m reads 73 to 79 of 165 open issues against a trigger of 10. The count is "open issues with no
-- remediation_verifications row in the last 60 minutes", and a verification row is exactly what two states never write by design:
--   * 47 issues are METRIC-TRIGGER tickets whose contract is parked 'monitoring' ON PURPOSE: the trigger evaluator (TRIGGER-RECOVERY-1, qnfo-fleet-control) closes them when the metric has been
--     clear for 60 minutes, and a second probe on the same issue is the VERIFICATION-OSCILLATION-1 defect (agent_issues 2953). They are owned, not unprobed.
--   * 8 issues have an active contract whose last verdict is 'deferred' (a probe that read 'pending: <reason>'; CONSUMER-PENDING-IS-DEFERRAL-1 and DEFERRAL-NOT-A-FAILURE-1 record no row for it).
--     The probe ran (last_attempt_at within 60 minutes) and said it cannot judge yet; that is a verdict with an age, tracked by deferred_since and the 7 day escalation.
-- Re-measured with both states counted as probed: 16 of 165 remain (13 superseded contracts that have no usable probe and no doer, the v_issue_dead_end lane, and 3 inside their cycle). 16 is
-- still above the trigger of 10, so the metric still fires for the real remainder and nothing is hidden; the gap is a doer for the superseded-contract issues, not a probe.
--
-- WHAT THIS FILE DOES
--   1. bak_20261019_stuck_summary_view_unprobed keeps the live view text; the view is recreated with issues_unprobed_60m not counting an issue whose contract is monitoring, or active and deferred
--      with a probe attempt in the last 60 minutes. Every other column is as the superseded-terminal file leaves it.
--   2. failure mode unprobed-counts-owned-issues and detector fm-unprobed-counts-owned-issues (the view text must keep the monitoring exclusion: it reads 0 when it does, 1 when it does not).
--   3. one decision_log row.

CREATE TABLE IF NOT EXISTS bak_20261019_stuck_summary_view_unprobed AS
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
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts mc WHERE mc.issue_id = a.id
       AND (mc.status = 'monitoring' OR (mc.status = 'active' AND mc.last_verdict LIKE 'deferred%'
         AND datetime(mc.last_attempt_at) > datetime('now', '-60 minutes'))))) AS issues_unprobed_60m,
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
VALUES ('unprobed-counts-owned-issues',
  'issues_unprobed_60m counts an issue whose probe is owned by another evaluator or deferred by design, so the metric reads 73 to 79 for 16 real cases and the trigger cannot show what is left',
  'v_stuck_summary.issues_unprobed_60m asks only for a remediation_verifications row in 60 minutes; a contract parked monitoring (a metric ticket owned by TRIGGER-RECOVERY-1) and a deferred contract (a pending read writes no row since CONSUMER-PENDING-IS-DEFERRAL-1) never write one',
  'UNPROBED-OWNED-1 (migrations/2026-10-19-stuck-summary-unprobed-owned.sql): the column does not count an issue whose contract is monitoring or deferred with an attempt in 60 minutes',
  'v_stuck_summary text keeps the monitoring exclusion in issues_unprobed_60m',
  'fm-unprobed-counts-owned-issues', '2026-10-19', NULL,
  'a contract is parked monitoring or reads deferred',
  'issues_unprobed_60m far above the number of issues nobody checks',
  'the metric issues_unprobed_60m, its trigger 3060 and the fm-unprobed-issues detector');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-unprobed-counts-owned-issues', NULL, 'UNPROBED-OWNED-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST(CASE WHEN instr((SELECT sql FROM sqlite_master WHERE name = ''v_stuck_summary''), ''mc.status = ''''monitoring'''''') > 0 THEN 0 ELSE 1 END AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'an issue whose probe is owned by another evaluator, or deferred with a recent attempt, is checked; the metric exists to find issues nobody checks',
  'UNPROBED-OWNED-1: v_stuck_summary.issues_unprobed_60m excludes issues whose contract is monitoring, or active and deferred with an attempt in 60 minutes',
  'qnfo-audit 2026-10-19 15:42Z: 165 open issues, current definition 73 unprobed, with both states counted as probed 16; 47 are monitoring metric tickets, 8 deferred, 13 superseded contracts remain as the real gap',
  'migration merged', 'one view column; issues_unprobed_60m falls from about 75 to about 16 and stays above its trigger of 10 until the superseded-contract issues get a doer',
  'the backup table and the Rollback header restore the view',
  'the metric names the issues nobody checks',
  'issues_unprobed_60m <= 20 within 1 h',
  'none',
  'd1:qnfo-audit v_stuck_summary, remediation_contracts, remediation_verifications (SELECT only); offline node:sqlite suite migrations/detector-measurement-repairs.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'UNPROBED-OWNED-1:') = 1);

-- UNPROBED-SCHEDULED-ONLY-1 (2026-11-09, charter pillar autonomy; issue 2522 METRIC-TRIGGER-3060-ISSUES-UNPROBED-60M).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261109_stuck_summary
-- Rollback: DROP VIEW IF EXISTS v_stuck_summary; CREATE VIEW v_stuck_summary AS SELECT (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error, (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0 AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled, (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id WHERE q.status = 'queued' AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-120 minutes')) AS research_queued_180m, (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending, (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact') AND (datetime(created_at) < datetime('now', '-120 minutes') OR COALESCE(attempts, 0) >= 3)) AS outreach_waiting, (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted', 'superseded') AND datetime(updated_at) < datetime('now', '-120 minutes')) AS code_tasks_stalled, (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m, (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000 AND COALESCE(a.description, '') NOT LIKE '%code-task:%' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%') AND NOT EXISTS (SELECT 1 FROM remediation_contracts mc WHERE mc.issue_id = a.id AND mc.status = 'monitoring' AND mc.last_verdict LIKE 'monitoring:%' AND EXISTS (SELECT 1 FROM remediation_verifications mv WHERE mv.class = mc.class AND mv.verifier LIKE 'qnfo-fleet-control/monitoring-pass%' AND mv.verified_at > datetime('now', '-120 minutes'))) AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h, (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled, (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS research_held_over_sla, (SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = 'open' AND t.issue_id IS NULL) AS triage_gap, (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND c.next_due_at IS NOT NULL AND datetime(c.next_due_at) > datetime('now', '+70 minutes')) AS contracts_cadence_drift, (SELECT COALESCE(CAST((julianday('now') - julianday(MIN(created_at))) * 1440 AS INTEGER), 0) FROM code_tasks WHERE status = 'queued') AS code_tasks_queued_oldest_min, (SELECT COUNT(*) FROM code_tasks WHERE status = 'ready_to_publish' AND julianday(updated_at) < julianday('now', '-120 minutes')) AS code_tasks_unpublished_120m;
-- CAUSE-MAPPED: no metric is registered here; issues_unprobed_60m keeps its existing breach cause mapping.
-- WHY: PR 9561 (qnfo-fleet-control 0.69.3) gave the monitoring pass its own time slice; measured then, 119 superseded, 49 escalated and 22 probe-review-refused
-- contracts on open issues are unprobed by design (nothing schedules a probe for them), so the old count of every open issue without a 60 minute verification stays above 10.
-- WHAT: issues_unprobed_60m counts an open issue only when a contract meant to be probed on schedule (status active, holding or monitoring) has no verification row in 60 minutes,
-- or when the issue has no contract at all (a gap, still visible). Issues whose only contracts are superseded, escalated or probe-review-refused leave the count; they stay
-- visible in v_issue_accounting and the contract status columns.
CREATE TABLE IF NOT EXISTS bak_20261109_stuck_summary AS SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_stuck_summary';
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
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open'
     AND (EXISTS (SELECT 1 FROM remediation_contracts sc WHERE sc.issue_id = a.id AND sc.status IN ('active', 'holding', 'monitoring'))
          OR NOT EXISTS (SELECT 1 FROM remediation_contracts ac WHERE ac.issue_id = a.id))
     AND NOT EXISTS (SELECT 1 FROM remediation_verifications v
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
     AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%')
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts mc WHERE mc.issue_id = a.id AND mc.status = 'monitoring' AND mc.last_verdict LIKE 'monitoring:%'
       AND EXISTS (SELECT 1 FROM remediation_verifications mv WHERE mv.class = mc.class AND mv.verifier LIKE 'qnfo-fleet-control/monitoring-pass%'
                   AND mv.verified_at > datetime('now', '-120 minutes')))
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

UPDATE metric_registry SET formula = 'Open issues with a scheduled contract (active, holding, monitoring) or no contract, and no remediation_verifications row in the last 60 minutes. Contracts that are superseded, escalated or probe-review-refused are unprobed by design and are not counted (UNPROBED-SCHEDULED-ONLY-1).',
  last_value = CAST((SELECT issues_unprobed_60m FROM v_stuck_summary) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'issues_unprobed_60m';

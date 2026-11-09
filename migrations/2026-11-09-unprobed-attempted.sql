-- UNPROBED-ATTEMPTED-1 (2026-11-09, charter pillar autonomy; issue 2522, follow-up to UNPROBED-SCHEDULED-ONLY-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261109_stuck_summary_2
-- Rollback: DROP VIEW IF EXISTS v_stuck_summary; CREATE VIEW v_stuck_summary AS SELECT (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error, (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0 AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled, (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id WHERE q.status = 'queued' AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-120 minutes')) AS research_queued_180m, (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending, (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact') AND (datetime(created_at) < datetime('now', '-120 minutes') OR COALESCE(attempts, 0) >= 3)) AS outreach_waiting, (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted', 'superseded') AND datetime(updated_at) < datetime('now', '-120 minutes')) AS code_tasks_stalled, (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND (EXISTS (SELECT 1 FROM remediation_contracts sc WHERE sc.issue_id = a.id AND sc.status IN ('active', 'holding', 'monitoring')) OR NOT EXISTS (SELECT 1 FROM remediation_contracts ac WHERE ac.issue_id = a.id)) AND NOT EXISTS (SELECT 1 FROM remediation_verifications v WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m, (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000 AND COALESCE(a.description, '') NOT LIKE '%code-task:%' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%') AND NOT EXISTS (SELECT 1 FROM remediation_contracts mc WHERE mc.issue_id = a.id AND mc.status = 'monitoring' AND mc.last_verdict LIKE 'monitoring:%' AND EXISTS (SELECT 1 FROM remediation_verifications mv WHERE mv.class = mc.class AND mv.verifier LIKE 'qnfo-fleet-control/monitoring-pass%' AND mv.verified_at > datetime('now', '-120 minutes'))) AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h, (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled, (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS research_held_over_sla, (SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = 'open' AND t.issue_id IS NULL) AS triage_gap, (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND c.next_due_at IS NOT NULL AND datetime(c.next_due_at) > datetime('now', '+70 minutes')) AS contracts_cadence_drift, (SELECT COALESCE(CAST((julianday('now') - julianday(MIN(created_at))) * 1440 AS INTEGER), 0) FROM code_tasks WHERE status = 'queued') AS code_tasks_queued_oldest_min, (SELECT COUNT(*) FROM code_tasks WHERE status = 'ready_to_publish' AND julianday(updated_at) < julianday('now', '-120 minutes')) AS code_tasks_unpublished_120m;
-- CAUSE-MAPPED: no metric is registered here; issues_unprobed_60m keeps its existing breach cause mapping.
-- WHY (measured 2026-11-09T10:0xZ, qnfo-audit): after UNPROBED-SCHEDULED-ONLY-1 the metric read 46; 42 were active d1-query contracts whose last_verdict is 'deferred'.
-- A deferral is a probe that ran and returned 'pending' (DEFERRAL-NOT-A-FAILURE-1 writes no remediation_verifications row for it), so a metric that reads only verification rows
-- can never see them as probed. Counting an attempt as a probe gives 3 on the same data.
-- WHAT: a scheduled contract with last_attempt_at inside 60 minutes counts as probed; a contract never attempted in 60 minutes still counts.
CREATE TABLE IF NOT EXISTS bak_20261109_stuck_summary_2 AS SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_stuck_summary';
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
     WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts rc WHERE rc.issue_id = a.id AND rc.status IN ('active', 'holding', 'monitoring')
       AND rc.last_attempt_at IS NOT NULL AND datetime(rc.last_attempt_at) > datetime('now', '-60 minutes'))) AS issues_unprobed_60m,
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

UPDATE metric_registry SET formula = 'Open issues with a scheduled contract (active, holding, monitoring) or no contract, with no remediation_verifications row and no contract attempt (last_attempt_at) in the last 60 minutes. A deferred probe is an attempt and writes no verification row (UNPROBED-ATTEMPTED-1).',
  last_value = CAST((SELECT issues_unprobed_60m FROM v_stuck_summary) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'issues_unprobed_60m';

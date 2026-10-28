-- MONITORING-CONTRACT-NEXT-ACTION-1 (2026-10-28, charter pillar autonomy; cluster H, back-pressure metrics issues_unprobed_60m and issues_without_doer_3h).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261028_monitoring_views
-- Rollback: DROP VIEW IF EXISTS v_issues_no_next_action; CREATE VIEW v_issues_no_next_action AS SELECT a.id, a.priority, a.category, a.title, a.source, t.owner, a.linked_session, CAST((CAST(strftime('%s', 'now') AS INTEGER) * 1000 - a.created_at) / 3600000 AS INTEGER) AS age_h, a.created_at, a.updated_at FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding')) AND instr(COALESCE(a.description, ''), 'code-task:') = 0 AND instr(COALESCE(a.description, ''), 'session-task:') = 0 AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.status NOT IN ('merged', 'closed', 'failed', 'needs_human') AND instr(COALESCE(k.goal, ''), '[issue #' || a.id || ']') > 0) AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now')) AND NOT EXISTS (SELECT 1 FROM human_actions h WHERE h.status NOT IN ('resolved', 'dismissed') AND h.source = 'issue:' || a.id); DROP VIEW IF EXISTS v_stuck_summary; CREATE VIEW v_stuck_summary AS SELECT (SELECT COUNT(*) FROM research_queue q JOIN research_review_seen s ON s.id = q.id WHERE q.status = 'review' AND s.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) AS research_review_error, (CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN ('queued', 'researching')) > 0 AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND kind = 'done' AND status = 'ok' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes')) THEN 1 ELSE 0 END) AS research_head_stalled, (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id WHERE q.status = 'queued' AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-120 minutes')) AS research_queued_180m, (SELECT COUNT(*) FROM intents WHERE status = 'pending' AND datetime(created_at) < datetime('now', '-60 minutes')) AS intents_pending, (SELECT COUNT(*) FROM outreach_queue WHERE status IN ('needs-email', 'needs-contact') AND (datetime(created_at) < datetime('now', '-120 minutes') OR COALESCE(attempts, 0) >= 3)) AS outreach_waiting, (SELECT COUNT(*) FROM code_tasks WHERE status NOT IN ('merged', 'closed', 'publish_failed', 'needs_human', 'failed', 'reverted', 'superseded') AND datetime(updated_at) < datetime('now', '-120 minutes')) AS code_tasks_stalled, (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_verifications v WHERE v.issue_id = a.id AND v.verified_at > datetime('now', '-60 minutes'))) AS issues_unprobed_60m, (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000 AND COALESCE(a.description, '') NOT LIKE '%code-task:%' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%') AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))) AS issues_without_doer_3h, (CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = 'zenodo-exit' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN (SELECT COUNT(*) FROM zenodo_exit_ledger WHERE status = 'pending') ELSE 0 END) AS zenodo_exit_pending_stalled, (SELECT COUNT(*) FROM research_queue q JOIN research_hold_seen h ON h.id = q.id WHERE q.status = 'held' AND h.first_seen < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS research_held_over_sla, (SELECT COUNT(*) FROM agent_issues i LEFT JOIN issue_triage t ON t.issue_id = i.id WHERE i.status = 'open' AND t.issue_id IS NULL) AS triage_gap, (SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND c.next_due_at IS NOT NULL AND datetime(c.next_due_at) > datetime('now', '+70 minutes')) AS contracts_cadence_drift, (SELECT COALESCE(CAST((julianday('now') - julianday(MIN(created_at))) * 1440 AS INTEGER), 0) FROM code_tasks WHERE status = 'queued') AS code_tasks_queued_oldest_min, (SELECT COUNT(*) FROM code_tasks WHERE status = 'ready_to_publish' AND julianday(updated_at) < julianday('now', '-120 minutes')) AS code_tasks_unpublished_120m;
--
-- WHAT IS WRONG (measured 2026-10-28T19:50Z, qnfo-audit)
--   Open issues by contract status: active 155, monitoring 133 (46 parked loop-owned by LOOP-OWNED-CONTRACT-MONITORING-1, 87 metric-condition), escalated 29, probe-review-refused 7, superseded 24.
--   Every prober (remediationContractsTick, WHERE c.status IN ('active','holding')) skips a monitoring contract, so those issues never carry a verification row:
--   v_stuck_summary.issues_unprobed_60m reads 131, and v_issues_no_next_action / issues_without_doer_3h (113) count them as doer-less because both views accept only
--   active and holding contracts as a next action. The 46 loop-owned parks last_attempt_at 2026-10-19 and the metric-condition parks are owned by a loop that closes them on recovery.
--
-- WHAT THIS CHANGES (view half; the worker half is the agent_issues row filed below, because qnfo-fleet-control/worker.js was work-claimed by code task
-- ct_y463lmqqv71lgq to 21:32Z on 2026-10-28)
--   A monitoring contract of an open issue counts as a next action in v_issues_no_next_action and in issues_without_doer_3h ONLY WHEN a monitoring-pass verification row of
--   its class exists from the last 120 minutes (verifier LIKE 'qnfo-fleet-control/monitoring-pass%'). The pass is the new worker step; until it ships no row exists, so
--   nothing is hidden: the counts do not move on the view change alone. issues_unprobed_60m is NOT redefined: it falls only because the pass writes real verification rows.
--   Nothing else changes: no guard, probe, cap or contract status is touched; an active or holding contract still decides as before.
--
-- PREDICTION (decision_log row below): within 2 hours of the worker deploy issues_unprobed_60m falls from 131 to under 20 and issues_without_doer_3h falls by at least 13
-- (the 13 METRIC-REGRESSION-1 tickets with monitoring:loop-owned contracts; up to 46 loop-owned plus the metric-condition parks). If either misses, revert the worker step and this file's Rollback.
-- FAILURE MODE: the pass writes pass = 1 for a monitoring read ("the owner loop still holds it") even when the probe text says stale; the guard remediation_latest_pass_pct_7d
-- then reads those subjects as passing. The worker spec therefore stores the probe's own observed text in `observed` and keeps the 48 h stale escalation in SLA-120M-2
-- (v_issue_age, issues_open_over_120m), which read agent_issues and not these rows. If the guard worsens after deploy, the step is rolled back, not the guard.

CREATE TABLE IF NOT EXISTS bak_20261028_monitoring_views AS SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name IN ('v_issues_no_next_action', 'v_stuck_summary');

DROP VIEW IF EXISTS v_issues_no_next_action;
CREATE VIEW v_issues_no_next_action AS
SELECT a.id, a.priority, a.category, a.title, a.source, t.owner, a.linked_session,
       CAST((CAST(strftime('%s', 'now') AS INTEGER) * 1000 - a.created_at) / 3600000 AS INTEGER) AS age_h,
       a.created_at, a.updated_at
FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id
WHERE a.status = 'open'
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding'))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts mc WHERE mc.issue_id = a.id AND mc.status = 'monitoring' AND mc.last_verdict LIKE 'monitoring:%'
                  AND EXISTS (SELECT 1 FROM remediation_verifications mv WHERE mv.class = mc.class AND mv.verifier LIKE 'qnfo-fleet-control/monitoring-pass%'
                              AND mv.verified_at > datetime('now', '-120 minutes')))
  AND instr(COALESCE(a.description, ''), 'code-task:') = 0
  AND instr(COALESCE(a.description, ''), 'session-task:') = 0
  AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.status NOT IN ('merged', 'closed', 'failed', 'needs_human')
                  AND instr(COALESCE(k.goal, ''), '[issue #' || a.id || ']') > 0)
  AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
                  AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  AND NOT EXISTS (SELECT 1 FROM human_actions h WHERE h.status NOT IN ('resolved', 'dismissed') AND h.source = 'issue:' || a.id);

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

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'MONITORING-PASS-1: probe monitoring contracts of open issues hourly so they carry a verification row',
 'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js
code-anchor: WHERE c.status IN (''active'', ''holding'') AND c.verify_transport IN (''d1-query'', ''d1-query@portfolio-state'', ''external-https'') AND (c.next_due_at IS NULL OR datetime(c.next_due_at) <= datetime(''now'')) ORDER BY COALESCE(c.next_due_at, c.ts) LIMIT 150
Charter pillar: autonomy. Metric: issues_unprobed_60m 131 to under 20 and issues_without_doer_3h down by at least 13 within 2 hours of deploy (migrations/2026-10-28-monitoring-contract-next-action.sql carries the view half and the decision_log row). Change: in remediationContractsTick add a separate limited pass after the main loop (at most 60 contracts per tick, own LIMIT, so the 150 active/holding slots are not shared): select contracts with status = ''monitoring'' of OPEN issues, transport d1-query, whose newest remediation_verifications row is older than 55 minutes; run the stored probe exactly as the main loop does (same read-only guard, rtSinkGuard, budget check); write one remediation_verifications row with verifier ''qnfo-fleet-control/monitoring-pass@'' || VERSION, the probe''s own expected and observed text, pass = 1 when the probe ran without error (the owning loop still holds the issue) and pass = 0 only on a probe error; set last_attempt_at. It must NOT change contract status, set last_verdict, close, reopen, supersede or escalate anything, and must NOT run for a closed issue. Failure mode: pass = 1 on a stale read could flatter remediation_latest_pass_pct_7d, so observed carries the probe text and the 48 h stale escalation stays in SLA-120M-2; if that guard or any other guard worsens within 7 days, roll the step back. Done: a test in qnfo-fleet-control proves the pass never mutates a contract status and respects its own limit; bump VERSION by a minor (new capability) and keep deployed-current.worker.js identical.',
 'session', 'reliability', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'MONITORING-PASS-1:%' AND status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-cluster-h-monitoring', 'a monitoring contract with a fresh loop-owned verification is a next action; the metrics fell only because nobody probed them, not because they were healthy',
 'views v_issues_no_next_action and v_stuck_summary.issues_without_doer_3h accept a monitoring contract with a monitoring-pass verification from the last 120 minutes; worker step filed as MONITORING-PASS-1 (code-task)',
 'qnfo-audit 2026-10-28T19:50Z: issues_unprobed_60m 131, issues_without_doer_3h 113, open issues with monitoring contract 133 (46 loop-owned, 87 metric-condition); work-locks: qnfo-fleet-control/worker.js held by ct_y463lmqqv71lgq to 21:32Z',
 'view change alone moves nothing (no monitoring-pass rows exist); worker step pending',
 'two stuck-summary views; no guard, probe, cap or contract status changed',
 'Rollback line of migrations/2026-10-28-monitoring-contract-next-action.sql restores both views; the worker step is reverted by the canary or by a revert PR',
 'monitoring contracts carry a verification and count as a doer without hiding unprobed issues',
 'after the worker deploy, within 2 hours: issues_unprobed_60m 131 to under 20; issues_without_doer_3h down by at least 13; no guard (remediation_latest_pass_pct_7d, issue_wontfix_share_7d) worse',
 'autonomy: back-pressure metrics fall from real probing', 'offline test migrations/monitoring-contract-next-action.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'session-cluster-h-monitoring' AND action LIKE 'views v_issues_no_next_action%');

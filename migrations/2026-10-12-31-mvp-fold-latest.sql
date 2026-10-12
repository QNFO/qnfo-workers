-- MVP-FOLD-LATEST-1 (2026-10-12, agent_issues 2259, charter pillar core; qnfo-fleet-control 0.18.1). The charter loop's MVP fold map
-- read "the latest worker_removals row per worker, when it is a fold". The D1 trigger worker_removals_from_live_audit appends an
-- OBSERVED-REMOVED row the first time a folded script reads NOT_DEPLOYED (row 66 for qnfo-paper-reviser, 2026-10-09 18:47Z, after
-- fold row 41 of 2026-10-06), so six folds left the map (qnfo-fleet-calibrator, qnfo-register-guard, ai-health-prober,
-- qnfo-email-orchestrator, qnfo-paper-reviser, qnfo-backlog-exec) and CHARTER-MVP-DOWN-1: qnfo-paper-reviser (2259) was filed while its
-- host qnfo-research-exec served (worker_live_audit SYNC). 0.18.1 reads the latest FOLD row per worker and lets only a later
-- RESURRECTED / RESTORED / UNFOLDED / REDEPLOYED row end the fold. This file registers the failure mode with its detector, gives 2259
-- a probe on the live measurement (the latest charter snapshot reports the reviser through its host), and logs the decision.
-- Rollback restores nothing in worker_removals (nothing there is changed).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM failure_modes WHERE fm_key = 'mvp-fold-hidden-by-later-row'; DELETE FROM remediation_contracts WHERE class = 'fm-mvp-fold-hidden-by-later-row'; UPDATE remediation_contracts SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 2259) <> ''open'' THEN ''ok'' ELSE ''open'' END AS observed' WHERE class = 'issue-2259'

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('mvp-fold-hidden-by-later-row', 'a folded MVP component is judged NOT_DEPLOYED although its host serves',
  'the fold map took the latest worker_removals row per worker and required it to be a fold; the live-audit trigger appends OBSERVED-REMOVED after the fold once the script is deleted',
  'qnfo-fleet-control 0.18.1 MVP-FOLD-LATEST-1: the latest fold row per worker, ended only by a later resurrection row; this detector files the mode when an open CHARTER-MVP-DOWN-1 names a folded worker',
  'no open CHARTER-MVP-DOWN-1 issue names a worker that has a fold row with a host', 'fm-mvp-fold-hidden-by-later-row', '2026-10-09', 2259,
  'a worker_removals row of any other action lands after a fold row for the same worker',
  'CHARTER-MVP-DOWN-1: <worker> open while worker_live_audit shows the fold host SYNC; charter_snapshots.mvp_up one short; the charter MVP table reads NOT_DEPLOYED for the component',
  'one MVP row and one false issue per folded component; personal_mvp_serving and the charter health figure undercount');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-mvp-fold-hidden-by-later-row', NULL, 'qnfo-fleet-control >= 0.18.1 live', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND a.title LIKE ''CHARTER-MVP-DOWN-1: %'' AND EXISTS (SELECT 1 FROM worker_removals r WHERE r.worker = substr(a.title, 21) AND lower(coalesce(r.action, '''')) IN (''folded'', ''fold'') AND coalesce(r.target, '''') <> '''')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

-- 2259 closes on the live measurement: the latest daily charter snapshot reports qnfo-paper-reviser through its host (FOLDED:qnfo-research-exec/<host note>, up true),
-- or the issue is already closed. Until a snapshot taken by 0.18.1 or later exists the probe reads pending (the loop runs at 03:00Z).
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''folded-serving'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 2259) <> ''open'' THEN ''folded-serving'' WHEN (SELECT COUNT(*) FROM charter_snapshots WHERE ts > ''2026-10-12T13:00:00Z'' AND worker_version NOT LIKE ''0.17.%'' AND worker_version NOT LIKE ''0.18.0%'') = 0 THEN ''pending: no charter snapshot from 0.18.1 yet'' WHEN instr((SELECT state_json FROM charter_snapshots ORDER BY id DESC LIMIT 1), ''"worker":"qnfo-paper-reviser","pillar":"research","role":"adversarial revision loop","note":"FOLDED:qnfo-research-exec/'') > 0 THEN ''folded-serving'' ELSE ''not-deployed'' END AS observed',
  verify_transport = 'd1-query', status = 'active', precondition = 'qnfo-fleet-control 0.18.1 MVP-FOLD-LATEST-1 deployed; daily charter tick at 03:00Z'
WHERE class = 'issue-2259';

INSERT INTO decision_log (ts, actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'session_01Kddqwk5gQT5qSSHVKjT2EA',
  'a fold ends only when the worker is put back in service, never when its deleted script is observed gone',
  'MVP-FOLD-LATEST-1: fix the charter fold map in qnfo-fleet-control 0.18.1 (latest fold row per worker) instead of repairing worker_removals by hand',
  'worker_removals 41 (folded -> qnfo-research-exec) then 66 (OBSERVED-REMOVED) for qnfo-paper-reviser; the same shape for qnfo-fleet-calibrator, qnfo-register-guard, ai-health-prober, qnfo-email-orchestrator, qnfo-backlog-exec; worker_live_audit qnfo-research-exec SYNC while 2259 was open',
  'pending: the first 03:00Z charter tick after the deploy',
  'the charter MVP table and CHARTER-MVP-DOWN-1 filing; no data changed',
  'revert the pull request (one SQL constant and its use) through the canonical path; the 0.4.129 query is kept in charter.test.mjs for the record',
  'the charter MVP table survives the deletion of a folded script',
  'the 03:00Z charter tick after the deploy reports qnfo-paper-reviser FOLDED:qnfo-research-exec/SYNC, mvp_up rises by one, 2259 closes on its probe and no CHARTER-MVP-DOWN-1 is refiled for a folded worker',
  '0', 'D1 worker_removals (the six hidden folds listed), fleet-control source (charterMvpStatus, charterFacts), charter.test.mjs replay of both queries'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'MVP-FOLD-LATEST-1:%');

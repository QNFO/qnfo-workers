-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition=b.definition, version=b.version, updated_at=b.updated_at FROM bak_20261025_portfolio_gap_task b WHERE fleet_tasks.id=b.id; UPDATE fleet_tasks_canonical SET definition=b.definition, repo_path=b.repo_path, exported_at=b.exported_at FROM bak_20261025_portfolio_gap_canon b WHERE fleet_tasks_canonical.id=b.id;
-- PORTFOLIO-GAP-CLOSE-EVIDENCE-1. Charter pillar: autonomy. Issue 1000208 / GitHub #4107.
-- The final task step closed upgrade issues without issue_triage.close_evidence, so the existing guard aborted it.
-- Keep that guard intact. Record the latest passing compatibility measurement before closing, and require it again
-- at closure. A historical verified roadmap row alone is not evidence of current compatibility.
-- No issue is closed by this migration. The hourly task and the issue's existing cron-fault contract remain the doers.
-- spof-review: none added; fleet-exec executes the task, and both remediation runners evaluate its fault contract.

SELECT json('PORTFOLIO-GAP-CLOSE-EVIDENCE-1: live task or canonical definition drifted')
WHERE NOT EXISTS (
  SELECT 1 FROM fleet_tasks t JOIN fleet_tasks_canonical c ON c.id=t.id
  WHERE t.id='portfolio-gap-action' AND json_valid(t.definition) AND t.definition=c.definition
    AND (instr(t.definition, 'PORTFOLIO-GAP-CLOSE-EVIDENCE-1') > 0 OR
      (json_array_length(t.definition, '$.steps')=8
       AND json_extract(t.definition, '$.steps[7].sql') =
         'UPDATE agent_issues SET status=''closed'', updated_at=CAST(strftime(''%s'',''now'') AS INTEGER)*1000
   WHERE title LIKE ''PORTFOLIO-UPGRADE-1: %'' AND status=''open''
     AND EXISTS (SELECT 1 FROM roadmap_implementation r WHERE r.item=''UPG-''||substr(agent_issues.title, length(''PORTFOLIO-UPGRADE-1: advance compat_date for '')+1) AND r.status=''verified'')'))
);

CREATE TABLE IF NOT EXISTS bak_20261025_portfolio_gap_task AS SELECT * FROM fleet_tasks WHERE id='portfolio-gap-action';
CREATE TABLE IF NOT EXISTS bak_20261025_portfolio_gap_canon AS SELECT * FROM fleet_tasks_canonical WHERE id='portfolio-gap-action';

UPDATE fleet_tasks SET definition=json_insert(
  json_set(definition, '$.steps[7].sql',
    'INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, ''verified-compatibility'', ''triaged'', ''portfolio-gap-action'', datetime(''now''),
       ''PORTFOLIO-GAP-CLOSE-EVIDENCE-1: worker=''||w.worker||'' checked_at=''||w.checked_at||
       '' live_date=''||w.live_date||'' days_behind=''||w.days_behind||'' roadmap=''||r.item||
       '' verified_at=''||r.verified_at
FROM agent_issues a
JOIN worker_compat_state w ON a.title=''PORTFOLIO-UPGRADE-1: advance compat_date for ''||w.worker
JOIN roadmap_implementation r ON r.item=''UPG-''||w.worker AND r.status=''verified''
WHERE a.status=''open''
  AND w.checked_at=(SELECT MAX(w2.checked_at) FROM worker_compat_state w2 WHERE w2.worker=w.worker)
  AND typeof(w.days_behind) IN (''integer'',''real'') AND w.days_behind>=0 AND w.days_behind<30
  AND datetime(w.checked_at) BETWEEN datetime(''now'',''-120 minutes'') AND datetime(''now'')
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id=a.id AND c.status IN (''active'',''holding'')
    AND COALESCE(c.last_verdict,'''') IN (''fail'',''vacuous-probe-result'',''probe-error'',''probe-not-machine-executable'',''probe-same-account-host''))
ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence'),
  '$.steps[#]', json_object('type','sql','db','AUDIT','sql',
    'UPDATE agent_issues SET status=''closed'', close_channel=''auto:portfolio-gap-action'',
  updated_at=CAST(strftime(''%s'',''now'') AS INTEGER)*1000
WHERE status=''open'' AND EXISTS (
  SELECT 1 FROM worker_compat_state w
  JOIN roadmap_implementation r ON r.item=''UPG-''||w.worker AND r.status=''verified''
  JOIN issue_triage t ON t.issue_id=agent_issues.id
  WHERE agent_issues.title=''PORTFOLIO-UPGRADE-1: advance compat_date for ''||w.worker
    AND w.checked_at=(SELECT MAX(w2.checked_at) FROM worker_compat_state w2 WHERE w2.worker=w.worker)
    AND typeof(w.days_behind) IN (''integer'',''real'') AND w.days_behind>=0 AND w.days_behind<30
    AND datetime(w.checked_at) BETWEEN datetime(''now'',''-120 minutes'') AND datetime(''now'')
    AND t.close_evidence=''PORTFOLIO-GAP-CLOSE-EVIDENCE-1: worker=''||w.worker||'' checked_at=''||w.checked_at||
      '' live_date=''||w.live_date||'' days_behind=''||w.days_behind||'' roadmap=''||r.item||'' verified_at=''||r.verified_at)
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id=agent_issues.id AND c.status IN (''active'',''holding'')
    AND COALESCE(c.last_verdict,'''') IN (''fail'',''vacuous-probe-result'',''probe-error'',''probe-not-machine-executable'',''probe-same-account-host''))')),
  version=version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id='portfolio-gap-action' AND instr(definition,'PORTFOLIO-GAP-CLOSE-EVIDENCE-1')=0;

UPDATE fleet_tasks_canonical SET definition=(SELECT definition FROM fleet_tasks WHERE id='portfolio-gap-action'),
  repo_path='migrations/2026-10-25-portfolio-gap-close-evidence.sql', exported_at=datetime('now')
WHERE id='portfolio-gap-action'
  AND definition<>(SELECT definition FROM fleet_tasks WHERE id='portfolio-gap-action');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('portfolio-gap-close-without-evidence', 'portfolio-gap-action aborts on upgrade issue closure',
  'The final SQL step relied on a verified roadmap row but never wrote issue_triage.close_evidence',
  'PORTFOLIO-GAP-CLOSE-EVIDENCE-1 writes fresh compatibility evidence before closure and rechecks the measurement and failing-contract veto',
  'fm-portfolio-gap-close-without-evidence', 'fm-portfolio-gap-close-without-evidence', '2026-10-25', 1000208,
  'An upgrade becomes verified while its matching issue remains open', 'D1_ERROR: close-without-evidence',
  'portfolio-gap-action hourly task and portfolio upgrade issue lifecycle');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to, module)
VALUES ('fm-portfolio-gap-close-without-evidence', NULL,
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM v_cron_faults WHERE fault_key=''task-failed:portfolio-gap-action''',
  'd1-query', 3, 1, 'active', 'PORTFOLIO-GAP-CLOSE-EVIDENCE-1', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('portfolio-upgrade-evidence-before-close', 'PORTFOLIO-GAP-CLOSE-EVIDENCE-1',
  'worker_compat_state, roadmap_implementation, existing close-evidence and contract guards',
  'migrations/portfolio-gap-close-evidence.test.mjs; hourly fm-portfolio-gap-close-without-evidence',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL,
  'Upgrade issues close only after a fresh latest compatibility measurement is persisted as close_evidence; unsupported and failed probes stay open');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('issue_close_evidence_required', 'qnfo-audit trigger issue_close_evidence_required', 'guard',
  'Issue closure without evidence or while an active contract fails', 0, 'keep', 'applied',
  'Evidence-first portfolio task writer; existing independent remediation runners can close on a passing contract',
  strftime('%Y-%m-%dT%H:%M:%SZ','now'),
  'PORTFOLIO-GAP-CLOSE-EVIDENCE-1 regression reproduces the rejected close and permits the evidence-first close without altering the trigger',
  1000208, strftime('%Y-%m-%dT%H:%M:%SZ','now'));
UPDATE control_registry SET disposition='keep', disposition_state='applied',
  evidence='PORTFOLIO-GAP-CLOSE-EVIDENCE-1: preserved unchanged; evidence-first close tested with the original guard and failing-contract veto',
  reviewed_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE control='issue_close_evidence_required';

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES ('portfolio-gap-close-evidence', 'The portfolio task must persist compatibility evidence before attempting upgrade issue closure',
  1.0, 'Live close-without-evidence fault reproduced by migrations/portfolio-gap-close-evidence.test.mjs; evidence-first replay passes',
  'belief-portfolio-gap-close-evidence', 'Existing close-evidence trigger and latest worker_compat_state measurement');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to, module)
VALUES ('belief-portfolio-gap-close-evidence', NULL,
  'SELECT ''1'' AS expected, CASE WHEN instr(json_extract(definition,''$.steps[7].sql''),''INSERT INTO issue_triage'')=1 AND instr(json_extract(definition,''$.steps[8].sql''),''t.close_evidence='')>0 THEN ''1'' ELSE ''0'' END AS observed FROM fleet_tasks WHERE id=''portfolio-gap-action''',
  'd1-query', 3, 1, 'active', 'PORTFOLIO-GAP-CLOSE-EVIDENCE-1', 'belief probe', 'qnfo-fleet-control', 'belief');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT '1ec4aedf-d2ce-4291-88c0-f8e03d455d3a',
  'A verified roadmap row is insufficient without a fresh latest compatibility measurement; the D1 close guard is correct',
  'PORTFOLIO-GAP-CLOSE-EVIDENCE-1: repair the task writer rather than weaken the close guard',
  'Live task version 3 and v_cron_faults read 2026-10-25: three close-without-evidence failures; SQLite regression replays the task with the close guard',
  'migration installed; runtime verdict belongs to the existing fault contract',
  'portfolio-gap-action final SQL steps and canonical definition only; no worker, binding, cron or guard changes',
  'Restore task and canonical definitions from bak_20261025_portfolio_gap_task and bak_20261025_portfolio_gap_canon using the Rollback header',
  'portfolio-upgrade-evidence-before-close',
  'Next hourly task succeeds and task-failed:portfolio-gap-action leaves v_cron_faults without a manual issue close',
  'none', 'D1 task, canonical definition, close triggers, cron fault view; offline SQLite replay'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PORTFOLIO-GAP-CLOSE-EVIDENCE-1:%');

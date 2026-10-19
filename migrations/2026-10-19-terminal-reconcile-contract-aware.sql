-- TERMINAL-RECONCILE-CONTRACT-AWARE-1 (2026-10-19, charter pillar: autonomy; CRON-FAULT-1 issue 100152, doctrine CLOSE-BINDS-TO-PROBE-1).
-- fleet task code-loop-terminal-reconcile (every 10 minutes) closes CODE-LOOP-EXHAUSTED-1 issues whose code task reached merged: it upserts
-- issue_triage with triage_state 'resolved', and the AFTER UPDATE trigger triage_close_sync_resolved_upd then sets the issue closed. The BEFORE
-- trigger issue_close_evidence_required refuses a close while the issue's own contract reads fail (CLOSE-BINDS-TO-PROBE-1), and the abort
-- unwinds the whole INSERT: since 2026-10-19 11:50Z every run failed ("D1_ERROR: close-while-contract-fails", 5 in a row, cron-watch issue
-- 100152) because ONE issue, 100089 (code task ct_im99937 merged, contract active/fail), matched, and every other exhausted issue whose
-- task merged waited behind it. The contract is the authority on whether the defect is gone, so the task now skips an issue whose contract
-- reads one of the five verdicts the close trigger refuses; the issue stays open and the contract closes it when its probe passes.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT b.definition FROM bak_20261019_terminal_reconcile_task b WHERE b.id = 'code-loop-terminal-reconcile'), version = (SELECT b.version FROM bak_20261019_terminal_reconcile_task b WHERE b.id = 'code-loop-terminal-reconcile') WHERE id = 'code-loop-terminal-reconcile'; UPDATE fleet_tasks_canonical SET definition = (SELECT b.definition FROM bak_20261019_terminal_reconcile_task b WHERE b.id = 'code-loop-terminal-reconcile') WHERE id = 'code-loop-terminal-reconcile'; DELETE FROM remediation_contracts WHERE class = 'fm-terminal-reconcile-contract-abort'; DELETE FROM failure_modes WHERE fm_key = 'terminal-reconcile-contract-abort'
-- BACKUP: bak_20261019_terminal_reconcile_task

CREATE TABLE IF NOT EXISTS bak_20261019_terminal_reconcile_task AS SELECT * FROM fleet_tasks WHERE id = 'code-loop-terminal-reconcile';

UPDATE fleet_tasks SET
  definition = json_set(definition, '$.steps[0].sql', replace(json_extract(definition, '$.steps[0].sql'),
      'AND t.status=''merged'' ON CONFLICT(issue_id)',
      'AND t.status=''merged'' /* TERMINAL-RECONCILE-CONTRACT-AWARE-1 */ AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''active'',''holding'') AND COALESCE(c.last_verdict,'''') IN (''fail'',''vacuous-probe-result'',''probe-error'',''probe-not-machine-executable'',''probe-same-account-host'')) ON CONFLICT(issue_id)')),
  version = version + 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'code-loop-terminal-reconcile' AND json_array_length(definition, '$.steps') = 1
  AND instr(definition, 'TERMINAL-RECONCILE-CONTRACT-AWARE-1') = 0
  AND instr(json_extract(definition, '$.steps[0].sql'), 'AND t.status=''merged'' ON CONFLICT(issue_id)') > 0;

UPDATE fleet_tasks_canonical SET
  definition = (SELECT t.definition FROM fleet_tasks t WHERE t.id = 'code-loop-terminal-reconcile'),
  repo_path = 'migrations/2026-10-19-terminal-reconcile-contract-aware.sql',
  exported_at = datetime('now')
WHERE id = 'code-loop-terminal-reconcile'
  AND definition = (SELECT b.definition FROM bak_20261019_terminal_reconcile_task b WHERE b.id = 'code-loop-terminal-reconcile')
  AND instr((SELECT t.definition FROM fleet_tasks t WHERE t.id = 'code-loop-terminal-reconcile'), 'TERMINAL-RECONCILE-CONTRACT-AWARE-1') > 0;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('terminal-reconcile-contract-abort',
   'a fleet task that closes issues through issue_triage runs into the close-while-contract-fails trigger for one issue and every run fails, so no issue behind it is ever closed',
   'code-loop-terminal-reconcile resolved every exhausted-issue whose code task merged without asking the issue contract; CLOSE-BINDS-TO-PROBE-1 aborts the close of an issue whose contract reads fail and the abort unwinds the whole INSERT',
   'TERMINAL-RECONCILE-CONTRACT-AWARE-1: the task skips an issue whose contract reads a verdict the close trigger refuses; the contract closes it when its probe passes',
   'fm-terminal-reconcile-contract-abort: runs of code-loop-terminal-reconcile that failed with close-while-contract-fails in the last 60 minutes (zero while the task skips such issues)',
   'fm-terminal-reconcile-contract-abort', '2026-10-19T11:50:51Z', 100152,
   'a CODE-LOOP-EXHAUSTED-1 issue whose code task merged but whose own contract still reads fail',
   'cron-watch CRON-FAULT-1: task-failed:code-loop-terminal-reconcile, D1_ERROR close-while-contract-fails, three or more runs in a row',
   'every exhausted-issue behind the failing one stays open past its reconcile, and cron-watch raises a fault every cycle');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
  ('fm-terminal-reconcile-contract-abort', NULL, 'TERMINAL-RECONCILE-CONTRACT-AWARE-1', 'failure-mode detector',
   'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM fleet_runs WHERE task_id = ''code-loop-terminal-reconcile'' AND status = ''failed'' AND instr(COALESCE(error, ''''), ''close-while-contract-fails'') > 0 AND started_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) AS TEXT) AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

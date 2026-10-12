-- REGISTER-TERMINAL-DISPOSITION-1 (2026-10-12, pillar autonomy; owner directive 2026-10-12 "audit, fix, resolve, and remediate
-- all permanently, automatically, and 100% autonomously"). qnfo-fleet-control's register scan files a fleet_improvements row for
-- every task_dod_register row that is open with a past due date, and fi-executor re-scopes each one into an agent_issue whose
-- only probe is "the filing loop closed it in 48 h". The register rows were never given a terminal state, so the same rows were
-- re-proposed within minutes of each resolution (row 362: improvement 1683 resolved 04:00:55Z, 3125 proposed 04:02:08Z) and nine
-- issues sat stale. Each row was checked live on 2026-10-12 and now carries its terminal state with that evidence; the issues
-- that mirror them, and five older fi-executor issues checked the same way, are closed with it. Issue 2174's probe waited for a
-- non-owner re-entry that current traffic never supplies; it now measures the defect itself. Rows 328, 331, 341 and 345 and
-- issues 2294-2297 are left to REGISTER-DISPOSITIONS-1 (PR 965, migrations/2026-10-12-24-register-dispositions.sql).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-register-row-reescalated'; DELETE FROM failure_modes WHERE fm_key = 'register-row-reescalated'; UPDATE task_dod_register SET status = 'open' WHERE id IN (333,342,362,363,365,385); UPDATE task_dod_register SET status = 'in_progress' WHERE id IN (277, 280); -- issues: reopen by setting issue_triage.triage_state back to its prior value; issue-2174 probe: restore from git history

-- 1. Register rows, each with the live evidence read on 2026-10-12.
UPDATE task_dod_register SET status = 'done', updated_at = datetime('now'), evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-TERMINAL-DISPOSITION-1 2026-10-12: items 1-3 marked DONE in the dod; item 4 met, qnfo-ops/scripts/router_calibrate.py is on main (commit 4b204df2)' WHERE id = 333 AND status = 'open';
UPDATE task_dod_register SET status = 'done', updated_at = datetime('now'), evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-TERMINAL-DISPOSITION-1 2026-10-12: capability_audit_snapshot 31 of 31 services carry non-empty capabilities and limitations (latest 2026-10-12T05:30Z), up from 2 of 32' WHERE id = 342 AND status = 'open';
UPDATE task_dod_register SET status = 'done', updated_at = datetime('now'), evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-TERMINAL-DISPOSITION-1 2026-10-12: the dod lists six completed steps with their evidence; the audit now runs itself (fleet-autoaudit, issue #52 closed with 0 findings)' WHERE id = 362 AND status = 'open';
UPDATE task_dod_register SET status = 'done', updated_at = datetime('now'), evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-TERMINAL-DISPOSITION-1 2026-10-12: the dod lists seven completed steps with commits 9743cef and 2c0a4f2; fleet_budget workers 28 (cap 30)' WHERE id = 363 AND status = 'open';
UPDATE task_dod_register SET status = 'done', updated_at = datetime('now'), evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-TERMINAL-DISPOSITION-1 2026-10-12: fleet_budget.current workers 28 <= 30; cron_schedules 50 within the re-baselined cap 50' WHERE id = 365 AND status = 'open';
UPDATE task_dod_register SET status = 'closed', updated_at = datetime('now'), evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-TERMINAL-DISPOSITION-1 2026-10-12: superseded by #2273 (NO-ZENODO-DOI-0); the gate was already satisfied and the residual is the Zenodo-only zenodo_doi field' WHERE id = 385 AND status = 'open';
UPDATE task_dod_register SET status = 'closed', updated_at = datetime('now'), evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-TERMINAL-DISPOSITION-1 2026-10-12: superseded by #2273 (NO-ZENODO-DOI-0): no new Zenodo versions are deposited' WHERE id = 280 AND status = 'in_progress';

UPDATE task_dod_register SET status = 'done', updated_at = datetime('now'), evidence_pointer = COALESCE(evidence_pointer, '') || ' | REGISTER-TERMINAL-DISPOSITION-1 2026-10-12: personal-api generateProactiveSignals filters every candidate through eventRecGuard/eventRecAllowed (standing filters, excluded topics, energy budget) before insert; 6 of 7 event_suggestion signals since 2026-10-01 carry profile_guard (latest 2026-10-11)' WHERE id = 277 AND status = 'in_progress';

-- 2. The open improvements that mirror them, so fi-executor stops re-scoping them.
UPDATE fleet_improvements SET status = 'resolved', updated_at = datetime('now')
WHERE status IN ('proposed', 'approved', 'in_progress')
  AND (detail LIKE '%[register:333]%'
    OR detail LIKE '%[register:342]%' OR detail LIKE '%[register:362]%' OR detail LIKE '%[register:363]%'
    OR detail LIKE '%[register:365]%' OR detail LIKE '%[register:277]%' OR detail LIKE '%[register:280]%' OR detail LIKE '%[register:385]%' OR detail LIKE '%[register:391]%');
UPDATE fleet_improvements SET status = 'resolved', updated_at = datetime('now') WHERE id IN (1024, 1036, 1115, 1567, 1581) AND status IN ('proposed', 'approved', 'in_progress');

-- 3. The issues, closed with the same evidence.
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'register row 391 is closed (backlog-exec mirror reconciliation, source issue terminal); live read 2026-10-12 (REGISTER-TERMINAL-DISPOSITION-1)' WHERE issue_id = 2208;
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'register row 333 done: dod items 1-3 DONE, item 4 met by qnfo-ops/scripts/router_calibrate.py on main (4b204df2)' WHERE issue_id = 2331;
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'register row 362 done: six completed steps in its dod; the fleet audit runs itself (fleet-autoaudit, #52 closed with 0 findings, live 2026-10-12)' WHERE issue_id = 2332;
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'register row 363 done: seven completed steps (9743cef, 2c0a4f2); fleet_budget workers 28 of cap 30 (live read 2026-10-12)' WHERE issue_id = 2333;
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'superseded by #2273 (NO-ZENODO-DOI-0): register row 385 residual is the Zenodo-only zenodo_doi field; the link-integrity gate was already satisfied' WHERE issue_id = 2334;
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'superseded by SELFHEAL-RATE-OR-ABSOLUTE-1 (issue 1165, qnfo-ops): the self-heal gate files on failure rate with its success denominator (>= 15%) or >= 25 errors, and auto-resolves on the same predicate; live read 2026-10-12: 1 selfheal ledger row since 2026-10-03, 0 unresolved' WHERE issue_id = 2144;
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'superseded by ENSEMBLE-POLICY-1 rule 6: error correlation is measured on task-level verdicts (q08-signal.q08_reader_tests, 125 judged reads) as q08_panel_effective_votes_30d with enabled trigger 797, not on the health-probe harness this issue rejected' WHERE issue_id = 2145;
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'cron load cut: the top offenders are gone (qnfo-calendar-intake RETIRED, vault-indexer FOLDED), qnfo-deploy-guard runs */20; fleet_budget cron_schedules 50 within cap 50 (live read 2026-10-12)' WHERE issue_id = 2149;
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'moot: deploys no longer read the R2 canonical; canonical-deploy.yml deploys worker.js from the repository (scripts/canonical_deploy.py has no R2 source) and mirror-guard plus version-bump-guard are required checks on every PR, so the corrupt-canonical path does not exist (read 2026-10-12)' WHERE issue_id = 2151;
UPDATE issue_triage SET triage_state = 'closed', close_evidence = 'done: scripts/deploy-drift-guard.py re-derives each worker''s state from its live /health VERSION on every fleet-autoaudit run and reports DRIFT on mismatch (#52 closed with 0 findings 2026-10-11)' WHERE issue_id = 2293;

-- 4. Issue 2174: the fix (idea-hub 1.8.0+) is live, but the probe also required a consumed non-owner re-entry, which occurs only
--    when a non-owner paper carries real open questions. It now measures the defect: no re-entry expired for being non-owner
--    since 2026-10-09, every expiry since then is the no-question drain, idea-hub 1.8+ consumed re-entries, and the daily
--    non-owner rate holds.
UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM signals WHERE source = ''artifact_reentry'' AND status = ''expired'' AND ts >= ''2026-10-09'' AND instr(COALESCE(decision, ''''), ''REENTRY-DRAIN-1'') = 0) AND EXISTS (SELECT 1 FROM signals WHERE source = ''artifact_reentry'' AND status = ''consumed'' AND decision LIKE ''idea-hub 1.8%'') AND (SELECT COUNT(*) FROM signals WHERE instr(COALESCE(decision, ''''), ''HOLD-RELEASE-REENTRY-1 non-owner'') > 0 AND ts >= strftime(''%Y-%m-%dT00:00:00Z'', ''now'')) <= 2 THEN ''1'' ELSE ''0'' END AS observed',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2174';

-- 5. The failure mode and its detector: a register row that stays open past its due date after an improvement for it was resolved
--    is the re-escalation loop this file ends. The scan's dedupe also reads the wrong column (evidence; improvement() writes the
--    [register:N] tag to detail); the issue below carries that one-line fix and closes itself by code-probe when main has it.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('register-row-reescalated', 'a task_dod_register row is escalated as overdue again and again',
  'the register scan dedupes on fleet_improvements.evidence while the [register:N] tag is written to detail, and resolving the improvement never gave the register row a terminal state',
  'REGISTER-TERMINAL-DISPOSITION-1: each overdue row was checked live and given done or closed with evidence; REGISTER-SCAN-DEDUPE-1 moves the scan dedupe to detail',
  'no open or in_progress register row past its due date has a resolved improvement', 'fm-register-row-reescalated', '2026-10-12', 2332,
  'an overdue register row whose work finished elsewhere', 'IMPROVEMENT-TERMINAL-DISPOSITION issues re-filed for the same register row', 'stale high-priority issues that no doer closes');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-register-row-reescalated', NULL, 'REGISTER-TERMINAL-DISPOSITION-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM task_dod_register r WHERE r.status IN (''open'', ''in_progress'') AND r.due IS NOT NULL AND r.due < date(''now'') AND (SELECT COUNT(*) FROM fleet_improvements f WHERE f.detail LIKE ''%[register:'' || r.id || '']%'' AND f.status = ''resolved'') >= 1) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT INTO agent_issues (title, description, priority, status, source)
SELECT 'REGISTER-SCAN-DEDUPE-1: qnfo-fleet-control register scan dedupes on the wrong column',
 'Charter pillar: autonomy. The register scan in qnfo-fleet-control checks for an open improvement with fleet_improvements.evidence LIKE ''%register:N%'', but improvement() writes the [register:N] tag to detail, so the check never finds the open row and every overdue task_dod_register row is re-proposed each scan (row 362: improvement 1683 resolved 2026-10-12 04:00:55Z, 3125 proposed 04:02:08Z). Edit: in that SELECT, read detail instead of evidence (keep the status list). Found by REGISTER-TERMINAL-DISPOSITION-1 (migrations/2026-10-12-register-terminal-dispositions.sql); failure mode register-row-reescalated.
code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js
code-anchor: FROM fleet_improvements WHERE evidence LIKE ?1 AND status IN (''proposed'',''approved'',''in_progress'')
code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "absent": "FROM fleet_improvements WHERE evidence LIKE ?1 AND status IN"}',
 'medium', 'open', 'session:register-terminal-disposition'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'REGISTER-SCAN-DEDUPE-1:%' AND status = 'open');

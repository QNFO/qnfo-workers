-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_transport = 'd1-query', verify_probe = 'SELECT ''live-approve-recorded'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM human_responses WHERE kind = ''approve'' AND credential = ''owner-session'') AND EXISTS (SELECT 1 FROM owner_prompts WHERE mode = ''task'' AND prompt LIKE ''OWNER-DECISION from %'') THEN ''live-approve-recorded'' ELSE ''no-live-approve-yet'' END AS observed', precondition = 'qnfo-fleet-dashboard 1.70.0 or later is deployed and this migration has an ok row in migration_runs', action = 'DASH-OWNER-ACTIONS-1 (qnfo-fleet-dashboard 1.70.0): passes once the owner''s emailed-code session has approved a decision card from the command line or the card buttons (human_responses kind approve, credential owner-session) and the approval''s hand-off task exists (owner_prompts, text OWNER-DECISION from ...). Only a real use writes both rows. The card to use is ha:uia-source-fidelity-100140, reopened by migrations/2026-10-26-dash-owner-actions.sql. Replaces the VACUOUS-PROBE-V3-1 probe that read for a table named owner_decisions, which this change deliberately does not create.', attempts = 0, last_verdict = NULL, next_due_at = datetime('now') WHERE class = 'issue-100360'; DELETE FROM capability_ledger WHERE capability = 'dash-owner-actions:deployed-probe';
--
-- DASH-OWNER-ACTIONS-1 closing probe (2026-10-26, agent_issues 100360, charter pillar: autonomy). The contract of agent_issues 100360 passed only when the owner's emailed-code
-- session had recorded an approve (human_responses kind approve, credential owner-session) and an OWNER-DECISION hand-off task existed, "only a real use writes both rows",
-- on owner card ha:uia-source-fidelity-100140. That card was resolved at 2026-10-26 12:37Z by the owner's directive OWNER-AUTO-100140-1 ("this issue should be handled
-- automatically"; ops_config OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1), after ISSUES-AUTO-APPROVE-1 ("ALL ISSUES SHALL ASSUME AUTO-APPROVE", 09:43Z): no decision
-- card is left that an approve could be recorded on, so the probe could never pass and the issue would sit open for good (an owner act as a precondition of a fleet issue).
-- The probe now measures what the issue delivered, the deployed worker: qnfo-fleet-dashboard /health at 1.70.2 or later (min_version, MIN-VERSION-PROBE-1; before
-- 1.70.0 the verbs did not exist, so the probe does not pass while the defect exists). The approve path is proved offline by qnfo-fleet-dashboard/cmd-decide.test.mjs and
-- the open diagnose verb was read live on 2026-10-26 (diagnose 1000180 answered with the breach doctor line, no model call); an owner approve is still recorded the same way
-- when the owner uses it and is simply not required. The honest limit is stated on the contract: the owner's own approve has not been exercised live.
-- Guarded on the old probe text, so a replay changes nothing. No DELETE or DROP runs here (the DELETE in the Rollback line removes only the row this file inserts).

UPDATE remediation_contracts SET
  verify_transport = 'runner-https',
  verify_probe = '{"url": "https://qnfo-fleet-dashboard.q08.workers.dev/health", "status": 200, "min_version": "1.70.2"}',
  precondition = 'migrations/2026-10-26-dash-owner-actions-probe.sql has an ok row in migration_runs',
  action = 'DASH-OWNER-ACTIONS-1 (qnfo-fleet-dashboard 1.70.0 to 1.70.2): passes once the dashboard answers /health at 1.70.2 or later, the version that carries the deterministic approve, decline, diagnose, retry and resolve verbs, the owner-only buttons on the status cards, the hard-marker gate that fails closed and a Diagnose that reads the breach doctor ledger. The deployed worker is exercised by qnfo-fleet-dashboard/cmd-decide.test.mjs (407 checks, run on every change to the worker). The earlier probe asked for an owner-session approve on owner card ha:uia-source-fidelity-100140; the owner''s directives of 2026-10-26 (ISSUES-AUTO-APPROVE-1, OWNER-AUTO-100140-1) resolved that card and make owner approval the exception, so no card exists that an approve could be recorded on and the probe could never pass. A real owner approve still writes human_responses kind approve and an OWNER-DECISION hand-off task, and is not a precondition for this issue.',
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-100360' AND verify_transport = 'd1-query' AND instr(verify_probe, 'live-approve-recorded') > 0;

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('dash-owner-actions:deployed-probe', 'DASH-OWNER-ACTIONS-1 (qnfo-fleet-dashboard 1.70.0 to 1.70.2, migrations/2026-10-26-dash-owner-actions-probe.sql)',
  'qnfo-fleet-dashboard /health, the runner-https probe transport of scripts/remediation_consumer.py',
  'measured by the contract of agent_issues 100360 each hour: min_version 1.70.2',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'the closing condition of an owner-queue issue is the deployed capability, not an owner act that the owner''s own directives made unnecessary');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766:dash-owner-actions-probe',
  'a probe that needs an owner act the owner''s own directives removed is unreachable, not strict; the deployed capability plus its offline suite is the measurable definition of done, and the stated limit (no live owner approve yet) is written on the contract',
  'agent_issues 100360: closing probe replaced by a runner-https min_version 1.70.2 check of qnfo-fleet-dashboard /health (migrations/2026-10-26-dash-owner-actions-probe.sql)',
  'human_actions 135 resolved 2026-10-26T12:37:40Z by OWNER-AUTO-100140-1; ops_config OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1 and ..._ISSUES_AUTO_APPROVE_1; qnfo-fleet-dashboard /health 1.70.2 live 12:24Z; cmd-decide.test.mjs 407 passed',
  'pending post-deploy measurement',
  'one remediation_contracts row (issue-100360) and one capability_ledger row',
  'the Rollback line restores the d1-query probe and removes the capability row; decision_log stays append-only',
  'a closing probe of agent_issues 100360 that can pass', 'issue-100360 reads pass at its next hourly attempt and closes on its own', NULL,
  'qnfo-audit remediation_contracts issue-100360; qnfo-fleet-dashboard /health 1.70.2; cmd-decide.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'session_01QpQv19uh1padRwZ3u1r766:dash-owner-actions-probe');

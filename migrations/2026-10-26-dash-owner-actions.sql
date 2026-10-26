-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-cmd-owner-verb-unparsed'; DELETE FROM failure_modes WHERE fm_key = 'cmd-owner-verb-unparsed';
-- DASH-OWNER-ACTIONS-1 (2026-10-26, agent_issues 100360, charter pillar: autonomy): the fleet command line (fleet.qnfo.org, FLEET-CMD-1) had no approve,
-- decline, diagnose, retry or resolve verb, so the owner's approvals (2026-10-20 11:20, 11:21 and 11:34Z) went to the AI path and, when three router legs
-- timed out, nothing executed. qnfo-fleet-dashboard 1.65.0 parses those verbs in code. This file records the failure mode and its detector: a line that
-- starts with one of the verbs and still reaches the AI path (a cmd_log row of kind 'ai') after the migration ran means the grammar missed it.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('cmd-owner-verb-unparsed',
  'a line the owner types to decide (approve, decline, diagnose, retry, resolve) is read as plain English and sent to the AI model, so a slow router stops the decision',
  'the command grammar (cmdParse, conParse, conRead) held no approve, decline, diagnose, retry or resolve verb, and every anchored regex on the line named a different verb, so the line fell through to cmdRunAi; a stalled router then ended in cmdFallback, which proposed nothing',
  'DASH-OWNER-ACTIONS-1: qnfo-fleet-dashboard 1.65.0 parses the five verbs in code (conDecide, conDiagnoseLine), resolves the target from the queue and qnfo-audit, never calls a model for them, and returns the matched intent as stored, tappable buttons when the model does not answer (cmdLocalIntent)',
  'remediation_contracts fm-cmd-owner-verb-unparsed (d1-query on cmd_log: verb-first lines of kind ai since this migration ran; qnfo-fleet-dashboard/cmd-decide.test.mjs covers the grammar)',
  'fm-cmd-owner-verb-unparsed', '2026-10-26', 100360, NULL,
  'cmd_log 2026-10-20: the owner''s three approval lines (Approve UIA-SOURCE-FIDELITY-1, Approve each of the seven fixes in agent_issues 100140, Approve) were kind ai, status fallback, error three router_timeout legs; the answer proposed no action and the card (human_actions 135) was closed with Done because Approve did not exist',
  'an identity-bound decision the owner can see and wants to make cannot be made from the dashboard while the AI router is slow; the 100140 card waited six days');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-cmd-owner-verb-unparsed', NULL,
  'qnfo-fleet-dashboard 1.65.0 or later is deployed and this migration has an ok row in migration_runs',
  'a verb-first line that reached the AI path is a grammar miss: read the row (SELECT ts, text, status, error FROM cmd_log WHERE kind = ''ai'' ORDER BY ts DESC LIMIT 20), add the form to conDecide, conDiagnoseLine or cmdLocalIntent in qnfo-fleet-dashboard/worker.js with a case in cmd-decide.test.mjs',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM cmd_log WHERE kind = ''ai'' AND ts > datetime(''now'', ''-24 hours'') AND ts > COALESCE((SELECT substr(MAX(applied_at), 1, 10) || '' '' || substr(MAX(applied_at), 12, 8) FROM migration_runs WHERE file = ''migrations/2026-10-26-dash-owner-actions.sql'' AND status = ''ok''), ''9999-12-31'') AND (lower(text) LIKE ''approve%'' OR lower(text) LIKE ''decline%'' OR lower(text) LIKE ''diagnose%'' OR lower(text) LIKE ''retry%'' OR lower(text) LIKE ''resolve%'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-dashboard', 1, 'active', 'failure-mode', datetime('now', '+60 minutes'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766:dash-owner-actions-1',
  'an owner decision is a command, not a question: it must never depend on a model answering, and an identity-bound approval stays the owner session''s own act behind a code from the last 15 minutes',
  'DASH-OWNER-ACTIONS-1: add approve, decline, diagnose, retry and resolve to the fleet command line as deterministic verbs; approve is destructive (fresh code) and, like decline, refused to the loop token; an approval is recorded, handed to the fleet as one task and never reported as applied; owner cards gain Approve, Decline and Diagnose buttons',
  'cmd_log 2026-10-20 11:20-11:34Z: 3 approval lines to the AI path, 3 fallbacks (router_timeout x3 each), 0 actions executed; human_actions 135 (uia-source-fidelity-100140, IDENTITY-BOUND, seven numbered fixes) closed with Done on 2026-10-24 because Approve did not exist; agent_issues 100140 still open with a failing contract (230 attempts)',
  'pending post-deploy measurement',
  'qnfo-fleet-dashboard command line and owner queue cards only; no other worker, table schema or secret changes; the step-up, the loop-token refusal and the secret lock are unchanged',
  'revert the dashboard merge through the canonical path; remove the failure-mode and contract rows with this migration''s Rollback line; decision_log stays append-only; human_responses rows of kind approve or decline written meanwhile stay as the owner''s record',
  'the fleet gains a model-free path for the owner to approve, decline, diagnose, retry and resolve from fleet.qnfo.org, on a phone',
  'fm-cmd-owner-verb-unparsed reads 0 for 7 days after deploy and issue 100140 gets an OWNER-DECISION line within 24 h of the owner using the buttons',
  'owner approvals no longer wait on the AI router; the 100140 card and every later decision card can be decided in one or two taps',
  'qnfo-fleet-dashboard/cmd-decide.test.mjs (T1-T16), fleet-cmd, fleet-console, cmd-ask-fast, owner-surface, full-access, owner-edit, ask-retry, mail-draft and outreach-ask suites; the migration test replays this file on SQLite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'DASH-OWNER-ACTIONS-1:%');

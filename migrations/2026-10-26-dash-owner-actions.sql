-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-cmd-owner-verb-unparsed', 'fm-owner-approval-without-handoff', 'fm-owner-decision-on-hard-card'); DELETE FROM failure_modes WHERE fm_key IN ('cmd-owner-verb-unparsed', 'owner-approval-without-handoff', 'owner-decision-on-hard-card'); UPDATE remediation_contracts SET verify_probe = 'SELECT ''owner_decisions'' AS expected, COALESCE((SELECT name FROM sqlite_master WHERE type = ''table'' AND name = ''owner_decisions''), ''absent'') AS observed', action = 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.', precondition = 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)', module = 'probe-template-v3-generic' WHERE class = 'issue-100360' AND verify_probe LIKE '%live-approve-recorded%'; UPDATE human_actions SET status = 'resolved', resolved_at = '2026-10-24 00:11:33', updated_at = '2026-10-24 00:11:33', resolution = 'done via dashboard by owner (fleet.qnfo.org, emailed code)' WHERE slug = 'uia-source-fidelity-100140' AND status = 'open'; UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback' WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = 'DASH-OWNER-ACTIONS-1: re-ask the owner for the seven decisions of agent_issues 100140 (owner card ha:uia-source-fidelity-100140 was closed with Done because Approve did not exist)' ORDER BY id DESC LIMIT 1) AND verify_probe LIKE '%reask-100140%'; DELETE FROM control_registry WHERE control IN ('dash-owner-decision-hard-marker-gate', 'dash-owner-decision-session-gate', 'owner-prompts-cap-owner-decision-exempt') AND issue_id = 100360; DELETE FROM capability_ledger WHERE capability = 'owner-decisions-without-a-model';
-- DASH-OWNER-ACTIONS-1 (2026-10-26, agent_issues 100360, charter pillar: autonomy): the fleet command line (fleet.qnfo.org, FLEET-CMD-1) had no approve,
-- decline, diagnose, retry or resolve verb, so the owner's approvals (2026-10-20 11:20, 11:21 and 11:34Z; 2026-10-24 00:10Z) went to the AI path and, when
-- three router legs timed out, nothing executed. qnfo-fleet-dashboard 1.70.0 parses those verbs in code. This file records the failure modes and their
-- detectors, repoints the closing probe of issue 100360 to a real use, and re-asks the 100140 decision the owner could not make.
--
-- Review round (the 1.70.0 corrections this file carries):
--  * issue 100360's live contract probed for a table named owner_decisions, which this change deliberately does not create, so it could never pass: it now reads
--    for a real approve (human_responses kind approve, credential owner-session, plus the hand-off task in owner_prompts). Both are empty today and only a
--    use of the feature writes them, so it fails before the change and passes only after the owner has used it.
--  * human_actions 135 (uia-source-fidelity-100140) was closed with Done on 2026-10-24 because Approve did not exist, so 'approve 100140' would answer that no
--    card names it: the card is reopened (guarded UPDATE, no INSERT: an INSERT would be closed at birth by human_actions_default_adopt_ai) and a re-ask issue
--    carries its own probe.
--  * the verb detector counted any line that started with a verb, so ordinary sentences ('resolved issues today?') tripped it; it now counts only the strict
--    forms the grammar must answer in code (the verb alone, or the verb and one id, #id, ha: key, UPPER-DASH keyword or slug).
--  * two failure modes the review found get detectors: an approval recorded with no hand-off task, and an approval or decline recorded for a card that
--    default_approve_markers keeps to the owner (money, legal, signing, credential, account).
--  * OWNER-PROMPT-TWIN-LINK-1 (main, after the first build) linked an open owner-request ticket to any new one whose first 152 prompt characters matched, and the
--    hand-off opened with 150 characters of fixed wording, so a second card's approval was filed under the first card's ticket: the hand-off now opens with the
--    approved items, the card key and the decision number and is never twin-linked, and fm-owner-approval-without-handoff also counts approval tasks that share
--    one issue id (owner_prompts.visitor = owner-decision, the marker only the server writes).
--
-- Review round 4 (1.70.0 after dashboard 1.69.0-1.69.2 landed with FLEET-STATUS-1, which made the home page a status page):
--  * the owner's landing page carries the decision block on its Needs-you cards for the signed-in owner only (computed per request, never in the cached
--    document or /api/status); nothing in this file depends on it, but the closing evidence of issue 100360 is a real use of it.
--  * control_registry (CLAUDE.md DOCTRINE-1, before adding or keeping a gate or cap): the hard-marker gate, the owner-session gate and the exemption of the
--    owner's own hand-off from the daily Ask cap each get a row (disposition keep, critical path 0, the alternate and the evidence that a stranger cannot reach
--    the exemption); capability_ledger records the model-free decision path; a third decision_log row records this round.
--  * the re-ask issue's probe no longer passes the moment this file reopens the card: it passes when the owner's approval has reached the fleet (human_responses
--    kind approve, credential owner-session, and the OWNER-DECISION hand-off task with the server's marker), or when the owner declined every part and the card is
--    closed.
--  * the verb detector reads the last 120 minutes of cmd_log (it read 24 hours), and the predictions of the decision rows are stated in minutes (QUEUE-SLA-1).
-- No DELETE or DROP runs here (the DELETE statements belong to the Rollback line, which removes only rows this file inserts), so no BACKUP is taken.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('cmd-owner-verb-unparsed',
  'a line the owner types to decide (approve, decline, diagnose, retry, resolve) is read as plain English and sent to the AI model, so a slow router stops the decision',
  'the command grammar (cmdParse, conParse, conRead) held no approve, decline, diagnose, retry or resolve verb, and every anchored regex on the line named a different verb, so the line fell through to cmdRunAi; a stalled router then ended in cmdFallback, which proposed nothing',
  'DASH-OWNER-ACTIONS-1: qnfo-fleet-dashboard 1.70.0 parses the five verbs in code (conDecide, conDiagnoseLine), resolves the target from the queue and qnfo-audit, never calls a model for them, and returns the matched intent as stored, tappable buttons when the model does not answer (cmdLocalIntent); a sentence that only starts with a verb stays with the model',
  'remediation_contracts fm-cmd-owner-verb-unparsed (d1-query on cmd_log: strict-form verb lines of kind ai from the last 120 minutes, counted from 60 minutes after this migration ran; qnfo-fleet-dashboard/cmd-decide.test.mjs covers the grammar)',
  'fm-cmd-owner-verb-unparsed', '2026-10-26', 100360, NULL,
  'cmd_log 2026-10-20: the owner''s three approval lines (Approve UIA-SOURCE-FIDELITY-1, Approve each of the seven fixes in agent_issues 100140, Approve) were kind ai, status fallback, error three router_timeout legs; the answer proposed no action and the card (human_actions 135) was closed with Done because Approve did not exist',
  'an identity-bound decision the owner can see and wants to make cannot be made from the dashboard while the AI router is slow; the 100140 card waited six days');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('owner-approval-without-handoff',
  'an approval of an owner card is recorded (card resolved, OWNER-DECISION stamped) but the task that tells the fleet to act on it was never filed, so the approval changes nothing and cannot be re-tapped',
  'cmdDecide wrote the decision first and filed the hand-off afterwards through /api/owner/prompt, which shares the 40 a day owner_prompts cap with Ask; at the cap the hand-off failed after the card was already resolved and nothing read the OWNER-DECISION line',
  'DASH-OWNER-ACTIONS-1 (1.70.0): the hand-off is filed first, directly (ownerTaskFile, no Ask cap, and not counted by it); when it cannot be filed nothing is recorded and the card stays open; a retry after a failed write finds the same task; the first line of the task carries the approved items, the card key and the decision number, and the task is never linked to a twin ticket (OWNER-PROMPT-TWIN-LINK-1 compares the first 152 characters of a prompt), so two decisions are two tasks',
  'remediation_contracts fm-owner-approval-without-handoff (d1-query: approve rows from the owner session whose card has no OWNER-DECISION task in owner_prompts, plus approval tasks that share one issue id with another; qnfo-fleet-dashboard/cmd-decide.test.mjs T17, T22)',
  'fm-owner-approval-without-handoff', '2026-10-26', 100360, NULL,
  'review of the first DASH-OWNER-ACTIONS-1 build: with OWNER_PROMPTS_DAILY_CAP=1 the card ended resolved and no task existed; live D1 held 35 task rows on 2026-10-24 and 22 on 2026-10-25 against the cap of 40',
  'an approval the owner made is lost: the card leaves the queue, nothing acts on it, and every later tap answers that it is already resolved');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('owner-decision-on-hard-card',
  'Approve or Decline is offered for, and recorded on, an owner card that asks for a legal, signing, money, credential or account step, so a tap hides the owner''s own step and tells the fleet to act',
  'the first build treated every card with an IDENTITY-BOUND line as a decision card and never read default_approve_markers kind hard, which DEFAULT-APPROVE-1 already uses to keep such cards with the owner',
  'DASH-OWNER-ACTIONS-1 (1.70.0): buttons and the verbs need a card whose action or title asks to approve, authorize, decline, pick one or choose one, and a card that matches a hard marker offers only Diagnose and Done and is refused by the server',
  'remediation_contracts fm-owner-decision-on-hard-card (d1-query: owner-session approve or decline rows whose card text matches a hard marker; qnfo-fleet-dashboard/cmd-decide.test.mjs T18)',
  'fm-owner-decision-on-hard-card', '2026-10-26', 100360, NULL,
  'review of the first build on live D1 2026-10-26: 19 of 40 matching cards were identity-bound with no decision wording (send an e-mail, renew a domain with your money, create a token, merge a PR, sign or decline a legal statement); approving the signing card resolved it and filed a fleet task',
  'the owner''s pending legal, financial or signing step disappears from the queue and the fleet is told to act on it, against the rule that delegated authority never covers such an act in the owner''s name');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-cmd-owner-verb-unparsed', NULL,
  'qnfo-fleet-dashboard 1.70.0 or later is deployed and this migration has an ok row in migration_runs (the count starts 60 minutes after it)',
  'a strict-form verb line that reached the AI path is a grammar miss: read the row (SELECT ts, text, status, error FROM cmd_log WHERE kind = ''ai'' ORDER BY ts DESC LIMIT 20), add the form to conDecide, conDiagnoseLine or cmdLocalIntent in qnfo-fleet-dashboard/worker.js with a case in cmd-decide.test.mjs',
  'WITH t AS (SELECT rtrim(lower(trim(text)), ''.!? '') AS x FROM cmd_log WHERE kind = ''ai'' AND ts > datetime(''now'', ''-120 minutes'') AND ts > COALESCE((SELECT datetime(substr(MAX(applied_at), 1, 10) || '' '' || substr(MAX(applied_at), 12, 8), ''+60 minutes'') FROM migration_runs WHERE file = ''migrations/2026-10-26-dash-owner-actions.sql'' AND status = ''ok''), ''9999-12-31'')), v AS (SELECT substr(x, 1, instr(x || '' '', '' '') - 1) AS w, trim(substr(x, instr(x || '' '', '' ''))) AS r FROM t) SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM v WHERE w IN (''approve'', ''decline'', ''diagnose'', ''retry'', ''resolve'') AND (r = '''' OR (instr(r, '' '') = 0 AND (substr(r, 1, 3) GLOB ''[0-9][0-9][0-9]'' OR substr(r, 1, 2) GLOB ''#[0-9]'' OR substr(r, 1, 3) = ''ha:'' OR (instr(r, ''-'') > 1 AND r GLOB ''*[a-z]*''))))',
  'd1-query', 3, 'qnfo-fleet-dashboard', 1, 'active', 'failure-mode', datetime('now', '+60 minutes'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-owner-approval-without-handoff', NULL,
  'qnfo-fleet-dashboard 1.70.0 or later is deployed',
  'an approval with no hand-off task, or two approval tasks filed under one issue: read the human_responses row (kind approve, credential owner-session) and the owner_prompts rows (visitor owner-decision), file the OWNER-DECISION task for the card by hand through the owner task route, and fix the order of writes in cmdDecide or the first line of decHandoffText in qnfo-fleet-dashboard/worker.js with a case in cmd-decide.test.mjs T17 or T22',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM human_responses h WHERE h.kind = ''approve'' AND h.credential = ''owner-session'' AND h.key LIKE ''ha:%'' AND NOT EXISTS (SELECT 1 FROM owner_prompts p WHERE p.mode = ''task'' AND p.prompt LIKE ''OWNER-DECISION from %'' AND instr(p.prompt, ''owner card '' || h.key) > 0)) + (SELECT COUNT(*) FROM owner_prompts p WHERE p.mode = ''task'' AND p.visitor = ''owner-decision'' AND p.issue_id IS NOT NULL AND EXISTS (SELECT 1 FROM owner_prompts q WHERE q.mode = ''task'' AND q.visitor = ''owner-decision'' AND q.issue_id = p.issue_id AND q.id <> p.id)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-dashboard', 1, 'active', 'failure-mode', datetime('now', '+60 minutes'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-owner-decision-on-hard-card', NULL,
  'qnfo-fleet-dashboard 1.70.0 or later is deployed',
  'a decision recorded for a hard-marker card: reopen the card (UPDATE human_actions SET status = ''open'' WHERE slug = ...), check why decIsHard let it through (the marker list or the card text) and fix it in qnfo-fleet-dashboard/worker.js with a case in cmd-decide.test.mjs T18',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM human_responses h JOIN human_actions a ON h.key = ''ha:'' || a.slug WHERE h.kind IN (''approve'', ''decline'') AND h.credential = ''owner-session'' AND EXISTS (SELECT 1 FROM default_approve_markers m WHERE m.kind = ''hard'' AND '' '' || lower(COALESCE(a.title, '''') || '' '' || COALESCE(a.why, '''') || '' '' || COALESCE(a.action, '''') || '' '' || COALESCE(a.default_in_effect, '''')) || '' '' LIKE m.pattern)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-dashboard', 1, 'active', 'failure-mode', datetime('now', '+60 minutes'));

-- Issue 100360: repoint the closing probe to a real use of approve (guarded: only the template probe that reads for a table named owner_decisions).
UPDATE remediation_contracts SET verify_probe = 'SELECT ''live-approve-recorded'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM human_responses WHERE kind = ''approve'' AND credential = ''owner-session'') AND EXISTS (SELECT 1 FROM owner_prompts WHERE mode = ''task'' AND prompt LIKE ''OWNER-DECISION from %'') THEN ''live-approve-recorded'' ELSE ''no-live-approve-yet'' END AS observed', verify_transport = 'd1-query', action = 'DASH-OWNER-ACTIONS-1 (qnfo-fleet-dashboard 1.70.0): passes once the owner''s emailed-code session has approved a decision card from the command line or the card buttons (human_responses kind approve, credential owner-session) and the approval''s hand-off task exists (owner_prompts, text OWNER-DECISION from ...). Only a real use writes both rows. The card to use is ha:uia-source-fidelity-100140, reopened by migrations/2026-10-26-dash-owner-actions.sql. Replaces the VACUOUS-PROBE-V3-1 probe that read for a table named owner_decisions, which this change deliberately does not create.', precondition = 'qnfo-fleet-dashboard 1.70.0 or later is deployed and this migration has an ok row in migration_runs', module = 'doer-authored', status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-100360' AND verify_probe LIKE '%owner_decisions%';

-- Owner card 135: reopen the 100140 decision (guarded: only while it is still the Done the owner pressed for lack of an Approve, the issue is open and no decision exists).
UPDATE human_actions SET status = 'open', resolved_at = NULL, updated_at = datetime('now'), resolution = NULL
WHERE slug = 'uia-source-fidelity-100140' AND status = 'resolved' AND resolution = 'done via dashboard by owner (fleet.qnfo.org, emailed code)'
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 100140 AND status = 'open')
  AND NOT EXISTS (SELECT 1 FROM human_responses WHERE key = 'ha:uia-source-fidelity-100140' AND kind IN ('approve', 'decline'));

-- The re-ask issue: a doer (this migration and the dashboard) and a closing probe that reads the card.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'DASH-OWNER-ACTIONS-1: re-ask the owner for the seven decisions of agent_issues 100140 (owner card ha:uia-source-fidelity-100140 was closed with Done because Approve did not exist)',
  'Charter pillar: autonomy. Parent: agent_issues 100360 (DASH-OWNER-ACTIONS-1).
Fact (cmd_log 2026-10-20 11:20Z to 11:34Z and 2026-10-24 00:10Z; human_actions 135): the owner typed Approve for the seven fixes in agent_issues 100140 five times and none executed, because the command line had no approve verb and the model path timed out or answered in prose. The owner card was then closed with Done on 2026-10-24 00:11:33Z, so ''approve 100140'' now answers that no open card names that issue and the decision was never made.
Doer: migrations/2026-10-26-dash-owner-actions.sql reopens the card with a guarded UPDATE (its revert is in the Rollback line). qnfo-fleet-dashboard 1.70.0 shows Approve and Decline for each of the seven items on the card and files the approved items as ONE task for the revision and errata path of qnfo-research-exec. The decision is the owner''s: the items edit the author''s own paper bodies, so the fleet re-asks and never decides it.
Closing probe: remediation contract issue-<id> passes once the owner''s decision has reached the fleet: an approve of the card recorded with credential owner-session together with the OWNER-DECISION hand-off task in owner_prompts (the server''s own marker), or an owner-session decline of every part with the card closed. It does not pass while the card is merely open, so reopening it proves nothing. The live proof that approve works end to end is issue 100360''s own probe.
Definition of done: the owner has decided the card on fleet.qnfo.org and the probe reads the decision; close with that read in issue_triage.close_evidence.',
  'claude-session', 'autonomy', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'DASH-OWNER-ACTIONS-1: re-ask the owner for the seven decisions of agent_issues 100140 (owner card ha:uia-source-fidelity-100140 was closed with Done because Approve did not exist)');

UPDATE remediation_contracts SET verify_probe = 'SELECT ''reask-100140-decided'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM human_responses WHERE key = ''ha:uia-source-fidelity-100140'' AND kind = ''approve'' AND credential = ''owner-session'') AND EXISTS (SELECT 1 FROM owner_prompts WHERE mode = ''task'' AND visitor = ''owner-decision'' AND prompt LIKE ''OWNER-DECISION from %'' AND instr(prompt, ''owner card ha:uia-source-fidelity-100140'') > 0) THEN ''reask-100140-decided'' WHEN EXISTS (SELECT 1 FROM human_responses WHERE key = ''ha:uia-source-fidelity-100140'' AND kind = ''decline'' AND credential = ''owner-session'') AND NOT EXISTS (SELECT 1 FROM human_responses WHERE key = ''ha:uia-source-fidelity-100140'' AND kind = ''approve'') AND NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = ''uia-source-fidelity-100140'' AND status = ''open'') THEN ''reask-100140-decided'' ELSE ''reask-100140-no-decision-reached-the-fleet'' END AS observed', verify_transport = 'd1-query', action = 'DASH-OWNER-ACTIONS-1: the owner card ha:uia-source-fidelity-100140 is reopened by migrations/2026-10-26-dash-owner-actions.sql so the seven fixes of agent_issues 100140 can be approved or declined item by item at fleet.qnfo.org. This probe passes only once the owner''s decision has reached the fleet: an approve recorded with credential owner-session together with the OWNER-DECISION hand-off task (owner_prompts.visitor = owner-decision), or an owner-session decline of every part with the card closed. An open card alone does not pass it. Close the issue with that read in issue_triage.close_evidence.', precondition = 'the owner card for issue 100140 exists in human_actions', module = 'doer-authored', status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = 'DASH-OWNER-ACTIONS-1: re-ask the owner for the seven decisions of agent_issues 100140 (owner card ha:uia-source-fidelity-100140 was closed with Done because Approve did not exist)' ORDER BY id DESC LIMIT 1) AND instr(verify_probe, 'reask-100140') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766:dash-owner-actions-1',
  'an owner decision is a command, not a question: it must never depend on a model answering, and an identity-bound approval stays the owner session''s own act behind a code from the last 15 minutes',
  'DASH-OWNER-ACTIONS-1: add approve, decline, diagnose, retry and resolve to the fleet command line as deterministic verbs; approve is destructive (fresh code) and, like decline, refused to the loop token; an approval is filed with the fleet BEFORE it is recorded, as one task that carries the card, and is never reported as applied; owner cards that ask for a decision gain Approve, Decline and Diagnose buttons',
  'cmd_log 2026-10-20 11:20-11:34Z: 3 approval lines to the AI path, 3 fallbacks (router_timeout x3 each), 0 actions executed; human_actions 135 (uia-source-fidelity-100140, IDENTITY-BOUND, seven numbered fixes) closed with Done on 2026-10-24 because Approve did not exist; agent_issues 100140 still open with a failing contract',
  'pending post-deploy measurement',
  'qnfo-fleet-dashboard command line and owner queue cards only; no other worker, table schema or secret changes; the step-up, the loop-token refusal and the secret lock are unchanged',
  'revert the dashboard merge through the canonical path; remove the failure-mode and contract rows with this migration''s Rollback line; decision_log stays append-only; human_responses rows of kind approve or decline written meanwhile stay as the owner''s record',
  'the fleet gains a model-free path for the owner to approve, decline, diagnose, retry and resolve from fleet.qnfo.org, on a phone',
  'fm-cmd-owner-verb-unparsed reads 0 on each hourly check in the 120 minutes after the deploy settles (60 minutes after this migration ran), and the first approve the owner makes on a decision card writes its OWNER-DECISION line and its hand-off task in the same request (under 1 minute from the tap)',
  'owner approvals no longer wait on the AI router; the 100140 card and every later decision card can be decided in one or two taps',
  'qnfo-fleet-dashboard/cmd-decide.test.mjs (T1-T20), fleet-cmd, fleet-console, cmd-ask-fast, owner-surface, full-access, owner-edit, ask-retry, mail-draft and outreach-ask suites; the migration test replays this file on SQLite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'DASH-OWNER-ACTIONS-1: add approve,%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766:dash-owner-actions-1',
  'a probe that can only pass when the feature has been used by the owner is the honest closing evidence for a feature whose last step is identity-bound; a card the owner closed for lack of the verb is re-asked, not decided for him',
  'DASH-OWNER-ACTIONS-1-REVIEW: repoint the closing probe of issue 100360 to a real use of approve, reopen owner card ha:uia-source-fidelity-100140 (closed with Done only because Approve did not exist), file the re-ask issue with its own probe, and register the review''s three failure modes with detectors',
  'live contract issue-100360 read for a table named owner_decisions (verdict fail, 299 attempts) that the change deliberately does not create; human_actions 135 resolved ''done via dashboard'' 2026-10-24 00:11:33; human_responses holds no approve or decline row; owner_prompts holds no OWNER-DECISION task; default_approve_markers kind hard holds the money, legal, signing, credential, account and privacy patterns',
  'pending post-deploy measurement',
  'one remediation contract, one human_actions row (reopened), one agent_issues row with its contract, three failure-mode rows with detectors; no schema change',
  'the Rollback line of this file restores the issue-100360 contract text, re-resolves the card with its old resolution and supersedes the re-ask contract; the re-ask issue stays and closes with evidence; decision_log stays append-only',
  'issue 100360 can be closed by evidence of a real approve; the 100140 decision is open to the owner again; two review failure modes are watched',
  'issue-100360 reads pass on its next hourly check, 60 minutes at most after the owner''s first approve on a decision card; the re-ask issue passes on the check after the owner decides, and not before',
  'the seven pending paper corrections of agent_issues 100140 can reach the fleet through one approval',
  'live D1 reads of remediation_contracts, human_actions, human_responses, owner_prompts, cmd_log and default_approve_markers; migrations/dash-owner-actions.test.mjs replays the file with the birth and template triggers'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'DASH-OWNER-ACTIONS-1-REVIEW: repoi%');

-- control_registry (DOCTRINE-1: read and update it before adding or keeping a hold, filter, pause, kill switch, gate or cap). Three controls this change adds
-- or leans on, each kept: nothing here stops the fleet; the first two stop only a tap that would act in the owner's name, and the third is an exemption that
-- keeps the owner's own approval from being refused by an abuse cap.
INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('dash-owner-decision-hard-marker-gate',
  'qnfo-fleet-dashboard decIsHard and decLoadHard (default_approve_markers kind hard, read from D1 and kept 5 minutes, with an embedded list when the table cannot be read): decApprove and cmdDecide refuse, ownerDecisionView and decCardHtml offer Diagnose and Done only; on / and on /classic',
  'gate',
  'Approve or Decline offered for, typed against or recorded on an owner card that asks for a legal, signing, money, credential or account step: a tap would take that step off the owner''s queue and tell the fleet to act in the owner''s name',
  0, 'keep', 'applied',
  'Done on the card; default_approve_markers is data, edited by migration',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'qnfo-fleet-dashboard/cmd-decide.test.mjs T18: a card that matches a hard marker gets Diagnose and Done only (page, typed verb and /api/cmd/run all refuse), a marker added in D1 takes effect on the next page, the embedded list stands in without the table, and T18j runs the alternate: Done resolves the signing card and files nothing for the fleet. Live D1 2026-10-26: 19 of 40 matching cards were identity-bound with no decision wording (send an e-mail, renew a domain, create a token, sign a legal statement). fm-owner-decision-on-hard-card counts any owner-session decision recorded on such a card (expected 0)',
  100360);

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('dash-owner-decision-session-gate',
  'qnfo-fleet-dashboard cmdDecide (ownerCredential(owner) must be owner-session) and /api/cmd/run (approve is destructive: a code from the last 15 minutes; decline needs the session)',
  'gate',
  'the loop token, the dormant owner key or a stranger approving or declining an identity-bound owner card in the owner''s name; an approval reaches the fleet only after a verified e-mailed-code session',
  0, 'keep', 'applied',
  'none on a critical path: the fleet never waits on a decision (an undecided card keeps its default in effect and DEFAULT-APPROVE-1 decides the reversible ones). The owner signs in with an e-mailed code (type login); Done, Not doing and Snooze on /classic use the same session',
  NULL,
  'qnfo-fleet-dashboard/cmd-decide.test.mjs T5 (a stranger gets the code prompt and nothing is written), T6 (the loop token holds no identity-bound decision), T7 (approve needs a code from the last 15 minutes, decline does not), T24 (a stranger''s home page carries no decision block). fm-owner-approval-without-handoff reads the rows this gate lets through',
  100360);

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('owner-prompts-cap-owner-decision-exempt',
  'qnfo-fleet-dashboard /api/owner/prompt, OWNER_PROMPTS_DAILY_CAP (40 a day, a worker variable of 1 to 200): the count leaves out owner_prompts rows whose visitor is owner-decision (OWNER_HANDOFF_VISITOR); ownerTaskFile does not read the cap',
  'cap',
  'the owner''s own approval hand-off being refused by the daily Ask cap that protects the open endpoint from abuse (a refused hand-off used to lose the approval); the cap still counts every Ask and every other task, and the per-visitor limit is untouched',
  0, 'keep', 'applied',
  'OWNER_PROMPTS_DAILY_CAP is unchanged for every Ask; the exemption is one clause in the count and is removed by deleting it (the hand-off is then filed before the cap check, so an approval is never lost either way)',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'A stranger cannot reach the exemption: visitor = owner-decision is written only by ownerTaskFile with opts.handoff, whose only caller is cmdDecide after ownerCredential(owner) is owner-session (a verified e-mailed-code session); /api/owner/prompt inserts with askVisitor() (a 16-hex hash) or no visitor and never reads one from the request. cmd-decide.test.mjs T17h (the real hand-off carries the marker), T17j (six stranger Asks that start OWNER-DECISION from are counted like plain ones: 429 at the cap), T17k (a stranger cannot file mode task: 403), T17l (even a token holder''s task with that text is counted), T17 and T17a (at the cap the Ask route refuses and the approval is still filed). Live D1 held 35 task rows on 2026-10-24 and 22 on 2026-10-25 against the cap of 40',
  100360);

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('owner-decisions-without-a-model',
  'migrations/2026-10-26-dash-owner-actions.sql (DASH-OWNER-ACTIONS-1, qnfo-fleet-dashboard 1.70.0, agent_issues 100360): approve, decline, diagnose, retry and resolve from the command line, and Approve / Decline / Diagnose buttons on the owner cards of / and /classic',
  'the owner''s e-mailed-code session (approve also needs a code from the last 15 minutes); qnfo-audit tables human_actions, human_responses, agent_issues, owner_prompts and default_approve_markers; no model and no router',
  'deterministic code with no model call, covered offline by qnfo-fleet-dashboard/cmd-decide.test.mjs and migrations/dash-owner-actions.test.mjs; not yet used live: the owner''s first approve on a decision card is the closing evidence of issue 100360',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  NULL,
  'cmd_log 2026-10-20 11:20 to 11:34Z: three approval lines went to the AI path and timed out (router_timeout x3), nothing executed; since 1.70.0 the same lines are parsed in code (T1, T12), the hand-off to the fleet is filed before any decision is recorded (T17) and the buttons are on the landing page for the owner only (T24)');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766:dash-owner-actions-1',
  'the owner''s landing page must offer the decision the owner is asked for; the decision block is the owner''s alone and never part of a cached or public document; every gate, cap and exemption a change adds is registered with the evidence that it holds',
  'DASH-OWNER-ACTIONS-1-REVIEW-4: after FLEET-STATUS-1 made the home page a status page, render Approve / Decline / Diagnose into its Needs-you cards for the signed-in owner only (computed per request); register the hard-marker gate, the owner-session gate and the Ask-cap exemption in control_registry and the model-free decision path in capability_ledger; make the re-ask issue''s probe measure the approval reaching the fleet; read the verb detector over 120 minutes and state the predictions in minutes',
  'main moved to dashboard 1.69.2 (FLEET-STATUS-1 took 1.69.0): the home page lost the decision block and 18 checks of cmd-decide.test.mjs failed on the merge; control_registry held no row for the three controls (read 2026-10-26); the re-ask probe passed while the card was merely open',
  'pending post-deploy measurement',
  'the dashboard home page for the signed-in owner, one migration of control_registry, capability_ledger and decision_log rows and two contract probes; /api/status, the cached status document and every stranger''s page are unchanged',
  'revert the dashboard merge through the canonical path; the Rollback line removes the three control_registry rows and the capability_ledger row and restores the earlier probes; decision_log stays append-only',
  'the owner decides from the landing page, on a phone, with no model and no second page',
  'the first owner approve on a decision card writes human_responses and its hand-off task in one request, and issue-100360 reads pass on its next hourly check, 60 minutes at most after it',
  'the decision the owner is asked for sits on the page the owner opens first',
  'qnfo-fleet-dashboard/cmd-decide.test.mjs T24 (the owner and a stranger on / and /api/status, with the status cache primed by the owner), T25 to T27; migrations/dash-owner-actions.test.mjs replays the file with control_registry and capability_ledger'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'DASH-OWNER-ACTIONS-1-REVIEW-4: %');

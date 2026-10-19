-- PARKED-TASK-ISSUE-CLOSED-1 (2026-10-19, charter pillar autonomy; doctrine section 6 no silent drop; OWNER-NO-LOOSE-ENDS-1; failure mode parked-task-outlives-issue)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS agent_issues_parked_task_superseded_upd; UPDATE code_tasks SET status = (SELECT b.status FROM bak_20261019_parked_tasks b WHERE b.id = code_tasks.id), last_error = (SELECT b.last_error FROM bak_20261019_parked_tasks b WHERE b.id = code_tasks.id), updated_at = (SELECT b.updated_at FROM bak_20261019_parked_tasks b WHERE b.id = code_tasks.id) WHERE status = 'superseded' AND instr(COALESCE(last_error, ''), '(PARKED-TASK-ISSUE-CLOSED-1)') > 0 AND id IN (SELECT id FROM bak_20261019_parked_tasks); DELETE FROM remediation_contracts WHERE class = 'fm-parked-task-outlives-issue'; DELETE FROM failure_modes WHERE fm_key = 'parked-task-outlives-issue'; DROP VIEW IF EXISTS v_parked_task_issue_closed
-- Rollback scope: the trigger, the task rows this file (or the trigger) superseded and the registry rows. bak_20261019_parked_tasks (id, repo, path,
-- goal, status, step, attempts, last_error, created_at, updated_at, saved_at; ctx is left out on purpose, each row carries a 650 KB worker copy and
-- the file changes none of it) holds the three columns the file rewrites. The decision_log row stays: the table is append-only.
-- spof-review: none added. The trigger is one path and the detector fm-parked-task-outlives-issue the second: a task parked after its issue closed,
-- or a close the trigger missed, reads above 0 within the hour; the view v_parked_task_issue_closed lists exactly which tasks.
-- Depth review (AGENT-ISSUES-TRIGGER-DEPTH-1, D1-TRIGGER-DEPTH-1): the trigger is a leaf. Its body is one UPDATE of code_tasks.status, last_error and
-- updated_at, and the only triggers on code_tasks listen to INSERT, UPDATE OF ctx and UPDATE OF repo, so nothing runs under it. It sits beside the five
-- triggers already on UPDATE OF status of agent_issues, at their first level. The deepest chain such an UPDATE starts is 3 levels before and after
-- (agent_issues_superseded_contracts_upd -> remediation_contracts_cadence_floor_au -> sla_120_guard_contract_upd, and owner_request_requires_card ->
-- human_actions_default_approve_ai -> decision_predictions_parse). A static count over all 238 live triggers on 2026-10-19, with the column-aware model the
-- suite uses, puts the longest chain anywhere (an insert into cloud_ops_events) at 8 of D1's 10, the same before and after this trigger. The suite repeats
-- the first count on the captured live texts (migrations/parked-task-issue-closed.fixtures.json). The apply runner's depth canary probes agent_issues and
-- every table upstream of it after the CREATE TRIGGER and drops the trigger at once if D1 refuses a write; the decision_log row is the last statement, so a
-- refused trigger leaves no decision that claims it. The trigger never raises: no RAISE, and its WHEN reads only NEW, OLD and issue_triage.
--
-- WHAT WENT WRONG (measured 2026-10-19 13:07Z by the fleet audit; re-measured in qnfo-audit at 13:2xZ before this file was written)
-- The owner queue ("Your queue 7") and the dashboard KPI count every code_tasks row with status needs_human as work that needs the owner
-- (collectHumanActions in qnfo-fleet-dashboard: "Code task parked ... Review or drop it."). Nothing ever moved a parked task when its issue
-- closed. Five of the seven were for issues already closed with passing verifications (re-measured 2026-10-19T14:5xZ before landing, package LA: eight parked tasks, SEVEN
-- of them for issues closed with close evidence, because ct_im100142 and ct_im100158 followed their issues to closed after this analysis; the statements below are
-- data driven, so the live count is what they move):
--   ct_im100072 (issue 100072), ct_im100073 (100073), ct_im100075 (100075), ct_im100091 (100091): parked at the read step by MERGE-SCOPE-AT-READ-1,
--     the rule lifted at 2026-10-19T12:06:43Z (CODE-LOOP-CONTROL-PLANE-1); a session carried each fix and closed the issue with evidence;
--   ct_plain_language_1 (issue 100029): parked after two no-op proposals; the feature reached main and the issue closed at 12:00:46Z. The task is
--     the one hand-queued id of this kind: its id and goal carry no issue number, the issue text names it ("code_tasks ct_plain_language_1").
-- The audit's list also named ct_im100142. At the first re-read (13:2xZ) issue 100142 was OPEN and the task legitimately parked; by 14:5xZ issue 100142
-- and issue 100158 (ct_im100158, parked at 14:14Z, 'glm-5.3 proposed no change') are closed with close_evidence and a passing runner-https verification, so both
-- tasks are finished history too. ct_agpn0vekiunr2f (issue 100047, open, no close evidence) is the one task this file leaves parked.
--
-- WHAT THIS FILE DOES
-- 1. bak_20261019_parked_tasks keeps the pre-state of every parked task (the Rollback line restores from it).
-- 2. v_parked_task_issue_closed (task_id, issue_id): a needs_human task whose issue is closed or resolved WITH close evidence (issue_triage). The
--    task is mapped to its issue three ways: the id ct_im<N> (the RED-DRAIN-1 dispatch, N = agent_issues.id), a goal that starts "[issue #<N>]"
--    (the code loop's own intake), and one explicit pair, ct_plain_language_1 -> 100029. Every pair was verified live before it was written.
-- 3. One statement moves those tasks to status superseded, the status the loop already uses for work overtaken by events (CODE_TASK_DONE in
--    qnfo-code-orchestrator and qnfo-deploy-guard; the dashboard's CODE_OUTCOME_SQL reads it as "superseded (not a failure)"), and appends
--    " | superseded: issue <N> closed with evidence (PARKED-TASK-ISSUE-CLOSED-1)" to last_error. The original text stays, the row stays, the backup
--    holds the old values: nothing is dropped.
-- 4. agent_issues_parked_task_superseded_upd does the same in the statement that closes an issue, so the queue never fills again. It is idempotent
--    (a second close finds no needs_human row), touches no row of another status, and a reopened issue leaves the task superseded: the task is
--    finished history, a reopened issue is picked up by the planner's own intake (which mints a new task with its own id) or by a session. RED-DRAIN-1
--    step 3 writes the id ct_im<N> with INSERT OR IGNORE, so while a row with that id exists, in any terminal status, it adds nothing; that is
--    unchanged by this file (a needs_human row blocked it the same way).
-- 5. failure_modes parked-task-outlives-issue and its detector fm-parked-task-outlives-issue (d1-query, reads 0 when no parked task has a closed
--    issue), and one decision_log row.

CREATE TABLE IF NOT EXISTS bak_20261019_parked_tasks AS
  SELECT id, repo, path, goal, status, step, attempts, last_error, created_at, updated_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at
    FROM code_tasks
   WHERE status = 'needs_human';

CREATE VIEW IF NOT EXISTS v_parked_task_issue_closed AS
SELECT t.id AS task_id, a.id AS issue_id
  FROM code_tasks t
  JOIN agent_issues a
    ON a.status IN ('closed', 'resolved')
   AND (t.id = 'ct_im' || a.id OR instr(t.goal, '[issue #' || a.id || ']') = 1 OR (t.id = 'ct_plain_language_1' AND a.id = 100029))
   AND EXISTS (SELECT 1 FROM issue_triage i WHERE i.issue_id = a.id AND TRIM(COALESCE(i.close_evidence, '')) <> '')
 WHERE t.status = 'needs_human';

UPDATE code_tasks SET
  status = 'superseded',
  last_error = CASE WHEN COALESCE(last_error, '') = '' THEN '' ELSE last_error || ' | ' END
    || 'superseded: issue ' || (SELECT MIN(v.issue_id) FROM v_parked_task_issue_closed v WHERE v.task_id = code_tasks.id)
    || ' closed with evidence (PARKED-TASK-ISSUE-CLOSED-1)',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'needs_human'
  AND id IN (SELECT task_id FROM v_parked_task_issue_closed);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('parked-task-outlives-issue',
  'a code task parked as needs_human stays on the owner queue after its issue closed with evidence, so closed work keeps asking the owner to review or drop it',
  'nothing superseded a parked code task when its issue closed: the dashboard defines parked only as code_tasks.status = needs_human, the loop parks a task when it cannot finish it (MERGE-SCOPE-AT-READ-1 until 2026-10-19T12:06:43Z, repeated no-op proposals) and a session or a later change then fixes the issue by another route; the task row was never revisited (5 of 7 owner-queue tasks on 2026-10-19)',
  'PARKED-TASK-ISSUE-CLOSED-1 (migrations/2026-10-19-parked-task-issue-closed.sql): the trigger agent_issues_parked_task_superseded_upd supersedes the task in the statement that closes its issue, the one-time statement cleared the seven existing rows (five at first measurement, seven at landing), the view v_parked_task_issue_closed lists any that remain; offline suite migrations/parked-task-issue-closed.test.mjs',
  'no code_tasks row with status needs_human maps to an issue that is closed or resolved with close evidence (v_parked_task_issue_closed is empty)',
  'fm-parked-task-outlives-issue', '2026-10-19', NULL,
  'an issue closes while a code task for it is parked, or a task is parked for an issue that is already closed (the loop re-reads an old row), or the trigger is dropped',
  'the owner queue and the KPI count work that is finished as needing the owner ("Code task parked: ... Review or drop it."), and the loop breaker keeps counting its last_error',
  'the owner queue, the needs_person count on the code-loop flow and the owner-attention KPI; no merge or deploy is affected');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-parked-task-outlives-issue', NULL, 'PARKED-TASK-ISSUE-CLOSED-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(DISTINCT task_id) FROM v_parked_task_issue_closed) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

CREATE TRIGGER IF NOT EXISTS agent_issues_parked_task_superseded_upd AFTER UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed', 'resolved') AND COALESCE(OLD.status, '') NOT IN ('closed', 'resolved')
  AND EXISTS (SELECT 1 FROM issue_triage i WHERE i.issue_id = NEW.id AND TRIM(COALESCE(i.close_evidence, '')) <> '')
BEGIN
  UPDATE code_tasks SET
    status = 'superseded',
    last_error = CASE WHEN COALESCE(last_error, '') = '' THEN '' ELSE last_error || ' | ' END
      || 'superseded: issue ' || NEW.id || ' closed with evidence (PARKED-TASK-ISSUE-CLOSED-1)',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE status = 'needs_human'
    AND (id = 'ct_im' || NEW.id OR instr(goal, '[issue #' || NEW.id || ']') = 1 OR (id = 'ct_plain_language_1' AND NEW.id = 100029));
END;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a code task the loop parked as needs_human is finished history once its issue is closed with close evidence (the issue''s own probe passed), so asking the owner to review or drop it is a false request; a parked task whose issue is still open (ct_agpn0vekiunr2f for issue 100047) is legitimately parked and is left alone; superseded is the status the loop already uses for work overtaken by events, and the row, its history and a backup are kept, so nothing is dropped',
  'PARKED-TASK-ISSUE-CLOSED-1: seven parked tasks (ct_im100072, ct_im100073, ct_im100075, ct_im100091, ct_im100142, ct_im100158, ct_plain_language_1) move to superseded with the reason appended to last_error; the trigger agent_issues_parked_task_superseded_upd does the same when an issue closes; failure mode parked-task-outlives-issue with the detector fm-parked-task-outlives-issue',
  'qnfo-audit 2026-10-19 (SELECT only): at 13:2xZ code_tasks needs_human = 7, at 14:5xZ = 8; the issues of ct_im100072, ct_im100073, ct_im100075, ct_im100091, ct_im100142, ct_im100158 and (by the issue text) ct_plain_language_1 are closed with close_evidence and passing verifications (the view v_parked_task_issue_closed returned exactly these seven pairs at 14:5xZ); issue 100047 (ct_agpn0vekiunr2f) is open, so that task stays parked (the audit''s 13:07Z claim that ct_im100142 belonged to a closed issue was wrong at the 13:2xZ re-read and has since become true); 5 earlier superseded rows show the status and last_error shapes the dashboard reads; offline suite migrations/parked-task-issue-closed.test.mjs replays the live table and trigger texts',
  'migration merged',
  'seven code_tasks rows (status, last_error, updated_at), one trigger on agent_issues that is a leaf (one UPDATE of code_tasks), one view, registry rows; no worker, cap, threshold or hold changes; the owner queue shrinks from 8 to 1',
  'the Rollback header (drop the trigger and the view, restore status, last_error and updated_at from bak_20261019_parked_tasks, delete the registry rows)',
  'a parked code task closes itself when its issue closes with evidence, so the owner queue lists only work that is still open',
  'human_actions_open < 8 within 6 h',
  'none',
  'd1:qnfo-audit code_tasks, agent_issues, issue_triage, issue_lifecycle, sqlite_master (SELECT only); offline node:sqlite suite migrations/parked-task-issue-closed.test.mjs on the live table and trigger texts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PARKED-TASK-ISSUE-CLOSED-1:') = 1);

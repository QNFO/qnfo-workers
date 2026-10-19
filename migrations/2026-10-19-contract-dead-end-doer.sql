-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_issue_dead_end; DELETE FROM remediation_contracts WHERE class = 'fm-open-issue-no-doer'; DELETE FROM failure_modes WHERE fm_key = 'open-issue-no-doer';
--
-- DEAD-END-DOER-1 (2026-10-19, charter pillar autonomy; cluster metrics-sla-queue/open-issue-dead-end-contract-states of
-- docs/handoff/2026-10-19-closeout.md; owner directive OWNER-NO-LOOSE-ENDS-1: "never leave open issues unresolved or unremediated")
--
-- MEASURED 2026-10-19 13:15Z (qnfo-audit, read only; the view below, run as a SELECT)
--   172 open issues; 33 non-metric ones older than 120 minutes have no active or holding contract (closeout step 8 counted 40 at 08:00Z; two
--   sibling sessions re-armed or closed 2935 and 2931 meanwhile). Newest contract verdict: closure-observing-probe 18 (6 of them at birth),
--   probe-unusable 11, needs-machine-probe 3, closure-superseded 1. Lanes: planner-untrusted 23, doer-merged-dod-unmeasured 6 (2925, 2927, 2928,
--   2937, 2938, 100130: the task merged and nothing measures the definition of done), task-ended 2, planner-not-code 1, unplanned 1, none in
--   flight. 9 are high priority. issues_without_next_action reads 70.
--   The planner records outcome untrusted because it refuses an origin that is a session, a chat or a tool event (PLAN_TRUSTED), so it never
--   plans a code task for 23 of the 33.
--
-- WHY THE CLOSEOUT'S STEP 8 IS NOT BUILT AS WRITTEN
--   Step 8 hands each such issue to red-drain's step-3 dispatch as a code_tasks row whose goal is "write a probe that measures the defect".
--   Read on origin/main, that does not work and would be unsafe:
--     1 a probe is a row in remediation_contracts, written by a migration. code_tasks.path is NOT NULL and is the task's primary file (claim,
--       VERSION bump, mirror); qnfo-code-orchestrator enqueue() runs mergeScopeWhy() and refuses a primary that is not <worker>/worker.js with its
--       mirror, docs/**.md, <dir>/README.md or scripts/*.py|*.mjs. A migration can travel only as a companion file (extras, MULTI-FILE-CODE-TASKS-1,
--       ops_config code_merge_multi_file on) of such a task, so a task whose whole job is a probe has no honest primary file to carry it;
--     2 a direct INSERT into code_tasks skips planTrusted(): it turns text from an origin the planner deliberately refuses into a code task.
--       Step 3 does that only for a code-task: line the issue's author wrote; a generated dispatch for 23 untrusted issues would widen it;
--     3 a model asked for a probe for a defect it cannot observe writes the circular or vacuous probe that CLOSE-PROBE-CIRCULAR-1 and
--       CLOSE-BINDS-TO-PROBE-1 exist to remove (the probe reads the issue's own status): the probe needs the author to know the defect.
--   So no step is added to red-drain and no task is created. What the fleet lacked was a place that names the doer and a detector that counts the
--   population; both are built here. The doer of a dead end is a probe author (a session, or the loop that owns the issue) who writes the
--   measuring probe as a migration; migrations/2026-10-19-high-issue-probes.sql does that for five high issues and is the pattern.
--
-- WHAT THIS FILE ADDS (no row of any existing table changes, no hold, cap, filter or gate)
--   v_issue_dead_end     one row per open non-metric issue older than 120 minutes with no active or holding contract: its newest contract and why
--                        it is not live (reason), whether it has a code-task: line, the status of its newest code task, the planner outcome, the
--                        lane (task-in-flight, doer-merged-dod-unmeasured, task-ended, planner-untrusted, planner-<outcome>, unplanned) and the
--                        next actor (qnfo-code-orchestrator while a task is in flight, probe-author otherwise). METRIC-TRIGGER issues are left
--                        out: TRIGGER-RECOVERY-1 closes them when the metric converges and does not read contracts.
--   failure mode open-issue-no-doer and its detector contract fm-open-issue-no-doer: the count of rows whose lane is not task-in-flight, expected 0,
--                        hourly. It reads 33 today and falls as probes are written; a rise is a new dead end.
-- A needs-machine-probe or superseded contract is not re-armed here: re-arming the circular closure-observing probe is the CLOSE-BINDS-TO-PROBE-1
-- deadlock (issue 3011). Loop-filed issues under the 48 h loop template (active) are not dead ends and are not in the view.
-- spof-review: one view, one failure-mode row, one detector contract; nothing on a critical path.

CREATE VIEW IF NOT EXISTS v_issue_dead_end AS
SELECT y.*,
  CASE WHEN y.lane = 'task-in-flight' THEN 'qnfo-code-orchestrator' ELSE 'probe-author' END AS next_actor
FROM (
  SELECT x.*,
    CASE
      WHEN x.code_task_status IS NOT NULL AND x.code_task_status NOT IN ('merged', 'failed', 'closed', 'superseded', 'needs_human') THEN 'task-in-flight'
      WHEN x.code_task_status = 'merged' THEN 'doer-merged-dod-unmeasured'
      WHEN x.code_task_status IS NOT NULL THEN 'task-ended'
      WHEN x.planner_outcome = 'untrusted' THEN 'planner-untrusted'
      WHEN x.planner_outcome IS NOT NULL THEN 'planner-' || x.planner_outcome
      ELSE 'unplanned'
    END AS lane
  FROM (
    SELECT a.id AS issue_id, a.priority, a.source,
      CAST((CAST(strftime('%s', 'now') AS INTEGER) - a.created_at / 1000) / 60 AS INTEGER) AS age_min,
      c.class AS contract_class, c.status AS contract_status,
      CASE
        WHEN c.class IS NULL THEN 'no-contract'
        WHEN c.status = 'needs-machine-probe' THEN 'needs-machine-probe'
        WHEN instr(COALESCE(c.last_verdict, ''), 'superseded:probe-unusable') = 1 THEN 'probe-unusable'
        WHEN instr(COALESCE(c.last_verdict, ''), 'superseded:closure-observing') = 1 THEN 'closure-observing-probe'
        WHEN instr(COALESCE(c.last_verdict, ''), 'superseded:closure-superseded') = 1 THEN 'closure-superseded'
        ELSE COALESCE(c.status, 'unknown')
      END AS reason,
      CASE WHEN instr(COALESCE(a.description, ''), 'code-task:') > 0 THEN 1 ELSE 0 END AS has_code_task_line,
      (SELECT t.status FROM code_tasks t WHERE t.goal LIKE '%issue #' || a.id || ' %' OR t.goal LIKE '%issue #' || a.id || ']%'
         ORDER BY t.created_at DESC LIMIT 1) AS code_task_status,
      (SELECT p.outcome FROM issue_plans p WHERE p.issue_id = a.id) AS planner_outcome
    FROM agent_issues a
    LEFT JOIN remediation_contracts c ON c.class = (SELECT c0.class FROM remediation_contracts c0 WHERE c0.issue_id = a.id ORDER BY c0.ts DESC, c0.class DESC LIMIT 1)
    WHERE a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%'
      AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
      AND NOT EXISTS (SELECT 1 FROM remediation_contracts k WHERE k.issue_id = a.id AND k.status IN ('active', 'holding'))
  ) x
) y
ORDER BY CASE y.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, y.age_min DESC, y.issue_id;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('open-issue-no-doer',
   'an open issue has no active contract and no code task in flight, so nothing verifies it and nothing acts on it',
   'CLOSE-PROBE-CIRCULAR-1 supersedes the generic closure-observing probe, so a session-filed issue is born without a live contract; the planner refuses a session, chat or tool-event origin as untrusted (PLAN_TRUSTED), so it never plans one; and the code loop cannot write the missing probe: a probe is a migration, which can travel only as a companion of a worker.js, doc or script task (code_tasks.path is not null and enqueue refuses any other primary), and a model that cannot observe the defect writes the circular probe again',
   'DEAD-END-DOER-1: v_issue_dead_end names each issue, why it is not live, its lane and its next actor; the probe author (a session or the loop that owns the issue) writes a measuring probe as a migration, as HIGH-ISSUE-PROBES-1 does; fm-open-issue-no-doer counts the issues no task is working on',
   'fm-open-issue-no-doer: SELECT COUNT(*) FROM v_issue_dead_end WHERE lane <> task-in-flight, expected 0',
   'fm-open-issue-no-doer', '2026-10-19', NULL,
   'an open non-metric issue older than 120 minutes whose contracts are all superseded, needs-machine-probe, monitoring or escalated, with no unfinished code task',
   'issues_without_next_action above 0; an open issue with superseded:closure-observing-probe or superseded:probe-unusable as its newest contract verdict',
   'every such issue stays open until someone writes its close_evidence by hand: 33 on 2026-10-19, 9 of them high priority');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-open-issue-no-doer', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_issue_dead_end WHERE lane <> ''task-in-flight'') AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'DEAD-END-DOER-1', 'failure-mode detector: open issues with no live contract and no task in flight, listed with their lane in v_issue_dead_end', 'qnfo-fleet-control');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'dispatching dead-end issues to the code loop as probe-writing tasks, as closeout step 8 proposed, has no primary file that can carry a probe (a migration is only a companion of a worker.js, doc or script task) and would bypass the planner trust gate, so the safe lever is to name the doer and count the population',
  'DEAD-END-DOER-1: view v_issue_dead_end, failure mode open-issue-no-doer and detector contract fm-open-issue-no-doer added; no red-drain step, no code task, no contract re-armed',
  'read 2026-10-19 13:15Z: 33 open non-metric issues older than 120 minutes without an active or holding contract; newest verdicts closure-observing 18, probe-unusable 11, needs-machine-probe 3, closure-superseded 1; lanes planner-untrusted 23, doer-merged-dod-unmeasured 6; qnfo-code-orchestrator mergeScopeWhy refuses a migration as the primary path and extraWhy allows it only as a companion; code_tasks.path NOT NULL; issues_without_next_action 70',
  'migration merged', 'one view, one failure-mode row, one detector contract', 'see the Rollback header',
  'the open issues nothing acts on are listed with the reason and the actor who must write the probe, and a rise is detected within the hour',
  'contracts_unexecutable_open = 0 within 2 h',
  'the probe author has one queue to work from, ordered by priority and age',
  'd1:qnfo-audit agent_issues, remediation_contracts, code_tasks, issue_plans; qnfo-code-orchestrator/worker.js mergeScopeWhy and planIssues read'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'DEAD-END-DOER-1:') = 1);

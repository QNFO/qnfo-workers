-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM research_queue WHERE source = 'owner-task' AND source_id = 'int-12c5dfa2mw923hks'; UPDATE issue_triage SET close_evidence = NULL WHERE issue_id = 1002684 AND close_evidence LIKE 'OWNER-TASKS-AUTO-1:%';
-- CAUSE-MAPPED: no metric registered; disposition for INTENT-TASK issue 1002684 and a doer issue for the owner-task backlog

-- OWNER-TASKS-AUTO-1 (owner directive 2026-11-09: "THE SYSTEM SHALL ALWAYS RESOLVE ALL OWNER-TASKS AUTOMATICALLY"; pillar autonomy).
-- Read from qnfo-audit 2026-11-09: no human_actions card is open (232 resolved, 52 rerouted); the 14 open owner-task issues
-- have no doer: 13 carry planner outcome retry or not-code (planned_at 2000-01-01), and INTENT-TASK 1002684 was refused as
-- an untrusted source (PLAN_TRUSTED) although it asks only to queue research.

-- 1. The research request of INTENT-TASK 1002684 is acted on: queued for the research pipeline (idempotent on source, source_id).
INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at, stage)
VALUES ('owner-task-int-12c5dfa2mw923hks', 'owner-task', 'int-12c5dfa2mw923hks',
  'Deep-dive follow-up on "Excluded Middle as Computational Boundary": ontological consequences of constructivist vs classical logic for computation',
  'Investigate (1) a formal comparison of choice sequences vs the Turing tape as models of physical reality, (2) the empirical testability of epistemic incompleteness claims, (3) architectural proposals that embody rather than simulate constructivist principles. Source paper: https://papers.qnfo.org/papers/excluded-middle-as-computational-boundary',
  1.0, 'owner-request', 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'idea');

UPDATE issue_triage SET close_evidence = 'OWNER-TASKS-AUTO-1: the request (add a deep-dive follow-up to the research pipeline) is done: research_queue row owner-task-int-12c5dfa2mw923hks (source owner-task, status queued) was inserted by migrations/2026-11-09-owner-tasks-auto-resolve.sql; the research executor takes it from there. Read before: agent_issues 1002684 planner outcome untrusted (PLAN_TRUSTED), no doer.'
WHERE issue_id = 1002684 AND close_evidence IS NULL;

-- 2. The other 13 owner-task issues get a doer: one umbrella issue with a code-task for the planner, so owner tasks that are
--    not single-file code are decomposed into doer issues instead of parking at retry with planned_at 2000-01-01.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'OWNER-TASKS-AUTO-1: owner-task issues with planner outcome retry/not-code get no doer (13 open, oldest 477 h)',
'13 open OWNER-TASK issues (ids 100384, 1000779, 1000780, 1000813, 1000822, 1000823, 1000941, 1001605, 1002454-1002458) have doer null and v_issue_age_ladder plan_outcome retry or empty, planned_at 2000-01-01. Owner directive 2026-11-09: the system always resolves all owner tasks automatically.
code-task: repo=qnfo-workers path=qnfo-code-orchestrator/worker.js
code-anchor: await record(r.id, "untrusted", "source " + String(r.source || "(none)").slice(0, 80) + " is not a trusted origin of code changes (PLAN_TRUSTED)");
Edit: for an issue whose source is qnfo-fleet-dashboard:owner-request, when the planner verdict is not-code or the change spans many files, write one child code-task per file/worker named in the text (or a research_queue / ops action for non-code asks) instead of leaving plan_outcome retry; an owner-request source is never recorded untrusted.
Closing probe: SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM v_issue_age_ladder WHERE (title LIKE ''OWNER-TASK-%'' OR title LIKE ''INTENT-TASK-%'') AND doer IS NULL AND age_h > 24',
'owner-tasks-auto-1', 'autonomy', 'critical', 'open', CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'OWNER-TASKS-AUTO-1:%' AND status = 'open');

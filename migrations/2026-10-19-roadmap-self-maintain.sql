-- ROADMAP-SELF-MAINTAIN-1 (2026-10-19, pillar autonomy). Owner directive 2026-10-18, restated in the project thread:
-- "the system populates and maintains its own roadmap, backlog, issues and portfolio/programs/projects".
--
-- WHAT ALREADY RUNS (read from qnfo-audit 2026-10-19 ~04:05Z; every cron fired ok within the hour)
--   roadmap-backlog-sync (hourly :00)   roadmap rows from open high/critical issues (AI-), failure modes (FM-), goals (GL-)
--   portfolio-self-manage (:40)         PROJ- and NEXT- rows per project, program health, owner and compat gaps
--   portfolio-lifecycle (:10)           deploy -> project ledger/state, phases, freshness, stale/unrecorded gaps
--   portfolio-autopilot (:20)           gap -> agent_issue -> gap closed when the issue closes
--   portfolio-gap-action (:25), portfolio-execute (:50), portfolio-deploy-sync (:20)
--   qnfo-github-steward (10 min)        projects from service_registry, issue -> project map, metric breaches as roadmap
--                                       objectives, mirror to GitHub labels/milestones/issues (PORTFOLIO-SYNC-1, TRACKER-SYNC-1)
--   So issues, projects and the GitHub mirror are populated. What is not maintained is the TOP of the hierarchy:
--
-- WHAT WAS MISSING (same read)
--   1. Goals never close. 61 goals are 'adopted', the newest change 2026-10-14. 14 carry a machine-checkable DoD
--      ("Done when this query reads ok or 1: SELECT ... AS expected ..." or a code-read spec) and nothing runs it, so the
--      55 GL- roadmap rows can only ever read 'open'. The DoD queries were written to be run; none ever was.
--   2. Programs have no objective of their own: QNFO.REACH and QNFO.PERSONAL hold 0 adopted goals, so the program layer
--      has nothing to be measured against except what a person writes by hand.
--   3. 13 adopted goals have no program (program_code NULL), and 4 research goals by qnfo-goal-author sit in QNFO.OPS
--      (braid statistics, Verlinde formula, GKP qubit, exchange statistics), so the program rollups are wrong.
--   4. Roadmap rows that can never close: 11 NEXT- rows stay 'planned' after their project gets mapped work; PROJ- rows
--      only verify on 'completed', never on 'archived'/'retired'; GL- rows only on completed/retired, never on
--      resolved/superseded/rejected, and never reopen when a goal regresses; FM- rows without an issue never verify.
--   5. roadmap_implementation carries no program or project, so "the roadmap of program X" cannot be read, and nothing
--      orders it (now / next / later).
--
-- WHAT THIS ADDS (one workflow, hourly at :30, no worker deploy; the two existing contract runners do the probing)
--   goal_lifecycle            append-only ledger of every goal status or program change this loop makes
--   v_goal_dod                each goal's DoD as a probe (d1-query or code-read) when it is machine-checkable
--   v_goal_evidence           latest verdict per goal-<key> contract, from both evidence sinks (v_remediation_evidence_all)
--   v_goal_status             goal + DoD + latest verdict + failures since the last pass
--   v_goal_program_fix        goals whose program is missing or misfiled, with the program they belong to
--   v_program_objective_seed  one living objective per program: "no open defect in the program" (PRG-<code>-DEFECTS-0)
--   v_roadmap                 every roadmap row with its program, project, placement and horizon (now/next/later/done)
--   v_portfolio_tree          portfolio -> program rollup: projects, open issues, roadmap by horizon, goals by state
--   fleet_tasks roadmap-self-maintain, steps in order:
--     programs      assign/repair goal programs (logged first)
--     objectives    seed each program's objective goal (logged first)
--     contracts     a remediation_contracts row 'goal-<key>' (issue_id NULL, module goal-dod-v1) per machine-checkable goal,
--                   kept in sync with the DoD, retired with the goal, re-activated if another sweep parks it
--                   (qnfo-fleet-control remediationContractsTick runs d1-query; scripts/remediation_consumer.py runs
--                   d1-query and code-read: two independent runners)
--     complete      adopted -> completed when the latest verdict passed within 120 minutes
--     reopen        completed -> adopted after two failed verdicts since the last pass (only goals this loop completed)
--     roadmap       GL- verify/reopen on goal state, NEXT- verify when work is mapped or the project leaves 'active',
--                   PROJ- verify on archived/retired, FM- verify when the detector reads 'absent' and no open issue
--     metrics       goals_unevaluated, goals_without_machine_dod, roadmap_open_unplaced, goals_completed_7d
--     ledger        one cloud_ops_events row per run
--   objective-revision goals (owner ratification, fleet.qnfo.org) are excluded from every step.
--
-- SAFETY
--   Nothing is deleted. Every write is idempotent (NOT EXISTS / OR IGNORE / predicate on current state). A goal completes
--   only on recorded probe evidence, and the same evidence reopens it. Goals are backed up first.
--   Stop without a deploy: UPDATE fleet_crons SET enabled = 0 WHERE name = 'roadmap-self-maintain-hourly'.
--
-- Verify after apply:
--   SELECT COUNT(*) FROM remediation_contracts WHERE module = 'goal-dod-v1';                 -- 19 (14 checkable goals + 5 program objectives)
--   SELECT status, COUNT(*) FROM fleet_runs WHERE task_id = 'roadmap-self-maintain' GROUP BY 1;  -- ok within the hour
--   SELECT * FROM v_portfolio_tree;  SELECT horizon, COUNT(*) FROM v_roadmap GROUP BY 1;
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_crons SET enabled = 0 WHERE name = 'roadmap-self-maintain-hourly'; UPDATE fleet_tasks SET enabled = 0 WHERE id = 'roadmap-self-maintain'; UPDATE goals SET status = (SELECT b.status FROM bak_20261019_goals_rsm b WHERE b.goal_key = goals.goal_key), program_code = (SELECT b.program_code FROM bak_20261019_goals_rsm b WHERE b.goal_key = goals.goal_key), completed_at = (SELECT b.completed_at FROM bak_20261019_goals_rsm b WHERE b.goal_key = goals.goal_key) WHERE goal_key IN (SELECT goal_key FROM bak_20261019_goals_rsm); UPDATE goals SET status = 'retired', retired_at = datetime('now') WHERE source = 'ROADMAP-SELF-MAINTAIN-1'; UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback' WHERE module = 'goal-dod-v1'; UPDATE metric_registry SET state = 'RETIRED' WHERE metric IN ('goals_unevaluated','goals_without_machine_dod','roadmap_open_unplaced','goals_completed_7d'); UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key IN ('goals_unevaluated','roadmap_open_unplaced'). The views and goal_lifecycle are additive and may stay.

CREATE TABLE IF NOT EXISTS bak_20261019_goals_rsm AS SELECT * FROM goals;

CREATE TABLE IF NOT EXISTS goal_lifecycle (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  goal_key TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  action TEXT NOT NULL,
  evidence TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_goal_lifecycle_goal ON goal_lifecycle (goal_key, ts);

-- A DoD is machine-checkable when it carries a d1-query probe (a SELECT that names its expected value) or a code-read
-- spec ({"paths": [...], "contains"|"absent": ...}, the CODE-READ-PROBE-1 shape). The semicolon normalisation is the one
-- the remediation_probe_semicolon_* triggers apply, so the contract sync below compares like with like.
CREATE VIEW IF NOT EXISTS v_goal_dod AS
SELECT g.id, g.goal_key, g.status, g.goal_type, g.program_code, g.owner, g.priority,
  CASE WHEN instr(COALESCE(g.dod, ''), '{"paths"') > 0 THEN 'code-read'
       WHEN instr(COALESCE(g.dod, ''), 'SELECT ') > 0 AND instr(COALESCE(g.dod, ''), 'AS expected') > 0 THEN 'd1-query'
  END AS transport,
  CASE WHEN instr(COALESCE(g.dod, ''), '{"paths"') > 0 THEN trim(substr(g.dod, instr(g.dod, '{"paths"')))
       WHEN instr(COALESCE(g.dod, ''), 'SELECT ') > 0 AND instr(COALESCE(g.dod, ''), 'AS expected') > 0
         THEN replace(rtrim(trim(substr(g.dod, instr(g.dod, 'SELECT '))), ';'), ';', ',')
  END AS probe
FROM goals g
WHERE g.goal_type <> 'objective-revision';

CREATE VIEW IF NOT EXISTS v_goal_evidence AS
SELECT class, pass, observed, vt AS verified_at
FROM (
  SELECT e.class, e.pass, e.observed, replace(substr(e.verified_at, 1, 19), 'T', ' ') AS vt,
    ROW_NUMBER() OVER (PARTITION BY e.class ORDER BY replace(substr(e.verified_at, 1, 19), 'T', ' ') DESC, e.id DESC) AS rn
  FROM v_remediation_evidence_all e
  WHERE e.class >= 'goal-' AND e.class < 'goal.'
)
WHERE rn = 1;

CREATE VIEW IF NOT EXISTS v_goal_status AS
SELECT d.goal_key, d.status, d.program_code, d.owner, d.transport, d.probe,
  ev.pass AS last_pass, ev.observed AS last_observed, ev.verified_at AS last_verified_at,
  (SELECT COUNT(*) FROM v_remediation_evidence_all e
    WHERE e.class = 'goal-' || d.goal_key AND e.pass = 0
      AND replace(substr(e.verified_at, 1, 19), 'T', ' ') > COALESCE(
        (SELECT MAX(replace(substr(e2.verified_at, 1, 19), 'T', ' ')) FROM v_remediation_evidence_all e2
          WHERE e2.class = 'goal-' || d.goal_key AND e2.pass = 1), '1970-01-01')) AS fails_since_pass
FROM v_goal_dod d
LEFT JOIN v_goal_evidence ev ON ev.class = 'goal-' || d.goal_key;

-- Program placement. Personal-twin owners go to QNFO.PERSONAL (PERSONAL-QNFO-SEPARATION-1 keeps them apart), research
-- statements by the goal author go to QNFO.RSCH, skill-sync work and goals that start with "Deploy " to QNFO.INFRA, everything else unplaced to
-- QNFO.OPS. An existing program is only changed for the research case.
CREATE VIEW IF NOT EXISTS v_goal_program_fix AS
SELECT goal_key, status, program_code, target_program
FROM (
  SELECT g.goal_key, g.status, g.program_code,
    CASE
      WHEN g.program_code IS NULL AND g.owner IN ('personal-api', 'personal-companion', 'radar-hub', 'personal-life') THEN 'QNFO.PERSONAL'
      WHEN g.owner = 'qnfo-goal-author' AND COALESCE(g.program_code, '') <> 'QNFO.RSCH'
        AND (instr(lower(g.statement), 'quantum') > 0 OR instr(lower(g.statement), 'braid') > 0
          OR instr(lower(g.statement), 'topolog') > 0 OR instr(lower(g.statement), 'qubit') > 0
          OR instr(lower(g.statement), 'anyon') > 0 OR instr(lower(g.statement), 'verlinde') > 0
          OR instr(lower(g.statement), 'exchange statistics') > 0 OR instr(lower(g.statement), 'majorana') > 0
          OR instr(lower(g.statement), 'neuromorphic') > 0) THEN 'QNFO.RSCH'
      WHEN g.program_code IS NULL AND (instr(lower(g.statement), 'skill-sync') > 0 OR instr(lower(g.statement), 'qnfo-skills') > 0
          OR instr(lower(g.statement), 'deploy ') = 1) THEN 'QNFO.INFRA'
      WHEN g.program_code IS NULL THEN 'QNFO.OPS'
      ELSE g.program_code
    END AS target_program
  FROM goals g
  WHERE g.status IN ('proposed', 'adopted') AND g.goal_type <> 'objective-revision'
)
WHERE target_program IS NOT program_code
  AND target_program IN (SELECT program_code FROM programs);

-- One living objective per program. It completes when the program has no open defect and reopens when one appears.
CREATE VIEW IF NOT EXISTS v_program_objective_seed AS
SELECT 'PRG-' || replace(p.program_code, '.', '-') || '-DEFECTS-0' AS goal_key,
  p.program_code,
  'PRG-' || replace(p.program_code, '.', '-') || '-DEFECTS-0: ' || p.name || ' runs with no open defect (every issue mapped to the program resolved, deployed and closed)' AS statement,
  'Done when this query reads ok or 1: SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM issue_project_map m JOIN agent_issues a ON a.id = m.issue_id WHERE a.status = ''open'' AND m.program_code = '''
    || p.program_code || ''') = 0 THEN ''ok'' ELSE ''open defects in ' || p.program_code || ': '' || (SELECT COUNT(*) FROM issue_project_map m JOIN agent_issues a ON a.id = m.issue_id WHERE a.status = ''open'' AND m.program_code = '''
    || p.program_code || ''') END AS observed' AS dod
FROM programs p
WHERE NOT EXISTS (SELECT 1 FROM goals g WHERE g.goal_key = 'PRG-' || replace(p.program_code, '.', '-') || '-DEFECTS-0');

-- The roadmap with its place in the hierarchy. Placement: the GitHub mirror's project (roadmap_gh_links), else the
-- project the row names (PROJ-/NEXT-/IMP-/UPG-), else the issue's project (AI-, or FM- through its issue), else the goal's
-- program (GL-). Metric-breach objectives and issue-less failure modes are fleet operations by construction and default to
-- QNFO.OPS (placement 'default-ops'). Horizon: now = open work on a high/critical issue or a live metric breach; next =
-- machine-checkable goals, next deliverables, failure modes and implementation/upgrade items; later = the rest; done = closed.
CREATE VIEW IF NOT EXISTS v_roadmap AS
SELECT x.*,
  ROW_NUMBER() OVER (ORDER BY CASE x.horizon WHEN 'now' THEN 0 WHEN 'next' THEN 1 WHEN 'later' THEN 2 ELSE 3 END, x.prank, x.id) AS pos
FROM (
  SELECT b.id, b.item, b.source, b.title, b.status, b.artifact_type, b.artifact_ref, b.created_at, b.verified_at,
    b.project_code,
    COALESCE(pj.program_code, b.issue_program, b.goal_program,
      CASE WHEN b.source = 'metric-breach' OR b.item LIKE 'FM-%' THEN 'QNFO.OPS' END) AS program_code,
    CASE WHEN pj.program_code IS NOT NULL OR b.issue_program IS NOT NULL OR b.goal_program IS NOT NULL THEN 'mapped'
         WHEN b.source = 'metric-breach' OR b.item LIKE 'FM-%' THEN 'default-ops'
    END AS placement,
    CASE
      WHEN b.status IN ('verified', 'enforced-verified', 'violated-remediated', 'retired', 'built') THEN 'done'
      WHEN b.source = 'metric-breach' OR (b.item LIKE 'AI-%' AND b.issue_priority IN ('critical', 'high')) THEN 'now'
      WHEN (b.item LIKE 'GL-%' AND b.goal_checkable = 1) OR b.item LIKE 'NEXT-%' OR b.item LIKE 'FM-%'
        OR b.item LIKE 'IMP-%' OR b.item LIKE 'UPG-%' THEN 'next'
      ELSE 'later'
    END AS horizon,
    CASE b.issue_priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END AS prank
  FROM (
    SELECT r.*,
      COALESCE(gl.project_code,
        CASE WHEN r.item LIKE 'PROJ-%' OR r.item LIKE 'NEXT-%' OR r.item LIKE 'IMP-%' OR r.item LIKE 'UPG-%'
             THEN (SELECT p.project_code FROM projects p WHERE p.project_code = r.artifact_ref) END,
        mi.project_code, mf.project_code) AS project_code,
      COALESCE(mi.program_code, mf.program_code) AS issue_program,
      g.program_code AS goal_program,
      CASE WHEN instr(COALESCE(g.dod, ''), '{"paths"') > 0
             OR (instr(COALESCE(g.dod, ''), 'SELECT ') > 0 AND instr(COALESCE(g.dod, ''), 'AS expected') > 0) THEN 1 ELSE 0 END AS goal_checkable,
      COALESCE(ai.priority, af.priority) AS issue_priority
    FROM roadmap_implementation r
    LEFT JOIN roadmap_gh_links gl ON gl.roadmap_id = r.id
    LEFT JOIN issue_project_map mi ON r.item LIKE 'AI-%' AND mi.issue_id = CAST(substr(r.item, 4) AS INTEGER)
    LEFT JOIN agent_issues ai ON r.item LIKE 'AI-%' AND ai.id = CAST(substr(r.item, 4) AS INTEGER)
    LEFT JOIN failure_modes f ON r.item LIKE 'FM-%' AND f.fm_key = substr(r.item, 4)
    LEFT JOIN issue_project_map mf ON mf.issue_id = f.issue_id
    LEFT JOIN agent_issues af ON af.id = f.issue_id AND af.status = 'open'
    LEFT JOIN goals g ON r.item LIKE 'GL-%' AND g.goal_key = substr(r.item, 4)
  ) b
  LEFT JOIN projects pj ON pj.project_code = b.project_code
) x;

CREATE VIEW IF NOT EXISTS v_portfolio_tree AS
SELECT p.portfolio_code, p.program_code, p.name,
  (SELECT COUNT(*) FROM projects j WHERE j.program_code = p.program_code AND j.status = 'active') AS projects_active,
  (SELECT COUNT(*) FROM issue_project_map m JOIN agent_issues a ON a.id = m.issue_id AND a.status = 'open' WHERE m.program_code = p.program_code) AS open_issues,
  (SELECT COUNT(*) FROM v_roadmap r WHERE r.program_code = p.program_code AND r.horizon = 'now') AS roadmap_now,
  (SELECT COUNT(*) FROM v_roadmap r WHERE r.program_code = p.program_code AND r.horizon = 'next') AS roadmap_next,
  (SELECT COUNT(*) FROM v_roadmap r WHERE r.program_code = p.program_code AND r.horizon = 'later') AS roadmap_later,
  (SELECT COUNT(*) FROM v_roadmap r WHERE r.program_code = p.program_code AND r.horizon = 'done') AS roadmap_done,
  (SELECT COUNT(*) FROM goals g WHERE g.program_code = p.program_code AND g.status = 'adopted') AS goals_adopted,
  (SELECT COUNT(*) FROM goals g WHERE g.program_code = p.program_code AND g.status = 'completed') AS goals_completed,
  (SELECT COUNT(*) FROM v_goal_dod d WHERE d.program_code = p.program_code AND d.status = 'adopted' AND d.transport IS NOT NULL) AS goals_checkable,
  (SELECT g.status FROM goals g WHERE g.goal_key = 'PRG-' || replace(p.program_code, '.', '-') || '-DEFECTS-0') AS objective_status
FROM programs p;

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state, last_value, last_refreshed)
VALUES
  ('goals_unevaluated', 'operational', 'guard',
   'adopted goals with a machine-checkable DoD (v_goal_dod) whose goal-<key> contract is older than 120 minutes and has no verdict in the last 120 minutes',
   'qnfo-audit.v_goal_status + remediation_contracts (ROADMAP-SELF-MAINTAIN-1), written hourly by fleet_tasks roadmap-self-maintain',
   '0', 'qnfo-fleet-control', 'agent:roadmap-self-maintain', 'hourly', 'MEASURED', NULL, NULL),
  ('goals_without_machine_dod', 'operational', 'lagging',
   'adopted goals (objective revisions excluded) whose DoD carries no d1-query or code-read probe, so no loop can close them. Exempt from a trigger: the research goals by qnfo-goal-author state a publication or experiment as their DoD, which no query decides; the number is kept for the program rollup',
   'qnfo-audit.v_goal_dod (ROADMAP-SELF-MAINTAIN-1), written hourly by fleet_tasks roadmap-self-maintain',
   'falling', 'qnfo-fleet-control', 'agent:roadmap-self-maintain', 'hourly', 'MEASURED', NULL, NULL),
  ('roadmap_open_unplaced', 'operational', 'guard',
   'open roadmap rows (v_roadmap horizon now/next/later) with no program: neither the GitHub mirror, the row, its issue nor its goal places it',
   'qnfo-audit.v_roadmap (ROADMAP-SELF-MAINTAIN-1), written hourly by fleet_tasks roadmap-self-maintain',
   '0', 'qnfo-fleet-control', 'agent:roadmap-self-maintain', 'hourly', 'MEASURED', NULL, NULL),
  ('goals_completed_7d', 'operational', 'lagging',
   'goals moved to completed by recorded DoD evidence in the last 7 days (goal_lifecycle action dod-passed)',
   'qnfo-audit.goal_lifecycle (ROADMAP-SELF-MAINTAIN-1), written hourly by fleet_tasks roadmap-self-maintain',
   'rising', 'qnfo-fleet-control', 'agent:roadmap-self-maintain', 'hourly', 'MEASURED', NULL, NULL);

INSERT OR IGNORE INTO analytics_metric_triggers
  (metric_key, title, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
  ('goals_unevaluated', 'Goals with a machine-checkable DoD are not being probed, so the roadmap cannot close them',
   'gt', 0, 6,
   'Pillar autonomy (ROADMAP-SELF-MAINTAIN-1). Read SELECT c.class, c.status, c.last_verdict, c.last_attempt_at, c.next_due_at FROM remediation_contracts c WHERE c.module = ''goal-dod-v1'' AND c.class IN (SELECT ''goal-'' || goal_key FROM v_goal_status WHERE status = ''adopted'' AND transport IS NOT NULL AND (last_verified_at IS NULL OR last_verified_at < datetime(''now'', ''-120 minutes''))). A contract that left status active was parked by another sweep and roadmap-self-maintain re-activates it on its next run; a last_verdict of probe-error or probe-not-machine-executable means the DoD text is not a runnable SELECT: correct the goal''s dod (the contract follows it within the hour). If every contract is active and due, check that qnfo-fleet-control remediationContractsTick and scripts/remediation_consumer.py are running. Definition of done: goals_unevaluated reads 0.',
   'qnfo-fleet-control', 'agent_issues', 2, 1,
   'ROADMAP-SELF-MAINTAIN-1 guard: an unprobed goal is a roadmap row that can never close'),
  ('roadmap_open_unplaced', 'Open roadmap items belong to no program, so no program rollup counts them',
   'gt', 0, 4,
   'Pillar autonomy (ROADMAP-SELF-MAINTAIN-1). Read SELECT id, item, source, artifact_ref, title FROM v_roadmap WHERE horizon <> ''done'' AND program_code IS NULL. Each source places its rows through one join in v_roadmap: GitHub mirror project (roadmap_gh_links, qnfo-github-steward), the project the row names, the issue''s project (issue_project_map), the goal''s program (goals.program_code, repaired hourly by roadmap-self-maintain). A row none of them places comes from a writer that names no project: extend that writer to set artifact_ref to a project_code, or mark the row verified/retired with evidence when it is obsolete. Definition of done: roadmap_open_unplaced reads 0.',
   'qnfo-fleet-control', 'agent_issues', 2, 1,
   'ROADMAP-SELF-MAINTAIN-1 guard: the roadmap is canonical only when every open row sits in the portfolio hierarchy');

INSERT OR IGNORE INTO sla_registry (sla_id, class, metric, threshold, window, owner, enforcement, breach_action, autofix, enabled)
VALUES ('SLA-GOAL-EVAL-120M', 'roadmap', 'adopted goals with a machine-checkable DoD and no verdict in 120 minutes (goals_unevaluated)', '0', '120m',
  'qnfo-fleet-control', 'v_goal_status', 'metric trigger goals_unevaluated files the issue; roadmap-self-maintain re-activates parked goal contracts', 1, 1);

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('roadmap-self-maintain', 'ROADMAP-SELF-MAINTAIN-1: goals and programs maintain themselves (DoD probes complete and reopen goals, program objectives, roadmap closure and placement)', 'workflow',
  '{"steps":[
    {"type":"sql","name":"programs-log","db":"AUDIT","sql":"INSERT INTO goal_lifecycle (goal_key, from_status, to_status, action, evidence) SELECT goal_key, status, status, ''program-assigned'', ''program '' || COALESCE(program_code, ''none'') || '' -> '' || target_program || '' (v_goal_program_fix)'' FROM v_goal_program_fix"},
    {"type":"sql","name":"programs","db":"AUDIT","sql":"UPDATE goals SET program_code = (SELECT f.target_program FROM v_goal_program_fix f WHERE f.goal_key = goals.goal_key), updated_at = datetime(''now'') WHERE goal_key IN (SELECT goal_key FROM v_goal_program_fix)"},
    {"type":"sql","name":"objectives-log","db":"AUDIT","sql":"INSERT INTO goal_lifecycle (goal_key, from_status, to_status, action, evidence) SELECT goal_key, NULL, ''adopted'', ''program-objective-seeded'', ''program '' || program_code || '' had no objective goal (v_program_objective_seed)'' FROM v_program_objective_seed"},
    {"type":"sql","name":"objectives","db":"AUDIT","sql":"INSERT OR IGNORE INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, priority, status, dod, owner, adopted_at, program_code) SELECT goal_key, statement, ''instrumental'', ''portfolio'', ''owner directive 2026-10-13 ISSUE-SLA-2H-1 (open issues 0) at program level'', ''ROADMAP-SELF-MAINTAIN-1'', 2, ''adopted'', dod, ''qnfo-fleet-control roadmap-self-maintain'', datetime(''now''), program_code FROM v_program_objective_seed"},
    {"type":"sql","name":"contracts","db":"AUDIT","sql":"INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at) SELECT ''goal-'' || goal_key, NULL, ''goal '' || goal_key || '' is adopted and its DoD is machine-checkable (v_goal_dod)'', ''ROADMAP-SELF-MAINTAIN-1: probe the goal DoD. roadmap-self-maintain completes the goal on a pass and reopens it after two failures since the last pass'', probe, transport, 3, COALESCE(owner, ''qnfo-fleet-control''), 1, ''active'', ''goal-dod-v1'', datetime(''now'') FROM v_goal_dod WHERE transport IS NOT NULL AND status IN (''adopted'', ''completed'')"},
    {"type":"sql","name":"contracts-sync","db":"AUDIT","sql":"UPDATE remediation_contracts SET verify_probe = (SELECT d.probe FROM v_goal_dod d WHERE ''goal-'' || d.goal_key = remediation_contracts.class), verify_transport = (SELECT d.transport FROM v_goal_dod d WHERE ''goal-'' || d.goal_key = remediation_contracts.class) WHERE module = ''goal-dod-v1'' AND EXISTS (SELECT 1 FROM v_goal_dod d WHERE ''goal-'' || d.goal_key = remediation_contracts.class AND d.transport IS NOT NULL AND (d.probe IS NOT remediation_contracts.verify_probe OR d.transport IS NOT remediation_contracts.verify_transport))"},
    {"type":"sql","name":"contracts-retire","db":"AUDIT","sql":"UPDATE remediation_contracts SET status = ''superseded'', last_verdict = ''superseded:goal-'' || COALESCE((SELECT g.status FROM goals g WHERE ''goal-'' || g.goal_key = remediation_contracts.class), ''missing''), last_attempt_at = datetime(''now'') WHERE module = ''goal-dod-v1'' AND status = ''active'' AND NOT EXISTS (SELECT 1 FROM v_goal_dod d WHERE ''goal-'' || d.goal_key = remediation_contracts.class AND d.status IN (''adopted'', ''completed'') AND d.transport IS NOT NULL)"},
    {"type":"sql","name":"contracts-reactivate","db":"AUDIT","sql":"UPDATE remediation_contracts SET status = ''active'', next_due_at = datetime(''now''), attempts = 0 WHERE module = ''goal-dod-v1'' AND COALESCE(status, '''') <> ''active'' AND EXISTS (SELECT 1 FROM v_goal_dod d WHERE ''goal-'' || d.goal_key = remediation_contracts.class AND d.status IN (''adopted'', ''completed'') AND d.transport IS NOT NULL)"},
    {"type":"sql","name":"complete-log","db":"AUDIT","sql":"INSERT INTO goal_lifecycle (goal_key, from_status, to_status, action, evidence) SELECT goal_key, ''adopted'', ''completed'', ''dod-passed'', ''goal-'' || goal_key || '' passed at '' || last_verified_at || '': '' || substr(COALESCE(last_observed, ''''), 1, 200) FROM v_goal_status WHERE status = ''adopted'' AND last_pass = 1 AND last_verified_at >= datetime(''now'', ''-120 minutes'')"},
    {"type":"sql","name":"complete","db":"AUDIT","sql":"UPDATE goals SET status = ''completed'', completed_at = datetime(''now''), updated_at = datetime(''now'') WHERE status = ''adopted'' AND goal_type <> ''objective-revision'' AND goal_key IN (SELECT goal_key FROM v_goal_status WHERE status = ''adopted'' AND last_pass = 1 AND last_verified_at >= datetime(''now'', ''-120 minutes''))"},
    {"type":"sql","name":"reopen-log","db":"AUDIT","sql":"INSERT INTO goal_lifecycle (goal_key, from_status, to_status, action, evidence) SELECT goal_key, ''completed'', ''adopted'', ''dod-regressed'', ''goal-'' || goal_key || '' failed '' || fails_since_pass || '' times since its last pass, latest at '' || last_verified_at || '': '' || substr(COALESCE(last_observed, ''''), 1, 200) FROM v_goal_status WHERE status = ''completed'' AND last_pass = 0 AND fails_since_pass >= 2 AND goal_key IN (SELECT goal_key FROM goal_lifecycle WHERE action = ''dod-passed'')"},
    {"type":"sql","name":"reopen","db":"AUDIT","sql":"UPDATE goals SET status = ''adopted'', completed_at = NULL, updated_at = datetime(''now'') WHERE status = ''completed'' AND goal_key IN (SELECT goal_key FROM v_goal_status WHERE status = ''completed'' AND last_pass = 0 AND fails_since_pass >= 2) AND goal_key IN (SELECT goal_key FROM goal_lifecycle WHERE action = ''dod-passed'')"},
    {"type":"sql","name":"roadmap-goal-verify","db":"AUDIT","sql":"UPDATE roadmap_implementation SET status = ''verified'', verified_at = datetime(''now''), evidence = ''auto (ROADMAP-SELF-MAINTAIN-1): goal '' || (SELECT g.status FROM goals g WHERE ''GL-'' || g.goal_key = roadmap_implementation.item) WHERE item LIKE ''GL-%'' AND status <> ''verified'' AND EXISTS (SELECT 1 FROM goals g WHERE ''GL-'' || g.goal_key = roadmap_implementation.item AND g.status IN (''completed'', ''retired'', ''resolved'', ''superseded'', ''rejected''))"},
    {"type":"sql","name":"roadmap-goal-reopen","db":"AUDIT","sql":"UPDATE roadmap_implementation SET status = ''open'', verified_at = NULL, evidence = ''auto (ROADMAP-SELF-MAINTAIN-1): goal reopened by failed DoD evidence'' WHERE item LIKE ''GL-%'' AND status = ''verified'' AND EXISTS (SELECT 1 FROM goals g WHERE ''GL-'' || g.goal_key = roadmap_implementation.item AND g.status = ''adopted'')"},
    {"type":"sql","name":"roadmap-next-verify","db":"AUDIT","sql":"UPDATE roadmap_implementation SET status = ''verified'', verified_at = datetime(''now''), evidence = ''auto (ROADMAP-SELF-MAINTAIN-1): '' || CASE WHEN EXISTS (SELECT 1 FROM projects p WHERE p.project_code = roadmap_implementation.artifact_ref AND p.status <> ''active'') THEN ''project left active'' ELSE ''work is mapped to the project ('' || (SELECT COUNT(*) FROM issue_project_map m WHERE m.project_code = roadmap_implementation.artifact_ref) || '' issues in issue_project_map)'' END WHERE item LIKE ''NEXT-%'' AND status NOT IN (''verified'', ''retired'') AND (EXISTS (SELECT 1 FROM issue_project_map m WHERE m.project_code = roadmap_implementation.artifact_ref) OR EXISTS (SELECT 1 FROM projects p WHERE p.project_code = roadmap_implementation.artifact_ref AND p.status <> ''active''))"},
    {"type":"sql","name":"roadmap-project-verify","db":"AUDIT","sql":"UPDATE roadmap_implementation SET status = ''verified'', verified_at = datetime(''now''), evidence = ''auto (ROADMAP-SELF-MAINTAIN-1): project '' || (SELECT p.status FROM projects p WHERE ''PROJ-'' || p.project_code = roadmap_implementation.item) WHERE item LIKE ''PROJ-%'' AND status <> ''verified'' AND EXISTS (SELECT 1 FROM projects p WHERE ''PROJ-'' || p.project_code = roadmap_implementation.item AND p.status IN (''completed'', ''archived'', ''retired''))"},
    {"type":"sql","name":"roadmap-fm-verify","db":"AUDIT","sql":"UPDATE roadmap_implementation SET status = ''verified'', verified_at = datetime(''now''), evidence = ''auto (ROADMAP-SELF-MAINTAIN-1): detector reads absent at '' || COALESCE((SELECT s.last_probed FROM v_failure_mode_status s WHERE ''FM-'' || s.fm_key = roadmap_implementation.item), ''?'') || '' and no open issue carries it'' WHERE item LIKE ''FM-%'' AND status <> ''verified'' AND EXISTS (SELECT 1 FROM v_failure_mode_status s WHERE ''FM-'' || s.fm_key = roadmap_implementation.item AND s.status = ''absent'') AND NOT EXISTS (SELECT 1 FROM failure_modes f JOIN agent_issues a ON a.id = f.issue_id AND a.status = ''open'' WHERE ''FM-'' || f.fm_key = roadmap_implementation.item)"},
    {"type":"sql","name":"metric-goals-unevaluated","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_goal_status s JOIN remediation_contracts c ON c.class = ''goal-'' || s.goal_key WHERE s.status = ''adopted'' AND s.transport IS NOT NULL AND replace(substr(c.ts, 1, 19), ''T'', '' '') < datetime(''now'', ''-120 minutes'') AND (s.last_verified_at IS NULL OR s.last_verified_at < datetime(''now'', ''-120 minutes''))) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''goals_unevaluated''"},
    {"type":"sql","name":"metric-goals-without-dod","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_goal_dod WHERE status = ''adopted'' AND transport IS NULL) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''goals_without_machine_dod''"},
    {"type":"sql","name":"metric-roadmap-unplaced","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM v_roadmap WHERE horizon <> ''done'' AND program_code IS NULL) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''roadmap_open_unplaced''"},
    {"type":"sql","name":"metric-goals-completed","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM goal_lifecycle WHERE action = ''dod-passed'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''goals_completed_7d''"},
    {"type":"sql","name":"ledger","db":"AUDIT","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''roadmap-self-maintain-'' || strftime(''%Y%m%d%H%M%S'', ''now''), datetime(''now''), ''roadmap-self-maintain'', ''ROADMAP-SELF-MAINTAIN-1: goals adopted '' || (SELECT COUNT(*) FROM goals WHERE status = ''adopted'') || '' (checkable '' || (SELECT COUNT(*) FROM v_goal_dod WHERE status = ''adopted'' AND transport IS NOT NULL) || '') completed '' || (SELECT COUNT(*) FROM goals WHERE status = ''completed'') || '' | goal contracts active '' || (SELECT COUNT(*) FROM remediation_contracts WHERE module = ''goal-dod-v1'' AND status = ''active'') || '' | roadmap now '' || (SELECT COUNT(*) FROM v_roadmap WHERE horizon = ''now'') || '' next '' || (SELECT COUNT(*) FROM v_roadmap WHERE horizon = ''next'') || '' later '' || (SELECT COUNT(*) FROM v_roadmap WHERE horizon = ''later'') || '' unplaced '' || (SELECT COUNT(*) FROM v_roadmap WHERE horizon <> ''done'' AND program_code IS NULL), NULL, ''roadmap-self-maintain'', ''ok''"}
  ]}', 120000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('roadmap-self-maintain-hourly', '30 * * * *', 'roadmap-self-maintain', 1, 'UTC', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES ('goal-self-closure', 'migrations/2026-10-19-roadmap-self-maintain.sql (ROADMAP-SELF-MAINTAIN-1)',
  'remediation_contracts runners (qnfo-fleet-control remediationContractsTick, scripts/remediation_consumer.py), fleet-exec workflow cron',
  'measured hourly: goals_unevaluated, goals_completed_7d', strftime('%Y-%m-%dT%H:%M:%SZ','now'),
  'goals with a machine-checkable DoD complete on probe evidence and reopen on regression; every program carries a living objective; roadmap rows carry program, project and horizon (v_roadmap, v_portfolio_tree)');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
VALUES ('session claude/self-maintained-roadmap-ps423o',
  'Goals, programs and roadmap closure are the part of the portfolio hierarchy no loop maintained: every lower layer (issues, projects, gaps, GitHub mirror) already has an hourly or 10-minute writer',
  'ROADMAP-SELF-MAINTAIN-1: goal DoD contracts, goal complete/reopen on evidence, one objective per program, roadmap closure for GL-/NEXT-/PROJ-/FM- rows, v_roadmap and v_portfolio_tree, four metrics',
  'qnfo-audit read 2026-10-19 ~04:05Z: 61 adopted goals (14 machine-checkable, none ever probed, newest change 2026-10-14), QNFO.REACH and QNFO.PERSONAL 0 goals, 13 goals without program, 11 NEXT- rows planned with no close path, roadmap_implementation without program or project',
  'pending: first runs after apply', 'qnfo-audit goals (status, program_code), remediation_contracts (new goal-* rows), roadmap_implementation (status of GL-/NEXT-/PROJ-/FM- rows)',
  'Rollback line of migrations/2026-10-19-roadmap-self-maintain.sql; goals restored from bak_20261019_goals_rsm',
  'goal-self-closure', 'remediation_contracts module goal-dod-v1 >= 18 within 120 minutes', 'qnfo-audit (D1 MCP read), fleet-exec workflow engine, both contract runners');

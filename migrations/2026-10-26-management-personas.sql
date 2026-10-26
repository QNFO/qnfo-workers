-- MANAGEMENT-PERSONAS-1 (2026-10-26, pillar autonomy). Owner request 2026-10-25 (project thread "Add portfolio and program
-- manager agents"): "we need a portfolio and program manager, at least one, maybe one per program, and then an overall
-- portfolio ... I'm spending too much time manually reviewing stuff when this should be part of the overall fleet ecosystem
-- cycle."
--
-- WHAT ALREADY EXISTED (read from qnfo-audit 2026-10-26 ~04:10Z)
--   management_personas      6 rows (portfolio:fleet + program:<code> x5), charter text and decision authority
--   program_charters         5 rows: objective, DoD, primary metric, guard metrics, manager persona
--   fleet_agents             portfolio-manager + program-manager:<code> x5 system prompts
--   qnfo-fleet-dashboard     PORTFOLIO-STRATEGIC-1/2 (1.59.x): a WEEKLY (Mondays) review that writes verdicts and top-action TEXT
--                            into program_review_notes; last written 2026-10-25 11:49Z. It changes nothing the fleet works on.
--   The personas therefore had names and charters but no decisions: no allocation, no reprioritisation, nothing a doer reads.
--   path_a of every persona names "fleet_tasks management-scorecards-hourly", a task that does not exist.
--
-- WHAT THIS ADDS (one fleet-exec workflow, hourly at :35, no worker deploy)
--   Portfolio manager (portfolio-manager), every hour:
--     v_program_risk                 risk per program (same weights as the weekly review: 3*high + 0.3*open + 15*guard
--                                    breaches + 2*stalled projects) and a verdict (RED: guard breach or charter primary metric
--                                    breaching; AMBER: high-priority open or stalled projects; else GREEN)
--     v_portfolio_allocation_plan    splits the fleet's focus slots (ops_config persona_focus_slots, default 25) across
--                                    programs: half evenly, half by risk share; decision per program:
--                                    constrain (highest risk) | escalate (risk up >10% in 24h: +50% slots) |
--                                    accelerate (risk down >20% in 24h) | maintain (GREEN: 1 slot) | steady | idle (no open work)
--     portfolio_allocations          one row per program per hourly tick (the record of the decision)
--   Program managers (program-manager:<code>), every hour, inside the slots the portfolio gave them:
--     v_program_focus_candidates     the program's open issues ranked: tier 0 the charter's primary metric, tier 1 a charter
--                                    guard metric, tier 2 critical, tier 3 high, tier 4 the rest; then priority, then oldest
--     program_focus                  the current focus set; program_focus_log records every enter / exit / closed
--     issue_priority_scores          a focus issue gets impact 5, probability 5, gains 5/5, cost 1 (scored_by
--                                    program-manager:<code>), so v_issue_queue_v2, which the code loop's intake reads, takes it
--                                    ahead of every other issue of its tier; the row is removed when the issue leaves focus.
--                                    A row another scorer wrote is never touched (INSERT OR IGNORE; delete only own rows).
--   Both levels:
--     persona_briefs                 one plain-language brief per persona per tick (what the program is for, its verdict, the
--                                    portfolio's decision, the focus list with doer gaps, the top adopted goal), read by
--                                    fleet.qnfo.org/managers so the owner reads one page instead of reviewing issues
--     decision_log                   one row whenever the allocation changes, with a parsed predicted_outcome
--     metrics                        program_focus_closed_24h (trigger lt 1), program_focus_without_doer (trigger gt 5)
--   management_personas path_a / decision_authority now name what each persona actually decides.
--
-- MIGRATION PATH (Agents SDK). The thread "Bring Cloudflare Agents into the fleet" is building an Agents SDK runtime. The
-- decisions live entirely in these views and tables, so an Agent class per persona can replace the fleet-exec workflow by
-- running the same steps (or reading the same views) on its own schedule; disable 'management-personas-hourly' in the PR that
-- moves it. Narrative text stays in the dashboard's weekly review (model-silent while an ai_spend cap is breached).
--
-- SAFETY. Nothing outside the persona tables is deleted; issue_priority_scores loses only rows scored_by program-manager:*.
-- No issue is closed, re-prioritised or re-assigned; no owner card is filed. Stop without a deploy:
--   UPDATE fleet_crons SET enabled = 0 WHERE name = 'management-personas-hourly';
--
-- Verify after apply:
--   SELECT status, COUNT(*) FROM fleet_runs WHERE task_id = 'management-personas' GROUP BY 1;   -- ok within the hour
--   SELECT * FROM portfolio_allocations WHERE tick = (SELECT MAX(tick) FROM portfolio_allocations);
--   SELECT program_code, COUNT(*) FROM program_focus GROUP BY 1;  SELECT persona_key, summary FROM persona_briefs ORDER BY tick DESC LIMIT 6;
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_crons SET enabled = 0 WHERE name = 'management-personas-hourly'; UPDATE fleet_tasks SET enabled = 0 WHERE id = 'management-personas'; DELETE FROM issue_priority_scores WHERE scored_by LIKE 'program-manager:%'; UPDATE metric_registry SET state = 'RETIRED' WHERE metric IN ('program_focus_closed_24h','program_focus_without_doer'); UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key IN ('program_focus_closed_24h','program_focus_without_doer'); UPDATE management_personas SET path_a = 'cron fleet_tasks management-scorecards-hourly' WHERE path_a LIKE 'fleet_tasks management-personas%'. The tables and views are additive and may stay.

CREATE TABLE IF NOT EXISTS portfolio_allocations (
  tick TEXT NOT NULL,
  program_code TEXT NOT NULL,
  manager_persona TEXT,
  verdict TEXT,
  risk_score REAL,
  risk_24h REAL,
  open_issues INTEGER,
  slots INTEGER NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  computed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (tick, program_code)
);

CREATE TABLE IF NOT EXISTS program_focus (
  program_code TEXT NOT NULL,
  issue_id INTEGER NOT NULL,
  rank INTEGER,
  tier INTEGER,
  reason TEXT,
  has_doer INTEGER,
  entered_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  last_tick TEXT,
  PRIMARY KEY (program_code, issue_id)
);

CREATE TABLE IF NOT EXISTS program_focus_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  program_code TEXT NOT NULL,
  issue_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_program_focus_log_ts ON program_focus_log (ts, action);

-- The plan is materialised once per tick (step plan-snapshot) so the focus steps read a small table instead of re-ranking
-- every open issue for each row they touch.
CREATE TABLE IF NOT EXISTS program_focus_plan_now (
  program_code TEXT NOT NULL,
  issue_id INTEGER NOT NULL,
  rank INTEGER,
  tier INTEGER,
  has_doer INTEGER,
  reason TEXT,
  PRIMARY KEY (program_code, issue_id)
);

CREATE TABLE IF NOT EXISTS persona_briefs (
  tick TEXT NOT NULL,
  persona_key TEXT NOT NULL,
  level TEXT NOT NULL,
  scope TEXT NOT NULL,
  verdict TEXT,
  decision TEXT,
  summary TEXT NOT NULL,
  computed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (tick, persona_key)
);

CREATE VIEW IF NOT EXISTS v_program_risk AS
SELECT h.program_code, h.name, h.open_issues, h.high_open, h.guard_breaches, h.stalled_projects, h.active_projects,
  ROUND(h.high_open * 3 + h.open_issues * 0.3 + h.guard_breaches * 15 + h.stalled_projects * 2, 1) AS risk,
  c.objective, c.primary_metric, c.guard_metrics,
  COALESCE(c.manager_persona, 'program-manager:' || h.program_code) AS manager_persona,
  COALESCE((SELECT MAX(v.hit) FROM v_metric_trigger_state v WHERE v.metric_key = c.primary_metric), 0) AS primary_hit,
  CASE WHEN h.guard_breaches > 0 OR COALESCE((SELECT MAX(v.hit) FROM v_metric_trigger_state v WHERE v.metric_key = c.primary_metric), 0) = 1 THEN 'RED'
       WHEN h.high_open > 0 OR h.stalled_projects > 0 THEN 'AMBER'
       ELSE 'GREEN' END AS verdict
FROM v_program_health h
LEFT JOIN program_charters c ON c.program_code = h.program_code AND c.status = 'active';

CREATE VIEW IF NOT EXISTS v_portfolio_allocation_plan AS
WITH cfg AS (
  SELECT COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = 'persona_focus_slots' AND CAST(value AS INTEGER) > 0), 25) AS slots
),
r AS (
  SELECT p.*,
    (SELECT a.risk_score FROM portfolio_allocations a WHERE a.program_code = p.program_code
       AND a.tick <= strftime('%Y-%m-%dT%H:00Z', 'now', '-24 hours') ORDER BY a.tick DESC LIMIT 1) AS risk_24h
  FROM v_program_risk p
),
tot AS (
  SELECT COALESCE(SUM(risk), 0) AS t, MAX(risk) AS mx, COUNT(*) AS n FROM r WHERE open_issues > 0
),
d AS (
  SELECT r.program_code, r.manager_persona, r.verdict, r.risk, r.risk_24h, r.open_issues, tot.t AS total_risk,
    CASE WHEN r.open_issues = 0 THEN 'idle'
         WHEN r.risk = tot.mx AND r.risk > 0 THEN 'constrain'
         WHEN r.risk_24h IS NOT NULL AND r.risk > r.risk_24h * 1.1 THEN 'escalate'
         WHEN r.risk_24h IS NOT NULL AND r.risk < r.risk_24h * 0.8 THEN 'accelerate'
         WHEN r.verdict = 'GREEN' THEN 'maintain'
         ELSE 'steady' END AS decision,
    CASE WHEN r.open_issues = 0 THEN 0
         ELSE MAX(1, (cfg.slots / 2) / MAX(1, tot.n) + CAST(ROUND((cfg.slots - cfg.slots / 2) * r.risk / MAX(tot.t, 0.0001)) AS INTEGER)) END AS base_slots
  FROM r, tot, cfg
)
SELECT program_code, manager_persona, verdict, risk, risk_24h, open_issues, decision,
  MIN(open_issues, CASE decision WHEN 'escalate' THEN base_slots + (base_slots + 1) / 2 WHEN 'maintain' THEN 1 WHEN 'idle' THEN 0 ELSE base_slots END) AS slots,
  CASE decision
    WHEN 'constrain' THEN 'highest risk in the portfolio (' || risk || ' of ' || ROUND(total_risk, 1) || '): it is the constraint and gets the largest share of focus'
    WHEN 'escalate' THEN 'risk rose from ' || risk_24h || ' to ' || risk || ' in 24h: focus raised by half'
    WHEN 'accelerate' THEN 'risk fell from ' || risk_24h || ' to ' || risk || ' in 24h: keep the current focus moving'
    WHEN 'maintain' THEN 'GREEN: one focus slot keeps the program watched'
    WHEN 'idle' THEN 'no open issue mapped to the program'
    ELSE verdict || ', risk ' || risk || ': focus in proportion to risk' END AS reason
FROM d;

CREATE VIEW IF NOT EXISTS v_program_focus_candidates AS
SELECT x.*, ROW_NUMBER() OVER (PARTITION BY x.program_code ORDER BY x.tier, x.prank, x.created_at, x.id) AS rn
FROM (
  SELECT m.program_code, a.id, a.priority, a.title, a.created_at,
    CASE a.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END AS prank,
    CASE WHEN COALESCE(a.description, '') LIKE '%code-task:%' OR a.linked_session IS NOT NULL
           OR EXISTS (SELECT 1 FROM remediation_contracts rc WHERE rc.issue_id = a.id AND rc.status = 'active') THEN 1 ELSE 0 END AS has_doer,
    CASE WHEN c.primary_metric IS NOT NULL AND (instr(a.title, c.primary_metric) > 0 OR instr(upper(a.title), upper(replace(c.primary_metric, '_', '-'))) > 0) THEN 0
         WHEN c.guard_metrics IS NOT NULL AND EXISTS (SELECT 1 FROM metric_registry mr
                WHERE instr(',' || replace(c.guard_metrics, ' ', '') || ',', ',' || mr.metric || ',') > 0
                  AND (instr(a.title, mr.metric) > 0 OR instr(upper(a.title), upper(replace(mr.metric, '_', '-'))) > 0)) THEN 1
         WHEN a.priority = 'critical' THEN 2
         WHEN a.priority = 'high' THEN 3
         ELSE 4 END AS tier,
    c.primary_metric
  FROM agent_issues a
  JOIN issue_project_map m ON m.issue_id = a.id
  LEFT JOIN program_charters c ON c.program_code = m.program_code AND c.status = 'active'
  WHERE a.status = 'open'
) x;

CREATE VIEW IF NOT EXISTS v_program_focus_plan AS
SELECT c.program_code, c.id AS issue_id, c.rn AS rank, c.tier, c.has_doer,
  CASE c.tier WHEN 0 THEN 'primary metric ' || c.primary_metric WHEN 1 THEN 'guard metric' WHEN 2 THEN 'critical'
              WHEN 3 THEN 'high' ELSE 'oldest open' END AS reason
FROM v_program_focus_candidates c
JOIN portfolio_allocations pa ON pa.program_code = c.program_code AND pa.tick = (SELECT MAX(tick) FROM portfolio_allocations)
WHERE c.rn <= pa.slots;

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('management-personas', 'MANAGEMENT-PERSONAS-1: portfolio manager allocates focus across programs; each program manager picks and pushes its focus issues; plain-language briefs', 'workflow',
  '{"steps":[
    {"type":"sql","name":"portfolio-allocate","db":"AUDIT","sql":"INSERT OR REPLACE INTO portfolio_allocations (tick, program_code, manager_persona, verdict, risk_score, risk_24h, open_issues, slots, decision, reason) SELECT strftime(''%Y-%m-%dT%H:00Z'', ''now''), program_code, manager_persona, verdict, risk, risk_24h, open_issues, slots, decision, reason FROM v_portfolio_allocation_plan"},
    {"type":"sql","name":"plan-clear","db":"AUDIT","sql":"DELETE FROM program_focus_plan_now"},
    {"type":"sql","name":"plan-snapshot","db":"AUDIT","sql":"INSERT OR REPLACE INTO program_focus_plan_now (program_code, issue_id, rank, tier, has_doer, reason) SELECT program_code, issue_id, rank, tier, has_doer, reason FROM v_program_focus_plan"},
    {"type":"sql","name":"focus-exit-log","db":"AUDIT","sql":"INSERT INTO program_focus_log (program_code, issue_id, action, reason) SELECT f.program_code, f.issue_id, CASE WHEN COALESCE((SELECT a.status FROM agent_issues a WHERE a.id = f.issue_id), ''missing'') <> ''open'' THEN ''closed'' ELSE ''exit'' END, CASE WHEN COALESCE((SELECT a.status FROM agent_issues a WHERE a.id = f.issue_id), ''missing'') <> ''open'' THEN ''issue '' || COALESCE((SELECT a.status FROM agent_issues a WHERE a.id = f.issue_id), ''missing'') ELSE ''outranked or outside the program slots'' END FROM program_focus f WHERE NOT EXISTS (SELECT 1 FROM program_focus_plan_now p WHERE p.program_code = f.program_code AND p.issue_id = f.issue_id)"},
    {"type":"sql","name":"focus-exit","db":"AUDIT","sql":"DELETE FROM program_focus WHERE NOT EXISTS (SELECT 1 FROM program_focus_plan_now p WHERE p.program_code = program_focus.program_code AND p.issue_id = program_focus.issue_id)"},
    {"type":"sql","name":"focus-enter-log","db":"AUDIT","sql":"INSERT INTO program_focus_log (program_code, issue_id, action, reason) SELECT p.program_code, p.issue_id, ''enter'', ''rank '' || p.rank || '': '' || p.reason FROM program_focus_plan_now p WHERE NOT EXISTS (SELECT 1 FROM program_focus f WHERE f.program_code = p.program_code AND f.issue_id = p.issue_id)"},
    {"type":"sql","name":"focus-enter","db":"AUDIT","sql":"INSERT OR IGNORE INTO program_focus (program_code, issue_id, rank, tier, reason, has_doer, last_tick) SELECT program_code, issue_id, rank, tier, reason, has_doer, strftime(''%Y-%m-%dT%H:00Z'', ''now'') FROM program_focus_plan_now"},
    {"type":"sql","name":"focus-refresh","db":"AUDIT","sql":"UPDATE program_focus SET rank = (SELECT p.rank FROM program_focus_plan_now p WHERE p.program_code = program_focus.program_code AND p.issue_id = program_focus.issue_id), tier = (SELECT p.tier FROM program_focus_plan_now p WHERE p.program_code = program_focus.program_code AND p.issue_id = program_focus.issue_id), reason = (SELECT p.reason FROM program_focus_plan_now p WHERE p.program_code = program_focus.program_code AND p.issue_id = program_focus.issue_id), has_doer = (SELECT p.has_doer FROM program_focus_plan_now p WHERE p.program_code = program_focus.program_code AND p.issue_id = program_focus.issue_id), last_tick = strftime(''%Y-%m-%dT%H:00Z'', ''now'')"},
    {"type":"sql","name":"scores-clear","db":"AUDIT","sql":"DELETE FROM issue_priority_scores WHERE scored_by LIKE ''program-manager:%'' AND NOT EXISTS (SELECT 1 FROM program_focus f WHERE f.issue_id = issue_priority_scores.issue_id AND issue_priority_scores.scored_by = ''program-manager:'' || f.program_code)"},
    {"type":"sql","name":"scores-set","db":"AUDIT","sql":"INSERT OR IGNORE INTO issue_priority_scores (issue_id, impact, probability, capability_gain, reach_gain, remediation_cost, scored_by, note) SELECT issue_id, 5, 5, 5, 5, 1, ''program-manager:'' || program_code, ''MANAGEMENT-PERSONAS-1 focus rank '' || rank || '' ('' || reason || '')'' FROM program_focus"},
    {"type":"sql","name":"brief-programs","db":"AUDIT","sql":"INSERT OR REPLACE INTO persona_briefs (tick, persona_key, level, scope, verdict, decision, summary) SELECT a.tick, a.manager_persona, ''program'', a.program_code, a.verdict, a.decision, a.program_code || '' is '' || a.verdict || '' at risk '' || a.risk_score || COALESCE('' (24h ago '' || a.risk_24h || '')'', '''') || ''. Aim: '' || COALESCE((SELECT c.objective FROM program_charters c WHERE c.program_code = a.program_code), ''no charter'') || '' Portfolio decision: '' || a.decision || '' with '' || a.slots || '' focus slot(s) ('' || a.reason || ''). Focus: '' || COALESCE((SELECT group_concat(x, ''; '') FROM (SELECT ''#'' || f.issue_id || '' '' || substr(i.title, 1, 90) || '' ['' || f.reason || CASE WHEN f.has_doer = 1 THEN '''' ELSE '', no doer yet'' END || '']'' AS x FROM program_focus f JOIN agent_issues i ON i.id = f.issue_id WHERE f.program_code = a.program_code ORDER BY f.rank)), ''none'') || ''. Top adopted goal: '' || COALESCE((SELECT g.goal_key || '': '' || substr(g.statement, 1, 120) FROM goals g WHERE g.program_code = a.program_code AND g.status = ''adopted'' AND g.goal_type <> ''objective-revision'' ORDER BY g.priority DESC, g.adopted_at LIMIT 1), ''none'') || ''.'' FROM portfolio_allocations a WHERE a.tick = (SELECT MAX(tick) FROM portfolio_allocations)"},
    {"type":"sql","name":"brief-portfolio","db":"AUDIT","sql":"INSERT OR REPLACE INTO persona_briefs (tick, persona_key, level, scope, verdict, decision, summary) SELECT cur.tick, ''portfolio-manager'', ''portfolio'', ''QNFO'', CASE WHEN (SELECT COUNT(*) FROM portfolio_allocations WHERE tick = cur.tick AND verdict = ''RED'') > 0 THEN ''RED'' WHEN (SELECT COUNT(*) FROM portfolio_allocations WHERE tick = cur.tick AND verdict = ''AMBER'') > 0 THEN ''AMBER'' ELSE ''GREEN'' END, ''allocate'', ''Constraint: '' || COALESCE((SELECT program_code || '' (risk '' || risk_score || '')'' FROM portfolio_allocations WHERE tick = cur.tick AND decision = ''constrain'' LIMIT 1), ''none'') || '' of portfolio risk '' || (SELECT ROUND(SUM(risk_score), 1) FROM portfolio_allocations WHERE tick = cur.tick) || ''. Focus slots: '' || (SELECT group_concat(program_code || '' '' || slots || '' '' || decision, '', '') FROM (SELECT program_code, slots, decision FROM portfolio_allocations WHERE tick = cur.tick ORDER BY slots DESC, program_code)) || ''. RED programs: '' || (SELECT COUNT(*) FROM portfolio_allocations WHERE tick = cur.tick AND verdict = ''RED'') || '' of '' || (SELECT COUNT(*) FROM portfolio_allocations WHERE tick = cur.tick) || ''. Focus moves last hour: '' || (SELECT COUNT(*) FROM program_focus_log WHERE action = ''enter'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) || '' in, '' || (SELECT COUNT(*) FROM program_focus_log WHERE action IN (''exit'', ''closed'') AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) || '' out. Focus issues closed in 24h: '' || (SELECT COUNT(*) FROM program_focus_log WHERE action = ''closed'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) || ''; focus issues with no doer yet: '' || (SELECT COUNT(*) FROM program_focus WHERE has_doer = 0) || ''. Priority mix of '' || (SELECT COUNT(*) FROM agent_issues WHERE status = ''open'') || '' open issues: '' || (SELECT COUNT(*) FROM agent_issues WHERE status = ''open'' AND priority = ''critical'') || '' critical, '' || (SELECT COUNT(*) FROM agent_issues WHERE status = ''open'' AND priority = ''high'') || '' high.'' FROM (SELECT MAX(tick) AS tick FROM portfolio_allocations) cur WHERE cur.tick IS NOT NULL"},
    {"type":"sql","name":"decision-log","db":"AUDIT","sql":"INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested) SELECT ''portfolio-manager (MANAGEMENT-PERSONAS-1)'', ''program risk = 3*high + 0.3*open + 15*guard breaches + 2*stalled projects (v_program_risk); half of the focus slots go evenly to programs with open work, half by risk share'', ''allocation changed: '' || (SELECT group_concat(program_code || '' '' || slots || '' '' || decision, '', '') FROM portfolio_allocations WHERE tick = cur.tick), ''v_program_risk and v_metric_trigger_state at '' || cur.tick, ''applied: program_focus resynced and issue_priority_scores set for '' || (SELECT COUNT(*) FROM program_focus) || '' focus issues'', ''qnfo-audit program_focus and issue_priority_scores rows scored_by program-manager:*, which reorder v_issue_queue_v2 (code loop intake) within each priority tier'', ''Rollback line of migrations/2026-10-26-management-personas.sql'', ''portfolio-allocation'', ''program_focus_closed_24h >= 1 within 24 h'', ''qnfo-audit v_program_health, v_metric_trigger_state, agent_issues, issue_project_map'' FROM (SELECT MAX(tick) AS tick FROM portfolio_allocations) cur WHERE cur.tick IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.actor = ''portfolio-manager (MANAGEMENT-PERSONAS-1)'' AND d.evidence = ''v_program_risk and v_metric_trigger_state at '' || cur.tick AND d.action = ''allocation changed: '' || (SELECT group_concat(program_code || '' '' || slots || '' '' || decision, '', '') FROM portfolio_allocations WHERE tick = cur.tick)) AND EXISTS (SELECT 1 FROM portfolio_allocations a WHERE a.tick = cur.tick AND NOT EXISTS (SELECT 1 FROM portfolio_allocations p WHERE p.program_code = a.program_code AND p.slots = a.slots AND p.decision = a.decision AND p.tick = (SELECT MAX(t2.tick) FROM portfolio_allocations t2 WHERE t2.tick < cur.tick)))"},
    {"type":"sql","name":"metric-focus-closed","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM program_focus_log WHERE action = ''closed'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''program_focus_closed_24h''"},
    {"type":"sql","name":"metric-focus-no-doer","db":"AUDIT","sql":"UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM program_focus WHERE has_doer = 0) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''program_focus_without_doer''"},
    {"type":"sql","name":"prune","db":"AUDIT","sql":"DELETE FROM persona_briefs WHERE tick < strftime(''%Y-%m-%dT%H:00Z'', ''now'', ''-30 days'')"},
    {"type":"sql","name":"ledger","db":"AUDIT","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''management-personas-'' || strftime(''%Y%m%d%H%M%S'', ''now''), datetime(''now''), ''management-personas'', ''MANAGEMENT-PERSONAS-1: '' || (SELECT group_concat(program_code || '' '' || verdict || '' '' || slots || '' '' || decision, '' | '') FROM portfolio_allocations WHERE tick = (SELECT MAX(tick) FROM portfolio_allocations)) || '' | focus '' || (SELECT COUNT(*) FROM program_focus) || '' (no doer '' || (SELECT COUNT(*) FROM program_focus WHERE has_doer = 0) || '')'', NULL, ''management-personas'', ''ok''"}
  ]}', 120000, 1, 1, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
VALUES ('management-personas-hourly', '35 * * * *', 'management-personas', 1, 'UTC', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

UPDATE management_personas
SET path_a = 'fleet_tasks management-personas (fleet_crons management-personas-hourly, :35 hourly)',
    path_b = 'qnfo-fleet-dashboard weekly review (PORTFOLIO-STRATEGIC-1) recomputes scorecards; POST /api/portfolio/strategic',
    decision_authority = CASE WHEN level = 'portfolio'
      THEN 'decides every hour how the fleet''s focus slots are split across programs and which program is the constraint (constrain / escalate / accelerate / maintain / steady / idle, portfolio_allocations); spend, legal and owner-account acts stay owner cards'
      ELSE 'decides every hour which open issues of its program are in focus inside the slots the portfolio gave it, and pushes them to the front of the code loop''s queue (program_focus, issue_priority_scores); never closes or re-prioritises an issue' END,
    updated_at = datetime('now')
WHERE persona_key = 'portfolio:fleet' OR persona_key LIKE 'program:%';

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state, last_value, last_refreshed)
VALUES
  ('program_focus_closed_24h', 'operational', 'target',
   'program_focus_log rows with action closed in the last 24 hours: focus issues the program managers picked that were then closed',
   'qnfo-audit.program_focus_log (MANAGEMENT-PERSONAS-1), written hourly by fleet_tasks management-personas',
   '>= 1', 'qnfo-fleet-control', 'agent:management-personas', 'hourly', 'MEASURED', NULL, NULL),
  ('program_focus_without_doer', 'operational', 'guard',
   'program_focus rows with has_doer 0: focus issues with no code-task line, no active remediation contract and no linked session',
   'qnfo-audit.program_focus (MANAGEMENT-PERSONAS-1), written hourly by fleet_tasks management-personas',
   '<= 5', 'qnfo-fleet-control', 'agent:management-personas', 'hourly', 'MEASURED', NULL, NULL);

INSERT OR IGNORE INTO analytics_metric_triggers
  (metric_key, title, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
  ('program_focus_closed_24h', 'Program focus is not moving: no issue the program managers put in focus closed in 24 hours',
   'lt', 1, 6,
   'Pillar autonomy (MANAGEMENT-PERSONAS-1). Read SELECT f.program_code, f.issue_id, f.rank, f.reason, f.has_doer, f.entered_at FROM program_focus f ORDER BY f.program_code, f.rank. A focus issue with has_doer 0 has no code-task line, contract or session: give it one (a code-task line for the code loop, or a runtime-probe line). A focus issue with a doer that did not close: read its code_tasks rows and remediation_contracts verdicts for the failure. If focus churns (program_focus_log enter/exit every hour), lower the churn by raising ops_config persona_focus_slots. Definition of done: program_focus_closed_24h reads 1 or more.',
   'qnfo-fleet-control', 'agent_issues', 2, 1, 'registered by migrations/2026-10-26-management-personas.sql'),
  ('program_focus_without_doer', 'Program focus issues have no doer: the program managers picked work nothing will execute',
   'gt', 5, 6,
   'Pillar autonomy (MANAGEMENT-PERSONAS-1). Read SELECT f.program_code, f.issue_id, i.title FROM program_focus f JOIN agent_issues i ON i.id = f.issue_id WHERE f.has_doer = 0. Give each one a doer: a code-task line plus code-anchor for the code loop when the fix is one file, a runtime-probe or code-probe line when it closes on evidence, or a named owning loop. Definition of done: program_focus_without_doer reads 5 or less.',
   'qnfo-fleet-control', 'agent_issues', 2, 1, 'registered by migrations/2026-10-26-management-personas.sql');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES ('portfolio-program-personas', 'migrations/2026-10-26-management-personas.sql (MANAGEMENT-PERSONAS-1)',
  'fleet-exec workflow cron, v_program_health, program_charters, issue_project_map, v_issue_queue_v2 (code loop intake)',
  'measured hourly: program_focus_closed_24h, program_focus_without_doer', strftime('%Y-%m-%dT%H:%M:%SZ','now'),
  'a portfolio manager allocates focus across the five programs every hour and each program manager picks its focus issues and moves them to the front of the code loop queue; one plain-language brief per persona per hour (persona_briefs, fleet.qnfo.org/managers)');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
VALUES ('session claude/project-thread-0hsmo1',
  'The personas existed as names, charters and a weekly read-only review; what the owner still did by hand was deciding where the fleet''s attention goes, so the personas need decisions a doer reads',
  'MANAGEMENT-PERSONAS-1: hourly portfolio allocation across programs, per-program focus sets pushed into v_issue_queue_v2 through issue_priority_scores, persona briefs, two metrics with triggers',
  'qnfo-audit read 2026-10-26 ~04:10Z: management_personas 6, program_charters 5, program_review_notes last 2026-10-25 11:49Z (weekly), issue_priority_scores 0 rows, 433 open issues (88 critical, 143 high), QNFO.OPS risk 702.6 of about 804',
  'pending: first runs after apply', 'qnfo-audit portfolio_allocations, program_focus, program_focus_log, persona_briefs (new); issue_priority_scores rows scored_by program-manager:*',
  'Rollback line of migrations/2026-10-26-management-personas.sql',
  'portfolio-program-personas', 'program_focus_closed_24h >= 1 within 24 h', 'qnfo-audit (D1 MCP read), fleet-exec workflow engine, qnfo-code-orchestrator intake (INTAKE_QUEUE_V2_SQL)');

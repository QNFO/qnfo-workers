-- MANAGEMENT-PERSONAS-2 (2026-10-26, pillar autonomy). Owner directives 2026-10-26, verbatim (project chat):
--   06:31Z "PORTFOLIO AND PROGRAM MANAGER AGENTS SHALL MAKE MOST DAILY DECISIONS AUTOMATICALLY TO MAINTAIN, IMPROVEN, UPGRADE, AND
--          ENHANCE THE FLEET"
--   06:32Z "EXPAND SCOPE AND AUTONOMY FURTHER TO DELEGATE ALL DECISIONS TO FLEET AGENTS"
--
-- MANAGEMENT-PERSONAS-1 (PR 4259) gave the managers a focus set but no decision over an issue itself, and its first three live
-- runs (06:02Z, 06:08Z, 06:12Z) failed at step 1 with "D1_ERROR: out of memory: SQLITE_NOMEM": v_portfolio_allocation_plan
-- referenced v_program_risk (which reads v_program_health and v_metric_trigger_state) from two CTE branches, so D1 evaluated the
-- whole health view repeatedly. Measured 2026-10-26 06:40Z: SELECT * FROM v_portfolio_allocation_plan -> SQLITE_NOMEM;
-- SELECT * FROM v_program_risk alone -> 5 rows in 28 ms.
--
-- WHAT THIS CHANGES
--   1. program_risk_now: v_program_risk is snapshotted once per tick (steps risk-clear, risk-snapshot) and
--      v_portfolio_allocation_plan reads the table, so step 1 no longer runs out of memory.
--   2. The managers decide and act on issues themselves, each decision a persona_actions row with its prior value:
--      promote   program manager: a focus issue at medium/low becomes high (the v1 queue, the issue planner and the dashboards
--                order by priority); restore: when it leaves focus and is still high, it goes back to its prior priority
--      close     program manager: a METRIC-TRIGGER-<id> issue whose trigger reads hit 0 on a value refreshed in the last
--                120 minutes, filed more than 120 minutes ago, with no failing contract, closes with that reading as
--                issue_triage.close_evidence (the metric's own trigger re-files and issue_refile_reopen reopens it if it breaches again)
--      supersede program manager: an older open METRIC-TRIGGER issue for the same trigger id as a newer open one closes as
--                "superseded by #<newer>"; its contracts are superseded first, as agent_issues_superseded_contracts_upd does
--      demote    portfolio manager: a critical issue filed by a fleet loop (qnfo-fleet-control, portfolio-autopilot) more than
--                24 h ago, with no code-task line, no linked session, not a metric-trigger issue and not a program's primary or
--                guard-metric focus issue, becomes high. Issues filed by the owner or a session are never demoted.
--   3. The portfolio brief lists the decisions of the last hour; decision_log gets one row per hour in which any were taken;
--      metric persona_actions_24h counts them (no trigger, an exemption: it is a volume reading, and program_focus_closed_24h
--      and program_focus_without_doer judge whether the decisions move work).
--
-- BOUNDS. No issue is deleted or set wontfix; owner and session issues keep their priority; nothing changes a merge scope, a
-- planner trust list, a cap, a credential or an owner card. Stop the decisions without a deploy:
--   INSERT OR REPLACE INTO ops_config (key, value) VALUES ('persona_actions', 'off');
-- (the focus allocation keeps running; fleet_crons management-personas-hourly enabled = 0 stops everything).
--
-- Verify after apply:
--   SELECT status, error FROM fleet_runs WHERE task_id = 'management-personas' ORDER BY id DESC LIMIT 3;   -- ok
--   SELECT kind, COUNT(*) FROM persona_actions GROUP BY 1;
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_issues_mp2
-- Rollback: INSERT OR REPLACE INTO ops_config (key, value) VALUES ('persona_actions', 'off'); UPDATE agent_issues SET priority = (SELECT p.from_value FROM persona_actions p WHERE p.issue_id = agent_issues.id AND p.kind IN ('promote', 'demote') AND p.reverted_at IS NULL ORDER BY p.id LIMIT 1) WHERE id IN (SELECT issue_id FROM persona_actions WHERE kind IN ('promote', 'demote') AND reverted_at IS NULL); closed rows reopen from bak_20261026_issues_mp2 by UPDATE agent_issues SET status = 'open' WHERE id IN (SELECT issue_id FROM persona_actions WHERE kind IN ('close', 'supersede')).

CREATE TABLE IF NOT EXISTS bak_20261026_issues_mp2 AS SELECT id, title, priority, status, source FROM agent_issues WHERE status = 'open';

CREATE TABLE IF NOT EXISTS program_risk_now (
  program_code TEXT PRIMARY KEY,
  manager_persona TEXT,
  verdict TEXT,
  risk REAL,
  open_issues INTEGER,
  computed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE TABLE IF NOT EXISTS persona_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  persona_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  issue_id INTEGER,
  from_value TEXT,
  to_value TEXT,
  evidence TEXT NOT NULL,
  reverted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_persona_actions_ts ON persona_actions (ts, kind);
CREATE INDEX IF NOT EXISTS idx_persona_actions_issue ON persona_actions (issue_id, kind);

DROP VIEW IF EXISTS v_portfolio_allocation_plan;
CREATE VIEW v_portfolio_allocation_plan AS
WITH cfg AS (
  SELECT COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = 'persona_focus_slots' AND CAST(value AS INTEGER) > 0), 25) AS slots
),
r AS (
  SELECT p.program_code, p.manager_persona, p.verdict, p.risk, p.open_issues,
    (SELECT a.risk_score FROM portfolio_allocations a WHERE a.program_code = p.program_code
       AND a.tick <= strftime('%Y-%m-%dT%H:00Z', 'now', '-24 hours') ORDER BY a.tick DESC LIMIT 1) AS risk_24h
  FROM program_risk_now p
),
tot AS (
  SELECT COALESCE(SUM(risk), 0) AS t, MAX(risk) AS mx, COUNT(*) AS n FROM program_risk_now WHERE open_issues > 0
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

CREATE VIEW IF NOT EXISTS v_persona_recovered_close AS
SELECT a.id AS issue_id, m.program_code, t.metric_key,
  'MANAGEMENT-PERSONAS-2 metric recovered: ' || t.metric_key || ' reads ' || v.val || ' (trigger ' || t.operator || ' ' || t.threshold
    || ' not hit), refreshed ' || r.last_refreshed || '; the trigger re-files and reopens this issue if the metric breaches again' AS evidence
FROM agent_issues a
JOIN analytics_metric_triggers t ON t.id = CAST(substr(a.title, 16, instr(substr(a.title, 16), '-') - 1) AS INTEGER)
JOIN v_metric_trigger_state v ON v.id = t.id
JOIN metric_registry r ON r.metric = t.metric_key
LEFT JOIN issue_project_map m ON m.issue_id = a.id
WHERE a.status = 'open' AND a.title LIKE 'METRIC-TRIGGER-%'
  AND v.hit = 0 AND v.val IS NOT NULL
  AND replace(substr(COALESCE(r.last_refreshed, ''), 1, 19), 'T', ' ') >= datetime('now', '-120 minutes')
  AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding')
    AND COALESCE(c.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'persona_actions'), 'on') <> 'off';

CREATE VIEW IF NOT EXISTS v_persona_twin_supersede AS
SELECT x.id AS issue_id, x.program_code, x.tid, x.successor,
  'superseded by #' || x.successor || ': the same metric trigger ' || x.tid || ' was filed again (newer threshold or text); the newer issue carries the work (MANAGEMENT-PERSONAS-2)' AS evidence
FROM (
  SELECT a.id, m.program_code, CAST(substr(a.title, 16, instr(substr(a.title, 16), '-') - 1) AS INTEGER) AS tid,
    (SELECT MAX(b.id) FROM agent_issues b WHERE b.status = 'open' AND b.title LIKE 'METRIC-TRIGGER-%'
       AND CAST(substr(b.title, 16, instr(substr(b.title, 16), '-') - 1) AS INTEGER) = CAST(substr(a.title, 16, instr(substr(a.title, 16), '-') - 1) AS INTEGER)) AS successor
  FROM agent_issues a LEFT JOIN issue_project_map m ON m.issue_id = a.id
  WHERE a.status = 'open' AND a.title LIKE 'METRIC-TRIGGER-%'
) x
WHERE x.tid > 0 AND x.successor > x.id
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'persona_actions'), 'on') <> 'off';

CREATE VIEW IF NOT EXISTS v_portfolio_critical_demote AS
SELECT a.id AS issue_id,
  'fleet-filed critical (source ' || a.source || ') open since ' || datetime(a.created_at / 1000, 'unixepoch')
    || ' with no code-task line, no linked session, not a metric-trigger issue and not a primary or guard-metric focus issue: high is its working priority' AS evidence
FROM agent_issues a
WHERE a.status = 'open' AND a.priority = 'critical'
  AND a.source IN ('qnfo-fleet-control', 'portfolio-autopilot')
  AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 86400) * 1000
  AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
  AND a.linked_session IS NULL
  AND a.title NOT LIKE 'METRIC-TRIGGER-%'
  AND NOT EXISTS (SELECT 1 FROM program_focus f WHERE f.issue_id = a.id AND f.tier <= 1)
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'persona_actions'), 'on') <> 'off';

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('management-personas', 'MANAGEMENT-PERSONAS-1/2: portfolio manager allocates focus and demotes stale fleet criticals; program managers pick focus, promote and restore priorities, close recovered metric issues and supersede duplicates; plain-language briefs', 'workflow',
  '{"steps":[
    {"type": "sql", "name": "risk-clear", "db": "AUDIT", "sql": "DELETE FROM program_risk_now"},
    {"type": "sql", "name": "risk-snapshot", "db": "AUDIT", "sql": "INSERT OR REPLACE INTO program_risk_now (program_code, manager_persona, verdict, risk, open_issues) SELECT program_code, manager_persona, verdict, risk, open_issues FROM v_program_risk"},
    {"type": "sql", "name": "portfolio-allocate", "db": "AUDIT", "sql": "INSERT OR REPLACE INTO portfolio_allocations (tick, program_code, manager_persona, verdict, risk_score, risk_24h, open_issues, slots, decision, reason) SELECT strftime(''%Y-%m-%dT%H:00Z'', ''now''), program_code, manager_persona, verdict, risk, risk_24h, open_issues, slots, decision, reason FROM v_portfolio_allocation_plan"},
    {"type": "sql", "name": "plan-clear", "db": "AUDIT", "sql": "DELETE FROM program_focus_plan_now"},
    {"type": "sql", "name": "plan-snapshot", "db": "AUDIT", "sql": "INSERT OR REPLACE INTO program_focus_plan_now (program_code, issue_id, rank, tier, has_doer, reason) SELECT program_code, issue_id, rank, tier, has_doer, reason FROM v_program_focus_plan"},
    {"type": "sql", "name": "focus-exit-log", "db": "AUDIT", "sql": "INSERT INTO program_focus_log (program_code, issue_id, action, reason) SELECT f.program_code, f.issue_id, CASE WHEN COALESCE((SELECT a.status FROM agent_issues a WHERE a.id = f.issue_id), ''missing'') <> ''open'' THEN ''closed'' ELSE ''exit'' END, CASE WHEN COALESCE((SELECT a.status FROM agent_issues a WHERE a.id = f.issue_id), ''missing'') <> ''open'' THEN ''issue '' || COALESCE((SELECT a.status FROM agent_issues a WHERE a.id = f.issue_id), ''missing'') ELSE ''outranked or outside the program slots'' END FROM program_focus f WHERE NOT EXISTS (SELECT 1 FROM program_focus_plan_now p WHERE p.program_code = f.program_code AND p.issue_id = f.issue_id)"},
    {"type": "sql", "name": "focus-exit", "db": "AUDIT", "sql": "DELETE FROM program_focus WHERE NOT EXISTS (SELECT 1 FROM program_focus_plan_now p WHERE p.program_code = program_focus.program_code AND p.issue_id = program_focus.issue_id)"},
    {"type": "sql", "name": "focus-enter-log", "db": "AUDIT", "sql": "INSERT INTO program_focus_log (program_code, issue_id, action, reason) SELECT p.program_code, p.issue_id, ''enter'', ''rank '' || p.rank || '': '' || p.reason FROM program_focus_plan_now p WHERE NOT EXISTS (SELECT 1 FROM program_focus f WHERE f.program_code = p.program_code AND f.issue_id = p.issue_id)"},
    {"type": "sql", "name": "focus-enter", "db": "AUDIT", "sql": "INSERT OR IGNORE INTO program_focus (program_code, issue_id, rank, tier, reason, has_doer, last_tick) SELECT program_code, issue_id, rank, tier, reason, has_doer, strftime(''%Y-%m-%dT%H:00Z'', ''now'') FROM program_focus_plan_now"},
    {"type": "sql", "name": "focus-refresh", "db": "AUDIT", "sql": "UPDATE program_focus SET rank = (SELECT p.rank FROM program_focus_plan_now p WHERE p.program_code = program_focus.program_code AND p.issue_id = program_focus.issue_id), tier = (SELECT p.tier FROM program_focus_plan_now p WHERE p.program_code = program_focus.program_code AND p.issue_id = program_focus.issue_id), reason = (SELECT p.reason FROM program_focus_plan_now p WHERE p.program_code = program_focus.program_code AND p.issue_id = program_focus.issue_id), has_doer = (SELECT p.has_doer FROM program_focus_plan_now p WHERE p.program_code = program_focus.program_code AND p.issue_id = program_focus.issue_id), last_tick = strftime(''%Y-%m-%dT%H:00Z'', ''now'')"},
    {"type": "sql", "name": "scores-clear", "db": "AUDIT", "sql": "DELETE FROM issue_priority_scores WHERE scored_by LIKE ''program-manager:%'' AND NOT EXISTS (SELECT 1 FROM program_focus f WHERE f.issue_id = issue_priority_scores.issue_id AND issue_priority_scores.scored_by = ''program-manager:'' || f.program_code)"},
    {"type": "sql", "name": "scores-set", "db": "AUDIT", "sql": "INSERT OR IGNORE INTO issue_priority_scores (issue_id, impact, probability, capability_gain, reach_gain, remediation_cost, scored_by, note) SELECT issue_id, 5, 5, 5, 5, 1, ''program-manager:'' || program_code, ''MANAGEMENT-PERSONAS-1 focus rank '' || rank || '' ('' || reason || '')'' FROM program_focus"},
    {"type": "sql", "name": "promote-log", "db": "AUDIT", "sql": "INSERT INTO persona_actions (persona_key, kind, issue_id, from_value, to_value, evidence) SELECT ''program-manager:'' || f.program_code, ''promote'', f.issue_id, a.priority, ''high'', ''in program focus at rank '' || f.rank || '' ('' || f.reason || '')'' FROM program_focus f JOIN agent_issues a ON a.id = f.issue_id WHERE a.status = ''open'' AND a.priority IN (''medium'', ''low'') AND COALESCE((SELECT value FROM ops_config WHERE key = ''persona_actions''), ''on'') <> ''off''"},
    {"type": "sql", "name": "promote", "db": "AUDIT", "sql": "UPDATE agent_issues SET priority = ''high'', updated_at = CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000 WHERE status = ''open'' AND priority IN (''medium'', ''low'') AND id IN (SELECT issue_id FROM program_focus) AND COALESCE((SELECT value FROM ops_config WHERE key = ''persona_actions''), ''on'') <> ''off''"},
    {"type": "sql", "name": "restore-log", "db": "AUDIT", "sql": "INSERT INTO persona_actions (persona_key, kind, issue_id, from_value, to_value, evidence) SELECT p.persona_key, ''restore'', p.issue_id, ''high'', p.from_value, ''left program focus: priority restored to its value before promotion (action '' || p.id || '')'' FROM persona_actions p JOIN agent_issues a ON a.id = p.issue_id WHERE p.kind = ''promote'' AND p.reverted_at IS NULL AND a.status = ''open'' AND a.priority = ''high'' AND NOT EXISTS (SELECT 1 FROM program_focus f WHERE f.issue_id = p.issue_id)"},
    {"type": "sql", "name": "restore", "db": "AUDIT", "sql": "UPDATE agent_issues SET priority = (SELECT p.from_value FROM persona_actions p WHERE p.kind = ''promote'' AND p.reverted_at IS NULL AND p.issue_id = agent_issues.id ORDER BY p.id DESC LIMIT 1), updated_at = CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000 WHERE status = ''open'' AND priority = ''high'' AND id IN (SELECT p.issue_id FROM persona_actions p WHERE p.kind = ''promote'' AND p.reverted_at IS NULL) AND id NOT IN (SELECT issue_id FROM program_focus)"},
    {"type": "sql", "name": "restore-mark", "db": "AUDIT", "sql": "UPDATE persona_actions SET reverted_at = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') WHERE kind = ''promote'' AND reverted_at IS NULL AND issue_id NOT IN (SELECT issue_id FROM program_focus)"},
    {"type": "sql", "name": "recovered-evidence", "db": "AUDIT", "sql": "INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT issue_id, ''metric-recovered'', ''triaged'', ''management-personas'', datetime(''now''), evidence FROM v_persona_recovered_close WHERE 1 ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence"},
    {"type": "sql", "name": "recovered-log", "db": "AUDIT", "sql": "INSERT INTO persona_actions (persona_key, kind, issue_id, from_value, to_value, evidence) SELECT ''program-manager:'' || COALESCE(program_code, ''QNFO.OPS''), ''close'', issue_id, ''open'', ''closed'', evidence FROM v_persona_recovered_close"},
    {"type": "sql", "name": "recovered-close", "db": "AUDIT", "sql": "UPDATE agent_issues SET status = ''closed'', close_channel = ''auto:management-personas'', updated_at = CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000 WHERE id IN (SELECT issue_id FROM v_persona_recovered_close)"},
    {"type": "sql", "name": "twin-evidence", "db": "AUDIT", "sql": "INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT issue_id, ''superseded-twin'', ''triaged'', ''management-personas'', datetime(''now''), evidence FROM v_persona_twin_supersede WHERE 1 ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence"},
    {"type": "sql", "name": "twin-log", "db": "AUDIT", "sql": "INSERT INTO persona_actions (persona_key, kind, issue_id, from_value, to_value, evidence) SELECT ''program-manager:'' || COALESCE(program_code, ''QNFO.OPS''), ''supersede'', issue_id, ''open'', ''closed'', evidence FROM v_persona_twin_supersede"},
    {"type": "sql", "name": "twin-contracts", "db": "AUDIT", "sql": "UPDATE remediation_contracts SET status = ''superseded'', last_verdict = ''superseded:twin-of-'' || (SELECT t.successor FROM v_persona_twin_supersede t WHERE t.issue_id = remediation_contracts.issue_id), last_attempt_at = datetime(''now'') WHERE issue_id IN (SELECT issue_id FROM v_persona_twin_supersede) AND status IN (''active'', ''holding'', ''needs-machine-probe'', ''probe-review-refused'')"},
    {"type": "sql", "name": "twin-close", "db": "AUDIT", "sql": "UPDATE agent_issues SET status = ''closed'', close_channel = ''auto:management-personas'', updated_at = CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000 WHERE id IN (SELECT issue_id FROM v_persona_twin_supersede)"},
    {"type": "sql", "name": "demote-log", "db": "AUDIT", "sql": "INSERT INTO persona_actions (persona_key, kind, issue_id, from_value, to_value, evidence) SELECT ''portfolio-manager'', ''demote'', issue_id, ''critical'', ''high'', evidence FROM v_portfolio_critical_demote"},
    {"type": "sql", "name": "demote", "db": "AUDIT", "sql": "UPDATE agent_issues SET priority = ''high'', updated_at = CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000 WHERE id IN (SELECT issue_id FROM v_portfolio_critical_demote)"},
    {"type": "sql", "name": "brief-programs", "db": "AUDIT", "sql": "INSERT OR REPLACE INTO persona_briefs (tick, persona_key, level, scope, verdict, decision, summary) SELECT a.tick, a.manager_persona, ''program'', a.program_code, a.verdict, a.decision, a.program_code || '' is '' || a.verdict || '' at risk '' || a.risk_score || COALESCE('' (24h ago '' || a.risk_24h || '')'', '''') || ''. Aim: '' || COALESCE((SELECT c.objective FROM program_charters c WHERE c.program_code = a.program_code), ''no charter'') || '' Portfolio decision: '' || a.decision || '' with '' || a.slots || '' focus slot(s) ('' || a.reason || ''). Focus: '' || COALESCE((SELECT group_concat(x, ''; '') FROM (SELECT ''#'' || f.issue_id || '' '' || substr(i.title, 1, 90) || '' ['' || f.reason || CASE WHEN f.has_doer = 1 THEN '''' ELSE '', no doer yet'' END || '']'' AS x FROM program_focus f JOIN agent_issues i ON i.id = f.issue_id WHERE f.program_code = a.program_code ORDER BY f.rank)), ''none'') || ''. Top adopted goal: '' || COALESCE((SELECT g.goal_key || '': '' || substr(g.statement, 1, 120) FROM goals g WHERE g.program_code = a.program_code AND g.status = ''adopted'' AND g.goal_type <> ''objective-revision'' ORDER BY g.priority DESC, g.adopted_at LIMIT 1), ''none'') || ''.'' FROM portfolio_allocations a WHERE a.tick = (SELECT MAX(tick) FROM portfolio_allocations)"},
    {"type": "sql", "name": "brief-portfolio", "db": "AUDIT", "sql": "INSERT OR REPLACE INTO persona_briefs (tick, persona_key, level, scope, verdict, decision, summary) SELECT cur.tick, ''portfolio-manager'', ''portfolio'', ''QNFO'', CASE WHEN (SELECT COUNT(*) FROM portfolio_allocations WHERE tick = cur.tick AND verdict = ''RED'') > 0 THEN ''RED'' WHEN (SELECT COUNT(*) FROM portfolio_allocations WHERE tick = cur.tick AND verdict = ''AMBER'') > 0 THEN ''AMBER'' ELSE ''GREEN'' END, ''allocate'', ''Constraint: '' || COALESCE((SELECT program_code || '' (risk '' || risk_score || '')'' FROM portfolio_allocations WHERE tick = cur.tick AND decision = ''constrain'' LIMIT 1), ''none'') || '' of portfolio risk '' || (SELECT ROUND(SUM(risk_score), 1) FROM portfolio_allocations WHERE tick = cur.tick) || ''. Focus slots: '' || (SELECT group_concat(program_code || '' '' || slots || '' '' || decision, '', '') FROM (SELECT program_code, slots, decision FROM portfolio_allocations WHERE tick = cur.tick ORDER BY slots DESC, program_code)) || ''. RED programs: '' || (SELECT COUNT(*) FROM portfolio_allocations WHERE tick = cur.tick AND verdict = ''RED'') || '' of '' || (SELECT COUNT(*) FROM portfolio_allocations WHERE tick = cur.tick) || ''. Focus moves last hour: '' || (SELECT COUNT(*) FROM program_focus_log WHERE action = ''enter'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) || '' in, '' || (SELECT COUNT(*) FROM program_focus_log WHERE action IN (''exit'', ''closed'') AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) || '' out. Focus issues closed in 24h: '' || (SELECT COUNT(*) FROM program_focus_log WHERE action = ''closed'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) || ''; focus issues with no doer yet: '' || (SELECT COUNT(*) FROM program_focus WHERE has_doer = 0) || ''. Priority mix of '' || (SELECT COUNT(*) FROM agent_issues WHERE status = ''open'') || '' open issues: '' || (SELECT COUNT(*) FROM agent_issues WHERE status = ''open'' AND priority = ''critical'') || '' critical, '' || (SELECT COUNT(*) FROM agent_issues WHERE status = ''open'' AND priority = ''high'') || '' high.'' FROM (SELECT MAX(tick) AS tick FROM portfolio_allocations) cur WHERE cur.tick IS NOT NULL"},
    {"type": "sql", "name": "brief-actions", "db": "AUDIT", "sql": "UPDATE persona_briefs SET summary = summary || '' Own decisions in the last hour: '' || (SELECT COUNT(*) FROM persona_actions WHERE kind = ''promote'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) || '' promoted, '' || (SELECT COUNT(*) FROM persona_actions WHERE kind = ''restore'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) || '' restored, '' || (SELECT COUNT(*) FROM persona_actions WHERE kind = ''close'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) || '' closed on recovered metrics, '' || (SELECT COUNT(*) FROM persona_actions WHERE kind = ''supersede'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) || '' duplicates superseded, '' || (SELECT COUNT(*) FROM persona_actions WHERE kind = ''demote'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) || '' stale criticals demoted.'' WHERE persona_key = ''portfolio-manager'' AND tick = (SELECT MAX(tick) FROM portfolio_allocations)"},
    {"type": "sql", "name": "decision-log", "db": "AUDIT", "sql": "INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested) SELECT ''portfolio-manager (MANAGEMENT-PERSONAS-1)'', ''program risk = 3*high + 0.3*open + 15*guard breaches + 2*stalled projects (v_program_risk); half of the focus slots go evenly to programs with open work, half by risk share'', ''allocation changed: '' || (SELECT group_concat(program_code || '' '' || slots || '' '' || decision, '', '') FROM portfolio_allocations WHERE tick = cur.tick), ''v_program_risk and v_metric_trigger_state at '' || cur.tick, ''applied: program_focus resynced and issue_priority_scores set for '' || (SELECT COUNT(*) FROM program_focus) || '' focus issues'', ''qnfo-audit program_focus and issue_priority_scores rows scored_by program-manager:*, which reorder v_issue_queue_v2 (code loop intake) within each priority tier'', ''Rollback line of migrations/2026-10-26-management-personas.sql'', ''portfolio-allocation'', ''program_focus_closed_24h >= 1 within 24 h'', ''qnfo-audit v_program_health, v_metric_trigger_state, agent_issues, issue_project_map'' FROM (SELECT MAX(tick) AS tick FROM portfolio_allocations) cur WHERE cur.tick IS NOT NULL AND NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.actor = ''portfolio-manager (MANAGEMENT-PERSONAS-1)'' AND d.evidence = ''v_program_risk and v_metric_trigger_state at '' || cur.tick AND d.action = ''allocation changed: '' || (SELECT group_concat(program_code || '' '' || slots || '' '' || decision, '', '') FROM portfolio_allocations WHERE tick = cur.tick)) AND EXISTS (SELECT 1 FROM portfolio_allocations a WHERE a.tick = cur.tick AND NOT EXISTS (SELECT 1 FROM portfolio_allocations p WHERE p.program_code = a.program_code AND p.slots = a.slots AND p.decision = a.decision AND p.tick = (SELECT MAX(t2.tick) FROM portfolio_allocations t2 WHERE t2.tick < cur.tick)))"},
    {"type": "sql", "name": "decision-log-actions", "db": "AUDIT", "sql": "INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested) SELECT ''management-personas (MANAGEMENT-PERSONAS-2)'', ''reversible issue decisions belong to the managers (owner directive 2026-10-26: delegate all decisions to fleet agents); each is in persona_actions with its prior value'', ''last hour: '' || (SELECT group_concat(kind || '' '' || n, '', '') FROM (SELECT kind, COUNT(*) AS n FROM persona_actions WHERE ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'') GROUP BY kind)), ''persona_actions rows since '' || strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes''), ''applied'', ''qnfo-audit agent_issues priority and status of the rows in persona_actions'', ''persona_actions holds from_value per row; set ops_config persona_actions = off to stop; Rollback line of migrations/2026-10-26-management-personas-2.sql'', ''manager-decisions'', ''program_focus_closed_24h >= 1 within 24 h'', ''qnfo-audit v_metric_trigger_state, remediation_contracts, program_focus'' WHERE EXISTS (SELECT 1 FROM persona_actions WHERE ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')) AND NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = ''management-personas (MANAGEMENT-PERSONAS-2)'' AND ts >= strftime(''%Y-%m-%dT%H:00:00Z'', ''now''))"},
    {"type": "sql", "name": "metric-focus-closed", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM program_focus_log WHERE action = ''closed'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''program_focus_closed_24h''"},
    {"type": "sql", "name": "metric-focus-no-doer", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM program_focus WHERE has_doer = 0) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''program_focus_without_doer''"},
    {"type": "sql", "name": "metric-actions", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM persona_actions WHERE ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''persona_actions_24h''"},
    {"type": "sql", "name": "prune", "db": "AUDIT", "sql": "DELETE FROM persona_briefs WHERE tick < strftime(''%Y-%m-%dT%H:00Z'', ''now'', ''-30 days'')"},
    {"type": "sql", "name": "ledger", "db": "AUDIT", "sql": "INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''management-personas-'' || strftime(''%Y%m%d%H%M%S'', ''now''), datetime(''now''), ''management-personas'', ''MANAGEMENT-PERSONAS-1: '' || (SELECT group_concat(program_code || '' '' || verdict || '' '' || slots || '' '' || decision, '' | '') FROM portfolio_allocations WHERE tick = (SELECT MAX(tick) FROM portfolio_allocations)) || '' | focus '' || (SELECT COUNT(*) FROM program_focus) || '' (no doer '' || (SELECT COUNT(*) FROM program_focus WHERE has_doer = 0) || '')'', NULL, ''management-personas'', ''ok''"}
  ]}', 120000, 1, 2, 1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state, last_value, last_refreshed)
VALUES
  ('persona_actions_24h', 'operational', 'target',
   'persona_actions rows in the last 24 hours: issue decisions (promote, restore, close, supersede, demote) the managers took without the owner',
   'qnfo-audit.persona_actions (MANAGEMENT-PERSONAS-2), written hourly by fleet_tasks management-personas',
   '>= 1', 'qnfo-fleet-control', 'agent:management-personas', 'hourly', 'MEASURED', NULL, NULL);

UPDATE management_personas
SET decision_authority = CASE WHEN level = 'portfolio'
      THEN 'decides every hour how the focus slots are split across programs and which program is the constraint (portfolio_allocations), and demotes stale fleet-filed critical issues to high (persona_actions demote); money, credentials, legal or signing acts and the owner''s accounts stay owner cards'
      ELSE 'decides every hour which open issues of its program are in focus, moves them to the front of the code loop''s queue, promotes them to high and restores them when they leave focus, closes metric-trigger issues whose metric recovered and supersedes duplicate metric issues (persona_actions)' END,
    updated_at = datetime('now')
WHERE persona_key = 'portfolio:fleet' OR persona_key LIKE 'program:%';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
VALUES ('session claude/project-thread-0hsmo1',
  'Owner directives 2026-10-26 06:31Z and 06:32Z delegate the daily decisions to the manager agents; the reversible issue decisions (priority, closing on recorded evidence, superseding duplicates) are theirs, the identity-bound ones stay with the owner',
  'MANAGEMENT-PERSONAS-2: promote/restore, close on recovered metric, supersede twin metric issues, demote stale fleet criticals; persona_actions ledger; snapshot of v_program_risk to end the SQLITE_NOMEM of step 1',
  'qnfo-audit 2026-10-26 06:40Z: fleet_runs management-personas 3 failed SQLITE_NOMEM; open METRIC-TRIGGER issues 74 (4 recovered, 2 twins); 29 fleet-filed criticals older than 24 h with no doer',
  'pending: first run after apply', 'qnfo-audit agent_issues priority/status of the rows in persona_actions',
  'Rollback line of migrations/2026-10-26-management-personas-2.sql',
  'manager-decisions', 'persona_actions_24h >= 1 within 2 h', 'qnfo-audit (D1 MCP read), fleet-exec workflow engine');

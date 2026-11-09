-- ISSUE-WEEK-CAP-1 (charter pillar autonomy). Owner directive 2026-11-09, verbatim: "DEVELOP A BETTER ISSUE TRIAGE AND BUILD/DEPLOY THAT CAN PROCESS ANY/ALL OPEN ISSUES AND CLOSE IN LESS THAN 1 WEEK, INCLUDING WONTFIX FOR LOW-IMPACT/LOW-PRIORITY ISSUES. ... NO OPEN ISSUE SHALL REMAIN LONGER THAN 1 WEEK."
-- READ 2026-11-09 (v_issue_age_ladder): 770 open, 187 older than 7 d, 405 critical at 1-5 d. The 8 h age bump (ISSUE-AGE-24H-1) turned nearly everything critical, so priority no longer says impact;
--   issue_age_actions.priority_was (rung 8h) keeps the original. Of 203 issues older than 5 d, 104 were originally low or medium.
-- ADDS: a terminal rung at 144 h (6 d, one day of margin). An open issue with no live doer whose ORIGINAL priority is low or medium is closed wontfix with evidence (issue_triage.close_evidence,
--   close_channel auto:week-cap), 25 a run, logged with its revert in issue_week_cap_ledger. wontfix is exempt from close-while-contract-fails; close-without-evidence is satisfied by the triage row.
--   High-impact issues are never wontfixed: metric issues_over_7d (target 0) files the breach for the planner and the ISSUE-AGE-24H-REPAIR-1 doers. ops_config issue_week_cap = off stops the rung.
-- TRADEOFF: guard issue_wontfix_share_7d (target <= 15) will breach during the first drain (about 100 closes); the guard is deliberately not edited and recovers as its 7 d window rolls.
-- CAUSE-MAPPED: issues_over_7d is the issue-backlog family; its lever is the ISSUE-AGE-24H-1 ladder plus this rung.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: issue_week_cap_ledger
-- Rollback: DELETE FROM fleet_crons WHERE name = 'issue-week-cap'; DELETE FROM fleet_tasks WHERE id = 'issue-week-cap'; DELETE FROM fleet_tasks_canonical WHERE id = 'issue-week-cap'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'issues_over_7d'; DELETE FROM metric_registry WHERE metric = 'issues_over_7d'; UPDATE agent_issues SET status = 'open' WHERE id IN (SELECT issue_id FROM issue_week_cap_ledger WHERE action = 'wontfix');

CREATE TABLE IF NOT EXISTS issue_week_cap_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  issue_id INTEGER NOT NULL, action TEXT NOT NULL, impact TEXT, priority_was TEXT, source TEXT, age_h REAL,
  evidence TEXT, applied INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_issue_week_cap_ledger_issue ON issue_week_cap_ledger (issue_id, action);

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES
 ('issue_week_cap', 'on', 'ISSUE-WEEK-CAP-1: off stops the 144 h wontfix rung for low-impact issues (migrations/2026-11-09-issue-week-cap.sql)'),
 ('OWNER_DIRECTIVE_2026_11_09_ISSUE_WEEK_CAP_1', '{"id":"ISSUE-WEEK-CAP-1","date":"2026-11-09","directive":"no open issue remains longer than one week; low-impact and low-priority issues close wontfix with evidence","measured_by":["issues_over_7d (target 0)"]}', 'owner directive 2026-11-09');

INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('issue-week-cap', 'ISSUE-WEEK-CAP-1: wontfix low-impact issues with no doer at 144 h', 'workflow',
  json_object('steps', json_array(
    json_object('type', 'sql', 'db', 'AUDIT', 'sql', 'INSERT INTO issue_week_cap_ledger (issue_id, action, impact, priority_was, source, age_h, evidence) SELECT a.id, ''wontfix'', ''low'', COALESCE((SELECT x.priority_was FROM issue_age_actions x WHERE x.issue_id = a.id AND x.rung = ''8h''), a.priority), a.source, l.age_h, ''ISSUE-WEEK-CAP-1: open '' || CAST(l.age_h AS INTEGER) || '' h (cap 168 h), original priority '' || COALESCE((SELECT x.priority_was FROM issue_age_actions x WHERE x.issue_id = a.id AND x.rung = ''8h''), a.priority) || '' (low impact), no live code task, work claim or progressing diagnosis, plan outcome '' || COALESCE(l.plan_outcome, ''none'') || ''. Closed wontfix by the week cap; a relapse refiles and reopens it (issue_refile_reopen). Revert: UPDATE agent_issues SET status = ''''open'''' WHERE id = '' || a.id FROM agent_issues a JOIN v_issue_age_ladder l ON l.id = a.id WHERE a.status = ''open'' AND l.age_h >= 144 AND l.doer IS NULL AND COALESCE((SELECT x.priority_was FROM issue_age_actions x WHERE x.issue_id = a.id AND x.rung = ''8h''), a.priority) IN (''low'', ''medium'') AND a.title NOT LIKE ''ISSUE-AGE-24H-REPAIR-1:%'' AND COALESCE((SELECT value FROM ops_config WHERE key = ''issue_week_cap''), ''on'') <> ''off'' AND NOT EXISTS (SELECT 1 FROM issue_week_cap_ledger w WHERE w.issue_id = a.id AND w.action = ''wontfix'' AND w.applied = 0) ORDER BY l.age_h DESC LIMIT 25'),
    json_object('type', 'sql', 'db', 'AUDIT', 'sql', 'INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT w.issue_id, ''week-cap'', ''triaged'', ''qnfo-fleet-control'', strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), w.evidence FROM issue_week_cap_ledger w WHERE w.applied = 0 AND w.action = ''wontfix'' ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence'),
    json_object('type', 'sql', 'db', 'AUDIT', 'sql', 'UPDATE agent_issues SET status = ''wontfix'', close_channel = ''auto:week-cap'', updated_at = CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000 WHERE status = ''open'' AND id IN (SELECT issue_id FROM issue_week_cap_ledger WHERE applied = 0 AND action = ''wontfix'')'),
    json_object('type', 'sql', 'db', 'AUDIT', 'sql', 'UPDATE issue_week_cap_ledger SET applied = 1 WHERE applied = 0 AND action = ''wontfix'''),
    json_object('type', 'sql', 'db', 'AUDIT', 'sql', 'UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM agent_issues WHERE status = ''open'' AND created_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 604800) * 1000) AS TEXT), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''issues_over_7d''')
  )),
  30000, 1, 1, 1, datetime('now'));

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, last_fired, next_fire, updated_at)
VALUES ('issue-week-cap', '*/10 * * * *', 'issue-week-cap', 1, 'UTC', NULL, NULL, datetime('now'));

INSERT OR REPLACE INTO fleet_tasks_canonical (id, definition, repo_path, exported_at)
SELECT id, definition, 'migrations/2026-11-09-issue-week-cap.sql', datetime('now') FROM fleet_tasks WHERE id = 'issue-week-cap';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('issues_over_7d', 'operational', 'target', 'open agent_issues created more than 168 h ago', 'qnfo-audit.agent_issues (ISSUE-WEEK-CAP-1)', '187 on 2026-11-09', '0 (owner directive 2026-11-09: no open issue remains longer than one week)', 'qnfo-fleet-control', 'trigger gt 0', '*/10', '> 0', '> 20', NULL, NULL, 'MEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'issues_over_7d', 'Open issues older than one week', 'registry', 'gt', 0, 1,
  'Pillar autonomy (owner directive 2026-11-09). Low-impact ones are closed wontfix by issue-week-cap at 144 h. What remains is high-impact with no doer: SELECT id, source, priority, age_h, plan_outcome, plan_reason FROM v_issue_age_ladder WHERE age_h >= 168 ORDER BY age_h DESC. Levers: give each a code-task line and probe, fold duplicates of one family into the oldest with close_evidence, or fix the filing loop so it closes its own notice.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'ISSUE-WEEK-CAP-1 (migrations/2026-11-09-issue-week-cap.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'issues_over_7d');

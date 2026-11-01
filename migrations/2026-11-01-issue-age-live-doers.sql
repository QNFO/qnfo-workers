-- ISSUE-AGE-24H-1 (#3224, agent_issues 100299, charter pillar autonomy).
-- Live 2026-11-01: 100 overdue issues count as owned solely through a code-task text line.
-- Prediction: text-only and terminal tasks become visible breaches; eligible plans retry within 120 minutes.
-- No trust, refusal, claim, or close-evidence check is weakened. Repair notices contain ids, not promoted issue text.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_issue_age_objects
-- Rollback: DROP TRIGGER IF EXISTS issue_age_live_doers_tick; DROP VIEW IF EXISTS v_sla_breaches; CREATE VIEW v_sla_breaches AS SELECT i.id, i.priority, i.category, NULL AS rc, NULL AS owner, NULL AS sla_due_at, NULL AS triage_state, 'untriaged' AS breach_type FROM agent_issues i WHERE i.status = 'open' AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = i.id); DROP VIEW IF EXISTS v_issue_age_ladder; CREATE VIEW v_issue_age_ladder AS WITH n AS (SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS now_iso), o AS (SELECT a.id, a.title, a.priority, a.source, ROUND((n.now_ms - a.created_at) / 3600000.0, 1) AS age_h, CASE WHEN instr(COALESCE(a.description, ''), 'code-task:') > 0 THEN 'code-task line' WHEN EXISTS (SELECT 1 FROM code_tasks k WHERE k.goal LIKE '[issue #' || a.id || ']%' AND k.status NOT IN ('failed', 'closed', 'superseded', 'needs_human')) THEN 'live code task' WHEN EXISTS (SELECT 1 FROM work_claims w WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id) AND w.released_at IS NULL AND w.expires_at > n.now_iso) THEN 'live work claim' WHEN EXISTS (SELECT 1 FROM breach_diagnoses d WHERE d.issue_id = a.id AND d.mode = 'on' AND d.state IN ('queued', 'applied', 'verifying') AND d.action_ref IS NOT NULL AND d.action_kind <> 'none' AND d.lease_until > n.now_iso AND d.last_progress_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN 'breach doctor' ELSE NULL END AS doer, p.outcome AS plan_outcome, p.planned_at, substr(COALESCE(p.detail, ''), 1, 200) AS plan_reason FROM agent_issues a CROSS JOIN n LEFT JOIN issue_plans p ON p.issue_id = a.id WHERE a.status = 'open') SELECT id, substr(title, 1, 120) AS title, priority, source, age_h, doer, plan_outcome, planned_at, plan_reason, CASE WHEN age_h >= 24 THEN '24h' WHEN age_h >= 16 THEN '16h' WHEN age_h >= 8 THEN '8h' WHEN age_h >= 4 THEN '4h' ELSE 'new' END AS rung, CASE WHEN age_h >= 24 AND doer IS NULL THEN 1 ELSE 0 END AS breach FROM o; UPDATE metric_registry SET formula = (SELECT sql FROM bak_20261101_issue_age_objects WHERE name = 'issues_over_24h_no_doer') WHERE metric = 'issues_over_24h_no_doer'

CREATE TABLE IF NOT EXISTS bak_20261101_issue_age_objects AS
SELECT name, sql FROM sqlite_master WHERE name IN ('v_issue_age_ladder', 'v_sla_breaches')
UNION ALL SELECT metric, formula FROM metric_registry WHERE metric = 'issues_over_24h_no_doer';

DROP VIEW IF EXISTS v_issue_age_ladder;
CREATE VIEW v_issue_age_ladder AS
WITH n AS (SELECT CAST(strftime('%s', 'now') AS INTEGER) * 1000 AS now_ms, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS now_iso),
live_tasks AS MATERIALIZED (
  SELECT id, goal FROM code_tasks
  WHERE status NOT IN ('merged', 'closed', 'superseded', 'publish_failed', 'needs_human', 'failed', 'reverted')
    AND (updated_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')
         OR lease_until > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
),
o AS (
  SELECT a.id, a.title, a.priority, a.source, n.now_ms - a.created_at AS age_ms,
    CASE WHEN EXISTS (SELECT 1 FROM live_tasks k WHERE k.goal LIKE '[issue #' || a.id || ']%' OR k.id = 'ct_im' || a.id OR k.id = p.task_id) THEN 'live code task'
         WHEN EXISTS (SELECT 1 FROM work_claims w WHERE (w.issue_id = a.id OR w.path = 'issue:' || a.id) AND w.released_at IS NULL AND w.expires_at > n.now_iso) THEN 'live work claim'
         WHEN EXISTS (SELECT 1 FROM breach_diagnoses d WHERE d.issue_id = a.id AND d.mode = 'on' AND d.state IN ('queued', 'applied', 'verifying')
                        AND d.action_ref IS NOT NULL AND d.action_kind <> 'none' AND d.lease_until > n.now_iso
                        AND d.last_progress_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) THEN 'breach doctor'
         ELSE NULL END AS doer,
    p.outcome AS plan_outcome, p.planned_at, substr(COALESCE(p.detail, ''), 1, 200) AS plan_reason
  FROM agent_issues a CROSS JOIN n LEFT JOIN issue_plans p ON p.issue_id = a.id
  WHERE a.status = 'open'
)
SELECT id, substr(title, 1, 120) AS title, priority, source, ROUND(age_ms / 3600000.0, 1) AS age_h,
  doer, plan_outcome, planned_at, plan_reason,
  CASE WHEN age_ms >= 86400000 THEN '24h' WHEN age_ms >= 57600000 THEN '16h' WHEN age_ms >= 28800000 THEN '8h' WHEN age_ms >= 14400000 THEN '4h' ELSE 'new' END AS rung,
  CASE WHEN age_ms >= 86400000 AND doer IS NULL THEN 1 ELSE 0 END AS breach
FROM o;

DROP VIEW IF EXISTS v_sla_breaches;
CREATE VIEW v_sla_breaches AS
SELECT i.id, i.priority, i.category, NULL AS rc, NULL AS owner, NULL AS sla_due_at, NULL AS triage_state, 'untriaged' AS breach_type
FROM agent_issues i WHERE i.status = 'open' AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = i.id)
UNION ALL
SELECT i.id, i.priority, i.category, NULL, 'qnfo-code-orchestrator', NULL, NULL, 'issue-age-24h'
FROM agent_issues i JOIN v_issue_age_ladder l ON l.id = i.id WHERE l.breach = 1;

CREATE TABLE IF NOT EXISTS issue_age_actions (
  issue_id INTEGER NOT NULL, rung TEXT NOT NULL, priority_was TEXT, priority_to TEXT, blocker TEXT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), PRIMARY KEY (issue_id, rung)
);

-- The heavy heartbeat is already produced every 10 minutes. Snapshot once; never burden the ordinary tick with more scans.
CREATE TABLE IF NOT EXISTS issue_age_tick_state AS
SELECT l.*, '' AS blocker FROM v_issue_age_ladder l WHERE 0;
CREATE TRIGGER IF NOT EXISTS issue_age_live_doers_tick AFTER INSERT ON fleet_tick_heavy
BEGIN
  DELETE FROM issue_age_tick_state;
  INSERT INTO issue_age_tick_state
    SELECT l.*, COALESCE(NULLIF(k.merge_note, ''), NULLIF(k.last_error, ''), NULLIF(l.plan_reason, ''), 'no live task, claim or progressing diagnosis')
    FROM v_issue_age_ladder l LEFT JOIN issue_plans p ON p.issue_id = l.id LEFT JOIN code_tasks k ON k.id = p.task_id;

  INSERT INTO issue_age_replans (issue_id, outcome_was, planned_at_was, age_h)
    SELECT id, plan_outcome, planned_at, age_h FROM issue_age_tick_state s
    WHERE s.rung <> 'new' AND s.doer IS NULL AND s.plan_outcome IN ('not-code', 'invalid', 'error', 'queued')
      AND COALESCE((SELECT value FROM ops_config WHERE key = 'issue_age_replan'), 'on') <> 'off'
      AND s.planned_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')
      AND NOT EXISTS (SELECT 1 FROM issue_age_replans r WHERE r.issue_id = s.id AND r.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes'))
    ORDER BY CASE s.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, s.age_h DESC LIMIT 12;
  UPDATE issue_plans SET outcome = 'retry', planned_at = '2000-01-01T00:00:00Z',
    detail = substr('ISSUE-AGE-24H-1 re-plan: ' || COALESCE(detail, ''), 1, 600)
    WHERE issue_id IN (SELECT issue_id FROM issue_age_replans WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 minutes'))
      AND outcome IN ('not-code', 'invalid', 'error', 'queued');

  INSERT OR IGNORE INTO issue_age_actions (issue_id, rung, priority_was, priority_to, blocker)
    SELECT id, '8h', priority, CASE priority WHEN 'low' THEN 'medium' WHEN 'medium' THEN 'high' WHEN 'high' THEN 'critical' ELSE priority END, blocker
    FROM issue_age_tick_state WHERE rung IN ('8h', '16h', '24h') AND doer IS NULL;
  UPDATE agent_issues SET priority = (SELECT priority_to FROM issue_age_actions WHERE issue_id = agent_issues.id AND rung = '8h'),
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
    WHERE status = 'open' AND id IN (SELECT issue_id FROM issue_age_actions WHERE rung = '8h' AND ts = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      AND priority IN ('low', 'medium', 'high');
  INSERT OR IGNORE INTO issue_age_actions (issue_id, rung, priority_was, priority_to, blocker)
    SELECT id, '16h', priority, 'critical', blocker FROM issue_age_tick_state WHERE rung IN ('16h', '24h') AND doer IS NULL;
  UPDATE agent_issues SET priority = 'critical', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
    WHERE status = 'open' AND priority <> 'critical'
      AND id IN (SELECT issue_id FROM issue_age_actions WHERE rung = '16h' AND ts = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

  INSERT OR IGNORE INTO issue_age_actions (issue_id, rung, blocker)
    SELECT id, '24h', blocker FROM issue_age_tick_state WHERE breach = 1;
  INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
    SELECT 'ISSUE-AGE-24H-REPAIR-1: issue #' || s.id || ' has no live doer',
      'Pillar autonomy. The blocker is recorded in issue_age_actions for issue ' || s.id || ', rung 24h. Read that row and issue_plans before choosing the remediation. The code planner, trusted intake and breach doctor own recovery; their refusal and claim checks still apply. Keep the original issue open until its own probe passes.',
      'qnfo-fleet-control', 'reliability', 'critical', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
    FROM issue_age_tick_state s WHERE s.breach = 1 AND s.title NOT LIKE 'ISSUE-AGE-24H-REPAIR-1:%'
      AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.status = 'open' AND a.title = 'ISSUE-AGE-24H-REPAIR-1: issue #' || s.id || ' has no live doer')
      AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title = 'ISSUE-AGE-24H-REPAIR-1: issue #' || s.id || ' has no live doer'
                      AND a.created_at > (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000)
    ORDER BY s.age_h DESC LIMIT 12;
  UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
    verify_probe = 'SELECT ''0'' AS expected, CAST(COALESCE((SELECT breach FROM v_issue_age_ladder WHERE id = ' ||
      (SELECT s.id FROM issue_age_tick_state s WHERE agent_issues.title = 'ISSUE-AGE-24H-REPAIR-1: issue #' || s.id || ' has no live doer') || '), 0) AS TEXT) AS observed',
    action = 'Verify recovery of the original issue''s live doer; its own outcome probe still controls its closure.'
    FROM agent_issues WHERE remediation_contracts.class = 'issue-' || agent_issues.id AND agent_issues.status = 'open'
      AND agent_issues.title LIKE 'ISSUE-AGE-24H-REPAIR-1:%'
      AND EXISTS (SELECT 1 FROM issue_age_tick_state s WHERE agent_issues.title = 'ISSUE-AGE-24H-REPAIR-1: issue #' || s.id || ' has no live doer');
  UPDATE metric_registry SET last_value = CAST((SELECT COUNT(*) FROM issue_age_tick_state WHERE breach = 1) AS TEXT),
    last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'issues_over_24h_no_doer';
END;

UPDATE metric_registry SET formula = 'open issues at least 24 h old without an unfinished code task, live work claim or progressing breach doctor; text-only markers and terminal tasks never count'
WHERE metric = 'issues_over_24h_no_doer';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('issue-age-phantom-doer', 'overdue issues appear owned after every task ended',
  'text markers and merged or publish_failed tasks counted as live; queued plans never retried',
  'count only unfinished tasks and live claims or progressing diagnoses; retry eligible plans using the intake retry policy',
  'fm-issue-age-phantom-doer', 'fm-issue-age-phantom-doer', '2026-11-01', 100299,
  'a terminal or text-only task is reported as live', 'age SLA misses unexecuted remediations', 'age ladder, planner and dashboard');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-issue-age-phantom-doer', 100299,
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM v_issue_age_ladder l WHERE l.doer = ''code-task line'' OR (l.doer = ''live code task'' AND NOT EXISTS (SELECT 1 FROM code_tasks k LEFT JOIN issue_plans p ON p.issue_id = l.id WHERE (k.goal LIKE ''[issue #'' || l.id || '']%'' OR k.id = ''ct_im'' || l.id OR k.id = p.task_id) AND k.status NOT IN (''merged'', ''closed'', ''superseded'', ''publish_failed'', ''needs_human'', ''failed'', ''reverted'') AND (k.updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'') OR k.lease_until > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''))))',
  'd1-query', 1000, 1, 'active', 'age ladder installed', 'Detect phantom doers without changing issue closure evidence', 'qnfo-fleet-control');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot:3224', 'a task marker is intent, not execution', 'ISSUE-AGE-24H-1 live-doer accounting and age recovery',
  'live D1: 100 overdue rows classified as code-task line on 2026-11-01; planner deduped against terminal history',
  'pending canonical migration and seven daily zero reads', 'age views, heavy tick and eligible issue plans',
  'Rollback line; escalation and repair history remain auditable',
  'overdue unowned issues receive bounded replanning, escalation and blocker repair notices',
  'phantom ownership falls to zero; eligible terminal plans return to planning within 120 minutes',
  'no direct reach claim', 'offline SQLite tick replay and planner retry tests'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action = 'ISSUE-AGE-24H-1 live-doer accounting and age recovery');

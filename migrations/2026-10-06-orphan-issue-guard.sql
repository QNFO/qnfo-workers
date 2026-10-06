-- ORPHAN-ISSUE-GUARD-1 (2026-10-06, pillar autonomy, transformation lever T5.12). Owner directive 2026-10-06: no open issue
-- stays unresolved or unremediated, now or later, fleet-wide. An issue with no owner and no next action is itself a defect
-- (core prompt rule 4), and nothing measured it: at 2026-10-06T10:55Z eleven of the 75 open issues had no next action at
-- all (no active or holding remediation_contracts probe, no code-task line, no session-task line, no unfinished code task,
-- no live work claim, no open owner card): 1750, 1779, 1815, 1898, 1901, 1903, 2019, 2024, 2034, 2037, 2045. Each got one
-- the same hour (session_01CX4ooVZuEie1F9eEtYHx2u); this file makes the gap a measured guard so it cannot recur silently.
--   v_issues_no_next_action     the open issues with none of the six next actions (id, priority, title, owner, age_h)
--   issues_without_next_action  guard metric, target 0. Two D1 triggers refresh it from the view every time the hourly
--                               open_agent_issues write lands (qnfo-lifecycle runMetricFreshness), so it needs no worker
--                               code, no cron and no watchmaker entry; the migration seeds the first value.
--   trigger gt 0                one deduped METRIC-TRIGGER issue (its probe comes from contract_probe_templates_v1) whose
--                               lever is: give every listed issue one of the six next actions; close only with evidence.
--   orphan-issue-guard-1        contract: the metric itself must be fresh (within 3h of the hourly refresh).
-- A next action is one of: (1) remediation_contracts row with status active or holding (the hourly remediation tick closes
-- the issue on recovery); (2) a code-task line in the description (the code loop opens the PR, ACT-BRIDGE-1); (3) an
-- unfinished code_tasks row naming [issue #id]; (4) a session-task line (a session picks it from v_issue_queue);
-- (5) a live work_claims row on the issue (a session is on it now); (6) an open human_actions card with source issue:<id>,
-- only for a decision or credential the owner alone holds. A needs-machine-probe placeholder contract is not a next action.
-- Idempotent: CREATE IF NOT EXISTS, INSERT OR IGNORE, guarded INSERT, guarded UPDATE.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS metric_orphan_issues_au; DROP TRIGGER IF EXISTS metric_orphan_issues_ai; DROP VIEW IF EXISTS v_issues_no_next_action; DELETE FROM metric_registry WHERE metric = 'issues_without_next_action'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'issues_without_next_action'; DELETE FROM remediation_contracts WHERE class = 'orphan-issue-guard-1';

CREATE VIEW IF NOT EXISTS v_issues_no_next_action AS
SELECT a.id, a.priority, a.category, a.title, a.source, t.owner, a.linked_session,
       CAST((CAST(strftime('%s', 'now') AS INTEGER) * 1000 - a.created_at) / 3600000 AS INTEGER) AS age_h,
       a.created_at, a.updated_at
FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id
WHERE a.status = 'open'
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding'))
  AND instr(COALESCE(a.description, ''), 'code-task:') = 0
  AND instr(COALESCE(a.description, ''), 'session-task:') = 0
  AND NOT EXISTS (SELECT 1 FROM code_tasks k WHERE k.status NOT IN ('merged', 'closed', 'failed', 'needs_human')
                  AND instr(COALESCE(k.goal, ''), '[issue #' || a.id || ']') > 0)
  AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL
                  AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
  AND NOT EXISTS (SELECT 1 FROM human_actions h WHERE h.status NOT IN ('resolved', 'dismissed') AND h.source = 'issue:' || a.id);

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('issues_without_next_action', 'operational', 'guard',
  'count(v_issues_no_next_action): open agent_issues with none of: a remediation_contracts row with status active or holding, a code-task line, a session-task line, an unfinished code_tasks row naming [issue #id], a live work_claims row on the issue, an open human_actions card with source issue:<id>. A needs-machine-probe placeholder is not a next action.',
  'qnfo-audit.v_issues_no_next_action (ORPHAN-ISSUE-GUARD-1, migrations/2026-10-06-orphan-issue-guard.sql)',
  '11 of 75 open issues at 2026-10-06T10:55Z, before the same-hour fixes',
  '0 at every refresh',
  'qnfo-fleet-control',
  'trigger gt 0 -> one METRIC-TRIGGER issue listing the lever per orphan (migrations/2026-10-06-orphan-issue-guard.sql)',
  'hourly (D1 triggers metric_orphan_issues_au/ai on the open_agent_issues refresh)', '> 0', '> 5',
  CAST((SELECT COUNT(*) FROM v_issues_no_next_action) AS TEXT), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS metric_orphan_issues_au AFTER UPDATE ON metric_registry
WHEN NEW.metric = 'open_agent_issues'
BEGIN
  UPDATE metric_registry
  SET last_value = CAST((SELECT COUNT(*) FROM v_issues_no_next_action) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'issues_without_next_action';
END;

CREATE TRIGGER IF NOT EXISTS metric_orphan_issues_ai AFTER INSERT ON metric_registry
WHEN NEW.metric = 'open_agent_issues'
BEGIN
  UPDATE metric_registry
  SET last_value = CAST((SELECT COUNT(*) FROM v_issues_no_next_action) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'issues_without_next_action';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'issues_without_next_action', 'Autonomy gap: an open issue has no owner action (no probe, code task, session task, claim or owner card)', 'registry', 'gt', 0, 3,
  'Pillar autonomy (ORPHAN-ISSUE-GUARD-1, lever T5.12). Owner directive 2026-10-06: no open issue stays unresolved or unremediated. Read SELECT id, priority, title, owner, age_h FROM v_issues_no_next_action. Give every row exactly one next action, in this order of preference: (1) a remediation_contracts row class issue-<id>, status active, verify_transport d1-query, a literal read-only SELECT returning expected and observed (observed ''pending: <why>'' while it cannot judge yet), so the hourly remediation tick closes the issue on recovery; (2) a code-task line plus a code-anchor line appended to the description (the two-line format in CLAUDE.md, ACT-BRIDGE-1) when the fix is one file, so the code loop opens the PR; (3) a session-task line naming the first concrete step when it needs a session; (4) a human_actions card with source issue:<id> only for a decision or credential the owner alone holds (consent, sign-in, money), never for work the fleet can do; (5) a live work claim (deploy-guard /work-lock/acquire, key issue:<id>) while a session is on it. Close an issue only with a live measurement in issue_triage.close_evidence; never close as wontfix or duplicate to clear the list (issue_wontfix_share_7d is a guard). Definition of done: issues_without_next_action reads 0 at the next open_agent_issues refresh, and issue_triage.remediation on each listed issue names the action it got.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'ORPHAN-ISSUE-GUARD-1 (migrations/2026-10-06-orphan-issue-guard.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'issues_without_next_action');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status)
VALUES ('orphan-issue-guard-1', NULL,
  'migration applied; qnfo-lifecycle writes open_agent_issues hourly',
  'observe only: the D1 triggers metric_orphan_issues_au and metric_orphan_issues_ai refresh issues_without_next_action from v_issues_no_next_action on every open_agent_issues write',
  'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT last_refreshed FROM metric_registry WHERE metric = ''issues_without_next_action''), '''') >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'') THEN ''ok'' ELSE ''stale: issues_without_next_action last refreshed '' || COALESCE((SELECT last_refreshed FROM metric_registry WHERE metric = ''issues_without_next_action''), ''never'') END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active');

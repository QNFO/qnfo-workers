-- ISSUE-DRAIN-RATIO-REPAIR-1 (agent_issues 99944, charter pillar autonomy).
-- Live qnfo-audit read 2026-11-01: issue_drain_ratio_24h=0.442; the issue-age
-- repair family added 193 opened/reopened events and retained 180 open notices.
-- The original issue remains measured and actionable through issue_age_actions,
-- v_issue_age_ladder and v_sla_breaches; a second issue row per target is redundant.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = 'on' WHERE key = 'issue_age_repair_notices'; UPDATE control_registry SET disposition = 'remove', disposition_state = 'applied', evidence = evidence || ' | ISSUE-DRAIN-RATIO-REPAIR-1 rollback: notices re-enabled through ops_config issue_age_repair_notices=on' WHERE control = 'issue-age-repair-secondary-notice'; UPDATE control_alternate_probes SET enabled = 0 WHERE control = 'issue-age-repair-secondary-notice'

INSERT OR IGNORE INTO ops_config (key, value)
VALUES ('issue_age_repair_notices', 'off');

CREATE TRIGGER IF NOT EXISTS issue_age_repair_notice_filter
BEFORE INSERT ON agent_issues
WHEN NEW.source = 'qnfo-fleet-control'
  AND NEW.title LIKE 'ISSUE-AGE-24H-REPAIR-1:%'
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'issue_age_repair_notices'), 'off') <> 'on'
BEGIN
  SELECT RAISE(IGNORE);
END;

INSERT OR IGNORE INTO control_registry
  (control, location, kind, guards_against, critical_path, disposition,
   disposition_state, alternate_path, evidence, issue_id)
VALUES
  ('issue-age-repair-secondary-notice',
   'qnfo-audit D1 trigger issue_age_repair_notice_filter',
   'filter',
   'secondary issue rows for overdue issues already recorded in issue_age_actions',
   0,
   'replace',
   'applied',
   'Keep each original issue open in v_issue_age_ladder and v_sla_breaches; issue_age_actions retains its 24h blocker for the code planner and breach doctor.',
   'ISSUE-DRAIN-RATIO-REPAIR-1: qnfo-audit measured 193 repair notices opened/reopened and 180 open in 24h while issue_age_actions and v_sla_breaches already retain the original work. The SQLite suite verifies the notice filter and continued age measurement.',
   99944);

INSERT OR IGNORE INTO control_alternate_probes
  (control, probe_sql, window_note, enabled)
VALUES
  ('issue-age-repair-secondary-notice',
   'SELECT ''ok'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM v_issue_age_ladder l WHERE l.breach = 1 AND NOT EXISTS (SELECT 1 FROM issue_age_actions x WHERE x.issue_id = l.id AND x.rung = ''24h'')) THEN ''an age breach has no issue_age_actions row'' WHEN EXISTS (SELECT 1 FROM v_issue_age_ladder l WHERE l.breach = 1 AND NOT EXISTS (SELECT 1 FROM v_sla_breaches b WHERE b.id = l.id AND b.breach_type = ''issue-age-24h'')) THEN ''an age breach is absent from v_sla_breaches'' ELSE ''ok'' END AS observed',
   'Each heavy tick: every 24h breach stays in issue_age_actions and v_sla_breaches after secondary notice rows are filtered; replayed by migrations/issue-age-live-doers.test.mjs.',
   1);

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class,
   first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES
  ('issue-age-repair-secondary-notice-fanout',
   'Issue-age repair notices inflate the issue arrival rate',
   'The heavy tick inserts a second agent_issues row for each overdue target even though the target and its blocker are already recorded.',
   'Filter only secondary notices; keep the original issue, age action, SLA breach and its evidence-based close path.',
   'fm-issue-age-repair-secondary-notice-fanout',
   'fm-issue-age-repair-secondary-notice-fanout',
   '2026-11-01',
   99944,
   'An ISSUE-AGE-24H-REPAIR-1 issue is opened by qnfo-fleet-control.',
   'Artificial arrivals depress issue_drain_ratio_24h and duplicate each unresolved target.',
   'agent_issues throughput and the code planner intake');

INSERT OR IGNORE INTO remediation_contracts
  (class, precondition, action, verify_probe, verify_transport, max_attempts,
   escalate_to, expected_cadence_h, status, module)
VALUES
  ('fm-issue-age-repair-secondary-notice-fanout',
   'ISSUE-DRAIN-RATIO-REPAIR-1 filter installed',
   'Detect new secondary issue-age repair notices without changing source issue closure.',
   'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE a.source = ''qnfo-fleet-control'' AND a.title LIKE ''ISSUE-AGE-24H-REPAIR-1:%'' AND l.event IN (''opened'', ''reopened'') AND l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-60 minutes'')',
   'd1-query',
   3,
   'qnfo-fleet-control',
   1,
   'active',
   'issue-drain-ratio-repair');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path,
   capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot:QNFO.OPS',
  'The issue-age ledger already preserves each original overdue issue.',
  'ISSUE-DRAIN-RATIO-REPAIR-1: filter secondary issue-age notices while preserving original issues and their 24h actions.',
  'qnfo-audit 2026-11-01: issue_drain_ratio_24h=0.442; 193 repair notices opened and 180 remain open.',
  'Secondary notices are filtered; original issues remain open and visible.',
  'One scoped agent_issues insert filter and its probe.',
  'Set ops_config issue_age_repair_notices=on to restore the prior notice path.',
  'Reduce redundant issue arrivals without weakening closure evidence.',
  'New repair notices stop; the drain ratio rises after the old notice window rolls out. The 1.5 target remains the closing probe.',
  'No direct reach change.',
  'Read-only D1 queries; SQLite tick replay, alternate-path probe and rollback.')
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action LIKE 'ISSUE-DRAIN-RATIO-REPAIR-1:%'
);

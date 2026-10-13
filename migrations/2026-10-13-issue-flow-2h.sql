-- ISSUE-FLOW-2H-1 (2026-10-13, pillar autonomy). Owner directive, verbatim: "The system shall automatically resolve, deploy, and close an open
-- issue server-side within 2 hours of opening, at a minimum rate of 1.5x open issue accumulation." It extends REMEDIATION-2X-1 (issue_drain_ratio_24h,
-- target > 1) and tightens issue_mttr_h_30d (guard band 48 h).
-- This file makes the directive measured and enforced by the existing metric loop (METRIC-CLOSED-LOOP-1): metric -> trigger -> one deduped issue with
-- levers -> remedy efficacy. It does not claim the system meets it; the baseline it records is the measurement on 2026-10-13 22:20Z:
--   issues open longer than 2 h: 110 of 120; issues opened in the last 7 days (329) closed with a disposition within 2 h of opening: 24.7%;
--   issue_drain_ratio_24h 1.154 (target now 1.5); issue_mttr_h_30d 12.8 h median (target now 2 h); code loop in 24 h: 5 merged, 18 closed, 17 failed.
-- (1) issues_open_over_2h (count, target 0): refreshed on every fleet tick; exemption from its own trigger: issues_open_over_24h and the share metric below
--     already file the lever for the same population (METRIC-CLOSED-LOOP-1 allows a named exemption).
-- (2) issue_closed_within_2h_share_7d (target >= 0.95): issues opened 2 h to 7 days ago whose first disposition came within 2 h of opening / issues opened
--     in that window (issue_lifecycle, append-only); trigger lt 0.95 with the levers in order.
-- (3) issue_drain_ratio_24h target 1.5 (was 1) and its trigger threshold 1.5; issue_mttr_h_30d target 2 (was 48) and its trigger threshold 2.
-- Refresh: trigger issue_flow_2h_tick on every fleet tick; two scalar subqueries per metric, no compound SELECT (D1-COMPOUND-LIMIT-1); it writes only
-- metric_registry. spof-review: a measurement only; the autoclose triggers and the consumer are untouched and the metric loop that files the issue keeps its
-- second path (metric_staleness_breach_rec records a stale refresh).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS issue_flow_2h_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'issue_closed_within_2h_share_7d'; DELETE FROM metric_registry WHERE metric IN ('issues_open_over_2h', 'issue_closed_within_2h_share_7d'); UPDATE metric_registry SET target = '> 1 (owner directive 2026-10-13: issues resolved faster than they accumulate)', warning_band = '< 1.2', kill_band = '< 1' WHERE metric = 'issue_drain_ratio_24h'; UPDATE analytics_metric_triggers SET threshold = 1 WHERE metric_key = 'issue_drain_ratio_24h'; UPDATE analytics_metric_triggers SET threshold = 48 WHERE metric_key = 'issue_mttr_h_30d'; UPDATE metric_registry SET target = '<= 48 (median hours from filing to closing; a guard band, no stated target: autotriage gives every issue a 7-day SLA)' WHERE metric = 'issue_mttr_h_30d'
-- BACKUP: bak_20261013_issue_flow_metrics

CREATE TABLE IF NOT EXISTS bak_20261013_issue_flow_metrics AS SELECT metric, target, warning_band, kill_band FROM metric_registry WHERE metric IN ('issue_drain_ratio_24h', 'issue_mttr_h_30d');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('issues_open_over_2h', 'operational', 'target',
  'COUNT of agent_issues with status open whose created_at is more than 2 hours old (owner directive 2026-10-13: resolved server-side within 2 hours of opening)',
  'qnfo-audit.agent_issues (migrations/2026-10-13-issue-flow-2h.sql)',
  '110 of 120 open on 2026-10-13 22:20Z',
  '0 (owner directive 2026-10-13)', 'qnfo-fleet-control', 'exempt from its own trigger: issues_open_over_24h and issue_closed_within_2h_share_7d file the lever', 'hourly', '> 10', '> 30', NULL, NULL, 'MEASURED', 'computed'),
 ('issue_closed_within_2h_share_7d', 'operational', 'target',
  'issues opened 2 h to 7 days ago whose first dispositioned event is within 2 h of their opened event / issues opened in that window (issue_lifecycle; denominator at least 1)',
  'qnfo-audit.issue_lifecycle (migrations/2026-10-13-issue-flow-2h.sql)',
  '0.247 on 2026-10-13 22:20Z (81 of 329 in 7 days)',
  '>= 0.95 (owner directive 2026-10-13: resolved, deployed and closed within 2 hours of opening)', 'qnfo-fleet-control', 'trigger lt 0.95', 'hourly', '< 0.8', '< 0.5', NULL, NULL, 'MEASURED', 'computed');

UPDATE metric_registry SET target = '>= 1.5 (owner directive 2026-10-13: a minimum of 1.5x open issue accumulation; was > 1)', warning_band = '< 1.8', kill_band = '< 1.5', disposition_actor = 'trigger lt 1.5' WHERE metric = 'issue_drain_ratio_24h';
UPDATE metric_registry SET target = '<= 2 (owner directive 2026-10-13: median hours from filing to closing; was a 48 h guard band)' WHERE metric = 'issue_mttr_h_30d';
UPDATE analytics_metric_triggers SET threshold = 1.5, notes = COALESCE(notes, '') || ' | ISSUE-FLOW-2H-1: threshold 1 -> 1.5 (migrations/2026-10-13-issue-flow-2h.sql)' WHERE metric_key = 'issue_drain_ratio_24h';
UPDATE analytics_metric_triggers SET threshold = 2, notes = COALESCE(notes, '') || ' | ISSUE-FLOW-2H-1: threshold 48 -> 2 (migrations/2026-10-13-issue-flow-2h.sql)' WHERE metric_key = 'issue_mttr_h_30d';

CREATE TRIGGER IF NOT EXISTS issue_flow_2h_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((SELECT COUNT(*) FROM agent_issues WHERE status = 'open' AND created_at <= (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000) AS TEXT)
  WHERE metric = 'issues_open_over_2h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((SELECT ROUND(1.0 * (SELECT COUNT(*) FROM issue_lifecycle o WHERE o.event = 'opened' AND o.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND o.ts <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours') AND EXISTS (SELECT 1 FROM issue_lifecycle d WHERE d.issue_id = o.issue_id AND d.event = 'dispositioned' AND julianday(d.ts) >= julianday(o.ts) AND julianday(d.ts) - julianday(o.ts) <= 2.0 / 24)) / MAX(1, (SELECT COUNT(*) FROM issue_lifecycle o2 WHERE o2.event = 'opened' AND o2.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND o2.ts <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours'))), 3)) AS TEXT)
  WHERE metric = 'issue_closed_within_2h_share_7d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'issue_closed_within_2h_share_7d', 'Issue flow: issues are not resolved, deployed and closed within 2 hours of opening', 'registry', 'lt', 0.95, 3,
  'Pillar autonomy (owner directive 2026-10-13: the system resolves, deploys and closes an open issue server-side within 2 hours of opening, at a minimum 1.5x the rate issues accumulate). Read the misses: SELECT a.id, a.priority, a.source, substr(a.title,1,80), (strftime(''%s'',''now'')*1000 - a.created_at)/3600000 AS age_h FROM agent_issues a WHERE a.status = ''open'' AND a.created_at <= (strftime(''%s'',''now'') - 7200) * 1000 ORDER BY a.created_at LIMIT 30, then group the open ones by source and by whether a doer exists (an active remediation_contracts row, a code-task: line, a work claim). Levers in order: (1) no machine probe: give the issue a remediation_contracts d1-query or code-read probe now, so the consumer closes it the hour its condition holds; (2) a probe that passes but never closes: read issue_triage.reopened_count and the autoclose hysteresis (AUTOCLOSE-HYSTERESIS-1) before changing the probe; (3) a code defect in one file: add code-task: repo=qnfo-workers path=<file> and code-anchor: lines so the code loop opens the PR; (4) an inflow source that opens more than it closes (the per-source query in issue_drain_ratio_24h): dedupe it or put a rate on it instead of a hold (ANTIFRAGILE-1); (5) a time-gated or owner-only item: name the gate and its closing probe on the issue so it stops counting as unowned. Definition of done: the share is at or above 0.95 on the 7-day window and issues_open_over_2h is below 10.',
  'qnfo-fleet-control', 'agent_issues', 12, 1, 'ISSUE-FLOW-2H-1 (migrations/2026-10-13-issue-flow-2h.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'issue_closed_within_2h_share_7d');

INSERT INTO fleet_tick (source) VALUES ('migration:issue-flow-2h');

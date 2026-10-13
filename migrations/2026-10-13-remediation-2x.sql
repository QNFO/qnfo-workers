-- REMEDIATION-2X-1 (2026-10-13, pillar autonomy). Owner directive, verbatim: "All issue remediation and consumer runs shall be
-- quickened/increased a minimum of 100% (2x). All issues shall be remediated/resolved/drained/deployed faster than they
-- accumulate."
-- The cadence half is code in the same pull request: qnfo-fleet-control 0.26.2 (remediation tick, PR opening, the stale-PR lane
-- and the deploy-drift runner every 10 minutes, were 20; code-loop merges twice an hour; re-probe offsets halved),
-- scripts/remediation_consumer.py (re-probe offsets halved, 8 probes at a time, was 4) and qnfo-cloud-ops 1.27.1 (the consumer
-- is dispatched after 30 idle minutes, was 60). No workflow file changes: the consumer's runs come from pushes and that
-- dispatch (the schedule event does not fire on this repository), and a run already drains every due batch (PROBE-DRAIN-1).
-- This file measures the second sentence. issue_drain_ratio_24h = issues closed with a disposition in 24 h / issues opened or
-- reopened in 24 h, from the append-only issue_lifecycle (doctrine section 6). Above 1 the backlog shrinks; below 1 issues
-- accumulate faster than they are resolved, and the trigger files one issue with the levers. Measured with this query on
-- 2026-10-13 at 19:40Z: 1.135 (118 closed, 47 opened, 57 reopened; 121 open). Reopens were 55% of the inflow, so the first
-- lever is the relapse, not the intake.
-- Refresh: trigger issue_drain_ratio_tick on every fleet tick (about every 10 minutes) and at apply; refresh_cadence is
-- hourly so one missed tick records no staleness breach. Two scalar subqueries, no compound
-- SELECT (D1-COMPOUND-LIMIT-1); the trigger writes only metric_registry.
-- spof-review: the 10-minute fleet-control cron replaces its 20-minute cron on the same producer, so no path is added or lost;
-- the remediation probes keep their second runner (scripts/remediation_consumer.py on the GitHub runner, dispatched by
-- qnfo-cloud-ops PROBE-CADENCE-1 after 30 idle minutes). issue_drain_ratio_tick is a measurement fed by both fleet_tick producers
-- (cron:qnfo-code-orchestrator and cron:qnfo-fleet-dashboard); metric_staleness_breach_rec records a stale refresh.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS issue_drain_ratio_tick; DELETE FROM analytics_metric_triggers WHERE notes LIKE 'REMEDIATION-2X-1%'; DELETE FROM metric_registry WHERE metric = 'issue_drain_ratio_24h'

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('issue_drain_ratio_24h', 'operational', 'target',
  'agent_issues closed with a disposition in the last 24 h / agent_issues opened or reopened in the last 24 h (issue_lifecycle events dispositioned / opened + reopened; denominator at least 1)',
  'qnfo-audit.issue_lifecycle (REMEDIATION-2X-1, migrations/2026-10-13-remediation-2x.sql)',
  '1.135 on 2026-10-13 19:40Z (118 closed, 47 opened, 57 reopened in 24 h; 121 open)',
  '> 1 (owner directive 2026-10-13: issues resolved faster than they accumulate)',
  'qnfo-fleet-control', 'trigger lt 1', 'hourly', '< 1.2', '< 1', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS issue_drain_ratio_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(event = 'dispositioned') / MAX(1, SUM(event IN ('opened', 'reopened'))), 3)
      FROM issue_lifecycle WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')) AS TEXT)
  WHERE metric = 'issue_drain_ratio_24h';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'issue_drain_ratio_24h', 'Issue backlog: issues accumulate faster than they are resolved', 'registry', 'lt', 1, 2,
  'Pillar autonomy (owner directive 2026-10-13: every issue remediated, resolved, drained and deployed faster than it accumulates). Read SELECT event, COUNT(*) FROM issue_lifecycle WHERE ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') GROUP BY event, then the inflow by source: SELECT a.source, l.event, COUNT(*) FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') AND l.event IN (''opened'', ''reopened'') GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10. Levers in order: (1) reopens: a contract that passes and then fails again is a fix that did not hold; read remediation_verifications for the top reopened issues and fix the root cause (or the probe, if it is flaky) instead of letting it cycle; (2) one producer filing many issues: dedupe or fix the producer (failure_modes row and fm- detector); (3) drain: the code loop takes more code-task issues per tick (qnfo-code-orchestrator intake and maxSteps, REMEDIATION-2X-1 doubled them), issues at the head of v_issue_queue_v2 without a code-task line get one, and remediation re-probe offsets shrink further. Done: issue_drain_ratio_24h >= 1 at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 12, 1, 'REMEDIATION-2X-1 (migrations/2026-10-13-remediation-2x.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'issue_drain_ratio_24h');

INSERT INTO fleet_tick (source) VALUES ('migration:remediation-2x');

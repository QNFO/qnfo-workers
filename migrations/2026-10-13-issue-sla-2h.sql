-- ISSUE-SLA-2H-1 (2026-10-13, pillar autonomy). Owner directive, verbatim: "Target open issues for definition-of-done success
-- criteria: 0 with all fleet systems green/passing. Remediate all failures and deploy fixes immediately. The system shall resolve,
-- deploy, and close all open issues within 24 hours, at a minimum rate of 1.5x open issue accumulation. The system shall
-- automatically resolve, deploy, and close an open issue server-side within 2 hours of opening, at a minimum rate of 1.5x open
-- issue accumulation."
-- This file makes each clause a measured target with a trigger, so the metric loop (METRIC-CLOSED-LOOP-1) files the gap instead of a
-- session noticing it:
--   open_agent_issues            target 0 (was <= 10), trigger gt 0 (was gt 20).
--   issues_open_over_24h         target 0 and trigger gt 0 already; target text names the directive.
--   issue_drain_ratio_24h        target >= 1.5 (was > 1), trigger lt 1.5 (was lt 1).
--   issue_auto_close_2h_share_24h  NEW: of the opened and reopened events 2 to 26 hours old, the share whose issue reached a
--                                disposition within 2 hours of that event and was not closed by a session (close_channel not
--                                session*, claude*, issue-triage*). Target 1.0, trigger lt 1.0.
-- Measured with these queries on 2026-10-13 at 22:04Z: 120 open, 90 older than 24 h, drain 1.154; issue_auto_close_2h_share_24h
-- 0.443 (47 of 106 open and reopen events of the window closed server-side within 2 h; per issue, 19 of 70).
-- Refresh: trigger issue_auto_close_2h_tick on every fleet tick (no CTE: SQLite refuses WITH inside a trigger body). Reads only
-- issue_lifecycle and agent_issues and writes only metric_registry.
-- spof-review: a measurement on the two fleet_tick producers (cron:qnfo-code-orchestrator, cron:qnfo-fleet-dashboard); metric_staleness_breach_rec records a stale refresh.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS issue_auto_close_2h_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'issue_auto_close_2h_share_24h'; DELETE FROM metric_registry WHERE metric = 'issue_auto_close_2h_share_24h'; UPDATE analytics_metric_triggers SET threshold = 1 WHERE metric_key = 'issue_drain_ratio_24h'; UPDATE analytics_metric_triggers SET threshold = 20 WHERE metric_key = 'open_agent_issues'; UPDATE metric_registry SET target = '<=10' WHERE metric = 'open_agent_issues'

UPDATE metric_registry
SET target = '>= 1.5 (owner directive 2026-10-13: open issues resolved, deployed and closed at a minimum of 1.5x their accumulation)',
    warning_band = '< 1.8', kill_band = '< 1.5'
WHERE metric = 'issue_drain_ratio_24h';
UPDATE analytics_metric_triggers SET threshold = 1.5,
  title = 'Issue backlog: issues are not resolved at 1.5x their accumulation'
WHERE metric_key = 'issue_drain_ratio_24h';

UPDATE metric_registry SET target = '0 (owner directive 2026-10-13: open issues for definition-of-done success criteria 0, all fleet systems green)'
WHERE metric = 'open_agent_issues';
UPDATE analytics_metric_triggers SET threshold = 0 WHERE metric_key = 'open_agent_issues';

UPDATE metric_registry SET target = '0 (owner directive 2026-10-13: every open issue resolved, deployed and closed within 24 hours)'
WHERE metric = 'issues_open_over_24h';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('issue_auto_close_2h_share_24h', 'operational', 'target',
  'issue_lifecycle opened or reopened events between 26 and 2 hours old whose issue has a dispositioned event within 2 hours of that event and whose agent_issues.close_channel is not session*, claude* or issue-triage* / those events (denominator at least 1)',
  'qnfo-audit.issue_lifecycle, agent_issues (ISSUE-SLA-2H-1, migrations/2026-10-13-issue-sla-2h.sql)',
  '0.443 on 2026-10-13 22:04Z (47 of 106 open and reopen events closed server-side within 2 h)',
  '1.0 (owner directive 2026-10-13: every open issue resolved, deployed and closed server-side within 2 hours of opening)',
  'qnfo-fleet-control', 'trigger lt 1', 'hourly', '< 0.9', '< 0.5', NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS issue_auto_close_2h_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(CASE WHEN EXISTS (
                 SELECT 1 FROM issue_lifecycle d JOIN agent_issues a ON a.id = d.issue_id
                 WHERE d.issue_id = o.issue_id AND d.event = 'dispositioned' AND d.ts >= o.ts
                   AND d.ts <= strftime('%Y-%m-%dT%H:%M:%SZ', o.ts, '+2 hours')
                   AND COALESCE(a.close_channel, '') NOT LIKE 'session%' AND COALESCE(a.close_channel, '') NOT LIKE 'claude%'
                   AND COALESCE(a.close_channel, '') NOT LIKE 'issue-triage%') THEN 1 ELSE 0 END) / MAX(1, COUNT(*)), 3)
      FROM issue_lifecycle o
      WHERE o.event IN ('opened', 'reopened')
        AND o.ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-26 hours') AND o.ts <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours')) AS TEXT)
  WHERE metric = 'issue_auto_close_2h_share_24h';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'issue_auto_close_2h_share_24h', 'Issue SLA: open issues are not closed server-side within 2 hours', 'registry', 'lt', 1, 2,
  'Pillar autonomy (owner directive 2026-10-13: every open issue resolved, deployed and closed server-side within 2 hours of opening, at 1.5x accumulation). Read the misses: SELECT o.issue_id, a.source, substr(a.title, 1, 80), o.event, o.ts FROM issue_lifecycle o JOIN agent_issues a ON a.id = o.issue_id WHERE o.event IN (''opened'', ''reopened'') AND o.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-26 hours'') AND o.ts <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2 hours'') AND NOT EXISTS (SELECT 1 FROM issue_lifecycle d WHERE d.issue_id = o.issue_id AND d.event = ''dispositioned'' AND d.ts >= o.ts AND d.ts <= strftime(''%Y-%m-%dT%H:%M:%SZ'', o.ts, ''+2 hours'')). Group the misses by source and take the largest group: (1) a loop that files a finding it cannot fix gets a doer (a code-task line the code loop takes, or the loop fixes it itself); (2) an issue whose fix shipped but whose probe measures nothing gets a probe on its definition of done; (3) a fix that needs code waits in the code loop: raise its intake and steps, or split the file the queue serialises on; (4) a filing that is not a defect (a roadmap item, a report) belongs in goals or objective_space, superseded with the successor id (never closed as wontfix to lower the count, INTEGRITY-GUARDS-1). Done: issue_auto_close_2h_share_24h = 1 and issue_drain_ratio_24h >= 1.5 at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 12, 1, 'ISSUE-SLA-2H-1 (migrations/2026-10-13-issue-sla-2h.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'issue_auto_close_2h_share_24h');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01DsmWp2NBtaAp37WP6rUpEP', 'an owner target the fleet does not measure is a target nobody acts on; each clause becomes a metric with a trigger',
  'ISSUE-SLA-2H-1: open_agent_issues target 0 (trigger gt 0), issue_drain_ratio_24h trigger lt 1.5, issues_open_over_24h target text, new issue_auto_close_2h_share_24h with trigger lt 1',
  'measured 2026-10-13 22:04Z: 120 open, 90 older than 24 h, drain 1.154, issue_auto_close_2h_share_24h 0.443 (47 of 106 open events)',
  'migration merged', 'metric_registry rows and analytics_metric_triggers thresholds; one new fleet_tick trigger that writes only metric_registry', 'the Rollback header',
  'the 2 h and 1.5x clauses of the directive are measured every tick and file their own gap', 'issue_auto_close_2h_share_24h holds a value within one tick of apply', 'none',
  'issue_lifecycle, agent_issues, metric_registry, analytics_metric_triggers'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'ISSUE-SLA-2H-1:') = 1);

INSERT INTO fleet_tick (source) VALUES ('migration:issue-sla-2h');

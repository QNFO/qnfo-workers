-- DOCTRINE-REV3-METRICS-1 (2026-10-09, pillar autonomy). Doctrine revision 3 (docs/AUTONOMOUS-OPERATION-DOCTRINE.md) adds two
-- scorecard lines to section 15 that no table measured:
--   blocker_survival_rate_7d   = blockers wrongly reported to the owner as a decision / all blocker outcomes, last 7 days.
--                                Numerator: human_actions of 7 days that v_human_action_gate reads 'fleet' (a fleet decision)
--                                and that were not rerouted. Identity-bound 'owner' cards are justified stops (doctrine section
--                                4) and count only in the denominator: every card of 7 days plus blocker_redteam rows of 7
--                                days. Target 0. Measured at authoring: 20 / (45 + 3) = 0.417, all fleet cards written
--                                before the autonomy-first gate (2026-10-08), so it decays as they leave the window.
--   blocker_surface_coverage_7d = share of blocker_redteam rows of 7 days whose evidence names the surfaces it tested with a
--                                "surfaces:" line (section 3/14: a blocker report lists every surface tested). Target 1.
--   Both read n/a-safe values (0 and 1) when there is nothing to judge. Refreshed hourly by the D1 trigger doctrine_rev3_tick
--   on the first fleet_tick row of each hour (same pattern as doctrine_rev4_tick), so no new cron or session is needed.
--   Fix 2026-10-09 (agent_issues #2210): the first version hung two triggers off every open_agent_issues write to
--   metric_registry; that write already runs inside cloud_ops_events trigger chains, so the runner's depth canary failed
--   ("triggers nested too deep") and dropped them, and both metrics froze at their apply-time reading. fleet_tick sits at the
--   top of its own chain.
--   Re-applying this file is a no-op (IF NOT EXISTS / INSERT OR IGNORE / WHERE NOT EXISTS).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS doctrine_rev3_tick; DROP TRIGGER IF EXISTS metric_doctrine_rev3_au; DROP TRIGGER IF EXISTS metric_doctrine_rev3_ai; DROP VIEW IF EXISTS v_doctrine_rev3_blockers; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('blocker_survival_rate_7d', 'blocker_surface_coverage_7d'); DELETE FROM metric_registry WHERE metric IN ('blocker_survival_rate_7d', 'blocker_surface_coverage_7d');

CREATE VIEW IF NOT EXISTS v_doctrine_rev3_blockers AS
SELECT
  (SELECT COUNT(*) FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id WHERE datetime(h.created_at) >= datetime('now', '-7 days') AND h.status <> 'rerouted' AND g.gate = 'fleet') AS owner_decisions_7d,
  (SELECT COUNT(*) FROM human_actions WHERE datetime(created_at) >= datetime('now', '-7 days')) AS cards_7d,
  (SELECT COUNT(*) FROM blocker_redteam WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS redteamed_7d,
  (SELECT COUNT(*) FROM blocker_redteam WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND lower(evidence) LIKE '%surfaces:%') AS redteamed_with_surfaces_7d;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('blocker_survival_rate_7d', 'operational', 'target',
  'v_doctrine_rev3_blockers: owner_decisions_7d (cards the gate reads fleet, not rerouted) / (cards_7d + redteamed_7d); 0 when both are 0. Doctrine rev 3 section 15 "blocker-survival rate".',
  'qnfo-audit.v_doctrine_rev3_blockers (DOCTRINE-REV3-METRICS-1, migrations/2026-10-09-doctrine-rev3-metrics.sql), refreshed hourly by D1 trigger doctrine_rev3_tick on fleet_tick',
  'first reading at apply', '0', 'qnfo-fleet-control',
  'trigger gt 0.25 -> one METRIC-TRIGGER issue: red-team the newest owner cards (blocker_redteam row with a surfaces: line) or reroute them', 'hourly', '> 0.10', '> 0.25',
  CAST((SELECT CASE WHEN cards_7d + redteamed_7d = 0 THEN 0 ELSE ROUND(1.0 * owner_decisions_7d / (cards_7d + redteamed_7d), 3) END FROM v_doctrine_rev3_blockers) AS TEXT),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed'),
 ('blocker_surface_coverage_7d', 'operational', 'guard',
  'v_doctrine_rev3_blockers: redteamed_with_surfaces_7d / redteamed_7d; 1 when no blocker was red-teamed. Doctrine rev 3 section 15 "surface-coverage" (proxy: the report names its surfaces).',
  'qnfo-audit.v_doctrine_rev3_blockers (DOCTRINE-REV3-METRICS-1, migrations/2026-10-09-doctrine-rev3-metrics.sql), refreshed hourly by D1 trigger doctrine_rev3_tick on fleet_tick',
  'first reading at apply', '1', 'qnfo-fleet-control',
  'trigger lt 0.8 -> one METRIC-TRIGGER issue: writers of blocker_redteam add a surfaces: line to evidence', 'hourly', '< 0.95', '< 0.8',
  CAST((SELECT CASE WHEN redteamed_7d = 0 THEN 1 ELSE ROUND(1.0 * redteamed_with_surfaces_7d / redteamed_7d, 3) END FROM v_doctrine_rev3_blockers) AS TEXT),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'blocker_survival_rate_7d', 'Doctrine breach: blockers are going to the owner instead of being red-teamed', 'registry', 'gt', 0.25, 4,
  'Pillar autonomy (doctrine rev 3 sections 3 and 15). Read SELECT id, title, why FROM human_actions WHERE status = ''open'' ORDER BY id DESC. For each card write a blocker_redteam row (target card:<id>, attempt, verdict, evidence with a "surfaces:" line naming every path tried). A card that is not irreversible and identity-bound is rerouted by v_human_action_gate; a refusal by a permission check or safety classifier stays with the owner under doctrine reading (b). Done = metric <= 0.25 for 7 days.',
  'qnfo-fleet-control', 'agent_issues', 72, 1, 'DOCTRINE-REV3-METRICS-1 (migrations/2026-10-09-doctrine-rev3-metrics.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'blocker_survival_rate_7d');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'blocker_surface_coverage_7d', 'Doctrine breach: blocker reports do not name the surfaces they tested', 'registry', 'lt', 0.8, 5,
  'Pillar autonomy (doctrine rev 3 sections 3 and 14). Find the writers of blocker_redteam rows of the last 7 days whose evidence has no "surfaces:" line (SELECT actor, COUNT(*) FROM blocker_redteam WHERE lower(evidence) NOT LIKE ''%surfaces:%'' GROUP BY actor) and make each append "surfaces: <list>" to the evidence it writes. Done = metric >= 0.8 for 7 days.',
  'qnfo-fleet-control', 'agent_issues', 72, 1, 'DOCTRINE-REV3-METRICS-1 (migrations/2026-10-09-doctrine-rev3-metrics.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'blocker_surface_coverage_7d');

CREATE TRIGGER IF NOT EXISTS doctrine_rev3_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT CASE WHEN cards_7d + redteamed_7d = 0 THEN 0 ELSE ROUND(1.0 * owner_decisions_7d / (cards_7d + redteamed_7d), 3) END FROM v_doctrine_rev3_blockers) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'blocker_survival_rate_7d';
  UPDATE metric_registry SET last_value = CAST((SELECT CASE WHEN redteamed_7d = 0 THEN 1 ELSE ROUND(1.0 * redteamed_with_surfaces_7d / redteamed_7d, 3) END FROM v_doctrine_rev3_blockers) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'blocker_surface_coverage_7d';
END;

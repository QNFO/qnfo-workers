-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE notes = 'CLOCKWORK-1 2026-11-12'; DELETE FROM metric_breach_cause WHERE metric_key IN ('clock_loops_not_ok', 'clock_missed_ticks_24h', 'clock_max_latency_min', 'clock_accuracy_rate'); DELETE FROM metric_registry WHERE metric IN ('clock_loops_not_ok', 'clock_missed_ticks_24h', 'clock_max_latency_min', 'clock_accuracy_rate'); DROP TABLE IF EXISTS clock_settlements; DROP TABLE IF EXISTS clock_ticks;
-- spof-review: two tables written by qnfo-cloud-ops jobClockwork every 10 minutes (it also creates them, so a late migration delays nothing),
-- four metrics it refreshes, and their triggers. Measurement and repair only: a stopped watchdog stops no loop, and its own heartbeat row
-- (fleet_heartbeat worker 'clockwork') is read by the fleet's existing heartbeat checks. No new cron, binding, host or credential.
-- CAUSE-MAPPED: the four clock metrics map to the existing cause key `structure` in this same file.
--
-- CLOCKWORK-1 (Rowan, 2026-11-12, pillar personal): "This all needs to keep ticking like clockwork ... A stopped clock or an inaccurate
-- clock is not a working clock." clock_ticks holds the latest verdict of every personal-plane loop (jobs sweep, shortlist, auto-apply,
-- confirmed skills, surface audit, profile sync, touchpoints, companion, brief, markets, signals, research); clock_settlements settles
-- every expected tick by name ("<loop>@<slot start>": ran, ran-inaccurate, late, missed).

CREATE TABLE IF NOT EXISTS clock_ticks (loop TEXT PRIMARY KEY, label TEXT, plane TEXT, cadence_min INTEGER, state TEXT, why TEXT, last_run TEXT, last_good TEXT, age_run_min INTEGER, latency_min INTEGER, missed_24h INTEGER, accuracy REAL, action TEXT, action_status TEXT, bad_ticks INTEGER, issue_id INTEGER, checked_at TEXT);
CREATE TABLE IF NOT EXISTS clock_settlements (slot TEXT PRIMARY KEY, loop TEXT NOT NULL, slot_start TEXT NOT NULL, outcome TEXT NOT NULL, settled_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_clock_settlements_start ON clock_settlements (slot_start);

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('clock_loops_not_ok', 'system', 'target', 'COUNT of clock_ticks rows in state stopped, inaccurate or unreadable (CLOCKWORK-1)', 'qnfo-audit.clock_ticks, written by qnfo-cloud-ops jobClockwork', 'job-apply and confirmed-skills on 2026-11-12', '= 0', 'qnfo-cloud-ops', 'analytics_metric_triggers clock_loops_not_ok', '10m', '> 0', '> 3', 'UNMEASURED', 'worker'),
 ('clock_missed_ticks_24h', 'system', 'target', 'SUM over loops of expected minus observed runs in 24 h (CLOCKWORK-1)', 'qnfo-audit.clock_ticks.missed_24h', 'job-apply 12, confirmed-skills about 20 on 2026-11-12', '= 0', 'qnfo-cloud-ops', 'analytics_metric_triggers clock_missed_ticks_24h', '10m', '> 0', '> 24', 'UNMEASURED', 'worker'),
 ('clock_max_latency_min', 'system', 'target', 'MAX over loops of minutes past the due time of the next tick (CLOCKWORK-1)', 'qnfo-audit.clock_ticks.latency_min', 'unmeasured', '<= 30', 'qnfo-cloud-ops', 'analytics_metric_triggers clock_max_latency_min', '10m', '> 30', '> 120', 'UNMEASURED', 'worker'),
 ('clock_accuracy_rate', 'system', 'guard', 'Mean share of runs in 24 h that produced correct output, over loops that count runs (CLOCKWORK-1)', 'qnfo-audit.clock_ticks.accuracy', 'jobs sweep 0.79 on 2026-11-12 (exceededResources)', '>= 0.95', 'qnfo-cloud-ops', 'analytics_metric_triggers clock_accuracy_rate', '10m', '< 0.95', '< 0.8', 'UNMEASURED', 'worker');

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('clock_loops_not_ok', 'structure', 'CLOCKWORK-1: a personal-plane loop stopped or produces no correct output'),
 ('clock_missed_ticks_24h', 'structure', 'CLOCKWORK-1: expected ticks that did not run'),
 ('clock_max_latency_min', 'structure', 'CLOCKWORK-1: a tick later than its cadence'),
 ('clock_accuracy_rate', 'structure', 'CLOCKWORK-1: runs that ran but produced wrong or no output');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'clock_loops_not_ok', 'CLOCKWORK-1: a personal-plane clock has stopped or is wrong', 'registry', 'gt', 0, 2,
  'Pillar personal. Read SELECT loop, state, why, action, action_status, issue_id FROM clock_ticks WHERE state IN (''stopped'',''inaccurate'',''unreadable''). Each loop already carries a CLOCKWORK-<loop> issue after three bad ticks with its closing probe on clock_ticks; fix the failing step of that loop (its run log, its worker), not the watchdog. A dispatch answered 401, 403 or 404 means the cloud-ops GH_TOKEN cannot reach that repository: give the loop a second trigger the fleet owns instead. Definition of done: clock_loops_not_ok = 0 at a refresh.',
  'qnfo-cloud-ops', 'agent_issues', 2, 1, 'CLOCKWORK-1 2026-11-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'clock_loops_not_ok' AND enabled = 1);
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'clock_missed_ticks_24h', 'CLOCKWORK-1: expected ticks were missed in 24 h', 'registry', 'gt', 0, 3,
  'Pillar personal. Read SELECT loop, outcome, COUNT(*) FROM clock_settlements WHERE slot_start > datetime(''now'',''-1 day'') GROUP BY 1,2. For each loop with missed slots give it a trigger that fires: a GitHub schedule gets the CLOCKWORK-1 re-dispatch (repair dispatch), a worker cron that is killed (exceededResources) gets its [limits] or a smaller batch. Definition of done: clock_missed_ticks_24h = 0.',
  'qnfo-cloud-ops', 'agent_issues', 6, 1, 'CLOCKWORK-1 2026-11-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'clock_missed_ticks_24h' AND enabled = 1);
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'clock_max_latency_min', 'CLOCKWORK-1: a personal-plane tick is more than 30 min late', 'registry', 'gt', 30, 3,
  'Pillar personal. Read SELECT loop, latency_min, why FROM clock_ticks ORDER BY latency_min DESC. Make the late loop fire on time (second trigger, shorter run). Definition of done: clock_max_latency_min <= 30.',
  'qnfo-cloud-ops', 'agent_issues', 6, 1, 'CLOCKWORK-1 2026-11-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'clock_max_latency_min' AND enabled = 1);
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'clock_accuracy_rate', 'CLOCKWORK-1: personal-plane runs produce wrong or no output', 'registry', 'lt', 0.95, 2,
  'Pillar personal. Read SELECT loop, accuracy, why FROM clock_ticks WHERE accuracy < 0.95. Fix the step that makes a run end without correct output (a killed run, a failing step, an empty result). Definition of done: clock_accuracy_rate >= 0.95.',
  'qnfo-cloud-ops', 'agent_issues', 6, 1, 'CLOCKWORK-1 2026-11-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'clock_accuracy_rate' AND enabled = 1);

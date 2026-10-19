-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT b.definition FROM bak_20261019_wc_task b WHERE b.id = 'metric-refresh'), version = (SELECT b.version FROM bak_20261019_wc_task b WHERE b.id = 'metric-refresh') WHERE id = 'metric-refresh' AND EXISTS (SELECT 1 FROM bak_20261019_wc_task WHERE id = 'metric-refresh'); UPDATE fleet_tasks_canonical SET definition = (SELECT b.definition FROM bak_20261019_wc_canon b WHERE b.id = 'metric-refresh') WHERE id = 'metric-refresh' AND EXISTS (SELECT 1 FROM bak_20261019_wc_canon WHERE id = 'metric-refresh'); DELETE FROM remediation_contracts WHERE class = 'fm-canonical-worker-count-all-state'; DELETE FROM failure_modes WHERE fm_key = 'canonical-worker-count-all-state';
-- spof-review: none added. The census is read from service_registry by the canonical hourly task and by qnfo-fleet-control oneWorkerCount; after this both count kind = 'worker' AND state = 'live', so the two writers agree instead of flipping the figure.
--
-- CANONICAL-WORKER-COUNT-LIVE-1 (2026-10-19, charter pillar: core; agent_issues 100176, child of owner task 100148, the dashboard figures audit).
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19, read only): metric_registry probe_coverage_pct read 94.1 (32 probed / 34 rows) and worker_count flipped 32 -> 34 -> 32.
-- The 34 rows of service_registry are 32 kind = 'worker' state = 'live' plus two retired members (calendar-api, qnfo-backlog-exec) that nothing probes. The canonical hourly task
-- (fleet_tasks metric-refresh, step 1) counted every row in both figures, the all-state COUNT(*) that ONE-WORKER-COUNT-1 removed from oneWorkerCount on 2026-10-06, so the two
-- writers of worker_count disagreed and the coverage denominator held retired workers. Live-worker coverage is 32/32 = 100.
-- WHAT THIS CHANGES: step 1 of metric-refresh counts worker_count and the probe coverage numerator and denominator over kind = 'worker' AND state = 'live' (two replace() calls on
-- anchors that each occur exactly once in the live definition and in its canonical row, read 2026-10-19: one occurrence each, JSON valid). Guarded: json_valid, the marker absent, each
-- anchor present exactly once; if a row drifted and did not take the rewrite the SELECT json(...) below fails the file loudly (D1 reports "malformed JSON") and nothing after it runs.
-- fleet_tasks.version +1 (fleet-exec reads only the definition); fleet_tasks_canonical takes the same two rewrites by its own anchors, because the drift gate files
-- WORKFLOW-DEFINITION-DRIFT for any live definition that differs from its canonical row (those two rows already differed before this file in other text; this adds no new difference).
-- docs/fleet-tasks-canonical.json carries the same two rewrites in the same PR. Failure mode canonical-worker-count-all-state with detector fm-canonical-worker-count-all-state.
-- NOT DONE HERE: the rewrite of service_registry.updated_at for the retired qnfo-backlog-exec row every 30 minutes (a writer to find; it changes no figure).

CREATE TABLE IF NOT EXISTS bak_20261019_wc_task AS SELECT * FROM fleet_tasks WHERE id = 'metric-refresh';
CREATE TABLE IF NOT EXISTS bak_20261019_wc_canon AS SELECT * FROM fleet_tasks_canonical WHERE id = 'metric-refresh';

UPDATE fleet_tasks SET
  definition = replace(replace(definition, 'WHEN ''worker_count'' THEN CAST((SELECT COUNT(*) FROM service_registry) AS TEXT)',
    'WHEN ''worker_count'' THEN CAST((SELECT COUNT(*) FROM service_registry WHERE kind = ''worker'' AND state = ''live'') AS TEXT)'),
    'AND name IN (SELECT service FROM service_registry))/(SELECT COUNT(*) FROM service_registry),1)',
    'AND name IN (SELECT service FROM service_registry WHERE kind = ''worker'' AND state = ''live''))/(SELECT COUNT(*) FROM service_registry WHERE kind = ''worker'' AND state = ''live'' /* CANONICAL-WORKER-COUNT-LIVE-1 */),1)'),
  version = version + 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'metric-refresh'
  AND json_valid(definition)
  AND instr(definition, 'CANONICAL-WORKER-COUNT-LIVE-1') = 0
  AND length(definition) - length(replace(definition, 'WHEN ''worker_count'' THEN CAST((SELECT COUNT(*) FROM service_registry) AS TEXT)', '')) = length('WHEN ''worker_count'' THEN CAST((SELECT COUNT(*) FROM service_registry) AS TEXT)')
  AND length(definition) - length(replace(definition, 'AND name IN (SELECT service FROM service_registry))/(SELECT COUNT(*) FROM service_registry),1)', '')) = length('AND name IN (SELECT service FROM service_registry))/(SELECT COUNT(*) FROM service_registry),1)');

SELECT json('CANONICAL-WORKER-COUNT-LIVE-1: the metric-refresh definition was not rewritten because the live text drifted from the 2026-10-19 reading (anchor absent or not unique)')
WHERE COALESCE((SELECT instr(definition, 'CANONICAL-WORKER-COUNT-LIVE-1') FROM fleet_tasks WHERE id = 'metric-refresh'), 0) = 0;

UPDATE fleet_tasks_canonical SET
  definition = replace(replace(definition, 'WHEN ''worker_count'' THEN CAST((SELECT COUNT(*) FROM service_registry) AS TEXT)',
    'WHEN ''worker_count'' THEN CAST((SELECT COUNT(*) FROM service_registry WHERE kind = ''worker'' AND state = ''live'') AS TEXT)'),
    'AND name IN (SELECT service FROM service_registry))/(SELECT COUNT(*) FROM service_registry),1)',
    'AND name IN (SELECT service FROM service_registry WHERE kind = ''worker'' AND state = ''live''))/(SELECT COUNT(*) FROM service_registry WHERE kind = ''worker'' AND state = ''live'' /* CANONICAL-WORKER-COUNT-LIVE-1 */),1)'),
  repo_path = 'migrations/2026-10-19-canonical-worker-count-live.sql',
  exported_at = datetime('now')
WHERE id = 'metric-refresh'
  AND json_valid(definition)
  AND instr(definition, 'CANONICAL-WORKER-COUNT-LIVE-1') = 0
  AND length(definition) - length(replace(definition, 'WHEN ''worker_count'' THEN CAST((SELECT COUNT(*) FROM service_registry) AS TEXT)', '')) = length('WHEN ''worker_count'' THEN CAST((SELECT COUNT(*) FROM service_registry) AS TEXT)')
  AND length(definition) - length(replace(definition, 'AND name IN (SELECT service FROM service_registry))/(SELECT COUNT(*) FROM service_registry),1)', '')) = length('AND name IN (SELECT service FROM service_registry))/(SELECT COUNT(*) FROM service_registry),1)');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('canonical-worker-count-all-state',
   'worker_count and probe_coverage_pct count every service_registry row, retired members included, so the census flips between 32 and 34 and coverage reads 94.1 for a fleet probed at 100',
   'the canonical metric-refresh step 1 used COUNT(*) FROM service_registry (all states) while oneWorkerCount in qnfo-fleet-control counts kind worker and state live (ONE-WORKER-COUNT-1, 2026-10-06): two writers of one metric with two definitions; the retired members calendar-api and qnfo-backlog-exec sit in the table with 0 probes',
   'CANONICAL-WORKER-COUNT-LIVE-1: the canonical step counts kind = worker AND state = live in worker_count and in both terms of the probe coverage ratio',
   'fm-canonical-worker-count-all-state: the metric-refresh definition carries CANONICAL-WORKER-COUNT-LIVE-1',
   'fm-canonical-worker-count-all-state', '2026-10-19', 100176,
   'a census metric is written by two producers that define the population differently',
   'worker_count steps between two values within the hour; probe_coverage_pct sits below 100 while every live worker is probed',
   'the fleet census and probe-coverage figures on fleet.qnfo.org and the metric trigger on probe_coverage_pct');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to, module)
VALUES ('fm-canonical-worker-count-all-state', NULL,
  'SELECT ''1'' AS expected, CASE WHEN instr((SELECT definition FROM fleet_tasks WHERE id = ''metric-refresh''), ''CANONICAL-WORKER-COUNT-LIVE-1'') > 0 THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 1, 'active', 'CANONICAL-WORKER-COUNT-LIVE-1', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'drain-dash',
  'one census metric has one population: the live workers; a retired member is not a worker the fleet should probe, so it is in neither term of the coverage ratio',
  'CANONICAL-WORKER-COUNT-LIVE-1: metric-refresh step 1 counts worker_count and probe_coverage_pct over kind = worker AND state = live',
  'qnfo-audit read-only 2026-10-19: service_registry 34 rows = 32 live workers + 2 retired members; fleet_probe_log probed 32; each anchor occurs once in the live definition and its canonical row; node:sqlite replay in migrations/canonical-worker-count-live.test.mjs',
  'migration merged',
  'fleet_tasks metric-refresh (one step, two expressions), its canonical row, one failure mode and its detector',
  'the Rollback header, restoring from bak_20261019_wc_task and bak_20261019_wc_canon',
  'the census and probe coverage agree across both writers',
  'probe_coverage_pct >= 99.9 and worker_count = the live worker count on two consecutive hourly refreshes',
  'none',
  'd1:qnfo-audit service_registry, fleet_probe_log, fleet_tasks, fleet_tasks_canonical'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'CANONICAL-WORKER-COUNT-LIVE-1:%');

-- PATH-ENFORCEMENT-1 (2026-10-17, owner directive: "ALL STEPS, ALL PROCESSES SHALL HAVE SLA AND MULTIPLE
-- EXECUTION/REMEDIATION/WORKAROUND PATHS TO SUCCESSFUL DEFINITION OF DONE")
--
-- SLA-AND-PATHS-1 (migrations/2026-10-17-process-contracts.sql) made every process declare an SLA, a DoD and at least
-- two paths, and covered the scheduled workers. What it could not see, measured live on 2026-10-17:
--
--   * a path that has never been exercised is not a path. 58 controls declare an alternate_path and 21 of them
--     (36%) carry alternate_tested_at IS NULL: declared, never tried. v_process_contract_gaps reads process_contracts
--     only, so all 44 contracts report path_state='ok' regardless.
--   * 32 of the 44 contracts still carry the '[seeded from worker_schedules purpose' DoD, which describes intent and
--     cannot be decided by a query. SLA-AND-PATHS-1 recorded that as a worklist marker; nothing counted it.
--   * every contract asserts sla_min=120 with exactly 3 paths. Uniform values are a seed, not an analysis: nothing
--     distinguished a measured SLA from an asserted one.
--
-- This file adds the enforcement views and a measurement. It seeds NOTHING and marks no path tested: a view that
-- claimed a test happened would be the same defect one layer down. Where the fleet records no start and finish for a
-- process, that process is absent from v_sla_compliance rather than shown as 'ok'.
--
-- Revert: DROP VIEW v_path_coverage_gaps, v_path_coverage_violations, v_sla_compliance, v_process_contract_dod_worklist.

-- 1. Every declared path, joined to whether the fleet has evidence it works.
--    A control's alternate is the fleet's existing record of a second route; alternate_tested_at is the only evidence
--    the route was ever taken. Untested is reported as a defect, never as pass.
DROP VIEW IF EXISTS v_path_coverage_gaps;
CREATE VIEW v_path_coverage_gaps AS
SELECT
  'control_registry' AS source,
  control AS process,
  kind AS path_kind,
  CASE
    WHEN alternate_path IS NULL OR trim(alternate_path) = '' THEN 'no-alternate'
    WHEN alternate_tested_at IS NULL THEN 'alternate-untested'
    ELSE 'ok'
  END AS path_state,
  alternate_path AS alternate,
  alternate_tested_at
FROM control_registry
UNION ALL
SELECT
  'process_contracts' AS source,
  process,
  'contract-paths' AS path_kind,
  CASE
    WHEN json_valid(paths_json) = 0 THEN 'paths-not-json'
    WHEN json_array_length(paths_json) < 2 THEN 'single-path'
    WHEN json_array_length(paths_json) = 2 THEN 'two-paths-no-spare'
    ELSE 'ok'
  END AS path_state,
  NULL AS alternate,
  NULL AS alternate_tested_at
FROM process_contracts;

DROP VIEW IF EXISTS v_path_coverage_violations;
CREATE VIEW v_path_coverage_violations AS
SELECT source, process, path_kind, path_state, alternate, alternate_tested_at
FROM v_path_coverage_gaps
WHERE path_state <> 'ok';

-- 2. An SLA that is measured rather than asserted.
--    Two clocks, because they answer different questions and conflating them is how a 25x breach gets read as a step
--    failure: queue_minutes is creation -> completion (how long the work item waited), step_minutes is claim ->
--    completion (how long the acting stage held it). state grades the STEP against sla_min, which is what a process
--    contract can control; queue_state grades the end-to-end wait against the same number so backpressure is visible
--    instead of hidden inside an average.
DROP VIEW IF EXISTS v_sla_compliance;
CREATE VIEW v_sla_compliance AS
SELECT
  'research-publish' AS process,
  COUNT(*) AS finished_7d,
  ROUND(AVG((julianday(published_at) - julianday(created_at)) * 1440), 1) AS queue_minutes,
  ROUND(AVG((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440), 1) AS step_minutes,
  MAX(CAST((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440 AS INTEGER)) AS worst_step_minutes,
  120 AS sla_min,
  CASE WHEN AVG((julianday(published_at) - julianday(COALESCE(claimed_at, created_at))) * 1440) > 120 THEN 'breach' ELSE 'ok' END AS state,
  CASE WHEN AVG((julianday(published_at) - julianday(created_at)) * 1440) > 120 THEN 'breach' ELSE 'ok' END AS queue_state,
  'measured' AS measurement
FROM research_queue
WHERE published_at IS NOT NULL AND created_at IS NOT NULL AND published_at > datetime('now', '-7 days')
UNION ALL
SELECT
  'code-task-merge',
  COUNT(*),
  ROUND(AVG((julianday(merged_at) - julianday(created_at)) * 1440), 1),
  ROUND(AVG((julianday(merged_at) - julianday(created_at)) * 1440), 1),
  MAX(CAST((julianday(merged_at) - julianday(created_at)) * 1440 AS INTEGER)),
  120,
  CASE WHEN AVG((julianday(merged_at) - julianday(created_at)) * 1440) > 120 THEN 'breach' ELSE 'ok' END,
  CASE WHEN AVG((julianday(merged_at) - julianday(created_at)) * 1440) > 120 THEN 'breach' ELSE 'ok' END,
  'measured (no claim timestamp on code_tasks, so step and queue are the same clock)'
FROM code_tasks
WHERE merged_at IS NOT NULL AND created_at IS NOT NULL AND merged_at > datetime('now', '-7 days');

-- 3. Processes whose DoD is still intent rather than a checkable state.
DROP VIEW IF EXISTS v_process_contract_dod_worklist;
CREATE VIEW v_process_contract_dod_worklist AS
SELECT process, owner, sla_min, substr(definition_of_done, 1, 160) AS dod_prefix
FROM process_contracts
WHERE definition_of_done LIKE '[seeded from worker_schedules purpose%';

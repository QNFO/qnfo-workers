-- RESEARCH-WATCHDOG-1 (2026-10-20, pillar autonomy; agent_issues 2838 EVOLVE-1 qnfo-research-exec single executor has no tested alternate path, spof_registry issue 2175; SLA-AND-PATHS-1: every step has an SLA and
-- at least two independent paths to its definition of done). Companion of qnfo-cloud-ops 1.33.0 (jobResearchExecWatchdog, wrangler binding RESEARCH_EXEC, qnfo-cloud-ops/research-exec-watchdog.test.mjs).
-- Measured 2026-10-20 06:0xZ (SELECT only): v_dod_spof_gaps NO-ALTERNATE-PATH for the component, spof_registry.alternate_path NULL, no spof_alternate_probes row, research_queue queued 193 and researching 21, research-exec
-- 'done' events 471 in the last 120 minutes (the cron path is healthy today; the defect is the single trigger, not a stall), qnfo-ops ops_research_kick exists since 2.51.0 (a tool the agent calls, no D1 trace: audit_trail 0 rows).
-- What this file does (INSERT OR IGNORE / guarded UPDATE only, no alternate_tested_at written, no DELETE):
--   * spof_registry.alternate_path of the component names the watchdog (so v_dod_spof_gaps moves from NO-ALTERNATE-PATH to ALTERNATE-NEVER-TESTED, then to nothing once a drill passes);
--   * spof_alternate_probes gets a read-only expected/observed probe the 6-hourly chaos drill judges and, on a pass, stamps spof_registry.alternate_tested_at (qnfo-fleet-control chaosDrill, unchanged): it needs a forced stage
--     inside 1560 minutes (the watchdog's own daily proof stage, so the alternate has run), the watchdog state fresh inside 30 minutes, and no 120-minute stall of a non-empty queue;
--   * failure mode research-exec-stalled with its fm- detector contract (a non-empty queue with no finished stage in 120 minutes, expected 0);
--   * a decision_log row.
-- Closing probe of issue 2838 (already armed, contract issue-2838): SELECT 'tested' AS expected, CASE WHEN EXISTS(SELECT 1 FROM v_spof_registry_all WHERE component LIKE 'qnfo-research-exec%' AND alternate_tested_at IS NOT NULL) THEN 'tested' ELSE 'untested' END AS observed.
-- It passes after qnfo-cloud-ops 1.33.0 is live (the first tick forces the proof stage) and the next chaos drill (every 360 minutes) judges the probe below.
-- spof-review: qnfo-research-exec's own cron under its single-flight lease is the first trigger path and the qnfo-cloud-ops watchdog is the second; if the RESEARCH_EXEC binding or the watchdog fails the cron runs unchanged and fm-research-exec-stalled reads a 120-minute stall.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM spof_alternate_probes WHERE component = 'qnfo-research-exec single executor' AND window_note LIKE '1560 minutes for the forced proof stage%'; UPDATE spof_registry SET alternate_path = NULL, evidence = replace(evidence, ' | EVOLVE-1 2026-10-20 (agent_issues 2838): alternate_path recorded with the watchdog that implements it; alternate_tested_at is stamped only by a passing chaos drill on the spof_alternate_probes row of this component, which reads a forced stage inside 1560 minutes, the watchdog state written inside 30 minutes and no stall of 120 minutes', '') WHERE component = 'qnfo-research-exec single executor' AND instr(alternate_path, 'research-exec-watchdog') > 0; DELETE FROM remediation_contracts WHERE class = 'fm-research-exec-stalled'; DELETE FROM failure_modes WHERE fm_key = 'research-exec-stalled'
-- BACKUP: bak_20261020_spof_research_exec
-- Rollback note: the decision_log row stays (append-only), and an alternate_tested_at the drill stamped on a passing probe stays (it was earned).

CREATE TABLE IF NOT EXISTS bak_20261020_spof_research_exec AS SELECT * FROM spof_registry WHERE component = 'qnfo-research-exec single executor';

UPDATE spof_registry SET alternate_path = 'the qnfo-cloud-ops research-exec-watchdog (RESEARCH-WATCHDOG-1, qnfo-cloud-ops 1.33.0): every 10-minute tick it forces one stage through the RESEARCH_EXEC service binding (POST /run?sync=1 on an internal host, the path qnfo-ops ops_research_kick uses) when the queue holds queued or researching rows and no stage finished in 30 minutes, and forces one proof stage a day; each forced stage is a cloud_ops_events row of kind research-watchdog. The first path is research-exec''s own cron under its single-flight lease.', evidence = evidence || ' | EVOLVE-1 2026-10-20 (agent_issues 2838): alternate_path recorded with the watchdog that implements it; alternate_tested_at is stamped only by a passing chaos drill on the spof_alternate_probes row of this component, which reads a forced stage inside 1560 minutes, the watchdog state written inside 30 minutes and no stall of 120 minutes'
WHERE component = 'qnfo-research-exec single executor' AND TRIM(COALESCE(alternate_path, '')) = '';

INSERT OR IGNORE INTO spof_alternate_probes (component, probe_sql, exercise, window_note, enabled) VALUES
 ('qnfo-research-exec single executor',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''research-watchdog'' AND status = ''ok'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-1560 minutes'')) THEN ''no research-watchdog stage was forced and answered in 1560 minutes, so the second trigger path of qnfo-research-exec has not run'' WHEN COALESCE((SELECT updated_at FROM scheduler_state WHERE key = ''research_exec_watchdog''), '''') < datetime(''now'', ''-30 minutes'') THEN ''the research_exec_watchdog state was not written in 30 minutes, so the tick no longer evaluates the research queue'' WHEN EXISTS (SELECT 1 FROM research_queue WHERE status IN (''queued'', ''researching'')) AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''done'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) THEN ''research work waits and no stage finished in 120 minutes: the cron and the watchdog both failed to move it'' ELSE ''ok'' END AS observed',
  NULL,
  '1560 minutes for the forced proof stage (one a day plus the 120 minutes SLA-120M-1 allows), 30 minutes for the watchdog state (written on every 10-minute tick of qnfo-cloud-ops), and 120 minutes for a stalled queue; the proof stage is the exercise: the watchdog forces one stage a day through the RESEARCH_EXEC binding, so the alternate is run, and a busy answer (the single-flight lease held by the cron) counts as a run', 1);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('research-exec-stalled', 'the research queue holds work and no research-exec stage finishes, because the pipeline has one executor and one trigger',
  'qnfo-research-exec runs from its own cron under a single-flight lease, one stage per tick; one failing row stalled 12 papers for 1440 minutes on 2026-10-07 (spof_registry issue 2175) and the component had no second trigger path (agent_issues 2838)',
  'qnfo-cloud-ops 1.33.0 research-exec-watchdog forces one stage through the RESEARCH_EXEC service binding when work waits and none finished in 30 minutes, and one proof stage a day; the detector fm-research-exec-stalled reads a 120-minute stall',
  'fm-research-exec-stalled: research_queue holds a queued or researching row and cloud_ops_events has no research-exec done event in 120 minutes',
  'fm-research-exec-stalled', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 2838,
  'research_queue rows with status queued or researching and no cloud_ops_events row of kind done for job qnfo-research-exec inside 120 minutes',
  'papers wait in the queue with no stage progress; research_queue published_at stops advancing',
  'research: queue to published paper');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-research-exec-stalled', NULL, 'RESEARCH-WATCHDOG-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM research_queue WHERE status IN (''queued'', ''researching'')) AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''done'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'agent-clusterD-a0676665',
  'a single executor with one trigger is a single point of failure even while it is healthy, and an alternate counts only after a run exercised it',
  'EVOLVE-1 / RESEARCH-WATCHDOG-1: qnfo-cloud-ops 1.33.0 forces a qnfo-research-exec stage when the queue holds work and none finished in 30 minutes (and one proof stage a day) through a new RESEARCH_EXEC service binding; spof_registry records it as the alternate path of the single executor, spof_alternate_probes drills it, and the detector fm-research-exec-stalled reads a 120-minute stall',
  'qnfo-audit 2026-10-20 06:0xZ (SELECT only): v_dod_spof_gaps NO-ALTERNATE-PATH for the component, research_queue queued 193 researching 21, 471 research-exec done events in 120 minutes, audit_trail has no ops_research_kick row, cloud-ops 1.33.0 suite qnfo-cloud-ops/research-exec-watchdog.test.mjs passes',
  'migration merged',
  'one spof_registry row text, one spof_alternate_probes row, one failure mode with its detector, a service binding on qnfo-cloud-ops (props.caller, no key copy)',
  'the Rollback header of migrations/2026-10-20-research-exec-watchdog.sql (the worker change reverts with the canonical deploy canary)',
  'research-exec has a second trigger path that runs daily and whenever the queue stalls',
  'v_dod_spof_gaps reads 0 rows for the component within 720 minutes of the deploy',
  'none',
  'd1:qnfo-audit read-only, node:sqlite fixtures in migrations/research-exec-watchdog.test.mjs, qnfo-cloud-ops/research-exec-watchdog.test.mjs (the job against an in-memory ledger)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'EVOLVE-1 / RESEARCH-WATCHDOG-1:%');

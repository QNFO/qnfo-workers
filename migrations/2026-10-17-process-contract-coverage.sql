-- SLA-AND-PATHS-1 coverage + seed (2026-10-17)
-- Owner directive: ALL STEPS, ALL PROCESSES SHALL HAVE SLA AND MULTIPLE EXECUTION/REMEDIATION/WORKAROUND PATHS
--                TO SUCCESSFUL DEFINITION OF DONE.
--
-- Applied live through the D1 API at 2026-10-17T16:4xZ before this file existed. This file is the tracked record so a
-- rebuild reproduces the same state. It is idempotent: CREATE VIEW IF NOT EXISTS + INSERT OR IGNORE.
--
-- Why the view exists: v_process_contract_gaps only measures rows that are ALREADY in process_contracts, so it reported
-- "0 gaps" while 32 of the fleet's 44 scheduled workers had no contract at all. Coverage has to be measured against the
-- schedule inventory, not against the registry's own contents.

CREATE VIEW IF NOT EXISTS v_process_contract_coverage AS
SELECT s.name AS process,
       s.crons_json AS crons,
       CASE WHEN p.process IS NULL THEN 'uncovered' ELSE 'covered' END AS coverage_state
FROM worker_schedules s
LEFT JOIN process_contracts p ON p.owner = s.name
WHERE s.crons_json IS NOT NULL AND s.crons_json NOT IN ('', '[]');

-- Seed contracts for scheduled workers that had none, from each worker's OWN recorded purpose, retry policy and failure
-- detectors (worker_schedules columns) rather than invented text. Provenance is stamped into definition_of_done so a
-- reviewer can tell a derived contract from a hand-written one.
--
-- KNOWN LIMITATION: a DoD derived from `purpose` describes intent, not a checkable done-state. These rows satisfy the
-- constraint honestly but will NOT catch a worker that runs and silently produces nothing. Each needs per-worker
-- review; the '[seeded from worker_schedules purpose ...]' prefix is the worklist marker.
INSERT OR IGNORE INTO process_contracts (process, owner, sla_min, definition_of_done, paths_json)
SELECT s.name,
       s.name,
       120,
       '[seeded from worker_schedules purpose 2026-10-17, review for a stricter DoD] The scheduled run completes and records its output: '
         || COALESCE(s.purpose, 'purpose not recorded'),
       json_array(
         json_object('name', 'cf-native-cron', 'kind', 'primary',
                     'action', 'the Cloudflare cron handler runs; crons ' || COALESCE(s.crons_json, '[]')),
         json_object('name', 'next-tick-retry', 'kind', 'remediation',
                     'action', COALESCE(NULLIF(s.retry_policy, ''),
                                        'the next scheduled tick is the retry (the handler is idempotent)')),
         json_object('name', 'cron-drift-autorestore', 'kind', 'workaround',
                     'action', COALESCE(NULLIF(s.failure_detectors, ''),
                                        'fleet-control cronDrift detects trigger drift and auto-restores it'))
       )
FROM worker_schedules s
WHERE s.crons_json IS NOT NULL
  AND s.crons_json NOT IN ('', '[]')
  AND NOT EXISTS (SELECT 1 FROM process_contracts p WHERE p.owner = s.name);

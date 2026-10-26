-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-census-heartbeat-ages-out'; DELETE FROM failure_modes WHERE fm_key = 'census-heartbeat-ages-out'; DELETE FROM ops_config WHERE key = 'census_external_attested'; decision_log is append-only and keeps its row.
-- spof-review: adds no worker, cron or trigger; the refresh is one more upsert in the existing hourly runner (scripts/fleet_journeys.py, outside the account) and the detector below reads the heartbeat age, so a runner that stops refreshing is found within the hour.
--
-- CENSUS-EXTERNAL-HEARTBEAT-2 (2026-10-26, pillar autonomy; agent_issues 100166, FLEET-JOURNEY-FAILED-1 binding-census, reopened 2026-10-26T19:01Z after PR 4717 closed it at 18:40Z)
--
-- WHY: CENSUS-EXTERNAL-HEARTBEAT-1 (scripts/fleet_journeys.py external_heartbeat) wrote a worker's fleet_heartbeat only while qnfo-ops read the row as blind. Once the heartbeat was written
-- qnfo-ops read the worker healthy through it (CRON-ONLY-HEARTBEAT-1, fresh under 2 h), the runner skipped the row, and the heartbeat aged out 2 h after the write (qnfo-workers and voice-stt, written 18:18:07Z,
-- run 8863; expiry 20:18Z). The runner runs about hourly (gaps of 50 to 74 minutes on 2026-10-26), so every cycle left the census blind for up to an hour and the 20-minute cf runner reopened the issue.
-- Measured 2026-10-26T19:18Z: qnfo-ops /fleet healthy 36 of 36, qnfo-workers and voice-stt healthy through probe heartbeat at age 60 minutes; the next blind window would have opened at 20:18Z.
--
-- WHAT CHANGED: external_heartbeat keeps the names it has attested in ops_config census_external_attested and probes a row that is healthy only through its heartbeat again on every run when its name is on that
-- list, so the heartbeat is rewritten (age under about 75 minutes) while the host answers 2xx or the retired stub. A cron-only worker that writes its own heartbeat is never on the list, so a dead cron still ages out.
-- This file seeds the list with the two names the runner wrote at 18:18Z so the first run after the deploy already refreshes them, and registers the failure mode with a detector that reads the age of those heartbeats.

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at)
VALUES ('census_external_attested', '["qnfo-workers","voice-stt"]',
  'CENSUS-EXTERNAL-HEARTBEAT-2: workers whose fleet_heartbeat is written by scripts/fleet_journeys.py from outside the account; seeded with the two names written 2026-10-26T18:18:07Z (journey run 8863); the runner adds the names it attests',
  'seed:2026-10-26');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('census-heartbeat-ages-out',
  'the heartbeat the journey runner writes for a worker qnfo-ops cannot probe ages out two hours later, so the binding-census journey fails and FLEET-JOURNEY-FAILED-1 reopens on every cycle',
  'external_heartbeat wrote only while a row was blind; once the heartbeat made the row healthy the runner skipped it, nothing refreshed it, and CRON-ONLY-HEARTBEAT-1 stops trusting a heartbeat older than 2 hours; the runner runs about hourly, so the census was blind for up to an hour of every cycle',
  'CENSUS-EXTERNAL-HEARTBEAT-2 (scripts/fleet_journeys.py): the names the runner attested (ops_config census_external_attested) are probed again each run and their heartbeat rewritten while the host answers; a worker with its own heartbeat is never on the list',
  'fleet_heartbeat rows of the attested names older than 100 minutes, or not ok (the detector d1-query below, expected 0)',
  'fm-census-heartbeat-ages-out', '2026-10-26', 100166,
  'a worker is healthy in the census only through a heartbeat written by the journey runner, and the runner skips it while healthy',
  'binding-census fails "census sees every worker" for qnfo-workers or voice-stt about two hours after the last heal; FLEET-JOURNEY-FAILED-1 (100166) reopens',
  'the binding-census journey and its issue, the census blind count in qnfo-ops /fleet; no worker is affected');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-census-heartbeat-ages-out', NULL, 'CENSUS-EXTERNAL-HEARTBEAT-2', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM fleet_heartbeat h WHERE h.worker IN (SELECT value FROM json_each((SELECT value FROM ops_config WHERE key = ''census_external_attested''))) AND (h.ok <> 1 OR h.ts < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-100 minutes''))) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-old-issues-6d-2038',
  'a heartbeat the journey runner writes must be rewritten while the host answers, or it ages out under the two-hour trust window and the census flaps once a cycle',
  'CENSUS-EXTERNAL-HEARTBEAT-2: external_heartbeat probes again each run the workers it attested (ops_config census_external_attested, seeded with qnfo-workers and voice-stt) when the census reads them healthy only through the heartbeat, and rewrites the heartbeat while the host answers 2xx or the retired stub; detector fm-census-heartbeat-ages-out',
  'journey_runs: binding-census gha run 8863 (18:18:41Z ok) healed qnfo-workers and voice-stt with heartbeats at 18:18:07Z; the cf runner failed at 19:00:48Z and the gha runner at 19:10:13Z; FLEET-JOURNEY-FAILED-1 reopened 19:01Z (issue_lifecycle 7010); qnfo-ops /fleet at 19:18Z reads both healthy through probe heartbeat at age 60 minutes, expiry at 7200000 ms (qnfo-ops/worker.js CRON-ONLY-HEARTBEAT-1); gha runner gaps 50 to 74 minutes',
  'merged with this migration',
  'scripts/fleet_journeys.py on the hourly runner; one extra /health GET per attested worker per run (two workers) and at most one ops_config write; a worker that answers an error is not refreshed and its heartbeat ages out as before',
  'git revert of the pull request; the Rollback header removes the seed row, the failure mode and the detector contract',
  'the census stays healthy for the workers the runner attests without a blind window each cycle',
  'binding-census passes on both runners across the 20:18Z expiry and FLEET-JOURNEY-FAILED-1 (100166) stays closed for 24 hours; fm-census-heartbeat-ages-out reads 0 each hour',
  'none', 'scripts/fleet_journeys.py --selftest (35 checks, fails with the old skip rule), the attested rows refreshed, a worker with its own heartbeat untouched, an erroring host not refreshed; migrations/census-heartbeat-refresh.test.mjs replays this file on the live table shapes'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CENSUS-EXTERNAL-HEARTBEAT-2:') = 1);

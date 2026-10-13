-- FLEET-JOURNEYS-1 and FLEET-JOURNEYS-2 (2026-10-13, pillar core). Owner directives, verbatim: "Test all worker functionality and
-- interconnectedness/routing. How to know if all workers actually work as intended end-to-end in real-world complex processes and
-- workflows (not just simple probe results)?" and "End-to-end worker functionality testing shall be baked into Cloudflare Quniverse
-- system diagnostics and fleet control. System shall have real-time understanding of its own complexity and fleet dynamics. Simple
-- probes are not enough. The system shall know and maintain itself automatically server-side under expected real-world complex
-- conditions and workflows."
-- Two runners write one ledger, journey_runs:
--   runner 'cf'   qnfo-fleet-control 0.27.0 journeyTick, every 20 minutes, through service bindings (server-side, the primary path):
--                 papers-path, lock-roundtrip, binding-census, deploy-coherence (fixes registry drift in the loop), loop-heartbeats,
--                 ai-router, traffic-health (real traffic: worker_logs errors against analytics_dash_workers requests) and, every 6 h,
--                 ask-path. GET https://qnfo-fleet-control.q08.workers.dev/journeys serves the newest runs and the hop graph.
--   runner 'gha'  scripts/fleet_journeys.py from the GitHub runner, outside the account (the second path: it also crosses the public
--                 hostnames, DNS and routes a binding skips), at most every 50 minutes.
-- Each row keeps the path actually taken (path_json: binding or host, target worker, path, status, ms) and the failing steps.
-- One self-filing, self-closing FLEET-JOURNEY-FAILED-1 issue per failing journey is shared by both runners (same title prefix; it closes
-- when one runner passes and the other's newest run in 2 h did not fail). fleet_journeys_failing is therefore trigger-exempt (a trigger on
-- the same signal would file each defect twice). journey_tick_age_min watches the watcher: a stalled server-side tick files its own issue.
-- First runs 2026-10-13 23:40Z-01:00Z: 28 of 28 workers answered /health 200 while three cross-worker defects stood: 9 registry versions
-- wrong (qnfo-ops sweep regex), 11 workers invisible to qnfo-ops /fleet (cf-1042 with a binding to each unused), and 228 error events a day
-- from qnfo-ops /registry/register (an ALTER that always fails, logged as an error). qnfo-ops 2.48.1 fixes all three.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_journey_state; DROP TABLE IF EXISTS journey_runs; DELETE FROM analytics_metric_triggers WHERE metric_key = 'journey_tick_age_min'; DELETE FROM remediation_contracts WHERE class IN ('fm-registry-version-sweep-regex', 'fm-fleet-census-blind', 'fm-ops-schema-alter-noise'); DELETE FROM failure_modes WHERE fm_key IN ('registry-version-sweep-regex', 'fleet-census-blind', 'ops-schema-alter-noise'); DELETE FROM metric_registry WHERE metric IN ('fleet_journeys_failing', 'journey_tick_age_min'); DELETE FROM capability_ledger WHERE capability = 'run end-to-end multi-worker journeys and self-file each failing one'
-- BACKUP: journey_runs

CREATE TABLE IF NOT EXISTS journey_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  runner TEXT NOT NULL,
  journey TEXT NOT NULL,
  ok INTEGER NOT NULL,
  steps INTEGER,
  failed INTEGER,
  ms INTEGER,
  failed_json TEXT,
  path_json TEXT,
  healed_json TEXT,
  version TEXT
);
CREATE INDEX IF NOT EXISTS idx_journey_runs_jrt ON journey_runs (journey, runner, ts);
CREATE INDEX IF NOT EXISTS idx_journey_runs_ts ON journey_runs (ts);

CREATE VIEW IF NOT EXISTS v_journey_state AS
SELECT r.journey, r.runner, r.ts, r.ok, r.steps, r.failed, r.ms, r.failed_json, r.version,
       CAST((julianday('now') - julianday(r.ts)) * 1440 AS INTEGER) AS age_min
FROM journey_runs r
WHERE r.id IN (SELECT MAX(id) FROM journey_runs GROUP BY journey, runner);

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('fleet_journeys_failing', 'operational', 'target',
  'journeys whose newest run, from either runner within 2 h, failed at least one step (papers-path, lock-roundtrip, binding-census, deploy-coherence, loop-heartbeats, ai-router, traffic-health, ask-path)',
  'qnfo-audit.journey_runs, written by qnfo-fleet-control journeyTick (runner cf, every 20 min) and scripts/fleet_journeys.py (runner gha)', '3 of 8 on 2026-10-14 01:00Z (deploy-coherence, binding-census, traffic-health)',
  '0 (every end-to-end journey passes; trigger-exempt: the runners file FLEET-JOURNEY-FAILED-1 per failing journey)', 'qnfo-fleet-control', 'self-filing runners', '20m', '> 0', '> 2', NULL, NULL, 'MEASURED', 'worker-written'),
 ('journey_tick_age_min', 'operational', 'target',
  'minutes since the newest journey_runs row of runner cf (qnfo-fleet-control journeyTick)',
  'qnfo-audit.journey_runs (FLEET-JOURNEYS-2)', 'none before qnfo-fleet-control 0.27.0 is live',
  '<= 25 (the tick runs every 20 minutes)', 'qnfo-fleet-control', 'trigger gt 60', '20m', '> 25', '> 60', NULL, NULL, 'MEASURED', 'computed');

-- The age is refreshed by the D1 heartbeat (fleet_tick, every 10 minutes from two producers), so it moves when the journey tick stops.
CREATE TRIGGER IF NOT EXISTS journey_tick_age_refresh AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET
    last_value = CAST(COALESCE((SELECT CAST((julianday('now') - julianday(MAX(ts))) * 1440 AS INTEGER) FROM journey_runs WHERE runner = 'cf'), 9999) AS TEXT),
    last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'journey_tick_age_min' AND EXISTS (SELECT 1 FROM journey_runs WHERE runner = 'cf');
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'journey_tick_age_min', 'Self-diagnosis outage: the server-side end-to-end journeys stopped', 'registry', 'gt', 60, 1,
  'Pillar core. qnfo-fleet-control journeyTick (FLEET-JOURNEYS-2) wrote no journey_runs row for over an hour, so the fleet is not testing its own processes. Check in order: (1) GET https://qnfo-fleet-control.q08.workers.dev/health for VERSION >= 0.27.0; (2) ops_config fleet_journeys (off stops it on purpose); (3) Workers Logs for "journeyTick error" or "fleet-control:journeys:record"; (4) the fast-slot dispatch at the top of scheduled() (onTwentyGrid); (5) the second runner still covers the journeys from outside: SELECT journey, ok, ts FROM v_journey_state WHERE runner = ''gha''. Done: journey_tick_age_min <= 25 at two refreshes.',
  'qnfo-fleet-control', 'agent_issues', 6, 1, 'FLEET-JOURNEYS-2 (migrations/2026-10-13-fleet-journeys.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'journey_tick_age_min');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius) VALUES
 ('registry-version-sweep-regex', 'qnfo-ops writes a wrong version into service_registry for a live worker',
  'the version sweep could not reach /health (error 1042 from inside the account) and fell back to a bundle regex that matched any *VERSION = (QDS_VERSION, INDEXER_VERSION, folded members) and rejected a hyphenated suffix, so "1.10.0-topic-clusters-derived" lost to "1.0.0"; 9 of 28 rows wrong',
  'qnfo-ops 2.48.1 REGISTRY-VERSION-SWEEP-1: /health through the COMPAT_HEALTH_BINDINGS service binding first; the fallback matches only var|const|let VERSION and accepts hyphens. qnfo-fleet-control 0.27.0 deploy-coherence also corrects a drifted row in the loop',
  'fm-registry-version-sweep-regex: the newest deploy-coherence run of each runner passed', 'fm-registry-version-sweep-regex', '2026-10-13',
  'qnfo-ops /registry shows 1.0.0 or x.y.z-folded for a worker whose /health reports another version', 'every reader of service_registry.version (deploy drift, compat gate, dashboard) judges the wrong build'),
 ('fleet-census-blind', 'qnfo-ops /fleet reports healthy:null for live workers it has a service binding to',
  'fleetStatus probed every worker outside FLEET over its workers.dev or registry URL, which a Worker cannot fetch on its own account (cf-1042), and never used the COMPAT_HEALTH_BINDINGS bindings added in 2.44.0',
  'qnfo-ops 2.48.1 FLEET-CENSUS-BINDINGS-1: fleetStatus reads /health through the binding first (probe binding:<name>)',
  'fm-fleet-census-blind: the newest binding-census run of each runner passed', 'fm-fleet-census-blind', '2026-10-13',
  '11 of 28 rows healthy:null, error cf-1042-no-published-route', 'the census and every consumer of /fleet cannot tell a down worker from a blind probe'),
 ('ops-schema-alter-noise', 'qnfo-ops logs an error on every /registry/register call',
  'ensureSchema runs ALTER TABLE ... ADD COLUMN upstream_model on every call and logs the expected "duplicate column" answer with console.error; ERROR-DETAIL-CAPTURE-1 captures each as an error event (228 a day, 92% of qnfo-ops error events)',
  'qnfo-ops 2.48.1 SCHEMA-ALTER-QUIET-1: the duplicate-column answer is not logged',
  'fm-ops-schema-alter-noise: no worker_logs row in the last 2 h carries the duplicate-column message', 'fm-ops-schema-alter-noise', '2026-10-13',
  'traffic-health reads qnfo-ops above a 5% error rate, top route /registry/register', 'real errors in qnfo-ops are buried under noise and its error rate reads high');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status) VALUES
 ('fm-registry-version-sweep-regex', NULL, 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_journey_state WHERE journey = ''deploy-coherence'' AND ok = 0 AND age_min <= 120) + (SELECT CASE WHEN EXISTS (SELECT 1 FROM v_journey_state WHERE journey = ''deploy-coherence'' AND age_min <= 120) THEN 0 ELSE 1 END) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active'),
 ('fm-fleet-census-blind', NULL, 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_journey_state WHERE journey = ''binding-census'' AND ok = 0 AND age_min <= 120) + (SELECT CASE WHEN EXISTS (SELECT 1 FROM v_journey_state WHERE journey = ''binding-census'' AND age_min <= 120) THEN 0 ELSE 1 END) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active'),
 ('fm-ops-schema-alter-noise', NULL, 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM worker_logs WHERE script_name = ''qnfo-ops'' AND ts_ms > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 7200) * 1000 AND exceptions_json LIKE ''%duplicate column%'') AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('run end-to-end multi-worker journeys and self-file each failing one', 'FLEET-JOURNEYS-1 and -2 (qnfo-fleet-control 0.27.0 journeyTick, scripts/fleet_journeys.py, migrations/2026-10-13-fleet-journeys.sql)', 'service bindings from qnfo-fleet-control to qnfo-gateway, qnfo-ai-search, qnfo-deploy-guard, qnfo-fleet-dashboard, qnfo-ops, qnfo-ai, qnfo-pdf; the remediation-consumer runner for the outside path', 'offline suites (journeys.test.mjs 34 checks, runner selftest 21, migration suite); live runner dry run 2026-10-13 found 3 cross-worker defects behind 28 green /health probes', '2026-10-13', '2026-10-13', 'journey_runs, v_journey_state, GET /journeys, metrics fleet_journeys_failing and journey_tick_age_min');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01AEEBcczeW1o2nKSUBtXnUL', 'a worker works when the processes that cross it work end to end, not when its /health answers; the fleet must run those processes itself, server-side, and read its real traffic',
  'FLEET-JOURNEYS-2: qnfo-fleet-control 0.27.0 journeyTick (8 journeys every 20 min through service bindings, per-hop path, in-loop registry fix, real-traffic health), journey_runs shared with the outside runner, GET /journeys; qnfo-ops 2.48.1 fixes the three defects the first runs found',
  '2026-10-13 23:40Z-2026-10-14 01:00Z: 28 of 28 /health 200; 9 wrong registry versions, 11 workers invisible to qnfo-ops /fleet, 228 error events a day from /registry/register',
  'migration merged', 'one 20-minute tick in qnfo-fleet-control (public reads, a 120 s work claim on a probe path, service_registry.version corrections logged to self_heal_actions); ops_config fleet_journeys = off stops it',
  'the Rollback header; ops_config fleet_journeys = off', 'the fleet tests its own multi-worker processes every 20 minutes and files, fixes or closes what it finds without a session',
  'fleet_journeys_failing <= 1 within 24 h', 'none', 'qnfo-gateway, qnfo-ai-search, qnfo-deploy-guard, qnfo-fleet-dashboard, qnfo-ops, qnfo-ai, qnfo-pdf, worker_logs, analytics_dash_workers'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'FLEET-JOURNEYS-2:%');

-- FLEET-JOURNEYS-1 (2026-10-13, pillar core). Owner question, verbatim: "Test all worker functionality and interconnectedness/routing.
-- How to know if all workers actually work as intended end-to-end in real-world complex processes and workflows (not just simple probe
-- results)?" scripts/fleet_journeys.py (a step of remediation-consumer.yml, at most once per 50 minutes) drives seven multi-worker
-- journeys from the GitHub runner, each a chain where a later request consumes what an earlier one returned: deploy-coherence (main
-- VERSION == live /health == qnfo-ops registry), binding-census (qnfo-ops /fleet across its service bindings), lock-roundtrip
-- (deploy-guard acquire, list, release, list), papers-path (gateway list -> page -> feed -> OAI-PMH for one paper), ask-path
-- (qnfo-ai-search -> gateway -> Workers AI, answer citations resolve on papers.qnfo.org), loop-heartbeats (fleet-control, dashboard,
-- ai-search and gateway loops ran within two cycles) and ai-router. Each run writes cloud_ops_events kind fleet-journey (one row per
-- journey), this metric, and one self-filing, self-closing FLEET-JOURNEY-FAILED-1 issue per failing journey.
-- First run 2026-10-13 23:40Z: 28 of 28 workers answered /health 200, and 2 of 7 journeys failed: deploy-coherence (9 registry
-- versions were a folded member's VERSION or QDS_VERSION: the qnfo-ops sweep regex rejected hyphenated suffixes) and binding-census
-- (qnfo-ops /fleet read 11 workers healthy:null on cf-1042 while holding a service binding to each). qnfo-ops 2.48.1 fixes both.
-- The metric is exempt from analytics_metric_triggers: the runner files its own issue per failing journey, and a trigger on the same
-- signal would file the same defect twice (two signals from one producer are one path, ANTIFRAGILE-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-registry-version-sweep-regex', 'fm-fleet-census-blind'); DELETE FROM failure_modes WHERE fm_key IN ('registry-version-sweep-regex', 'fleet-census-blind'); DELETE FROM metric_registry WHERE metric = 'fleet_journeys_failing'; DELETE FROM capability_ledger WHERE capability = 'run end-to-end multi-worker journeys and self-file each failing one'

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('fleet_journeys_failing', 'operational', 'target',
  'journeys of scripts/fleet_journeys.py whose latest run failed at least one step (deploy-coherence, binding-census, lock-roundtrip, papers-path, ask-path, loop-heartbeats, ai-router)',
  'qnfo-audit.cloud_ops_events kind fleet-journey, written by scripts/fleet_journeys.py from the GitHub runner (FLEET-JOURNEYS-1)', '2 of 7 on 2026-10-13 23:40Z (deploy-coherence, binding-census)',
  '0 (every end-to-end journey passes; trigger-exempt: the runner files FLEET-JOURNEY-FAILED-1 per failing journey)', 'qnfo-fleet-control', 'self-filing runner', 'hourly', '> 0', '> 2', NULL, NULL, 'MEASURED', 'runner');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius) VALUES
 ('registry-version-sweep-regex', 'qnfo-ops writes a wrong version into service_registry for a live worker',
  'the version sweep could not reach /health (error 1042 from inside the account) and fell back to a bundle regex that matched any *VERSION = (QDS_VERSION, INDEXER_VERSION, folded members) and rejected a hyphenated suffix, so "1.10.0-topic-clusters-derived" lost to "1.0.0"; 9 of 28 rows wrong',
  'qnfo-ops 2.48.1 REGISTRY-VERSION-SWEEP-1: /health through the COMPAT_HEALTH_BINDINGS service binding first; the fallback matches only var|const|let VERSION and accepts hyphens',
  'fm-registry-version-sweep-regex: the latest deploy-coherence journey passed', 'fm-registry-version-sweep-regex', '2026-10-13',
  'qnfo-ops /registry shows 1.0.0 or x.y.z-folded for a worker whose /health reports another version', 'every reader of service_registry.version (deploy drift, compat gate, dashboard) judges the wrong build'),
 ('fleet-census-blind', 'qnfo-ops /fleet reports healthy:null for live workers it has a service binding to',
  'fleetStatus probed every worker outside FLEET over its workers.dev or registry URL, which a Worker cannot fetch on its own account (cf-1042), and never used the COMPAT_HEALTH_BINDINGS bindings added in 2.44.0',
  'qnfo-ops 2.48.1 FLEET-CENSUS-BINDINGS-1: fleetStatus reads /health through the binding first (probe binding:<name>)',
  'fm-fleet-census-blind: the latest binding-census journey passed', 'fm-fleet-census-blind', '2026-10-13',
  '11 of 28 rows healthy:null, error cf-1042-no-published-route', 'the census and every consumer of /fleet cannot tell a down worker from a blind probe');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status) VALUES
 ('fm-registry-version-sweep-regex', NULL, 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector',
  'SELECT ''ok'' AS expected, COALESCE((SELECT status FROM cloud_ops_events WHERE kind = ''fleet-journey'' AND id LIKE ''fleet-journey-deploy-coherence-%'' ORDER BY ts DESC LIMIT 1), ''none'') AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active'),
 ('fm-fleet-census-blind', NULL, 'FAILURE-MODE-DETECTOR-OWN-1', 'failure-mode detector',
  'SELECT ''ok'' AS expected, COALESCE((SELECT status FROM cloud_ops_events WHERE kind = ''fleet-journey'' AND id LIKE ''fleet-journey-binding-census-%'' ORDER BY ts DESC LIMIT 1), ''none'') AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('run end-to-end multi-worker journeys and self-file each failing one', 'FLEET-JOURNEYS-1 (scripts/fleet_journeys.py, migrations/2026-10-13-fleet-journeys.sql)', 'remediation-consumer.yml runner; public fleet hosts; qnfo-deploy-guard work-lock API', 'selftest 21 checks; live dry run 2026-10-13 23:40Z found 2 cross-worker defects behind 28 green /health probes', '2026-10-13', '2026-10-13', 'cloud_ops_events kind fleet-journey, metric fleet_journeys_failing');

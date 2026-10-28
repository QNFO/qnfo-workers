-- BP26-LEASES-KILLSWITCH-1 (2026-10-28, charter pillar autonomy; agent_issues 1000361, GitHub 4457; program QNFO.OPS, project BP26.AGENTOPS, session bp26-reliability).
-- WHAT: qnfo-deploy-guard 1.4.0 reads the global kill switch ops_config.fleet_kill_switch (off by default) and refuses new work claims, renewals, deploy leases and secret leases
-- with 503 reason kill-switch while it is on; every fresh work claim takes the next fence number for its path (work_claims.fence) and POST /work-lock/check validates token plus fence.
-- cf-ops-actions action kill-switch-drill (scripts/cf_ops_actions.py) exercises it live and appends kill_switch_tests rows, which is what metric kill_switch_test_age_days reads.
-- The other loops adopt the flag one by one (roadmap rows below); the drill reports the readers it covered and the ones still pending.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'fleet_kill_switch'; DELETE FROM roadmap_implementation WHERE item LIKE 'BP26-LEASES-KILLSWITCH-1%' OR item LIKE 'ROADMAP-1: QNFO.OPS BP26-KILLSWITCH-%'; DELETE FROM decision_log WHERE action LIKE 'BP26-LEASES-KILLSWITCH-1:%';

ALTER TABLE work_claims ADD COLUMN fence INTEGER;

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('fleet_kill_switch', 'off', 'BP26-LEASES-KILLSWITCH-1: global kill switch. on = no new claim, deploy, secret write or other side effect starts in a worker that reads it; off = normal. Flip it only through the kill-switch-drill action or an incident (docs/KILL-SWITCH-DRILL.md); revert is setting it to off.');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'BP26-LEASES-KILLSWITCH-1', 'bp26-catalogue', 'Kill switch read by qnfo-deploy-guard, fencing tokens on work claims, live drill action', 'code', 'qnfo-deploy-guard/worker.js; scripts/cf_ops_actions.py kill_switch_drill; docs/LEASES-FENCING.md', 'implemented',
  'qnfo-deploy-guard/kill-switch-fence.test.mjs (24 checks) and scripts/cf_ops_killswitch_test.py pass; a live drill row in kill_switch_tests with mode live outcome pass is the closing evidence'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'BP26-LEASES-KILLSWITCH-1');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'ROADMAP-1: QNFO.OPS BP26-KILLSWITCH-READERS-1', 'bp26-catalogue', 'qnfo-fleet-control tick, qnfo-code-orchestrator, qnfo-ops, qnfo-social, qnfo-email-orchestrator, qnfo-research-exec, qnfo-cloud-ops and qnfo-github-steward read fleet_kill_switch and stop new side effects at the next step boundary', 'code', 'qnfo-fleet-control/worker.js', 'planned',
  'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js; one worker per change, each added to KS_READERS in scripts/cf_ops_actions.py with the change that teaches it the flag; serves charter pillar autonomy; moves kill_switch coverage toward every loop'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'ROADMAP-1: QNFO.OPS BP26-KILLSWITCH-READERS-1');

INSERT INTO roadmap_implementation (item, source, title, artifact_type, artifact_ref, status, evidence)
SELECT 'ROADMAP-1: QNFO.OPS BP26-KILLSWITCH-CAPS-1', 'bp26-catalogue', 'Per-iteration caps (steps, tokens, wall-clock, EUR) and a circuit breaker that pauses a loop after N consecutive failures and files an agent_issue', 'code', 'qnfo-code-orchestrator/worker.js', 'planned',
  'code-task: repo=qnfo-workers path=qnfo-code-orchestrator/worker.js; serves charter pillar autonomy; existing: LOOP-BREAKER-1 (signature repeats), fleet_budget caps, code-loop per-tick budget'
WHERE NOT EXISTS (SELECT 1 FROM roadmap_implementation WHERE item = 'ROADMAP-1: QNFO.OPS BP26-KILLSWITCH-CAPS-1');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-bp26-reliability',
  'qnfo-deploy-guard is the one chokepoint every deploy, secret write and session claim passes, so a kill switch read there stops the highest-blast-radius side effects first; a drill that names its covered and pending readers is honest where one that claims every loop is not',
  'BP26-LEASES-KILLSWITCH-1: qnfo-deploy-guard 1.4.0 kill switch and fencing, work_claims.fence, ops_config.fleet_kill_switch (off), kill-switch-drill action',
  'docs/KILL-SWITCH-DRILL.md state read 2026-10-26: no global switch existed; kill_switch_test_age_days unmeasured; offline suites 24 + 6 checks pass',
  'applied by migration and the canonical deploy of qnfo-deploy-guard; the switch is off', 'while on, no deploy, secret write or session claim starts (releases, reads and the sweep continue); the drill holds it on for at most 10 minutes',
  'set ops_config fleet_kill_switch to off; delete the migration rows; revert qnfo-deploy-guard to 1.3.34', 'a tested global stop for deploys, secrets and claims; fencing tokens to reject a writer that lost its lease',
  'kill_switch_test_age_days is measured (about 0 days) after the first live drill row; orphaned_leases stays 0',
  'none directly; it bounds the damage of a runaway loop', 'offline suites; live drill recorded on the issue'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'BP26-LEASES-KILLSWITCH-1:%');

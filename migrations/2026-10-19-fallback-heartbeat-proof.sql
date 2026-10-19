-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_single_heartbeat_probe b WHERE b.class = 'fm-single-heartbeat') WHERE class = 'fm-single-heartbeat'
-- spof-review: none added; this makes the second heartbeat producer observable, which is what keeps it a real alternate path
--
-- FALLBACK-HEARTBEAT-PROOF-1 (2026-10-19, pillar autonomy; owner directive 2026-10-19 on failure modes of the fleet's own loops).
-- fm-single-heartbeat passes only while BOTH fleet_tick producers wrote a row in 24 hours. The fallback (qnfo-fleet-dashboard */15)
-- inserts only when the primary (qnfo-code-orchestrator) missed the last 9 minutes, so on a healthy day it writes nothing: its last
-- row was 2026-10-18T10:00Z, and the detector was due to fail at 10:00Z today with both producers fine (a false alarm that files an
-- issue and spends a loop on nothing). qnfo-fleet-dashboard 1.44.7 now writes fleet_heartbeat each run with ok = whether the guarded
-- insert executed; the detector accepts that row (ok 1, under 30 minutes old) as proof the fallback is alive, as well as a tick.

CREATE TABLE IF NOT EXISTS bak_20261019_single_heartbeat_probe AS
  SELECT class, verify_probe FROM remediation_contracts WHERE class = 'fm-single-heartbeat';

UPDATE remediation_contracts SET verify_probe = replace(verify_probe,
    'AND EXISTS (SELECT 1 FROM fleet_tick WHERE source = ''cron:qnfo-fleet-dashboard'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours''))',
    'AND (EXISTS (SELECT 1 FROM fleet_tick WHERE source = ''cron:qnfo-fleet-dashboard'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) OR EXISTS (SELECT 1 FROM fleet_heartbeat WHERE worker = ''qnfo-fleet-dashboard'' AND ok = 1 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')))')
WHERE class = 'fm-single-heartbeat' AND instr(verify_probe, 'fleet_heartbeat') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01X81kqL6v2eFPmyL3JayV1i',
  'a fallback producer that ran cleanly in the last 30 minutes is alive even when it had nothing to insert',
  'FALLBACK-HEARTBEAT-PROOF-1: fm-single-heartbeat accepts a fresh ok fleet_heartbeat row from qnfo-fleet-dashboard as proof of the second producer',
  'qnfo-audit 2026-10-19 05:50Z: last cron:qnfo-fleet-dashboard fleet_tick 2026-10-18T10:00Z, every slot since 14:40Z covered by the primary, the dashboard writes no other run marker',
  'migration merged', 'one detector probe text', 'the Rollback header',
  'the heartbeat detector separates an idle fallback from a dead one',
  'fm-single-heartbeat keeps passing after 2026-10-19 10:00Z while both producers run',
  'none', 'd1:qnfo-audit fleet_tick, fleet_heartbeat, remediation_contracts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'FALLBACK-HEARTBEAT-PROOF-1:') = 1);

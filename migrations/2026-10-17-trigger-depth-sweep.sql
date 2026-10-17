-- TRIGGER-DEPTH-SWEEP-1 (2026-10-17, owner directive "ALL SWEEPS SHALL BE SCHEDULED FOR PERIODIC
-- FAILURE-MODE/ROOT-CAUSE AUTOMATIC AUDITS AND REMEDIATION AND SYSTEMWIDE").
-- APPLY-BY: ci
-- DB: qnfo-audit
-- The trigger-depth deadlock (agent_issues 10 self-updating timestamp triggers -> remediation_verifications
-- writes refused with "triggers nested too deep", 7500) stalled the self-heal loop 14:40Z until the 20:20Z
-- consolidation. The lagging detector fm-trigger-depth only checked fleet_tick/cron_fire_log recency and fired
-- only after the loop was already dead. This file registers the PROACTIVE sweep as a first-class failure mode
-- with its own verification class, so scripts/trigger_depth_sweep.py's periodic run is tracked, metered and
-- re-opened like every other contract.
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-trigger-depth-compile';
--           DELETE FROM failure_modes WHERE fm_key = 'trigger-depth-compile';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius) VALUES
 ('trigger-depth-compile', 'a table write is refused with "triggers nested too deep" (7500)', 'D1 limits trigger nesting to 10 levels counted at compile time; self-updating triggers count, so a regrown trigger graph wedges every write on the chain', 'consolidate or drop the self-updating triggers on the named table (see migration 2026-10-17-consolidate-agent-issues-ts-triggers.sql)', 'scripts/trigger_depth_sweep.py runs the zero-row INSERT/UPDATE/DELETE probes across every table each cadence and files a deduped issue on the first refusal', 'fm-trigger-depth-compile', '2026-10-17', 'a new self-updating trigger lands anywhere upstream of a deep chain', 'remediation_verifications, deployment_history or another chained write fails with 7500', 'every write on the affected table and its downstream chain');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-trigger-depth-compile', NULL, 'a self-updating trigger lands anywhere upstream of a deep chain', 'scripts/trigger_depth_sweep.py files a deduped issue and the code loop consolidates the named table triggers', 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM remediation_verifications WHERE class=''fm-trigger-depth-compile'' AND verified_at > datetime(''now'',''-25 minutes'') AND pass=1) > 0 THEN ''ok'' ELSE ''stale-or-failing'' END AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

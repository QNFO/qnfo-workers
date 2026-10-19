-- REOPEN-LIVE-PATH-2 (2026-10-19, pillar autonomy; agent_issues 100270, successor of REOPEN-LIVE-PATH-1, migrations/2026-10-19-reopen-live-path.sql).
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19 19:4xZ by session_01QpQv19, re-read 22:0xZ by session_01JADz8u)
--   contract_probe_templates_v3_generic (CLOSE-PROBE-CIRCULAR-1) supersedes the birth contract of every issue whose source is not itself the name of a live
--   service, and its WHEN clause does not read issue_source_hosts, so the loop-owned template (contract_probe_templates_loop_merged, which parks the contract as
--   monitoring:loop-owned-48h) never sees an issue filed under a mapped loop label: v3 is the newest trigger and fires first, and the loop_merged UPDATE then
--   finds the row no longer needs-machine-probe. qnfo-fleet-advisor is mapped and still claimed by v3 (issue 100151 holds a v3-superseded contract); chaos-drill and
--   fleet-journeys, filed by qnfo-fleet-control, are not mapped at all (100247 and 100248 were born superseded, 100161 and 100166 likewise).
--   A loop-owned park is true only when the loop closes its own issue. Verified in code on main and on closed rows (2026-10-19 20:1xZ):
--     chaos-drill     the chaos drill pass of qnfo-fleet-control closes CHAOS-DRILL-FAILED-1 when the alternate's probe passes again (close evidence CHAOS-DRILL-1);
--     fleet-journeys  journeyTick in qnfo-fleet-control and scripts/fleet_journeys.py close FLEET-JOURNEY-FAILED-1 with close_channel auto-recovery on the first run in
--                     which the journey passes every step (100161 and 100166 were closed that way at 20:00Z);
--     qnfo-fleet-advisor (already mapped) qnfo-backlog-exec closes a MODEL-DEGRADED issue when none of its named models is degraded.
--   NOT verified, so neither mapped nor parked here: cf-model-eval (qnfo-model-eval files an issue and has no code that closes one) and the [ai-cal] model-probe copies in
--   agent_issues (source NULL; their writer is not known). Any other label is treated the same until its closer is read in code or shown on a closed row.
--
-- WHAT THIS CHANGES
--   1. issue_source_hosts gets chaos-drill and fleet-journeys, each to qnfo-fleet-control (live in service_registry).
--   2. contract_probe_templates_v3_generic is dropped and re-created last (it stays the newest trigger, so it still fires first: the ORDER TRAP of
--      migrations/2026-10-19-loop-owned-contract-monitoring.sql) with one more condition: NOT EXISTS (an issue whose source maps through issue_source_hosts to a live
--      service). A mapped label is left to loop_merged, whose contract is born monitoring:loop-owned-48h, a state the dead-end detector already skips. The body sets the
--      same columns as before (D1-TRIGGER-DEPTH-1: the runner compiles zero-row writes on remediation_contracts and agent_issues after it).
--   3. One guarded UPDATE parks the standing v3-superseded contracts of open issues filed under a mapped label as the loop-owned monitoring state, exactly as the
--      template would have written it (module probe-template-v2c-loop, the owner text and the status-reading probe, so the PARKED-REARM-1 carve-out and
--      fm-loop-owned-contract-circular treat it like any other parked row). It creates no contract that only reads pending.
--   4. control_registry loop-owned-contract-park is updated (the v3 change is a filter, DOCTRINE-1): location and evidence name this change and the closer verified per label.
--
-- WHAT STAYS REPORTED
--   The issue itself is untouched: v_issue_age, issues_open_over_120m and the 120-minute escalation read agent_issues. 100247 and 100248 hold the measuring probes written
--   on 2026-10-19 21:2xZ (active, pending until the 00:00Z drill), which this file does not touch; 2679 holds an active v3 contract that is not superseded.
--
-- Backups: bak_20261019_reopen_path2_triggers (the v3 trigger text), bak_20261019_reopen_path2_contracts (every row step 3 moves), bak_20261019_reopen_path2_control
--   (the control_registry row). The Rollback line restores them. Applying DROP and CREATE TRIGGER on remediation_contracts follows migration_runs 299 and the loop-owned
--   migration: the runner snapshots both and restores them if its depth canary refuses the new text, which is no deeper than before.
-- spof-review: the trigger is the first path and the hourly red-drain park of LOOP-OWNED-CONTRACT-MONITORING-1 the second for a row born active; a mapped label whose loop stops
--   closing its issues is reported by issues_open_over_120m and the SLA-120M-2 escalation, and removing its issue_source_hosts row returns the label to v3.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_reopen_path2_triggers
-- Rollback: DROP TRIGGER IF EXISTS contract_probe_templates_v3_generic; CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-TRIGGER-%') AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live' WHERE a.id = NEW.issue_id) BEGIN UPDATE remediation_contracts SET status = 'superseded', verify_transport = 'd1-query', module = 'probe-template-v3-generic', attempts = 0, last_verdict = 'superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: this template observes the guarded issue status, which issue_close_evidence_required only lets change after a close that the same probe blocks; a doer that knows the defect replaces it with a probe that measures it)', next_due_at = NULL, precondition = 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)', action = 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.', verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || NEW.issue_id || ') AS observed' WHERE class = NEW.class AND status = 'needs-machine-probe'; END; DELETE FROM issue_source_hosts WHERE source IN ('chaos-drill', 'fleet-journeys'); UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261019_reopen_path2_contracts b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261019_reopen_path2_contracts b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261019_reopen_path2_contracts b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261019_reopen_path2_contracts b WHERE b.class = remediation_contracts.class), precondition = (SELECT b.precondition FROM bak_20261019_reopen_path2_contracts b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261019_reopen_path2_contracts b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261019_reopen_path2_contracts b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261019_reopen_path2_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_reopen_path2_contracts); UPDATE control_registry SET location = (SELECT b.location FROM bak_20261019_reopen_path2_control b), evidence = (SELECT b.evidence FROM bak_20261019_reopen_path2_control b) WHERE control = 'loop-owned-contract-park' AND EXISTS (SELECT 1 FROM bak_20261019_reopen_path2_control);

INSERT OR IGNORE INTO issue_source_hosts (source, host, note) VALUES
 ('chaos-drill', 'qnfo-fleet-control', 'REOPEN-LIVE-PATH-2: the chaos drill pass of qnfo-fleet-control closes CHAOS-DRILL-FAILED-1 when the alternate probe passes again (close evidence CHAOS-DRILL-1)'),
 ('fleet-journeys', 'qnfo-fleet-control', 'REOPEN-LIVE-PATH-2: journeyTick in qnfo-fleet-control and scripts/fleet_journeys.py close FLEET-JOURNEY-FAILED-1 with close_channel auto-recovery on the first run in which the journey passes every step');

CREATE TABLE IF NOT EXISTS bak_20261019_reopen_path2_triggers AS
  SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name = 'contract_probe_templates_v3_generic';

CREATE TABLE IF NOT EXISTS bak_20261019_reopen_path2_contracts AS
  SELECT * FROM remediation_contracts
   WHERE status = 'superseded' AND module = 'probe-template-v3-generic' AND issue_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source JOIN service_registry s ON s.service = m.host AND s.state = 'live' WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%');

CREATE TABLE IF NOT EXISTS bak_20261019_reopen_path2_control AS
  SELECT * FROM control_registry WHERE control = 'loop-owned-contract-park';

DROP TRIGGER IF EXISTS contract_probe_templates_v3_generic;

-- Re-created LAST so it is the newest trigger and fires first again.
CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-TRIGGER-%')
  AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live'
                   WHERE a.id = NEW.issue_id)
  AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source
                    JOIN service_registry s ON s.service = m.host AND s.state = 'live'
                   WHERE a.id = NEW.issue_id)
BEGIN
  UPDATE remediation_contracts
  SET status = 'superseded', verify_transport = 'd1-query', module = 'probe-template-v3-generic', attempts = 0,
      last_verdict = 'superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: this template observes the guarded issue status, which issue_close_evidence_required only lets change after a close that the same probe blocks; a doer that knows the defect replaces it with a probe that measures it)',
      next_due_at = NULL,
      precondition = 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)',
      action = 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.',
      verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || NEW.issue_id || ') AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

UPDATE remediation_contracts
   SET status = 'monitoring', verify_transport = 'd1-query', attempts = 0,
       last_verdict = 'monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)',
       next_due_at = NULL,
       action = 'LOOP-OWNED-CONTRACT-MONITORING-1: the filing loop closes this issue on recovery. This contract is parked as monitoring and is not probed, so it cannot block that close (close-while-contract-fails). The 120-minute issue SLA (issues_open_over_120m) and the stale views still report the open issue.',
       module = 'probe-template-v2c-loop',
       precondition = 'filed by a fleet loop under a mapped label (LOOP-SOURCE-HOSTS-1), which owns it for 48h',
       verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || remediation_contracts.issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || remediation_contracts.issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = remediation_contracts.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = remediation_contracts.issue_id) || ' did not close it within 48h'' END AS observed'
 WHERE status = 'superseded' AND module = 'probe-template-v3-generic' AND issue_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source JOIN service_registry s ON s.service = m.host AND s.state = 'live' WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%');

UPDATE control_registry
   SET location = location || '; D1 trigger contract_probe_templates_v3_generic (REOPEN-LIVE-PATH-2: leaves a source mapped in issue_source_hosts to the loop-owned template) and the park of the standing v3-superseded contracts of mapped labels',
       evidence = evidence || ' REOPEN-LIVE-PATH-2 (2026-10-19, issue 100270): chaos-drill and fleet-journeys mapped to qnfo-fleet-control after their closers were read in code (the chaos drill pass closes CHAOS-DRILL-FAILED-1; journeyTick and scripts/fleet_journeys.py close FLEET-JOURNEY-FAILED-1 with close_channel auto-recovery, 100161 and 100166 closed that way at 20:00Z); cf-model-eval and the [ai-cal] rows stay with v3 until a closer is shown.'
 WHERE control = 'loop-owned-contract-park' AND instr(location, 'REOPEN-LIVE-PATH-2') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'an issue filed by a loop that closes its own issue on recovery must not be born with a contract that only the close can satisfy, and a label counts as loop-owned only when its closer is read in code or on a closed row',
  'REOPEN-LIVE-PATH-2: chaos-drill and fleet-journeys mapped in issue_source_hosts, contract_probe_templates_v3_generic leaves a mapped source to the loop-owned template, the standing v3-superseded contracts of open issues under a mapped label are parked as loop-owned monitoring',
  'qnfo-audit 2026-10-19: 100151 (qnfo-fleet-advisor, mapped) holds a v3-superseded contract; 100247 and 100248 (chaos-drill) and 100161 and 100166 (fleet-journeys) were born superseded; closers read in qnfo-fleet-control (chaos drill pass, journeyTick) and scripts/fleet_journeys.py, 100161 and 100166 closed by close_channel auto-recovery at 20:00Z; migrations/reopen-live-path-2.test.mjs replays the loop-owned migration on SQLite',
  'migration merged',
  'the v3 birth trigger on remediation_contracts, two issue_source_hosts rows, the standing superseded contracts of open issues under a mapped label (one today), one control_registry row; no worker changed',
  'the Rollback header of migrations/2026-10-19-reopen-live-path-2.sql (from the three bak_20261019_reopen_path2_* tables)',
  'a loop-filed issue under a verified label is born loop-owned and the filing loop closes it without a probe author',
  'issues_without_next_action <= 63 within 12 h',
  'none',
  'd1:qnfo-audit read-only (sqlite_master trigger texts, remediation_contracts, issue_source_hosts, service_registry, closed rows of chaos-drill and fleet-journeys issues), node:sqlite fixtures in migrations/reopen-live-path-2.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REOPEN-LIVE-PATH-2:') = 1);

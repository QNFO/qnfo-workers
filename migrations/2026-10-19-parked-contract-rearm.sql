-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks_canonical SET definition = (SELECT b.definition FROM bak_20261019_parked_rearm_task b WHERE b.id = 'red-drain') WHERE id = 'red-drain'; UPDATE fleet_tasks SET definition = (SELECT b.definition FROM bak_20261019_parked_rearm_task b WHERE b.id = 'red-drain'), version = (SELECT b.version FROM bak_20261019_parked_rearm_task b WHERE b.id = 'red-drain') WHERE id = 'red-drain'; UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261019_parked_rearm_contracts b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261019_parked_rearm_contracts b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261019_parked_rearm_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_parked_rearm_contracts)
-- spof-review: removes a single point of failure (one hourly sweep could switch off the only probe of an open issue and every failure-mode detector it touched); adds none
--
-- PARKED-REARM-1 (2026-10-19, pillar autonomy; owner directive 2026-10-19 "DO ANY ISSUES AFFECT FLEET'S OWN LOOPS? AUDIT, RESOLVE, AND
-- REMEDIATE ALL SUCH FAILURE MODES AND THEIR ROOT CAUSES").
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19 05:30-05:45Z)
-- The hourly red-drain workflow (fleet_tasks 'red-drain', cron :35) parks remediation contracts in three states that no prober reads:
--   step 0  superseded:probe-unusable   any active contract whose last verdict was probe-error (a transient read error included)
--   step 1  monitoring:metric-condition any active contract whose probe reads a metric
--   step 2  escalated:over-retried      any active contract that failed more than 5x max_attempts with no code task in flight
-- The probers (qnfo-fleet-control remediationContractsTick and scripts/remediation_consumer.py) read only active and holding
-- contracts, so a parked contract is never probed again. Two loops lost their input:
--   1. The close loop. 36 open issues (2007, 2008, 2067, 2101, 2111, 2116, 2346, 2379, 2380, 2393, 2507, 2508, 2826, 2827, 99991 ...)
--      had every contract escalated and no probe since 2026-10-18 12:19Z (issue-2111 last verified 11:19Z), and 4 more (1947, 2446,
--      2581, 2922) were parked as monitoring although no recovery loop owns them: only METRIC-TRIGGER issues have one
--      (qnfo-fleet-control TRIGGER-RECOVERY-1). A fix to any of them could never be seen, so none could close, and they fed
--      issues_unprobed_60m (167), issues_open_over_120m and stuck_items_over_sla.
--   2. The failure-mode loop. Steps 0-2 also caught standing detectors: 14 fm-/belief- detectors sat escalated, 12 monitoring and
--      3 superseded at 05:36Z, against DETECTOR-NEVER-PARKS-2 ("a standing detector is never parked").
-- METRIC-TRIGGER issues keep their monitoring park on purpose: TRIGGER-RECOVERY-1 is their one closing owner, and a second
-- evaluator on the same issue is the reopen/re-close oscillation of VERIFICATION-OSCILLATION-1 (agent_issues 2953).
--
-- WHAT THIS CHANGES
--   red-drain steps 0-2   never touch an fm-/belief- standing detector; step 1 parks only contracts of METRIC-TRIGGER issues
--   red-drain step 6      new, PARKED-REARM-1: an escalated or monitoring contract goes back to active (due now) when it is a
--                         standing detector, or when its issue is open, is not a METRIC-TRIGGER issue, has no active or holding
--                         contract and has no verification in the last 50 minutes. The escalation still happens and is still
--                         counted in red_snapshots each hour (step 4 runs first); the contract simply keeps its hourly probe.
--   once, at apply        the same re-arm, so the 36 + 4 issues and 26 detectors are probed on the next ticks
--   failure_modes         parked-contract-unprobed with its fm- detector
-- Backups: bak_20261019_parked_rearm_task (the red-drain row) and bak_20261019_parked_rearm_contracts (every row this file re-arms).

CREATE TABLE IF NOT EXISTS bak_20261019_parked_rearm_task AS SELECT * FROM fleet_tasks WHERE id = 'red-drain';

CREATE TABLE IF NOT EXISTS bak_20261019_parked_rearm_contracts AS
  SELECT * FROM remediation_contracts
   WHERE status IN ('escalated', 'monitoring', 'superseded')
     AND (substr(class, 1, 3) = 'fm-' OR substr(class, 1, 7) = 'belief-'
          OR (status IN ('escalated', 'monitoring') AND issue_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%')));

UPDATE fleet_tasks SET
  definition = json_insert(json_set(json_set(json_set(definition,
    '$.steps[0].sql', 'UPDATE remediation_contracts SET status=''superseded'',
        last_verdict=''superseded:probe-unusable (no machine-executable probe; the issue stays open and needs a real one)'',
        last_attempt_at=datetime(''now'')
      WHERE status IN (''active'',''holding'')
        AND (verify_probe LIKE ''%needs-machine-probe%'' OR COALESCE(last_verdict,'''') IN (''vacuous-probe-result'',''probe-not-machine-executable'',''probe-error''))
        AND substr(class,1,3) <> ''fm-'' AND substr(class,1,7) <> ''belief-'''),
    '$.steps[1].sql', 'UPDATE remediation_contracts SET status=''monitoring'',
        last_verdict=''monitoring:metric-condition (the probe reads a live metric; the card closes when the metric converges, not by retrying)'',
        last_attempt_at=datetime(''now'')
      WHERE status IN (''active'',''holding'')
        AND (verify_probe LIKE ''%metric_registry%'' OR verify_probe LIKE ''%v_metric_trigger_state%'' OR verify_probe LIKE ''%v_metric%'')
        AND substr(class,1,3) <> ''fm-'' AND substr(class,1,7) <> ''belief-''
        AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.title LIKE ''METRIC-TRIGGER-%'')'),
    '$.steps[2].sql', 'UPDATE remediation_contracts SET status=''escalated'',
        last_verdict=''escalated:over-retried (probe re-ran past 5x max_attempts with no code task in flight; parked for RED-DRAIN while the issue stays open)'',
        last_attempt_at=datetime(''now'')
      WHERE status IN (''active'',''holding'') AND last_verdict=''fail'' AND attempts > 5*COALESCE(max_attempts,3)
        AND substr(class,1,3) <> ''fm-'' AND substr(class,1,7) <> ''belief-''
        AND NOT EXISTS (SELECT 1 FROM code_tasks ct WHERE ct.status NOT IN (''closed'',''superseded'') AND ct.goal LIKE ''%#'' || remediation_contracts.issue_id || '' %'')'),
    '$.steps[#]', json_object('type', 'sql', 'db', 'AUDIT', 'sql', 'UPDATE remediation_contracts SET status=''active'', next_due_at=datetime(''now''),
        last_verdict=''rearmed: PARKED-REARM-1 (was '' || substr(COALESCE(last_verdict,''?''),1,60) || ''; an open issue and a standing detector keep an hourly probe)''
      WHERE status IN (''escalated'',''monitoring'')
        AND (substr(class,1,3) = ''fm-'' OR substr(class,1,7) = ''belief-''
             OR (issue_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = ''open'' AND a.title NOT LIKE ''METRIC-TRIGGER-%'')
                 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = remediation_contracts.issue_id AND c2.status IN (''active'',''holding''))
                 AND COALESCE((SELECT replace(substr(MAX(v.verified_at),1,19),''T'','' '') FROM remediation_verifications v WHERE v.class = remediation_contracts.class), ''1970-01-01 00:00:00'') <= datetime(''now'',''-50 minutes'')))')),
  version = version + 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'red-drain' AND type = 'workflow' AND json_array_length(definition, '$.steps') = 6
  AND instr(json_extract(definition, '$.steps[2].sql'), 'escalated:over-retried') > 0
  AND instr(definition, 'PARKED-REARM-1') = 0;

-- The drift gate (fleet_tasks 'fleet-tasks-drift-gate', issue 1669) files WORKFLOW-DEFINITION-DRIFT when fleet_tasks differs from
-- fleet_tasks_canonical, so the canonical row moves with the live one, and only when it matched the definition this file replaced.
UPDATE fleet_tasks_canonical SET
  definition = (SELECT t.definition FROM fleet_tasks t WHERE t.id = 'red-drain'),
  repo_path = 'migrations/2026-10-19-parked-contract-rearm.sql',
  exported_at = datetime('now')
WHERE id = 'red-drain'
  AND definition = (SELECT b.definition FROM bak_20261019_parked_rearm_task b WHERE b.id = 'red-drain')
  AND instr((SELECT t.definition FROM fleet_tasks t WHERE t.id = 'red-drain'), 'PARKED-REARM-1') > 0;

UPDATE remediation_contracts SET status = 'active', next_due_at = datetime('now'),
       last_verdict = 'rearmed: PARKED-REARM-1 (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || '; an open issue and a standing detector keep an hourly probe)'
 WHERE class IN (SELECT class FROM bak_20261019_parked_rearm_contracts)
   AND status IN ('escalated', 'monitoring')
   AND (substr(class, 1, 3) = 'fm-' OR substr(class, 1, 7) = 'belief-'
        OR NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = remediation_contracts.issue_id AND c2.status IN ('active', 'holding')));

UPDATE remediation_contracts SET status = 'active', next_due_at = datetime('now'),
       last_verdict = 'rearmed: PARKED-REARM-1 (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || '; a standing detector is never parked)'
 WHERE class IN (SELECT class FROM bak_20261019_parked_rearm_contracts)
   AND status = 'superseded' AND last_verdict LIKE 'superseded:probe-unusable%' AND COALESCE(verify_transport, '') <> 'agent-runtime'
   AND (substr(class, 1, 3) = 'fm-' OR substr(class, 1, 7) = 'belief-');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('parked-contract-unprobed',
  'an hourly sweep parks the only probing contract of an open issue (or a standing detector) in a state no prober reads, so a fix is never seen and the issue can never close',
  'red-drain steps 0-2 moved active contracts to superseded, monitoring or escalated with no exit; qnfo-fleet-control and remediation_consumer.py probe only active and holding contracts',
  'PARKED-REARM-1 (migrations/2026-10-19-parked-contract-rearm.sql): red-drain never parks fm-/belief- detectors, parks metric contracts only for METRIC-TRIGGER issues (TRIGGER-RECOVERY-1 owns them), and re-arms any other parked contract of an open issue that has no live contract and no verification in 50 minutes',
  'no open non-METRIC-TRIGGER issue whose contracts are all escalated or monitoring has gone 130 minutes without a verification, and no fm-/belief- detector is escalated or monitoring',
  'fm-parked-contract-unprobed', '2026-10-19', NULL,
  'red-drain parks a contract of an open issue or a detector',
  '2026-10-18 12:19Z to 2026-10-19 05:45Z: 36 open issues escalated and 4 monitoring with no probe; 29 fm-/belief- detectors parked',
  'the issue close loop for every parked issue, the failure-mode and belief detectors, issues_unprobed_60m and the 120-minute SLA metrics');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-parked-contract-unprobed', NULL, 'PARKED-REARM-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND a.title NOT LIKE ''METRIC-TRIGGER-%'' AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''escalated'', ''monitoring'')) AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN (''active'', ''holding'')) AND NOT EXISTS (SELECT 1 FROM remediation_verifications v WHERE v.issue_id = a.id AND replace(substr(v.verified_at, 1, 19), ''T'', '' '') > datetime(''now'', ''-130 minutes''))) + (SELECT COUNT(*) FROM remediation_contracts WHERE status IN (''escalated'', ''monitoring'') AND (substr(class, 1, 3) = ''fm-'' OR substr(class, 1, 7) = ''belief-'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01X81kqL6v2eFPmyL3JayV1i',
  'an open issue that is not owned by TRIGGER-RECOVERY-1 needs one probing contract at all times, and a standing detector is never parked',
  'PARKED-REARM-1: red-drain stops parking fm-/belief- detectors and non-METRIC-TRIGGER metric contracts, and re-arms parked contracts of open issues hourly',
  'qnfo-audit 2026-10-19 05:43Z: issue-2111 and issue-2067 escalated since 2026-10-18 12:19:35Z, last verified 11:19Z and 11:21Z; 36 open issues with only escalated contracts, 4 non-METRIC-TRIGGER issues with only monitoring ones; 29 fm-/belief- detectors parked',
  'migration merged', 'red-drain steps 0-2 and one new step; the re-armed contract rows (status, verdict, due time)', 'the Rollback header (from the two bak_20261019_parked_rearm_* tables)',
  'the close loop and the failure-mode loop see every open issue and detector again',
  'fm-parked-contract-unprobed reads 0 within 130 minutes of the apply and issues_unprobed_60m falls below its 05:28Z value of 167 within 120 minutes',
  'none', 'd1:qnfo-audit fleet_tasks, remediation_contracts, remediation_verifications, fleet_runs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PARKED-REARM-1:') = 1);

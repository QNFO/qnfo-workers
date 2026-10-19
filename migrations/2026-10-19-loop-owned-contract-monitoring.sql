-- LOOP-OWNED-CONTRACT-MONITORING-1 (2026-10-19, pillar autonomy; verification-machinery cluster, issues 2694, 2826, 2880, 2881, 2953, 2954).
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19 12:26Z)
--   The birth template for an issue filed by a live fleet loop (D1 trigger contract_probe_templates_loop_merged, same text in
--   migrations/2026-10-18-collapse-probe-templates.sql) wrote an ACTIVE contract whose probe reads the status of its own issue:
--       SELECT 'ok' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = N) <> 'open' THEN 'ok'
--              WHEN <filed under 48h ago> THEN 'pending: ...' ELSE 'stale: the filing loop X did not close it within 48h' END AS observed
--   That probe can pass only after the issue is closed, and issue_close_evidence_required (CLOSE-BINDS-TO-PROBE-1) aborts a close with
--   close-while-contract-fails while an active or holding contract of the issue reads fail. The consumer stamps a pending read as fail
--   and the stale branch is a fail, so the loop that filed the issue could not close it by any evidence: 27 such contracts on open
--   issues at 12:26Z (24 reading fail, 3 deferred; the cluster read of 11:50Z had 26 with 19 fail), among them 2694, 2826, 2880 and
--   2881, and the template files one or two more every hour. 2953 and 2954 count them in the verification-failure and no-live-path
--   measures.
--   Re-measured 2026-10-19T14:5xZ before landing (package LA): 30 such contracts on open issues (24 last_verdict fail, 6 deferred), all module
--   probe-template-v2d-loop; issues 2694, 2826, 2880, 2881 are among them and none of the six cluster issues has close_evidence yet. Live trigger texts
--   contract_probe_templates_loop_merged (4483 characters) and contract_probe_templates_v3_generic (1498) are byte-identical to the Rollback line below,
--   and the red-drain row (fleet_tasks version 5, equal to fleet_tasks_canonical) takes the step-6 edit and the new last step (read-only dry run of the
--   json_set/json_insert expression: valid JSON, 8 steps, both edits carry the marker).
--
-- WHAT THIS CHANGES
--   1. contract_probe_templates_loop_merged is re-created so a loop-owned contract is born status monitoring with last_verdict
--      monitoring:loop-owned-48h. The probe text, module and precondition are unchanged, so the row still says who owns the issue;
--      the probers read only active and holding contracts, and issue_close_evidence_required checks only those two, so the park
--      cannot block the close. The WHEN clause is the one the collapse migration wrote, byte for byte.
--   2. contract_probe_templates_v3_generic is dropped and re-created right after it with its live text (CLOSE-PROBE-CIRCULAR-1, born
--      superseded). SQLite fires AFTER triggers newest first, and a re-created loop_merged would otherwise fire before v3 and take the
--      issues v3 claims (the ORDER TRAP of the collapse migration). A test asserts that v3 keeps an unmapped label.
--   3. The standing circular contracts of open issues (status active or holding, module probe-template-v2*-loop, probe reading
--      SELECT status FROM agent_issues WHERE id =) move to the same parked state. A contract whose module carries the label but
--      whose probe measures something else (issues 2158 and 2323 read the improvement loop) is not touched.
--   4. PARKED-REARM-1 (red-drain step 6, migrations/2026-10-19-parked-contract-rearm.sql) would undo step 3 within the hour: it sets an
--      escalated or monitoring contract of an open issue back to active when the issue has no active or holding contract and the
--      contract has no verification for 50 minutes, and a parked contract is never probed. The step now skips the circular
--      loop-owned template (marker LOOP-OWNED-CONTRACT-MONITORING-1 in the step), and a new last step of red-drain re-runs the park
--      of step 3 every hour, so a birth the trigger missed or a producer that re-creates the old trigger text is repaired without
--      a deploy. The detector fm-parked-contract-unprobed counted exactly these issues (open, only monitoring contracts, no
--      verification for 130 minutes) and would have read 27 and filed an issue; it now ignores the same template.
--   5. (added at landing) the detector fm-open-issue-no-doer (DEAD-END-DOER-1, migrations/2026-10-19-contract-dead-end-doer.sql) counts every open issue
--      older than 120 minutes with no active or holding contract and states, in its own header, that loop-filed issues under the 48 h template are not dead ends. A
--      parked loop-owned contract would have made 30 of them dead ends (33 to 63 on 2026-10-19T14:5xZ) and named a probe author as the next actor, which is wrong:
--      the filing loop owns them. The detector probe now skips an issue whose newest contract is the parked loop-owned one (monitoring:loop-owned-48h); it is a
--      guarded UPDATE of the one detector row, applied only when the probe still has its text of 2026-10-19, with the old text in the Rollback line.
--   6. failure mode loop-owned-contract-circular with detector fm-loop-owned-contract-circular (active or holding contracts of open
--      issues whose probe reads the status of their own issue, expected 0), control_registry row loop-owned-contract-park and a
--      decision_log row.
--
-- WHAT STAYS REPORTED (nothing is dropped silently)
--   The issue itself is untouched: v_issue_age, issues_open_over_120m, the 120-minute escalation of SLA-120M-2 and the daily
--   priority bump read agent_issues and not its contracts. A parked issue now also counts in issues_unprobed_60m and in
--   issues_without_doer_3h (open over 120 minutes, no active probe, no code task), which is the honest state: the old contract
--   produced a verdict only to block its own close. The 48h stale read is retired with the probe; a second age threshold in days
--   would break the 120-minute rule of QUEUE-SLA-1. The park ends when the issue closes. A contract of a closed issue stays
--   monitoring and is never probed.
--
-- Backups: bak_20261019_loop_owned_triggers (the two trigger texts), bak_20261019_loop_owned_contracts (every row step 3 moves and
--   the detector row of step 4), bak_20261019_loop_owned_task (the red-drain row). The Rollback line below restores them.
-- Not applied by hand. Applying DROP and CREATE TRIGGER on remediation_contracts follows the collapse migration (migration_runs 299);
--   the runner snapshots both triggers first (D1-TRIGGER-DEPTH-RESTORE-1) and restores them if its depth canary refuses the new text,
--   which cannot be deeper than before because the UPDATE sets the same columns. The hand-applied note in
--   migrations/2026-10-19-close-probe-generator.sql predates that restore.
-- spof-review: the birth trigger is the first path and the hourly red-drain park of step 3 is the second; fm-loop-owned-contract-circular
--   reports any circular contract that is active again, and the filing loop or a session can always close an issue with close_evidence.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_loop_owned_triggers
-- Rollback: DROP TRIGGER IF EXISTS contract_probe_templates_loop_merged; CREATE TRIGGER contract_probe_templates_loop_merged AFTER INSERT ON remediation_contracts WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL AND (EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%' AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%' AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%' AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%' AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source)) OR EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source JOIN service_registry s ON s.service = m.host AND s.state = 'live' WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%') OR EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.state = 'live' AND instr(a.source, s.service || '-') = 1 WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%') OR EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live' WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')) BEGIN UPDATE remediation_contracts SET status = 'active', verify_transport = 'd1-query', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), action = 'the filing loop closes it on recovery; after 48h open the probe fails and the remediation tick escalates', module = CASE WHEN EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%' AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%' AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%' AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%' AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source)) THEN 'probe-template-v2d-loop' WHEN EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source JOIN service_registry s ON s.service = m.host AND s.state = 'live' WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%') THEN 'probe-template-v2c-loop' ELSE 'probe-template-v2-loop' END, precondition = CASE WHEN EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%' AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%' AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%' AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%' AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source)) THEN 'filed by a fleet loop under an unmapped label (ORPHAN-GUARD-BIRTH-1c), which owns it for 48h' WHEN EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source JOIN service_registry s ON s.service = m.host AND s.state = 'live' WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%') THEN 'filed by a fleet loop under a mapped label (LOOP-SOURCE-HOSTS-1), which owns it for 48h' ELSE 'filed by a live fleet loop, which owns it for 48h (ORPHAN-GUARD-BIRTH-1)' END, verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || NEW.issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || NEW.issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ' did not close it within 48h'' END AS observed' WHERE class = NEW.class AND status = 'needs-machine-probe'; END; DROP TRIGGER IF EXISTS contract_probe_templates_v3_generic; CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-TRIGGER-%') AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live' WHERE a.id = NEW.issue_id) BEGIN UPDATE remediation_contracts SET status = 'superseded', verify_transport = 'd1-query', module = 'probe-template-v3-generic', attempts = 0, last_verdict = 'superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: this template observes the guarded issue status, which issue_close_evidence_required only lets change after a close that the same probe blocks; a doer that knows the defect replaces it with a probe that measures it)', next_due_at = NULL, precondition = 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)', action = 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.', verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || NEW.issue_id || ') AS observed' WHERE class = NEW.class AND status = 'needs-machine-probe'; END; UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261019_loop_owned_contracts b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261019_loop_owned_contracts b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261019_loop_owned_contracts b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261019_loop_owned_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_loop_owned_contracts WHERE class <> 'fm-parked-contract-unprobed'); UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_loop_owned_contracts b WHERE b.class = 'fm-parked-contract-unprobed') WHERE class = 'fm-parked-contract-unprobed' AND EXISTS (SELECT 1 FROM bak_20261019_loop_owned_contracts b WHERE b.class = 'fm-parked-contract-unprobed'); UPDATE fleet_tasks SET definition = (SELECT b.definition FROM bak_20261019_loop_owned_task b WHERE b.id = 'red-drain'), version = (SELECT b.version FROM bak_20261019_loop_owned_task b WHERE b.id = 'red-drain') WHERE id = 'red-drain' AND instr(definition, 'LOOP-OWNED-CONTRACT-MONITORING-1') > 0; UPDATE fleet_tasks_canonical SET definition = (SELECT b.definition FROM bak_20261019_loop_owned_task b WHERE b.id = 'red-drain') WHERE id = 'red-drain' AND instr(definition, 'LOOP-OWNED-CONTRACT-MONITORING-1') > 0; DELETE FROM remediation_contracts WHERE class = 'fm-loop-owned-contract-circular'; DELETE FROM failure_modes WHERE fm_key = 'loop-owned-contract-circular'; DELETE FROM control_registry WHERE control = 'loop-owned-contract-park'; UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_issue_dead_end WHERE lane <> ''task-in-flight'') AS TEXT) AS observed' WHERE class = 'fm-open-issue-no-doer' AND instr(verify_probe, 'monitoring:loop-owned-48h') > 0

CREATE TABLE IF NOT EXISTS bak_20261019_loop_owned_triggers AS
  SELECT name, sql FROM sqlite_master
   WHERE type = 'trigger' AND name IN ('contract_probe_templates_loop_merged', 'contract_probe_templates_v3_generic');

CREATE TABLE IF NOT EXISTS bak_20261019_loop_owned_contracts AS
  SELECT * FROM remediation_contracts
   WHERE class = 'fm-parked-contract-unprobed'
      OR (status IN ('active', 'holding') AND issue_id IS NOT NULL
          AND instr(verify_probe, 'SELECT status FROM agent_issues WHERE id =') > 0
          AND COALESCE(module, '') LIKE 'probe-template-v2%-loop'
          AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open'));

CREATE TABLE IF NOT EXISTS bak_20261019_loop_owned_task AS SELECT * FROM fleet_tasks WHERE id = 'red-drain';

DROP TRIGGER IF EXISTS contract_probe_templates_loop_merged;

CREATE TRIGGER contract_probe_templates_loop_merged AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND (EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%'
                AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%'
                AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%'
                AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%'
                AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source))
    OR EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source
                 JOIN service_registry s ON s.service = m.host AND s.state = 'live'
                WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
    OR EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.state = 'live' AND instr(a.source, s.service || '-') = 1
                WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
    OR EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live'
                WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%'))
BEGIN
  UPDATE remediation_contracts
     SET status = 'monitoring', verify_transport = 'd1-query', attempts = 0,
         last_verdict = 'monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)',
         next_due_at = NULL,
         action = 'LOOP-OWNED-CONTRACT-MONITORING-1: the filing loop closes this issue on recovery. This contract is parked as monitoring and is not probed, so it cannot block that close (close-while-contract-fails). The 120-minute issue SLA (issues_open_over_120m) and the stale views still report the open issue.',
         module = CASE
           WHEN EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%'
                     AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%'
                     AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%'
                     AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%'
                     AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source))
             THEN 'probe-template-v2d-loop'
           WHEN EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source
                          JOIN service_registry s ON s.service = m.host AND s.state = 'live'
                         WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
             THEN 'probe-template-v2c-loop'
           ELSE 'probe-template-v2-loop' END,
         precondition = CASE
           WHEN EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%'
                     AND a.source NOT LIKE 'session%' AND a.source NOT LIKE 'claude%' AND a.source NOT LIKE 'chat%'
                     AND a.source NOT LIKE 'owner%' AND a.source NOT LIKE 'backlog%' AND a.source NOT LIKE 'cloud_ops_events%'
                     AND a.source NOT LIKE 'TRANSFORMATION-PROGRAM%' AND a.source NOT LIKE 'human%'
                     AND NOT EXISTS (SELECT 1 FROM issue_source_hosts m WHERE m.source = a.source))
             THEN 'filed by a fleet loop under an unmapped label (ORPHAN-GUARD-BIRTH-1c), which owns it for 48h'
           WHEN EXISTS (SELECT 1 FROM agent_issues a JOIN issue_source_hosts m ON m.source = a.source
                          JOIN service_registry s ON s.service = m.host AND s.state = 'live'
                         WHERE a.id = NEW.issue_id AND a.title NOT LIKE 'METRIC-TRIGGER-%')
             THEN 'filed by a fleet loop under a mapped label (LOOP-SOURCE-HOSTS-1), which owns it for 48h'
           ELSE 'filed by a live fleet loop, which owns it for 48h (ORPHAN-GUARD-BIRTH-1)' END,
         verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = ' || NEW.issue_id || ') <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = ' || NEW.issue_id || ') > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = NEW.issue_id) || ' did not close it within 48h'' END AS observed'
   WHERE class = NEW.class AND status = 'needs-machine-probe';
END;

-- Re-created LAST so it is the newest trigger and fires first again (see change 2 above).
DROP TRIGGER IF EXISTS contract_probe_templates_v3_generic;

CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-TRIGGER-%')
  AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live'
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
   SET status = 'monitoring',
       last_verdict = 'monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)',
       next_due_at = NULL,
       action = 'LOOP-OWNED-CONTRACT-MONITORING-1: the filing loop closes this issue on recovery. This contract is parked as monitoring and is not probed, so it cannot block that close (close-while-contract-fails). The 120-minute issue SLA (issues_open_over_120m) and the stale views still report the open issue.'
 WHERE status IN ('active', 'holding') AND issue_id IS NOT NULL
   AND instr(verify_probe, 'SELECT status FROM agent_issues WHERE id =') > 0
   AND COALESCE(module, '') LIKE 'probe-template-v2%-loop'
   AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open');

UPDATE fleet_tasks SET
  definition = json_insert(
    json_set(definition,
      '$.steps[' || (SELECT e.key FROM json_each(fleet_tasks.definition, '$.steps') e
                      WHERE instr(json_extract(e.value, '$.sql'), 'rearmed: PARKED-REARM-1') > 0 LIMIT 1) || '].sql',
      replace((SELECT json_extract(e.value, '$.sql') FROM json_each(fleet_tasks.definition, '$.steps') e
                WHERE instr(json_extract(e.value, '$.sql'), 'rearmed: PARKED-REARM-1') > 0 LIMIT 1),
        'WHERE status IN (''escalated'',''monitoring'')',
        'WHERE status IN (''escalated'',''monitoring'')' || char(10)
          || '        AND NOT (COALESCE(module, '''') LIKE ''probe-template-v2%-loop'' AND instr(verify_probe, ''SELECT status FROM agent_issues WHERE id ='') > 0) /* LOOP-OWNED-CONTRACT-MONITORING-1 */')),
    '$.steps[#]', json_object('type', 'sql', 'db', 'AUDIT', 'sql', 'UPDATE remediation_contracts SET status = ''monitoring'', last_verdict = ''monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)'', next_due_at = NULL, action = ''LOOP-OWNED-CONTRACT-MONITORING-1: the filing loop closes this issue on recovery. This contract is parked as monitoring and is not probed, so it cannot block that close (close-while-contract-fails). The 120-minute issue SLA (issues_open_over_120m) and the stale views still report the open issue.'' WHERE status IN (''active'', ''holding'') AND issue_id IS NOT NULL
       AND instr(verify_probe, ''SELECT status FROM agent_issues WHERE id ='') > 0
       AND COALESCE(module, '''') LIKE ''probe-template-v2%-loop''
       AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = ''open'') /* LOOP-OWNED-CONTRACT-MONITORING-1 */')),
  version = version + 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'red-drain' AND type = 'workflow'
  AND instr(definition, 'LOOP-OWNED-CONTRACT-MONITORING-1') = 0
  AND instr((SELECT json_extract(e.value, '$.sql') FROM json_each(fleet_tasks.definition, '$.steps') e
              WHERE instr(json_extract(e.value, '$.sql'), 'rearmed: PARKED-REARM-1') > 0 LIMIT 1),
            'WHERE status IN (''escalated'',''monitoring'')') > 0;

-- The drift gate (fleet_tasks 'fleet-tasks-drift-gate') files WORKFLOW-DEFINITION-DRIFT when fleet_tasks differs from
-- fleet_tasks_canonical, so the canonical row moves with the live one, and only when it matched the definition this file replaced.
UPDATE fleet_tasks_canonical SET
  definition = (SELECT t.definition FROM fleet_tasks t WHERE t.id = 'red-drain'),
  repo_path = 'migrations/2026-10-19-loop-owned-contract-monitoring.sql',
  exported_at = datetime('now')
WHERE id = 'red-drain'
  AND definition = (SELECT b.definition FROM bak_20261019_loop_owned_task b WHERE b.id = 'red-drain')
  AND instr((SELECT t.definition FROM fleet_tasks t WHERE t.id = 'red-drain'), 'LOOP-OWNED-CONTRACT-MONITORING-1') > 0;

UPDATE remediation_contracts
   SET verify_probe = replace(verify_probe,
         'c.issue_id = a.id AND c.status IN (''escalated'', ''monitoring''))',
         'c.issue_id = a.id AND c.status IN (''escalated'', ''monitoring'') AND NOT (COALESCE(c.module, '''') LIKE ''probe-template-v2%-loop'' AND instr(c.verify_probe, ''SELECT status FROM agent_issues WHERE id ='') > 0))')
 WHERE class = 'fm-parked-contract-unprobed'
   AND instr(verify_probe, 'probe-template-v2%-loop') = 0
   AND instr(verify_probe, 'c.issue_id = a.id AND c.status IN (''escalated'', ''monitoring''))') > 0;

-- Step 5 of the header: the dead-end detector skips an issue whose newest contract is the parked loop-owned template. Guarded on the exact probe text it
-- replaces, so a probe another session changed since 2026-10-19 is left alone; the Rollback line restores the old text.
UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_issue_dead_end WHERE lane <> ''task-in-flight'' AND NOT (contract_status = ''monitoring'' AND contract_class IN (SELECT class FROM remediation_contracts WHERE status = ''monitoring'' AND instr(COALESCE(last_verdict, ''''), ''monitoring:loop-owned-48h'') = 1))) AS TEXT) AS observed'
 WHERE class = 'fm-open-issue-no-doer'
   AND verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_issue_dead_end WHERE lane <> ''task-in-flight'') AS TEXT) AS observed';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('loop-owned-contract-circular',
  'the birth contract of an issue filed by a fleet loop probes the status of its own issue, so it can pass only after the close that the failing contract blocks',
  'contract_probe_templates_loop_merged wrote the loop-ownership contract as active with a probe that reads agent_issues.status of its own issue; issue_close_evidence_required refuses a close while an active or holding contract reads fail, and the consumer stamps the pending read as fail',
  'LOOP-OWNED-CONTRACT-MONITORING-1 (migrations/2026-10-19-loop-owned-contract-monitoring.sql): the template is born monitoring, the standing rows are parked, red-drain parks any that reappear every hour and PARKED-REARM-1 no longer re-arms them',
  'd1-query: active or holding contracts of open issues whose probe reads the status of their own issue, expected 0',
  'fm-loop-owned-contract-circular', '2026-10-19', NULL,
  'an issue is filed by a live fleet loop and ORPHAN-GUARD-BIRTH-1 writes its birth contract',
  'the filing loop cannot close its own issue: close-while-contract-fails on 2694, 2826, 2880 and 2881 while the metric or condition had recovered',
  'every METRIC-REGRESSION-1, RESEARCH-TERMINAL, CODE-LOOP-EXHAUSTED-1 and similar loop-filed issue, the verification-failure measure and the no-live-path measure');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-loop-owned-contract-circular', NULL, 'LOOP-OWNED-CONTRACT-MONITORING-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = ''open'' AND c.status IN (''active'', ''holding'') AND instr(c.verify_probe, ''SELECT status FROM agent_issues WHERE id ='') > 0) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('loop-owned-contract-park',
  'D1 trigger contract_probe_templates_loop_merged (contract born monitoring), red-drain last step and the PARKED-REARM-1 carve-out, detector fm-parked-contract-unprobed',
  'hold',
  'a loop-filed issue whose birth contract reads the status of its own issue as a failing verdict, which blocks the close the filing loop is waiting to make',
  0, 'replace', 'applied',
  'the hourly red-drain park (second producer of the same state) and the detector fm-loop-owned-contract-circular; a session or loop can also close any issue with issue_triage.close_evidence',
  NULL,
  'Reason and expiry recorded 2026-10-19: 27 active circular contracts on open issues at 12:26Z (30 at 14:5xZ), 24 reading fail, blocked close-while-contract-fails for 2694, 2826, 2880 and 2881. The park ends when the issue closes. Replaces an active contract that could never pass while the issue was open. Issue age, issues_open_over_120m and the 120-minute escalation still report the issue.',
  NULL);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'the loop that files an issue closes it on recovery, and a contract that reads the status of its own issue cannot judge anything while the issue is open',
  'LOOP-OWNED-CONTRACT-MONITORING-1: loop-owned birth contracts are born and standing monitoring, red-drain parks them hourly and no longer re-arms them',
  'qnfo-audit 2026-10-19 12:26Z: 27 active circular contracts on open issues, 24 last_verdict fail, 3 deferred (14:5xZ: 30, 24 fail, 6 deferred); close-while-contract-fails blocks the close of 2694, 2826, 2880, 2881; PARKED-REARM-1 step 6 would set a parked row back to active within the hour; fm-open-issue-no-doer (DEAD-END-DOER-1) reads 33 and would read 63 with the parked rows listed as dead ends',
  'migration merged', 'remediation_contracts rows of loop-filed open issues, the two birth triggers on remediation_contracts, the PARKED-REARM-1 step of red-drain and a new last step, the detectors fm-parked-contract-unprobed and fm-open-issue-no-doer (one guarded probe edit each)',
  'the Rollback header (from the three bak_20261019_loop_owned_* tables)',
  'the loops that file issues can close them again when their condition recovers; expected after the apply: the active circular contracts of open issues read 0 within one red-drain run (the detector fm-loop-owned-contract-circular), no named issue closes until its own condition recovers, and issues_unprobed_60m and issues_without_doer_3h in v_stuck_summary rise by up to the parked count until those issues close',
  'remediation_latest_pass_pct_7d >= 73 within 24 h',
  'none',
  'd1:qnfo-audit remediation_contracts, fleet_tasks, agent_issues, control_registry, failure_modes'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'LOOP-OWNED-CONTRACT-MONITORING-1:') = 1);

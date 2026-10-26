-- REM-A4-CLOSING-MACHINERY-1 (2026-10-26, charter pillar autonomy; remediation session rem-a4, closing-machinery package; agent_issues 1000182, 1000183, 2826, 2827).
-- The fleet cannot close what it cannot measure. Four open issues about that machinery each stood on a contract that no executor could ever pass or even read:
--   * 1000183 REMEDIATION-ESCALATE-DEAD-1: its own text withdraws the change it asked for (CLOSE-CHANNEL-GUARD-1: scripts/remediation_consumer.py stays in CM_SCRIPT_DENY, the escalation exists in the
--     fleet_tasks workflow red-drain) and its contract was born superseded, so nothing could close it. It is closed here as superseded by 1000189 (the issue that carries the live invariant probe),
--     only while the live tables still hold the evidence of that decision at apply time: red-drain enabled with its escalated:over-retried step, more than 49 contracts escalated (the definition of done: "escalated count rises above 49"; 49 when the issue was filed,
--     56 read 19:23Z, 50 at 19:36Z after roadmap-self-maintain re-armed six parked goal contracts) and at most 10 failing non-exempt contracts past 5 times max_attempts left unparked (2154 contracts were past max_attempts at filing, 8 read 19:28Z, all goal-dod-v1 contracts
--     that flipped from deferred to unmet after 18:38Z and are parked by the 19:35Z red-drain run). The strict zero stays the closing probe of 1000189.
--   * 2826 PATHS-UNTESTED-1 and 2827 DOD-CHECKABLE-1: both contracts were parked as monitoring (LOOP-OWNED-CONTRACT-MONITORING-1: the probe is the loop-ownership template, red-drain step 7 parks it, nothing
--     reads it), 218 hours after the filing loop took ownership for 48 hours. Each gets a probe that reads the definition of done the issue states, module rem-a4-closing-v1 so red-drain step 7 (which matches the
--     ownership template text and module) never parks it again:
--       2826: v_path_coverage_violations rows with path_state alternate-untested (22 read 2026-10-26 19:30Z, 21 of 58 at filing). Outcome-bound: each control's owner exercises its alternate (rem-a3-drills holds
--             migrations/2026-10-26-control-alternate-probes4c.sql); alternate_tested_at is never stamped without a run.
--       2827: v_process_contract_dod_worklist is 0 AND the code-task-merge row of v_sla_compliance reads ok. The worklist half was fixed on 2026-10-17 18:01 (0 of 45 process contracts carry the seeded intent
--             text, every DoD is a cloud_ops_events recency state); the SLA half is outcome-bound (309.9 minutes mean over 148 merges in 7 days against 120, 249.2 over the last 24 hours, the 31 merges of
--             2026-10-26 average 69.2) and converges as the slow merges of 2026-10-22 to 2026-10-25 leave the 7-day window.
--   * 1000182 REMEDIATION-CONTRACT-DEAD-PATH-1: the outcome is "no open critical issue without a live closing path" within 72 hours. Measured 2026-10-26 19:33Z: of 56 open critical issues older than
--     1 hour, 2 had no live path (1000063 at 50 hours and 100406 at 130 hours); 1 is older than 72 hours: 100406, an OWNER-TASK whose definition of done is act-or-record, which no table measures, so a
--     measuring probe cannot be derived for it mechanically. It was 8 of the top 10 on 2026-10-25. The ten ROOT-CAUSE-1 issues 1000301 to 1000310 carry measuring contracts
--     (module root-cause-probe-at-birth-1, born 2026-10-26 07:36Z). The contract (born superseded) is replaced by a probe that reads exactly the 72-hour SLA count. A live path is a contract in status active, holding or escalated,
--     or a monitoring contract parked as metric-condition (the METRIC-TRIGGER recovery path), whose probe is not closure-observing: it neither reads agent_issues WHERE id = <the issue> (the born-superseded and
--     loop-ownership templates) nor reads close_evidence while naming the issue's own id (the generic BACKFILL-1 alias). A probe that can only read ok after the close it guards is not a path. The fleet metric
--     orphan_issues_no_live_path (15 at 19:21Z, all priorities) treats any probe that mentions close_evidence as dead, which also flags 100419 whose probe is real; the probe here is the exact form for criticals.
-- No agent_issues row is closed by hand except 1000183 above; 1000182, 2826 and 2827 stay open and close through remediation_verification_autoclose_ins when their probe passes. No cap, cron, worker or guard is
-- added, raised or weakened. The first passing verification often does not close (the consumer inserts the row before it stamps last_verdict), the second does.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback REM-A4-CLOSING-MACHINERY-1', last_attempt_at = datetime('now') WHERE class IN ('issue-1000182', 'issue-2826', 'issue-2827') AND module = 'rem-a4-closing-v1'; UPDATE agent_issues SET status = 'open', close_channel = NULL WHERE id = 1000183 AND close_channel = 'auto:triage-sync:qnfo-fleet-control'; UPDATE issue_triage SET triage_state = 'triaged' WHERE issue_id = 1000183 AND rc = 'closing-machinery:superseded-by-1000189'

-- 1000183: superseded by 1000189, only while the evidence of the decision holds in the live tables
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'closing-machinery:superseded-by-1000189', 'closed', 'qnfo-fleet-control', datetime('now'),
  'superseded by 1000189 (REMEDIATION-CONSUMER-MERGE-DENIED-1), which carries the live invariant probe. DECISION on both issues (CLOSE-CHANNEL-GUARD-1, 2026-10-26): the stamp-block edit of scripts/remediation_consumer.py is withdrawn: the escalation exists in the fleet_tasks workflow red-drain (RED-DRAIN-1 version ' || f.version || ', enabled, step 2 parks a failing contract past 5 times max_attempts as escalated:over-retried) and escalating on attempts would end the probing of passing contracts. Measured at apply ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' from qnfo-audit: ' || e.n || ' contracts are escalated:over-retried (49 when this issue was filed), ' || u.n || ' failing non-exempt contracts past 5 times max_attempts are not parked yet (2154 contracts were past max_attempts at filing). The strict zero of that last count is the closing probe of 1000189. Closed once by migration 2026-10-26-rem-a4-closing-machinery from those counts only.'
FROM agent_issues a,
  (SELECT COUNT(*) AS n FROM remediation_contracts WHERE status = 'escalated' AND last_verdict LIKE 'escalated:over-retried%') e,
  (SELECT COUNT(*) AS n FROM remediation_contracts r WHERE r.status IN ('active', 'holding') AND r.last_verdict = 'fail' AND r.attempts > 5 * COALESCE(r.max_attempts, 3) AND substr(r.class, 1, 3) <> 'fm-' AND substr(r.class, 1, 7) <> 'belief-' AND NOT EXISTS (SELECT 1 FROM code_tasks ct WHERE ct.status NOT IN ('closed', 'superseded') AND ct.goal LIKE '%#' || r.issue_id || ' %') AND NOT (r.issue_id IS NOT NULL AND EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = r.issue_id AND x.status = 'open' AND x.title NOT LIKE 'METRIC-TRIGGER-%') AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = r.issue_id AND c2.class <> r.class AND c2.status IN ('active', 'holding')))) u,
  (SELECT version FROM fleet_tasks WHERE id = 'red-drain' AND enabled = 1 AND instr(definition, 'escalated:over-retried') > 0) f
WHERE a.id = 1000183 AND a.status = 'open' AND a.title LIKE 'REMEDIATION-ESCALATE-DEAD-1:%'
  AND EXISTS (SELECT 1 FROM agent_issues b WHERE b.id = 1000189 AND b.status = 'open')
  AND e.n > 49 AND u.n <= 10
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

-- 1000182: the contract reads the dead-path outcome at the issue's own SLA (critical issues older than 72 hours with no live closing path)
UPDATE remediation_contracts
   SET status = 'active', module = 'rem-a4-closing-v1', verify_transport = 'd1-query', max_attempts = 3, expected_cadence_h = 1,
       precondition = 'open critical issue 1000182 (REMEDIATION-CONTRACT-DEAD-PATH-1): the dead-path outcome is measured on the open critical issues older than its 72-hour SLA',
       action = 'MEASURES the outcome of REMEDIATION-CONTRACT-DEAD-PATH-1 at its own 72-hour SLA: open critical issues older than 72 hours with no live closing path. A live path is a contract in status active, holding or escalated, or a monitoring contract parked as metric-condition (the METRIC-TRIGGER recovery path), whose probe is not closure-observing (it does not read agent_issues WHERE id = the issue, and does not read close_evidence while naming the issue''s own id). Read 2026-10-26 19:33Z: 56 open critical issues older than 1 hour, 2 without a live path (1000063 at 50 hours, 100406 at 130 hours), 1 older than 72 hours: 100406, an OWNER-TASK whose definition of done is act-or-record, so a measuring probe cannot be derived mechanically. Doer: the owner of each issue or the probe author writes a probe that measures its definition of done on class issue-<id>; this contract reads 0 when none is left.',
       verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND a.priority = ''critical'' AND a.created_at <= (CAST(strftime(''%s'', ''now'') AS INTEGER) - 259200) * 1000 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND (c.status IN (''active'', ''holding'', ''escalated'') OR (c.status = ''monitoring'' AND c.last_verdict LIKE ''monitoring:metric-condition%'')) AND instr(c.verify_probe, ''FROM agent_issues WHERE id = '' || a.id) = 0 AND NOT (instr(lower(c.verify_probe), ''close_evidence'') > 0 AND instr(c.verify_probe, CAST(a.id AS TEXT)) > 0))) AS TEXT) AS observed',
       last_verdict = NULL, last_attempt_at = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-1000182' AND issue_id = 1000182 AND COALESCE(module, '') <> 'rem-a4-closing-v1'
   AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 1000182 AND a.status = 'open');

-- 2827: both halves of the definition of done (the worklist half is met since 2026-10-17, the SLA half is outcome-bound)
UPDATE remediation_contracts
   SET status = 'active', module = 'rem-a4-closing-v1', verify_transport = 'd1-query', max_attempts = 3, expected_cadence_h = 1,
       precondition = 'open issue 2827 (DOD-CHECKABLE-1): process contracts define done as a checkable state and the code-task-merge SLA holds',
       action = 'MEASURES both halves of DOD-CHECKABLE-1. (1) No process contract defines done as intent: v_process_contract_dod_worklist is 0 (32 of 44 on 2026-10-17, rewritten to cloud_ops_events recency states at 2026-10-17 18:01, 0 of 45 read 2026-10-26 19:30Z). (2) The code-task-merge row of v_sla_compliance reads ok: 309.9 minutes mean over 148 merges in 7 days against 120 at 19:30Z, 249.2 over the last 24 hours, the 31 merges of 2026-10-26 average 69.2. Half (2) is outcome-bound: it converges as the slow merges of 2026-10-22 to 2026-10-25 leave the 7-day window. Doer: qnfo-code-orchestrator and the merge lane (MERGE-LANE-THROUGHPUT-1, agent_issues 100293).',
       verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM v_process_contract_dod_worklist) <> 0 THEN ''dod-worklist-nonzero:'' || (SELECT COUNT(*) FROM v_process_contract_dod_worklist) WHEN COALESCE((SELECT finished_7d FROM v_sla_compliance WHERE process = ''code-task-merge''), 0) = 0 THEN ''no-merges-in-window'' WHEN (SELECT state || queue_state FROM v_sla_compliance WHERE process = ''code-task-merge'') = ''okok'' THEN ''ok'' ELSE ''code-task-merge '' || (SELECT state || ''/'' || queue_state || '' '' || queue_minutes || '' min vs '' || sla_min || '', finished_7d '' || finished_7d || '', last 24h '' || COALESCE(recent_24h_minutes, ''n/a'') FROM v_sla_compliance WHERE process = ''code-task-merge'') END AS observed',
       last_verdict = NULL, last_attempt_at = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-2827' AND issue_id = 2827 AND COALESCE(module, '') <> 'rem-a4-closing-v1'
   AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 2827 AND a.status = 'open');

-- 2826: the closing probe the issue names (alternate paths that were never exercised)
UPDATE remediation_contracts
   SET status = 'active', module = 'rem-a4-closing-v1', verify_transport = 'd1-query', max_attempts = 3, expected_cadence_h = 1,
       precondition = 'open issue 2826 (PATHS-UNTESTED-1): every control that declares an alternate path has exercised it or records why it cannot',
       action = 'MEASURES the closing probe PATHS-UNTESTED-1 names: rows of v_path_coverage_violations with path_state alternate-untested (22 read 2026-10-26 19:30Z, 21 of 58 controls at filing). A control leaves the count when its alternate has run (a control_alternate_probes row, or alternate_tested_at stamped with the evidence of a trace, a replay or a test) or its row records ALTERNATE-NOT-EXERCISABLE with the reason. Doer: the owner of each control (the loop that owns it exercises the declared alternate once). rem-a3-drills holds migrations/2026-10-26-control-alternate-probes4c.sql. alternate_tested_at is never stamped without a run.',
       verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_path_coverage_violations WHERE path_state = ''alternate-untested'') AS TEXT) AS observed',
       last_verdict = NULL, last_attempt_at = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-2826' AND issue_id = 2826 AND COALESCE(module, '') <> 'rem-a4-closing-v1'
   AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 2826 AND a.status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a4-closing',
  'a contract that no executor reads, or that can only pass after the close it guards, is not a closing path: the issue needs a probe that measures its own definition of done on class issue-<id>, and an issue whose own text withdraws its change is closed as superseded by the issue that holds the live invariant, with the numbers of that decision',
  'REM-A4-CLOSING-MACHINERY-1: 1000183 closed as superseded by 1000189 (guarded on the live red-drain escalation counts); contracts of 1000182, 2826 and 2827 replaced by measuring probes (module rem-a4-closing-v1, status active)',
  'read 2026-10-26 19:23Z to 19:35Z from qnfo-audit: escalated:over-retried 56 (49 at filing), failing non-exempt contracts past 5 times max_attempts unparked 8 (goal-dod-v1, flipped after 18:38Z, parked by the 19:35Z red-drain run), red-drain version 7 enabled with its escalated:over-retried step; contracts issue-2826 and issue-2827 status monitoring since 2026-10-19 (LOOP-OWNED-CONTRACT-MONITORING-1, nothing probes them); v_process_contract_dod_worklist 0 of 45 since 2026-10-17 18:01; v_sla_compliance code-task-merge breach 309.9 min over 148 merges, 31 merges today average 69.2; v_path_coverage_violations alternate-untested 22; open critical issues older than 72 hours with no live closing path 1 (100406), older than 1 hour 2 (100406, 1000063)',
  'applied by migration',
  'one issue closed (1000183), three contracts rewritten; no worker, cap, cron, guard or fleet_tasks change',
  'the Rollback line',
  'issues about the closing machinery are measured by the outcome they name, and a superseded issue closes with its successor id and numbers',
  '1000183 closed at apply if its guard holds, else it stays open with its contract superseded (the guard is the evidence); 2826 reads 22 and 2827 reads the code-task-merge breach until their outcomes converge (2827 within days as the 7-day window rolls), 1000182 reads 1 until 100406 has a measuring probe; the first pass often does not close, the second does',
  'none (internal closing machinery)',
  'live D1 reads of every table the probes and the guard use; offline replay in migrations/rem-a4-closing-machinery.test.mjs on node:sqlite with the live view texts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A4-CLOSING-MACHINERY-1:%');

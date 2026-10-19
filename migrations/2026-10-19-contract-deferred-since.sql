-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-relapse-window-close-anchor', 'fm-verification-deferral-unaged'); DELETE FROM failure_modes WHERE fm_key IN ('relapse-window-updated-at-anchor', 'verification-deferral-unaged'); DELETE FROM control_registry WHERE control IN ('relapse-reopen-window', 'verification-deferral-escalation'); DELETE FROM capability_ledger WHERE capability = 'verification-deferral-escalation'; DELETE FROM decision_log WHERE instr(action, 'VERIFICATION-PATH-1:') = 1; UPDATE agent_issues SET status = 'superseded' WHERE title LIKE 'VERIFICATION-PATH-2:%' AND status = 'open'; ALTER TABLE remediation_contracts DROP COLUMN deferred_since
-- spof-review: adds no single point of failure; the column is read only by qnfo-fleet-control 0.38.0, which runs without it (the stamp and the sweep pause ten minutes on a missing column), and a standing detector reads the same condition from SQL alone
--
-- VERIFICATION-PATH-1 (2026-10-19, pillar autonomy; agent_issues 2953 and 2954; qnfo-fleet-control 0.38.0). Companion to the worker change.
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19 12:00Z to 13:10Z)
--   * A deferral had no age. DEFERRAL-NOT-A-FAILURE-1 (qnfo-fleet-control 0.33.11) stopped writing a verification row for a 'pending'
--     read, which was right for the ledger and left nothing that said how long a contract had been unable to judge. 7 active contracts
--     read last_verdict 'deferred' at 13:05Z. EVID-GATE-A2-PUBLISHV2 had read pending since 2026-10-07 09:09Z (174 attempts, its last
--     real verdict was 2026-10-05) and no issue, card or probe named what it waited for. The 2954 close probe asks for
--     COALESCE(c.deferred_since, c.ts), a column that did not exist, so the probe could only error.
--   * The deferral is shared with scripts/remediation_consumer.py, which still stamps last_verdict 'fail' and writes a pending pass = 0 row
--     for a pending read (its own fix is a separate change). At 13:16Z 39 active contracts read 'fail' with a pending newest row, next
--     to 9 that read 'deferred', and the verdict alternates between the two probers. The age therefore lives in the new column, which
--     only the tick sets and clears, and "still deferring" is read as: active, deferred_since set, and last_verdict 'deferred' or
--     'fail' on a pending newest row. The backfill covers both populations; it dates the five oldest to 2026-10-06/07
--     (issue-2007, issue-2008, issue-2101, issue-2111, EVID-GATE-A2-PUBLISHV2), the start list of the cluster verdict.
--   * The relapse window of rtReopenOnRelapse started at agent_issues.updated_at. 10 of the 1139 closed issues that have an
--     issue_lifecycle row had been touched 1 minute to 2 days after their close (2194, 2302, 2349, 2584, 2585, 2614, 2695, 2724,
--     2748, 100023), so failures between the close and the touch were forgotten. The worker now starts the window at the close
--     event (the newest 'dispositioned' or 'closed' lifecycle row that landed on closed or resolved) and falls back to updated_at.
--     None of the 166 closed issues that carry a live contract is skewed today, so no reopen follows the deploy; the defect was latent.
--
-- WHAT THIS CHANGES
--   remediation_contracts.deferred_since   nullable; the tick stamps it when a contract first reads deferred and clears it on any real
--                                          verdict. Backfilled below, for contracts that read deferred or read fail on a pending newest
--                                          row in the last 24 h, from the trailing run of pending reads (rows after the last
--                                          non-pending row); a contract that never had a real verdict starts at its birth (ts); one
--                                          with real rows and no pending row after them has no known start and stays NULL, so the
--                                          tick stamps it on its next deferred read (the age can only be under-counted, never over).
--   failure modes + detectors              relapse-window-updated-at-anchor (fm-relapse-window-close-anchor) and
--                                          verification-deferral-unaged (fm-verification-deferral-unaged), both standing detectors
--   control_registry                       relapse-reopen-window (the gate, input changed) and verification-deferral-escalation (new)
--   VERIFICATION-PATH-2                    the SQL twins of the relapse window keep the updated_at anchor; filed with a probe
--
-- REVIEW 2026-10-19 (session_01JADz8uHqYt9eUMBTwbbBE6, landing the handoff patch): live qnfo-audit 14:50Z, read only.
--   * Backfill touches 48 of 2272 contracts (13 read deferred, the other 35 read fail on a pending newest row seen inside 24 h); 5 of them are
--     over 7 days old (issue-2007, issue-2008, issue-2101, issue-2111, EVID-GATE-A2-PUBLISHV2), so the first sweeps file 5 issues; the next
--     contracts cross 7 days on 2026-10-19 17:42Z (issue-2381, 2446, 2346) and 2026-10-24 (2826, 2827, 2880, 2881, 2884).
--   * Window anchor: 181 closed or resolved issues carry a live contract and all 181 have a lifecycle close row; 0 would start their window
--     EARLIER than the updated_at anchor (so no reopen can follow the deploy) and 45 start LATER (a writer that closed without bumping updated_at).
--   * Bounds the worker adds to what this file describes: the sweep files at most 3 issues a tick and 12 in any 24 hours, oldest deferral first
--     (a contract over the limit waits, it is not dropped); revert switches that need no deploy: ops_config rt_close_event_anchor = off puts
--     the window back on agent_issues.updated_at, ops_config rt_deferral_escalation = off stops the sweep (the stamp keeps running).
--
-- No view or trigger reads remediation_contracts with SELECT *, and no INSERT into it is positional (checked in sqlite_master
-- 2026-10-19: 34 triggers and views mention the table, none matched), so the extra column changes no row shape they see.
-- Backups: none needed. The UPDATEs write the new column and the born contract of the one issue this file files; the Rollback line drops the
-- column, supersedes that issue and deletes the rows the file adds.

ALTER TABLE remediation_contracts ADD COLUMN deferred_since TEXT;

UPDATE remediation_contracts SET deferred_since = COALESCE(
    (SELECT MIN(replace(substr(p.verified_at, 1, 19), 'T', ' ')) FROM v_remediation_evidence_all p
      WHERE p.class = remediation_contracts.class AND p.pass = 0 AND lower(trim(COALESCE(p.observed, ''))) LIKE 'pending%'
        AND replace(substr(p.verified_at, 1, 19), 'T', ' ') > COALESCE((SELECT MAX(replace(substr(r.verified_at, 1, 19), 'T', ' ')) FROM v_remediation_evidence_all r
              WHERE r.class = remediation_contracts.class AND NOT (r.pass = 0 AND (COALESCE(r.observed, '') = '' OR lower(trim(r.observed)) LIKE 'pending%'))), '1970-01-01 00:00:00')),
    CASE WHEN NOT EXISTS (SELECT 1 FROM v_remediation_evidence_all r WHERE r.class = remediation_contracts.class AND NOT (r.pass = 0 AND (COALESCE(r.observed, '') = '' OR lower(trim(r.observed)) LIKE 'pending%')))
         THEN remediation_contracts.ts END)
 WHERE deferred_since IS NULL
   AND (last_verdict LIKE 'deferred%'
        OR (status = 'active' AND last_verdict = 'fail'
            AND lower(trim(COALESCE((SELECT e.observed FROM v_remediation_evidence_all e WHERE e.class = remediation_contracts.class ORDER BY e.verified_at DESC LIMIT 1), ''))) LIKE 'pending%'
            AND (SELECT MAX(replace(substr(e.verified_at, 1, 19), 'T', ' ')) FROM v_remediation_evidence_all e WHERE e.class = remediation_contracts.class) >= datetime('now', '-24 hours')));

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('verification-deferral-unaged',
  'a verification contract reads pending for days and nothing says what it waits for or for how long',
  'DEFERRAL-NOT-A-FAILURE-1 (0.33.11) made a pending read a non-verdict that writes no row, so the ledger lost the only trace of the deferral; no column held its start and no rule escalated it. EVID-GATE-A2-PUBLISHV2 sat deferred for 12 days with 174 attempts.',
  'VERIFICATION-PATH-1 (qnfo-fleet-control 0.38.0, migrations/2026-10-19-contract-deferred-since.sql): remediation_contracts.deferred_since is stamped and cleared by the tick; a deferral older than 10080 minutes files one deduped VERIFICATION-DEFERRED-7D-1 issue that quotes the pending reason as the unblocker, names escalate_to as the doer and closes itself when the contract reads a verdict or is parked',
  'no active contract reads deferred for more than 10080 minutes plus 30 without an open VERIFICATION-DEFERRED-7D-1 issue for its class',
  'fm-verification-deferral-unaged', '2026-10-19', 2954,
  'a probe returns pending for more than 7 days',
  'active contracts with last_verdict deferred and an old deferred_since or birth, and no escalation issue',
  'the closure of every issue behind a deferred contract, and the 2954 definition of done');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('relapse-window-updated-at-anchor',
  'a closed issue whose contract keeps failing is not reopened because an unrelated touch of the row moved the start of the failure window',
  'rtReopenOnRelapse counted failures since agent_issues.updated_at, which every annotation moves (the kept-closed twin note, the CF-OBS bridge, reconcile). 10 of 1139 closed issues with a lifecycle row were touched 1 minute to 2 days after the close.',
  'VERIFICATION-PATH-1 (qnfo-fleet-control 0.38.0): the window starts at the newest issue_lifecycle row of event dispositioned or closed that landed on closed or resolved, with updated_at as the fallback. The SQL twins (remediation_reopen_on_relapse_d1, v_closure_relapses) are VERIFICATION-PATH-2.',
  'no closed, non-superseded issue with a live contract and no open twin has max_attempts real failures since its close event and last pass',
  'fm-relapse-window-close-anchor', '2026-10-19', 2953,
  'an issue row is updated after its close while its contract is failing',
  'closed issues whose failures since the close event reach max_attempts with reopened_count unchanged',
  'fixes counted that did not hold, and the oscillation view of 2953');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-verification-deferral-unaged', NULL, 'VERIFICATION-PATH-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c WHERE c.status = ''active'' AND c.deferred_since IS NOT NULL AND c.deferred_since < datetime(''now'', ''-10110 minutes'') AND (c.last_verdict LIKE ''deferred%'' OR (c.last_verdict = ''fail'' AND lower(trim(COALESCE((SELECT e.observed FROM v_remediation_evidence_all e WHERE e.class = c.class ORDER BY e.verified_at DESC LIMIT 1), ''''))) LIKE ''pending%'')) AND NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.id = c.issue_id AND x.title LIKE ''VERIFICATION-DEFERRED-7D-1: %'') AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = ''open'' AND o.title LIKE ''VERIFICATION-DEFERRED-7D-1: '' || c.class || ''%'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-relapse-window-close-anchor', NULL, 'VERIFICATION-PATH-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id JOIN (SELECT issue_id, replace(substr(MAX(ts), 1, 19), ''T'', '' '') AS t FROM issue_lifecycle WHERE event IN (''dispositioned'', ''closed'') AND to_status IN (''closed'', ''resolved'') GROUP BY issue_id) l ON l.issue_id = a.id LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE c.status IN (''active'', ''holding'') AND a.status IN (''closed'', ''resolved'') AND NOT (lower(substr(COALESCE(t.close_evidence, ''''), 1, 10)) = ''superseded'' OR lower(substr(COALESCE(t.close_evidence, ''''), 1, 4)) = ''moot'') AND NOT EXISTS (SELECT 1 FROM agent_issues o WHERE o.status = ''open'' AND o.id <> a.id AND lower(trim(o.title)) = lower(trim(a.title))) AND l.t < datetime(''now'', ''-30 minutes'') AND (SELECT COUNT(*) FROM remediation_verifications v WHERE v.class = c.class AND v.pass = 0 AND COALESCE(v.observed, '''') <> '''' AND lower(trim(v.observed)) NOT LIKE ''pending%'' AND v.verified_at > MAX(l.t, COALESCE((SELECT MAX(p.verified_at) FROM remediation_verifications p WHERE p.class = c.class AND p.pass = 1), ''1970-01-01''))) >= MAX(1, COALESCE(c.max_attempts, 3))) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('relapse-reopen-window', 'qnfo-fleet-control/worker.js rtReopenOnRelapse (window start) and the D1 trigger remediation_reopen_on_relapse_d1', 'gate',
  'a closure that did not hold staying closed, and a flapping probe reopening an issue on a single read',
  0, 'keep', 'applied',
  'the D1 trigger remediation_reopen_on_relapse_d1 runs the same rule on every verification insert; fm-relapse-window-close-anchor reads the closed-and-failing population from SQL alone',
  NULL,
  'VERIFICATION-PATH-1 2026-10-19: the gate stays (max_attempts real failures since the closure and last pass, no open twin, pending reads not counted); only its start changes, from agent_issues.updated_at to the issue_lifecycle close event, because updated_at moves on every annotation. Measured: 10 of 1139 closed issues with a lifecycle row were touched after the close; none of the 166 with a live contract is skewed now. The SQL twin keeps the old start until VERIFICATION-PATH-2.',
  2953, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('verification-deferral-escalation', 'qnfo-fleet-control/worker.js rtEscalateStaleDeferrals and remediation_contracts.deferred_since', 'guard',
  'a verification contract waiting on a pending condition for ever with nobody named to unblock it',
  0, 'keep', 'applied',
  'the standing detector fm-verification-deferral-unaged counts the same contracts from SQL alone and the 2954 close probe reads the same two columns',
  NULL,
  'VERIFICATION-PATH-1 2026-10-19: new. Not a hold: it blocks nothing and writes one deduped issue per class once a deferral is older than 10080 minutes (7 days); the issue closes itself when the contract reads a verdict or is parked. Live 2026-10-19 13:05Z: 7 deferred contracts, 1 past the threshold (EVID-GATE-A2-PUBLISHV2, deferred since 2026-10-07).',
  2954, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('verification-deferral-escalation', 'migrations/2026-10-19-contract-deferred-since.sql (VERIFICATION-PATH-1, qnfo-fleet-control 0.38.0)',
  'the qnfo-fleet-control remediation tick (every 10 minutes), remediation_contracts.deferred_since, cloud_ops_events kind remediation.deferred for the pending reason',
  'measured hourly by fm-verification-deferral-unaged; the sweep files at most 3 issues a tick and 12 in any 24 hours, one per class, oldest deferral first; ops_config rt_deferral_escalation = off stops it without a deploy',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'qnfo-fleet-control/verification-path.test.mjs and migrations/contract-deferred-since.test.mjs');

-- The SQL twins of the relapse window. Single-row VALUES insert: agent_issues refuses the INSERT .. SELECT shape at compile time.
INSERT OR IGNORE INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (
 'VERIFICATION-PATH-2: the SQL twins of the relapse window (remediation_reopen_on_relapse_d1, v_closure_relapses) still start at agent_issues.updated_at',
 'Charter pillar: autonomy. VERIFICATION-PATH-1 moved the worker window (rtReopenOnRelapse) to the issue_lifecycle close event because updated_at moves on every annotation of the row. The D1 trigger remediation_reopen_on_relapse_d1 and the view v_closure_relapses compute the same window from agent_issues.updated_at (datetime(CASE WHEN a.updated_at > 100000000000 THEN a.updated_at / 1000 ELSE a.updated_at END, ''unixepoch'')), and the detector fm-closure-relapse-unreopened reads it too. Edit (one migration with APPLY-BY ci, DB qnfo-audit, a Rollback line and a BACKUP table holding the current trigger and view text): replace that start with COALESCE((SELECT replace(substr(MAX(l.ts), 1, 19), ''T'', '' '') FROM issue_lifecycle l WHERE l.issue_id = <the issue> AND l.event IN (''dispositioned'', ''closed'') AND l.to_status IN (''closed'', ''resolved'')), <the old expression>) in the trigger and the view. The D1-TRIGGER-DEPTH-RESTORE-1 canary in the migration runner restores the old trigger if the replacement is refused, so keep the trigger body otherwise identical.' || char(10) ||
 'Definition of done: both objects mention issue_lifecycle in sqlite_master. The d1-query contract on this issue reads that.',
 'qnfo-fleet-control', 'reliability', 'medium', 'open',
 CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''2'' AS expected, CAST((SELECT COUNT(*) FROM sqlite_master WHERE name IN (''remediation_reopen_on_relapse_d1'', ''v_closure_relapses'') AND instr(sql, ''issue_lifecycle'') > 0) AS TEXT) AS observed',
  verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, next_due_at = NULL, module = 'verification-path',
  precondition = 'the SQL twins of the relapse window start at agent_issues.updated_at',
  action = 'one migration puts the issue_lifecycle close event at the start of the window in the trigger and the view',
  escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1
 WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'VERIFICATION-PATH-2:%' AND status = 'open')
   AND COALESCE(module, '') <> 'verification-path'
   AND EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'VERIFICATION-PATH-2:%' AND status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a deferral is a legitimate wait but not an unbounded one, and a failure window must start at the event it measures from, not at the last time anything touched the row',
  'VERIFICATION-PATH-1: remediation_contracts.deferred_since (stamped and cleared by the remediation tick, backfilled from the trailing pending reads) with a 10080-minute escalation that files one VERIFICATION-DEFERRED-7D-1 issue per class, and the worker relapse window moved from agent_issues.updated_at to the issue_lifecycle close event. The 7-day figure is the one measured in the cluster verdict and the 2954 close probe; it is a threshold in code (RT_DEFERRAL_ESCALATE_MIN) and a one-line change.',
  'qnfo-audit 2026-10-19 13:05Z: 7 active contracts deferred, EVID-GATE-A2-PUBLISHV2 since 2026-10-07 with 174 attempts; 10 of 1139 closed issues with a lifecycle row touched after their close, 0 of the 166 with a live contract; no view or trigger reads remediation_contracts with SELECT *',
  'migration merged', 'remediation_contracts (one nullable column), the fleet-control tick, one issue per class deferred over 7 days',
  'the Rollback header (drops the column and deletes the rows this file adds); redeploy of qnfo-fleet-control 0.37.0 stops the stamp and the sweep',
  'a deferred contract has an age and, past 7 days, a named unblocker and a doer; the relapse window no longer forgets failures before an annotation',
  'failure_modes_recurring <= 12 within 6 h',
  'none', 'd1:qnfo-audit remediation_contracts, issue_lifecycle, v_remediation_evidence_all; worker: qnfo-fleet-control remediationContractsTick'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'VERIFICATION-PATH-1:') = 1);

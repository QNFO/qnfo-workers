-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = substr(description, 1, instr(description, char(10) || 'CANARY-AHEAD-PROBES-1 closing probe') - 1) WHERE id IN (1000171, 100419) AND instr(description, char(10) || 'CANARY-AHEAD-PROBES-1 closing probe') > 0; UPDATE remediation_contracts SET ts = (SELECT b.ts FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), status = (SELECT b.status FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), precondition = (SELECT b.precondition FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), max_attempts = (SELECT b.max_attempts FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class), deferred_since = (SELECT b.deferred_since FROM bak_20261026_canary_ahead_probes b WHERE b.class = remediation_contracts.class) WHERE class IN ('issue-100419', 'issue-1000171') AND module IN ('canary-ahead-probes-1', 'code-probe-line-v1') AND class IN (SELECT class FROM bak_20261026_canary_ahead_probes); DELETE FROM remediation_contracts WHERE class = 'fm-canary-false-revert-when-ahead'; DELETE FROM failure_modes WHERE fm_key = 'canary-false-revert-when-ahead';
--
-- CANARY-AHEAD-PROBES-1 (2026-10-26, charter pillar autonomy; agent_issues 1000171 CONTROL-PLANE-REVERTED-1 and 100419 CLOSE-CHANNEL-REQUIRED-1).
-- Companion to scripts/canary_revert.py, scripts/conflict_repair.py and scripts/apply_migrations.py in the same pull request (commit fc265cba). The independent review of that commit
-- asked for the closing probes to be installed with it, so that "this will work after the deploy" has a probe written at the same time (METRIC-CLOSED-LOOP-1). decision_log is
-- append-only, so the Rollback line above leaves the decision row.
--
-- WHAT WAS WRONG (read 2026-10-26 from live qnfo-audit and origin/main)
--   1000171. The canary (scripts/canary_revert.py) judged a /health answer ok only when it equalled the pushed VERSION. The deploy installs main's tip, so two pushes seconds apart
--   leave /health on the later VERSION: push 7a9d293 carried qnfo-gateway 3.31.2-seo-index-8, commit 03976536 landed 15 s later as 3.31.3-seo-index-9, the canary saw 3.31.3-seo-index-9
--   on 25 polls and reverted a healthy worker (3595289a). The contract of the issue, issue-1000171, is the circular status-of-itself probe born superseded (probe-template-v3-generic).
--   100419. Two script closes wrote no close_channel: scripts/conflict_repair.py SETTLE_CLOSE_SQL (1000365, 1000270, 1000256 in the last 2880 minutes, 100422 before that) and
--   scripts/apply_migrations.py resolve_failure (1000212). The first probe proposed for the issue keyed on the TITLES of the two producers and read 6 on 2026-10-26; that count was wrong in
--   two ways: 1000254 (STALE-PR-CONFLICT-REPAIR-1 PR 4254) was closed by a session as a duplicate (its close_evidence reads "PR 4254 closed as duplicate ... No conflict left to repair"),
--   not by the script, and a title says nothing about who closed the row. The close_evidence each script writes does: conflict_repair.py writes "CONFLICT-REPAIR-SETTLE-1: GitHub reads
--   PR #n ..." and apply_migrations.py writes "migration_runs ok for <file> (sha256 ..., n statements, ci:apply-migrations)". Keyed on those strings the same read is 4 (1000365,
--   1000270, 1000256, 1000212), checked against live qnfo-audit before this file was written. The other NULL closes of the window are owner-chat session SQL (100612, 1000011, 100630,
--   100631, 100619, 100621) and 1000254; they stay a separate recorded decision and are not counted by this probe. The contract of the issue, issue-100419, is the same circular probe
--   (superseded), and issue-100419-BACKFILL-1 was refused by PROBE-REVIEW-1 as self-confirming.
--
-- WHAT THIS CHANGES
--   1. The descriptions of the two issues, while they are open, gain one block that names the fix and carries the code-probe lines (a replay finds the block and adds nothing).
--      1000171 gets  code-probe: {"paths": ["scripts/canary_revert.py"], "contains": "CANARY-AHEAD-1"}.
--      100419 gets   code-probe: {"paths": ["scripts/conflict_repair.py"], "contains": "auto:conflict-repair-settle"} and
--                    code-probe: {"paths": ["scripts/apply_migrations.py"], "contains": "auto:migration-apply-resolve"}.
--      The D1 trigger agent_issues_code_probe_upd (PROBE-LINE-EDIT-ONLY-1) turns the FIRST code-probe line of an edited description into the issue's contract. For 1000171 that is the
--      closing contract: it passes once the canary change is on main, and the issue closes on the resulting verification. For 100419 it would be wrong, because a code-probe passes the
--      moment the scripts merge and the autoclose triggers would close an issue whose definition of done is a count of rows over time. So statement 3 replaces the contract the trigger
--      just wrote for 100419 with the d1-query probe below, in the same file and a few milliseconds later; the two code-probe lines stay in the text as documentation of the code state.
--   2. The contract issue-100419 becomes a d1-query probe, expected 0: closed rows with a NULL close_channel whose triage evidence is one of the two producers' strings, in the last
--      2880 minutes (the issue's own window). It reads 4 today and so does not pass; it reads 0 once 1000365 (2026-10-26T09:07:53Z) is 2880 minutes old and no script close since has
--      been unchannelled, at the earliest 2026-10-28T09:08Z. max_attempts 60 because an hourly contract fails for up to 49 reads before the oldest row leaves the window.
--      It is a UPDATE on class issue-100419 (ORPHAN-GUARD-BIRTH-1), guarded on the module of the born or trigger-written contract, on the probe not being ours yet, and on the issue being open,
--      so a replay, a probe a doer wrote by hand and a closed issue are all left alone.
--   3. The failure mode canary-false-revert-when-ahead and its code-read detector fm-canary-false-revert-when-ahead (scripts/canary_revert.py on main keeps the CANARY_SATISFIED
--      tuple that lets "ahead" through), and one decision_log row. The canary also writes one cloud_ops_events row of kind canary-ahead for each run that met an ahead worker, so the avoided
--      revert is a durable record and not only a log line.
--   Not touched: status, issue_triage and close_evidence of either issue (they close only through their probes), any worker, any trigger.
--
-- Limits that stay: the 100419 definition of done is not "every close has a channel" (owner-chat session SQL closes still write none); this probe measures the two producers this
-- change fixes. One executor reads each probe (the qnfo-fleet-control tick for the d1-query probe, the consumer for the code-read ones). The three scripts are the only paths that
-- close these rows, and their tests (scripts/canary_revert_test.py, scripts/conflict_repair_test.py, scripts/apply_migrations_test.py) run in deploy-gate.
-- spof-review: no new loop, cap, hold or gate. Two contracts re-pointed, one detector added, one backup table (bak_20261026_canary_ahead_probes).

-- 0. Backup of the contracts this file changes (BACKUP-CREATES-1). A replay finds the table and leaves it as it is.
CREATE TABLE IF NOT EXISTS bak_20261026_canary_ahead_probes AS
  SELECT class, issue_id, ts, status, verify_probe, verify_transport, last_verdict, module, action, precondition, attempts, max_attempts, next_due_at, deferred_since
  FROM remediation_contracts
  WHERE class IN ('issue-100419', 'issue-1000171');

-- 1. The code-probe line of 1000171. The trigger agent_issues_code_probe_upd makes it the closing contract of the issue (code-read, active). It would also replace a probe a doer wrote in
--    the meantime, so both description blocks (statements 1 and 2) are guarded on the contract still being the born one (module probe-template-v3-generic).
UPDATE agent_issues SET description = COALESCE(description, '') || char(10) || 'CANARY-AHEAD-PROBES-1 closing probe (migrations/2026-10-26-canary-ahead-probes.sql): the fix is scripts/canary_revert.py judge() returning ahead for a live VERSION whose numeric X.Y.Z core is above the pushed one (CANARY-AHEAD-1); scripts/canary_revert_test.py and python3 scripts/canary_revert.py --selftest replay the 7a9d293 incident. The line below is read by the consumer against its checkout of main.' || char(10) || 'code-probe: {"paths": ["scripts/canary_revert.py"], "contains": "CANARY-AHEAD-1"}'
WHERE id = 1000171 AND status = 'open' AND instr(COALESCE(description, ''), 'CANARY-AHEAD-PROBES-1 closing probe') = 0
  AND EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'issue-1000171' AND module = 'probe-template-v3-generic');

-- 2. The two code-probe lines of 100419, as documentation of the code state (the contract the trigger writes from the first of them is replaced in statement 3).
UPDATE agent_issues SET description = COALESCE(description, '') || char(10) || 'CANARY-AHEAD-PROBES-1 closing probe (migrations/2026-10-26-canary-ahead-probes.sql): the two script closes that wrote no close_channel now write one (scripts/conflict_repair.py SETTLE_CLOSE_SQL auto:conflict-repair-settle, scripts/apply_migrations.py RESOLVE_CLOSE_SQL auto:migration-apply-resolve). The closing contract issue-100419 is the d1-query probe keyed on the close_evidence those two scripts write, 0 over the last 2880 minutes. Not counted by it: the owner-chat session SQL closes (100612, 1000011, 100630, 100631, 100619, 100621) and 1000254, a session close of a duplicate pull request.' || char(10) || 'code-probe: {"paths": ["scripts/conflict_repair.py"], "contains": "auto:conflict-repair-settle"}' || char(10) || 'code-probe: {"paths": ["scripts/apply_migrations.py"], "contains": "auto:migration-apply-resolve"}'
WHERE id = 100419 AND status = 'open' AND instr(COALESCE(description, ''), 'CANARY-AHEAD-PROBES-1 closing probe') = 0
  AND EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'issue-100419' AND module = 'probe-template-v3-generic');

-- 3. The contract of 100419: the d1-query probe keyed on the producers' evidence strings. Guarded on the born (circular) or trigger-written contract, so a replay and a hand-written probe are left alone.
UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query',
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.status IN (''closed'', ''resolved'', ''wontfix'') AND a.close_channel IS NULL AND a.updated_at > (strftime(''%s'', ''now'') - 2880 * 60) * 1000 AND (t.close_evidence LIKE ''CONFLICT-REPAIR-SETTLE-1:%'' OR t.close_evidence LIKE ''migration_runs ok for %'')) AS TEXT) AS observed',
  last_verdict = NULL, attempts = 0, max_attempts = 60, deferred_since = NULL, next_due_at = datetime('now'),
  module = 'canary-ahead-probes-1', escalate_to = 'qnfo-fleet-control', expected_cadence_h = 1,
  precondition = 'CANARY-AHEAD-PROBES-1: issue 100419 defect (an issue closed by scripts/conflict_repair.py or scripts/apply_migrations.py carries no close_channel) measured from the rows those scripts closed, never from the status of the issue',
  action = 'MEASURES the defect: counts agent_issues closed, resolved or wontfix in the last 2880 minutes with a NULL close_channel whose issue_triage.close_evidence starts with CONFLICT-REPAIR-SETTLE-1: (scripts/conflict_repair.py settle_issue) or migration_runs ok for (scripts/apply_migrations.py resolve_failure). Expected 0. It reads 4 on 2026-10-26 (1000365, 1000270, 1000256, 1000212) and passes once those leave the window with no new unchannelled script close. The owner-chat session SQL closes are not counted: they are a separate recorded decision, not a defect of these scripts.'
WHERE class = 'issue-100419' AND issue_id = 100419 AND module IN ('probe-template-v3-generic', 'code-probe-line-v1')
  AND instr(verify_probe, 'CONFLICT-REPAIR-SETTLE-1:') = 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 100419 AND status = 'open');

-- 4. The failure mode and its detector: scripts/canary_revert.py on main keeps the tuple that lets an ahead worker through.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('canary-false-revert-when-ahead',
  'the control-plane canary reverts a healthy push because /health already answers the VERSION of a later push',
  'scripts/canary_revert.py judge() accepted only seen == want. The deploy installs main''s tip, so two pushes seconds apart leave /health on the later VERSION while the canary of the earlier push still waits for its own: push 7a9d293 (qnfo-gateway 3.31.2-seo-index-8) was followed 15 s later by 03976536 (3.31.3-seo-index-9), the canary saw 3.31.3-seo-index-9 on 25 polls, reverted 3595289a and filed CONTROL-PLANE-REVERTED-1 issue 1000171',
  'CANARY-AHEAD-1 (scripts/canary_revert.py): a live VERSION whose numeric X.Y.Z core is strictly above the pushed core is state ahead (CANARY_SATISFIED): polling stops, nothing is reverted, no issue is filed, the functional step is left to the later push''s own canary, and one cloud_ops_events row of kind canary-ahead records it. An equal core with another suffix, a lower core and an unreadable VERSION still fail as before. scripts/canary_revert_test.py replays the incident through run() and mutation-checks judge, poll, run and issue_text',
  'the code-read contract fm-canary-false-revert-when-ahead reads scripts/canary_revert.py on main for the CANARY_SATISFIED tuple (the consumer reads its checkout of main), scripts/canary_revert_test.py and python3 scripts/canary_revert.py --selftest run in deploy-gate, and cloud_ops_events kind canary-ahead counts the reverts avoided',
  'fm-canary-false-revert-when-ahead', '2026-10-25', 1000171,
  'two pushes that change the same control-plane worker land closer together than the canary window, the later one with a higher VERSION',
  'CONTROL-PLANE-REVERTED-1 names a push whose content is on main and live: the issue says wanted 3.31.2-seo-index-8, saw 3.31.3-seo-index-9 after 25 polls, and a revert commit for a healthy fix sits on main',
  'a correct control-plane fix is reverted and its VERSION bumped past the later push, the fix is lost from the live worker until someone re-applies it, and the revert deploy itself runs a canary');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-canary-false-revert-when-ahead', NULL, 'CANARY-AHEAD-PROBES-1', 'failure-mode detector',
  '{"paths":["scripts/canary_revert.py"],"contains":"CANARY_SATISFIED = (\"ok\", \"ahead\")"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- 5. The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015kWmGuAq2fNuvzu4MrD7x3',
  'a closing probe written at the same time as the fix is the only record that the fix worked; a probe keyed on an issue title counts rows the scripts did not close, and a code-probe on an issue whose definition of done is a count over time would close it the moment the scripts merge',
  'CANARY-AHEAD-PROBES-1: migrations/2026-10-26-canary-ahead-probes.sql appends the code-probe lines to issues 1000171 and 100419 (while open, once), replaces the contract of 100419 with a d1-query probe keyed on the close_evidence of scripts/conflict_repair.py and scripts/apply_migrations.py (expected 0 over 2880 minutes, max_attempts 60), and adds the failure mode canary-false-revert-when-ahead with its code-read detector fm-canary-false-revert-when-ahead',
  'read 2026-10-26 from live qnfo-audit: 1000171 open with a superseded circular contract; 100419 open with a superseded circular contract and a probe-review-refused one; the NULL close_channel closes of the last 2880 minutes are 12, of which 4 carry the producers'' evidence (1000365, 1000270, 1000256, 1000212), 1000254 is a session close (evidence "PR 4254 closed as duplicate") and the other 6 are owner-chat; the probe reads 4 against expected 0; agent_issues_code_probe_upd read from live sqlite_master (3079 characters, equal to migrations/2026-10-12-probe-line-edit-only.sql); the consumer parse_code_probe and is_literal_select accept the three probes',
  'applied through the canonical path on merge: the descriptions gain their blocks, issue-1000171 becomes a code-read contract that passes once scripts/canary_revert.py with CANARY-AHEAD-1 is on main, issue-100419 becomes a d1-query contract that fails until the four rows leave the window',
  'two issue descriptions appended, two contracts re-pointed, one failure mode and one detector contract added, one backup table; no status, triage row, worker, trigger or secret is touched; 1000171 may close on its code-probe after the merge, 100419 only on a count of 0',
  'run the migration Rollback header: it strips the appended blocks from both descriptions, restores both contracts from bak_20261026_canary_ahead_probes (only while their module is still ours or the trigger''s) and removes the detector contract and the failure mode (decision_log is append-only and keeps this row)',
  'the false canary revert and the unchannelled script closes each have a probe that measures the defect, so both issues close on evidence and neither on a status',
  'issue-1000171 reads ok at the first consumer read after the merge (CANARY-AHEAD-1 present in scripts/canary_revert.py); issue-100419 observes 4 at its first read and 0 from about 2026-10-28T09:08Z if no script close is unchannelled before then',
  'none',
  'migrations/canary-ahead-probes.test.mjs applies the file on SQLite over the live table shapes and the live triggers (agent_issues_code_probe_upd, the four remediation_contracts update triggers, the append-only decision_log), runs each probe through the consumer''s own parse_code_probe, run_code_probe and is_literal_select on a bad and a good state, replays the file, a closed issue and a hand-written probe, and applies the Rollback'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CANARY-AHEAD-PROBES-1:') = 1);

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_session_dep_issues b WHERE b.id = agent_issues.id) WHERE id IN (100419, 1000189, 1000140, 1000183) AND status = 'open' AND EXISTS (SELECT 1 FROM bak_20261026_session_dep_issues b WHERE b.id = agent_issues.id); UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class), max_attempts = (SELECT b.max_attempts FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class), precondition = (SELECT b.precondition FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class) WHERE class = 'issue-1000189' AND module = 'red-drain-invariant-v1' AND EXISTS (SELECT 1 FROM bak_20261026_session_dep_contract b WHERE b.class = remediation_contracts.class);
--
-- CLOSE-CHANNEL-GUARD-1 (2026-10-26, charter pillar autonomy; metric session_dependent_issues_open; agent_issues 100419, 1000189, 1000140 and 1000183).
-- The file name is the one issue 100419 asked for. The change to that issue's own definition of done is the guard suite scripts/close-channel-guard.test.mjs in the same pull request.
--
-- WHAT WAS WRONG (read 2026-10-26 from live qnfo-audit, origin/main and the work-lock ledger)
--   Three open issues carried a session-task handoff line that no session needs to act on, and the metric counted them as work waiting for a Claude session.
--   100419 CLOSE-CHANNEL-REQUIRED-1. The handoff names this migration file, but the issue's own MEASURED CORRECTION says a trigger cannot assign close_channel, so the file was the wrong target and the
--     real work was the close sites in worker and script code. That work landed (PR 3478, PR 3506, commit 2844dbdf for scripts/conflict_repair.py and scripts/apply_migrations.py). Read now: since
--     2026-10-26T10:06:44Z there are 131 closes and 0 with a NULL close_channel, and over the last 10080 minutes 750 closes with 58 NULL (7.7 percent, was 449 of 900 at filing). What nothing did was stop the
--     next site from forgetting the column, which is the first half of the definition of done. scripts/close-channel-guard.test.mjs does: it fails a pull request that adds a statement closing agent_issues
--     without close_channel to a deployed Worker or a CI script (62 UPDATE agent_issues statements in 243 files, none unchannelled). The two unchannelled sites left, qnfo-pipeline-ops lines 79 and 104 and
--     qnfo-skill-sync line 248, are in RETIRED directories that no deploy installs, so the code-task line of that issue for qnfo-pipeline-ops is moot. The issue stays open for its second half, the
--     observation window: the closing contract issue-100419 (d1-query, expected 0, window 2880 minutes) reads 0 from about 2026-10-28T09:08Z. Residual, recorded: owner-chat session SQL closes are not in any
--     repository text and still write no channel.
--   1000189 REMEDIATION-CONSUMER-MERGE-DENIED-1 and 1000183 REMEDIATION-ESCALATE-DEAD-1. Both ask for the same change in scripts/remediation_consumer.py: when attempts + 1 reaches max_attempts, set status
--     escalated. 1000189 says the code loop cannot merge that file (CM_SCRIPT_DENY, 7 failed code tasks), so a session must. Measured against live data the change is wrong, so it is withdrawn and not made:
--     (1) the escalation exists: fleet_tasks red-drain version 6 (RED-DRAIN-1, migrations/2026-10-19-parked-contract-rearm-2.sql) parks a failing contract past 5 times max_attempts as
--         escalated:over-retried, 56 contracts are escalated (49 when 1000183 was filed) and metric remediation_contracts_over_budget, refreshed from the same predicate by qnfo-fleet-control, reads 0.
--     (2) the 1164 active or holding contracts with attempts above max_attempts are 888 last_verdict pass, 180 fail and 95 deferred, and 415 of them are fm- or belief- standing detectors. attempts is a probe
--         counter that every pass raises, including every pass of a hold window, so escalating on attempts would end the probing of 888 passing contracts: the harm 1000183 lists under DO NOT.
--     (3) of the 44 failing, non-exempt contracts past 5 times max_attempts, red-drain leaves all 44 alone through its two documented exclusions (9 have a code task in flight, 40 are the sole live probe of an
--         open issue), and escalating the second group would leave 40 open issues with no closing probe.
--     (4) CM_SCRIPT_DENY keeps the verifier out of the loop it verifies on purpose (core prompt rule 8), so the denied merge is a boundary and not a defect. A session path exists, this change is one, and it is not needed.
--   The probe of contract issue-1000189 counts failed code tasks for the path, which can never fall to 0 because a failed task is a permanent row. It is replaced by the invariant red-drain keeps: 0 failing,
--   non-exempt contracts past 5 times max_attempts that red-drain neither parks nor excludes. That is the predicate of metric remediation_contracts_over_budget (qnfo-fleet-control
--   RED_DRAIN_ELIGIBLE_REMEDIATION_SQL), and migrations/close-channel-required.test.mjs runs the probe and that predicate on the same fixtures and requires equal counts.
--   1000140 AGENT-WS-REACTIVATION-1. The issue says to reactivate qnfo-agent-ws only if the fleet census is at most 30 and a consumer is evidenced, and otherwise to leave the worker retired and report the
--   measured blocker. Read now: metric worker_count is 36 against the cap of 30, qnfo-agent-ws/RETIRED is present ("absent from the live fleet pending owner decision RM-AGENT-WS-DECISION-1"), and the
--   re-plan of the parked code task found no service_registry row, no fleet-graph node and no deployed script. No edit of the oversized worker.js is safe, so no session step remains. The blocker is
--   recorded on the issue, whose runtime-probe line and contract are untouched, so it closes when the worker is back and healthy.
--
-- WHAT THIS CHANGES
--   1. Backup tables for the four descriptions and for the contract of 1000189 (BACKUP-CREATES-1). A replay finds them and leaves them as they are.
--   2. The three handoff lines are replaced by the records above (1000189 carries two: a prose mention and the final line). 1000183 gets one appended block and keeps its text. Every statement is guarded on the
--      exact old text and on the issue still being open, so a replay and a hand-edited issue are left alone. Statuses, triage rows and close_evidence are not touched: nothing here closes an issue.
--      The runtime-probe and code-probe lines are untouched, so agent_issues_runtime_probe_upd and agent_issues_code_probe_upd (PROBE-LINE-EDIT-ONLY-1) do not fire and no contract is re-derived.
--   3. The contract issue-1000189 becomes the d1-query invariant probe above (module red-drain-invariant-v1, guarded on the born probe still being in place). It carries no semicolon, because
--      remediation_probe_semicolon_upd rewrites one.
--   4. One decision_log row (append-only, so the Rollback leaves it).
--   Limits that stay: the handoff markers are replaced only where this file records why no session step remains, and the three issues stay open on their own probes. The fm- and belief- detectors, the hold
--   windows and red-drain are unchanged. 100318 (staged rollout, needs qnfo-ai which another session holds) and the four qnfo-fleet-control handoffs are not touched.
-- spof-review: no new loop, cap, hold or gate. One contract re-pointed, one guard suite, four backup rows.

-- 1. Backups.
CREATE TABLE IF NOT EXISTS bak_20261026_session_dep_issues AS
  SELECT id, status, description FROM agent_issues WHERE id IN (100419, 1000189, 1000140, 1000183);
CREATE TABLE IF NOT EXISTS bak_20261026_session_dep_contract AS
  SELECT * FROM remediation_contracts WHERE class = 'issue-1000189';

-- 2a. 100419: the handoff line becomes the record of the work done.
UPDATE agent_issues SET description = replace(description,
  'session-task: repo=qnfo-workers path=migrations/2026-10-22-close-channel-required.sql',
  'CLOSE-CHANNEL-GUARD-1 (migrations/2026-10-22-close-channel-required.sql, scripts/close-channel-guard.test.mjs): the session step is done. Read 2026-10-26: since 2026-10-26T10:06:44Z (scripts commit 2844dbdf) 131 closes and 0 with a NULL close_channel, over the last 10080 minutes 750 closes with 58 NULL (was 449 of 900). scripts/close-channel-guard.test.mjs fails any change that adds a statement closing agent_issues without close_channel to a deployed Worker or a CI script (62 statements in 243 files scanned, none unchannelled). The two unchannelled sites left, qnfo-pipeline-ops lines 79 and 104 and qnfo-skill-sync line 248, are in RETIRED directories no deploy installs, so the code-task line for qnfo-pipeline-ops above is moot. Residual, recorded: owner-chat session SQL closes sit in no repository text and still write no channel. Open for the observation window: the closing contract issue-100419 (d1-query, expected 0 over 2880 minutes) reads 0 from about 2026-10-28T09:08Z.')
WHERE id = 100419 AND status = 'open'
  AND instr(COALESCE(description, ''), 'session-task: repo=qnfo-workers path=migrations/2026-10-22-close-channel-required.sql') > 0;

-- 2b. 1000189: the prose mention first (it contains the line form), then the final handoff line.
UPDATE agent_issues SET description = replace(replace(description,
  '(issue 1000183 carries `session-task: repo=qnfo-workers path=scripts/remediation_consumer.py`)',
  '(issue 1000183 carries a code-task line naming scripts/remediation_consumer.py)'),
  'session-task: repo=qnfo-workers path=scripts/remediation_consumer.py',
  'DECISION (CLOSE-CHANNEL-GUARD-1, migrations/2026-10-22-close-channel-required.sql, AUTONOMY-FIRST-1): the stamp-block escalation specified for scripts/remediation_consumer.py is withdrawn, so no session edit of that file is needed. Read 2026-10-26 from qnfo-audit. (1) The escalation exists: fleet_tasks red-drain version 6 (RED-DRAIN-1, migrations/2026-10-19-parked-contract-rearm-2.sql) parks a failing contract past 5 times max_attempts as escalated:over-retried. 56 contracts are escalated (49 when 1000183 was filed) and metric remediation_contracts_over_budget, refreshed from the same predicate by qnfo-fleet-control, reads 0. (2) The 1164 active or holding contracts with attempts above max_attempts are 888 last_verdict pass, 180 fail and 95 deferred, and 415 are fm- or belief- standing detectors. attempts is a probe counter that every pass raises, so escalating on attempts + 1 >= max_attempts would end the probing of 888 passing contracts and of every hold window. (3) Of the 44 failing, non-exempt contracts past 5 times max_attempts, red-drain leaves all 44 alone through its two documented exclusions (9 with a code task in flight, 40 the sole live probe of an open issue): escalating them would leave 40 open issues with no closing probe. (4) scripts/remediation_consumer.py stays in CM_SCRIPT_DENY on purpose: the loop the consumer verifies does not edit its verifier. The same finding applies to issue 1000183. The contract issue-1000189 now measures the invariant red-drain keeps (0 failing, non-exempt contracts past 5 times max_attempts that red-drain neither parks nor excludes), the predicate of metric remediation_contracts_over_budget.')
WHERE id = 1000189 AND status = 'open'
  AND instr(COALESCE(description, ''), 'session-task: repo=qnfo-workers path=scripts/remediation_consumer.py') > 0;

-- 2c. 1000183: one appended block, nothing removed.
UPDATE agent_issues SET description = COALESCE(description, '') || char(10) || 'DECISION (CLOSE-CHANNEL-GUARD-1, migrations/2026-10-22-close-channel-required.sql): the stamp-block change this issue asks for is withdrawn. The escalation it describes is done by fleet_tasks red-drain version 6 for failing contracts (56 escalated, metric remediation_contracts_over_budget 0), and escalating on attempts would end the probing of 888 passing contracts. The evidence and the invariant probe are on issue 1000189. The code-task line above names a path the merge runner denies on purpose (CM_SCRIPT_DENY) and is not to be retried.'
WHERE id = 1000183 AND status = 'open' AND instr(COALESCE(description, ''), 'DECISION (CLOSE-CHANNEL-GUARD-1') = 0;

-- 2d. 1000140: the handoff line becomes the measured blocker the issue itself asks for. The runtime-probe line above it and the code-anchor line below it are not touched.
UPDATE agent_issues SET description = replace(description,
  'session-task: repo=qnfo-workers path=qnfo-agent-ws/worker.js',
  'BLOCKED (CLOSE-CHANNEL-GUARD-1, migrations/2026-10-22-close-channel-required.sql, AUTONOMY-FIRST-1): no session step remains, and the worker stays retired as this issue instructs. Read 2026-10-26: metric worker_count is 36 against the cap of 30, qnfo-agent-ws/RETIRED is present (absent from the live fleet pending owner decision RM-AGENT-WS-DECISION-1), the re-plan below found no service_registry row, no fleet-graph node and no deployed script, and no consumer is evidenced. Editing the oversized worker.js is not safe before those hold. Resume when worker_count is at most 30 and a consumer and a same-class retirement are evidenced, in the small files only (RETIRED removal and deploy-targets). The runtime-probe line above closes this issue once the worker is deployed and healthy.')
WHERE id = 1000140 AND status = 'open'
  AND instr(COALESCE(description, ''), 'session-task: repo=qnfo-workers path=qnfo-agent-ws/worker.js') > 0;

-- 3. The contract of 1000189: the invariant probe, no semicolon. Guarded on the born probe (failed code tasks for the path) still being in place and on the issue being open.
UPDATE remediation_contracts SET ts = datetime('now'), status = 'active', verify_transport = 'd1-query',
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts r WHERE r.status IN (''active'', ''holding'') AND r.last_verdict = ''fail'' AND r.attempts > 5 * COALESCE(r.max_attempts, 3) AND substr(r.class, 1, 3) <> ''fm-'' AND substr(r.class, 1, 7) <> ''belief-'' AND NOT EXISTS (SELECT 1 FROM code_tasks ct WHERE ct.status NOT IN (''closed'', ''superseded'') AND ct.goal LIKE ''%#'' || r.issue_id || '' %'') AND NOT (r.issue_id IS NOT NULL AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = r.issue_id AND a.status = ''open'' AND a.title NOT LIKE ''METRIC-TRIGGER-%'') AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = r.issue_id AND c2.class <> r.class AND c2.status IN (''active'', ''holding'')))) AS TEXT) AS observed',
  last_verdict = NULL, attempts = 0, max_attempts = 3, next_due_at = datetime('now'), module = 'red-drain-invariant-v1',
  precondition = 'CLOSE-CHANNEL-GUARD-1: issue 1000189 asked for an escalation that red-drain already performs, measured from the contracts red-drain must park, never from the failed code tasks of one path',
  action = 'MEASURES the invariant: counts remediation_contracts in active or holding with last_verdict fail and attempts above 5 times max_attempts, outside the fm- and belief- detectors, with no code task in flight and not the sole live probe of an open issue. Expected 0. It is the predicate of metric remediation_contracts_over_budget (RED_DRAIN_ELIGIBLE_REMEDIATION_SQL in qnfo-fleet-control) and reads 0 on 2026-10-26. A value above 0 means red-drain stopped parking.'
WHERE class = 'issue-1000189' AND issue_id = 1000189
  AND instr(verify_probe, 'failed merge-denied tasks') > 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 1000189 AND status = 'open');

-- 4. The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'fork-session-dep',
  'a session handoff line is work only while a session step remains: when the work is done, or measured to be wrong or blocked, the line is replaced by the record and the issue stays open on its own probe',
  'CLOSE-CHANNEL-GUARD-1: migrations/2026-10-22-close-channel-required.sql replaces the session handoff line of 100419 (work done), 1000189 (change withdrawn) and 1000140 (blocked by the worker cap) with records, appends the decision to 1000183, and re-points the contract of 1000189 to the red-drain invariant',
  'read 2026-10-26 from live qnfo-audit: 100419 has 131 closes and 0 NULL close_channel since 10:06:44Z and 58 NULL of 750 in 10080 minutes, the guard suite finds 62 UPDATE agent_issues statements in 243 files and none unchannelled, pipeline-ops and skill-sync are RETIRED; remediation_contracts active or holding past max_attempts are 888 pass, 180 fail, 95 deferred with 415 standing detectors, red-drain version 6 holds 56 escalated, the 44 failing non-exempt contracts past 5 times max_attempts are all excluded by red-drain (9 and 40), metric remediation_contracts_over_budget reads 0; worker_count 36 against 30 and qnfo-agent-ws/RETIRED present',
  'applied through the canonical path on merge: four descriptions rewritten or appended, one contract re-pointed to a d1-query invariant probe that reads 0, three handoff markers gone from the metric, no status changed',
  'four issue descriptions, one contract, two backup tables and one guard suite; no worker, trigger, status, triage row, cap or secret is touched',
  'run the migration Rollback header: it restores the four descriptions from bak_20261026_session_dep_issues while they are open and the contract from bak_20261026_session_dep_contract while its module is still ours (decision_log is append-only and keeps this row)',
  'a new close site that forgets close_channel fails a pull request instead of showing up as a NULL count two days later, and three issues that waited on a session carry the measured reason no session step remains',
  'session_dependent_issues_open falls by 3 at its next refresh after the merge and nothing else changes: the three issues stay open, issue-1000189 reads 0 at its first probe, issue-100419 reads 0 from about 2026-10-28T09:08Z',
  'none',
  'migrations/close-channel-required.test.mjs applies the file on SQLite over the live table shapes and triggers (the probe-line triggers, the remediation_contracts update triggers, the append-only decision_log), counts the metric''s own LIKE before and after, runs the new probe and the fleet-control predicate on the same fixtures, replays the file, leaves a closed or hand-edited issue alone and applies the Rollback; scripts/close-channel-guard.test.mjs mutation-checks the guard'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CLOSE-CHANNEL-GUARD-1:') = 1);

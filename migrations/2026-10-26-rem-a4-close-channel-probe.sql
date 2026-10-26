-- CLOSE-CHANNEL-PROBE-2 (2026-10-26, rem-a4 fork F6, charter pillar autonomy; agent_issues 100419 CLOSE-CHANNEL-REQUIRED-1, critical).
-- Defect: closes of agent_issues that carry no close_channel cannot be attributed to a fix, a probe or a sweep. 449 of 900 closes in 7 days read NULL on 2026-10-21.
-- State read from qnfo-audit 2026-10-26 19:30Z:
--   * every code path the issue named writes a channel now: PR 3478 (11 worker sites, 2026-10-21), scripts/conflict_repair.py SETTLE_CLOSE_CHANNEL and scripts/apply_migrations.py RESOLVE_CLOSE_CHANNEL
--     (scripts commit 2844dbdf, 2026-10-26T10:06:44Z), the D1 triggers (remediation_verification_autoclose_*, triage_close_sync_*) and the migration runner; scripts/close-channel-guard.test.mjs passes
--     (18 checks, 63 UPDATE agent_issues statements in 247 files, none unchannelled). The only D1-resident closer without a channel, fleet_tasks cf-model-eval-repair step 5, is stopped by the
--     trigger issue_close_evidence_required (it writes no issue_triage close_evidence) and the issue it names was never filed (0 rows), so it cannot produce a NULL close.
--   * issue_lifecycle holds 259 dispositioned events after the fix (2026-10-26T10:06:44Z); 0 of those issues have a NULL close_channel. The 49 NULL closes of the last 7 days are all older than the fix
--     (the newest is issue 1000365 at 2026-10-26 09:07:53); by writer they are TRIGGER-RECOVERY-1 / IMPROVEMENT-LOOP-1 / MODEL-HEALTH-SWEEP-1 (fixed by PR 3478), conflict_repair and apply_migrations
--     (fixed 10:06Z) and owner-chat session SQL closes (the residual the issue records: no repository text, no channel).
-- The contract issue-100419 counted only two evidence families (CONFLICT-REPAIR-SETTLE-1 and migration_runs ok): it read 4 while the all-writers count read 5 (issue 1000254, a session close
-- of a duplicate pull request, was outside both families), so a third unchannelled writer could never have moved it. This file makes it measure the definition of done itself: the number of issues
-- closed in the last 2880 minutes (issue_lifecycle event dispositioned, written by trigger issue_lifecycle_au at the status change) whose close_channel is still NULL, whatever wrote the close, with a floor of
-- 20 closes in the window so a quiet fleet cannot pass vacuously. The same query read 11 for the window ending at the fix (2026-10-26 10:06Z), 8 for the window ending 2026-10-26 00:00Z, 7 for 2026-10-25 12:00Z
-- and 6 for 2026-10-22 12:00Z, read 5 now, and reads 0 from 2026-10-28T09:08Z when issue 1000365 leaves the window, which is the 48 hours of soak the definition of done asks for; a NULL close after that reopens it
-- (REMEDIATION-REOPEN-2). No trigger is added on agent_issues (AGENT-ISSUES-TRIGGER-DEPTH-1): the residual, a session closing with raw SQL and no channel, is a rule for sessions, recorded here and on the issue.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261026_close_channel_contract b WHERE b.class = 'issue-100419'), action = (SELECT b.action FROM bak_20261026_close_channel_contract b WHERE b.class = 'issue-100419'), next_due_at = datetime('now') WHERE class = 'issue-100419' AND EXISTS (SELECT 1 FROM bak_20261026_close_channel_contract b WHERE b.class = 'issue-100419')

CREATE TABLE IF NOT EXISTS bak_20261026_close_channel_contract AS
  SELECT class, status, verify_probe, action, last_verdict, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at
    FROM remediation_contracts WHERE class = 'issue-100419';

UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM issue_lifecycle WHERE event = ''dispositioned'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2880 minutes'')) < 20 THEN ''unmeasured: fewer than 20 issue closes in the last 48 hours'' WHEN (SELECT COUNT(DISTINCT a.id) FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE l.event = ''dispositioned'' AND l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2880 minutes'') AND a.status IN (''closed'', ''resolved'', ''wontfix'') AND a.close_channel IS NULL) = 0 THEN ''ok'' ELSE (SELECT COUNT(DISTINCT a.id) FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE l.event = ''dispositioned'' AND l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-2880 minutes'') AND a.status IN (''closed'', ''resolved'', ''wontfix'') AND a.close_channel IS NULL) || '' issues closed in the last 48 hours carry no close_channel'' END AS observed',
       action = 'MEASURES the defect (CLOSE-CHANNEL-PROBE-2, rem-a4 2026-10-26): reads ok only when at least 20 issues were closed in the last 2880 minutes (issue_lifecycle event dispositioned) and none of the issues closed in that window has a NULL close_channel, whatever wrote the close (a worker, a script, a D1 trigger, a fleet task or a session). It replaces the earlier count of two evidence families (CONFLICT-REPAIR-SETTLE-1 and migration_runs ok), which read 4 while the all-writers count read 5. Read 2026-10-26 19:30Z: 259 closes since the fix (scripts commit 2844dbdf, 2026-10-26T10:06:44Z) and none unchannelled, the 5 NULL closes in the window all predate it; the same query read 11 for the window ending at the fix, and reads 0 from 2026-10-28T09:08Z when issue 1000365 leaves the window if nothing unchannelled is closed before then. The residual (a session closing with raw SQL and no close_channel) is not fixable by a trigger on agent_issues (AGENT-ISSUES-TRIGGER-DEPTH-1): sessions state a channel in the close.',
       next_due_at = datetime('now')
 WHERE class = 'issue-100419' AND instr(verify_probe, 'issue_lifecycle') = 0;

UPDATE agent_issues
   SET description = COALESCE(description, '') || char(10) || 'CLOSE-CHANNEL-PROBE-2 2026-10-26T19:30Z (rem-a4 fork F6): every writer the issue named is fixed and on main (PR 3478, scripts commit 2844dbdf, the D1 triggers); scripts/close-channel-guard.test.mjs passes (63 statements in 247 files, none unchannelled); issue_lifecycle holds 259 dispositioned events since the fix and 0 of those issues has a NULL close_channel. The 49 NULL closes of the last 7 days are all older than the fix, the newest is issue 1000365 at 2026-10-26 09:07:53. The closing contract issue-100419 now counts NULL-channel closes of ALL writers in the last 2880 minutes with a floor of 20 closes (the old text counted two evidence families and read 4 while the all-writers count read 5); the same query read 11 at the fix, reads 5 now and reads 0 from 2026-10-28T09:08Z, the 48 hours of soak of the definition of done. Residual, recorded: owner-chat sessions that close with raw SQL write no channel (issues 100612, 1000011, 100619, 100621, 100630, 100631 on 2026-10-24 and 1000254 on 2026-10-26); a trigger on agent_issues cannot fix that (AGENT-ISSUES-TRIGGER-DEPTH-1), so a session states a close_channel in its close.',
       updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 100419 AND status = 'open' AND instr(COALESCE(description, ''), 'CLOSE-CHANNEL-PROBE-2') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a4-cost',
  'a closing probe must count the defect over every writer, not over the two evidence families that were known when it was written, and must not pass because nothing was closed',
  'CLOSE-CHANNEL-PROBE-2: contract issue-100419 re-pointed at issue_lifecycle dispositioned events of the last 2880 minutes with a NULL close_channel, floor of 20 closes; backup table bak_20261026_close_channel_contract; note on the issue',
  'qnfo-audit 2026-10-26 19:30Z: 259 dispositioned events after 2026-10-26T10:06:44Z, 0 NULL close_channel; 49 NULL closes in 7 days, newest 2026-10-26 09:07:53; probe as of the fix read 11, 8 as of 2026-10-26 00:00Z, 5 now; scripts/close-channel-guard.test.mjs 18 checks, 63 statements in 247 files',
  'applied by migration', 'one contract row and one issue description; no worker, trigger or cron change', 'the Rollback line (restores the contract from bak_20261026_close_channel_contract)',
  'the close-channel contract measures every closer, so a new unchannelled writer or a session close moves it',
  'the contract reads 5 now, falls to 0 on 2026-10-28T09:08Z if no unchannelled close is made, and then the autoclose trigger closes issue 100419 on two consecutive passes; a NULL close before then restarts the 48 hours and names a live writer',
  'none', 'D1 reads: issue_lifecycle and agent_issues as of six dates, replay of the probe on node:sqlite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'CLOSE-CHANNEL-PROBE-2:%');

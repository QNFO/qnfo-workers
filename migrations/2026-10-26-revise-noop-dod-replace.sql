-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'WITH bad AS (SELECT id FROM content_stage_events WHERE flow=''research'' AND from_stage=''revise'' AND to_stage IN (''ground'',''parked'') AND ts >= datetime(''now'',''-48 hours'')) SELECT ''0'' AS expected, CAST(count(*) AS TEXT) AS observed FROM bad' WHERE class = 'issue-1000029' AND issue_id = 1000029;
-- REVISE-NOOP-DOD-REPLACE-1 (2026-10-26, charter pillar: autonomy; agent_issues 1000456, issue 1000029 REVISE-NOOP-WAIVE-1; session-old-issues-6d-2038).
-- WHAT WAS WRONG: the closing probe of issue 1000029 expects zero content_stage_events with flow research, from_stage revise and to_stage ground or parked in 48 hours (36 at
-- 2026-10-26T16:54Z). A revise no-op that exhausts its recoveries parks the row by design (PARKED-POISON-1; since qnfo-research-exec 0.36.7 PARK-REARM-CAP-1 parks it for good after
-- TERMINAL_RECOVERY_MAX = 2 recoveries) and a first or second no-op re-queues from ground by design (markError), so the probe reaches zero only if revise can no longer fail, which is
-- the waiver that REVISE-NO-UNREVISED-1 (0.13.0, issue 2211) replaced because it published papers whose HARD findings no edit had applied. The waiver is declined (default-approve took the
-- recommended option on 2026-10-26; OUTPUT-QUALITY-LEDGER-1: no quality gate is weakened to raise a count). The probe therefore could never pass, and a probe that cannot pass is not a measure.
-- WHAT THE DEFECT IS (issue 1000029): re-draft loops cap publications: one row claimed 7 times in a day, 167 done events and 5 publications. The loop is a row that goes revise to ground or
-- to parked again and again. The measure of that is per item, not total: how many times one item_id is parked or re-grounded by revise inside 48 hours.
-- MEASURED 2026-10-26T18:5xZ (read-only, content_stage_events flow research, from revise, last 2880 minutes): 34 revise to parked events on 11 items and 2 revise to ground on 2 items; the most
-- parked item (rem-rev-b9f3a431-3e00-428c-ade4-bc602d0b2d08) 12 times, then 7 and 6, the rest 2 or fewer. Per day parked: 96 (10-19), 123, 48, 45, 35, 26, 6, 2 (10-26): the loop stopped on
-- 2026-10-25 when 0.36.7 landed, and the 12, 7 and 6 are events from before it that age out of the 48-hour window by about 2026-10-28T02:10Z.
-- THE NEW PROBE (replaces the old one on the contract of issue 1000029): '1' when no single item_id has more than 3 revise to parked events and no more than 3 revise to ground events in the
-- last 2880 minutes (3 = the recover_count cap that PARKED-POISON-1 and PARK-REARM-CAP-1 enforce), else '0'. It reads 0 today because of the pre-fix events, passes once they age out if the cap
-- holds, and fails again if a row loops. It is not a constant, it does not loosen the target to what the data shows, and the waiver is not implemented.
-- Publications per day (candidate c) stay with issues 1000005, 100622 and 100629.
-- Revert: the Rollback line restores the previous probe text.
UPDATE remediation_contracts SET verify_probe = 'WITH per AS (SELECT item_id, SUM(to_stage = ''parked'') AS parked, SUM(to_stage = ''ground'') AS regrounded FROM content_stage_events WHERE flow = ''research'' AND from_stage = ''revise'' AND to_stage IN (''ground'', ''parked'') AND ts >= datetime(''now'', ''-2880 minutes'') GROUP BY item_id) SELECT ''1'' AS expected, CASE WHEN COALESCE((SELECT MAX(parked) FROM per), 0) <= 3 AND COALESCE((SELECT MAX(regrounded) FROM per), 0) <= 3 THEN ''1'' ELSE ''0'' END AS observed'
  WHERE class = 'issue-1000029' AND issue_id = 1000029;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-old-issues-6d-2038',
  'the revise-noop waiver stays declined; a closing probe that only the declined waiver could satisfy is replaced by a measure of the defect it names, not confirmed and not loosened to a constant',
  'REVISE-NOOP-DOD-REPLACE-1: the contract of issue 1000029 now reads the largest number of revise to parked and revise to ground events for one item_id in 2880 minutes (3 or fewer passes); the waiver is not implemented',
  'qnfo-audit 2026-10-26 read-only: 34 revise to parked events on 11 items and 2 revise to ground on 2 items in 48 h, worst item 12 parked; parked per day 123 on 10-20 down to 2 on 10-26 after research-exec 0.36.7 (PARK-REARM-CAP-1); old probe expected 0 and read 36',
  'migration merged',
  'the verify_probe of contract issue-1000029 only',
  'the Rollback header of migrations/2026-10-26-revise-noop-dod-replace.sql',
  'issue 1000029 can close when its defect is gone (no item loops through revise more than 3 times in 48 h) instead of never',
  'the probe passes by about 2026-10-28T02:10Z when the pre-0.36.7 events leave the window, and fails again if a row loops',
  'none',
  'd1:qnfo-audit read-only, node:sqlite replay in migrations/revise-noop-dod-replace.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'REVISE-NOOP-DOD-REPLACE-1:%');

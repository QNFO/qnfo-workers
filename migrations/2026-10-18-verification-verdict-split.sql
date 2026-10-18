-- 2026-10-18 VERIFICATION-VERDICT-SPLIT-1 (qnfo-fleet-control 0.33.11-deferral-not-a-failure-1)
--
-- Why: on 2026-10-18 the fleet read "45% of verification runs fail (61,282 of 135,263)". That ratio is
-- remediation_verifications.pass = 0 over all rows, and it is not a failure rate, for three reasons measured
-- that day:
--
--   1. 19,320 rows (14.3% of the table, 31.5% of every pass = 0 row) are DEFERRALS, not verdicts. The
--      observation text starts with 'pending' ('pending' or 'pending: <reason>'), the documented deferral
--      convention of REMEDIATION-PENDING-PREFIX-1 (0.4.128): the probe cannot judge yet. The tick wrote them
--      as pass = 0 anyway. Every reader that acts on a failure already excluded them by SQL (rtReopenOnRelapse,
--      rtPassStreakDays) or in code (the hold cadence), so the rows were written for no reader.
--      Worst single contract: issue-1987, 306 rows, never one verdict.
--   2. 4,264 rows are standing DETECTOR breaches (fm-*, belief-*). A detector is an audit that runs for ever by
--      design (DETECTOR-CADENCE-1) and never closes; its observed = 0 is a real finding about the fleet, but it
--      is not a remediation that failed.
--   3. The denominator counts re-probes. One contract returning 'pending' every 30 minutes produced 303
--      "failures" from a single unresolved condition, so the ratio measures probe cadence as much as outcome.
--      The subject-level reading the fleet already publishes, remediation_latest_pass_pct_7d (latest row per
--      subject, 7 days), read 73.6 against a target of >= 80 on the same day.
--
-- What is left after those three: 37,469 real failed checks, of which 21,775 sit on 114 open issues (the genuine
-- remediation backlog) and 15,442 on 552 closed issues that another evaluator re-closed inside the reopen window
-- (a reopen/close oscillation, tracked separately).
--
-- This view is the canonical split. It is data-only and additive: nothing renames or deletes a verification row.

CREATE VIEW IF NOT EXISTS v_verification_verdict_split AS
SELECT
  substr(verified_at, 1, 10) AS day,
  CASE
    WHEN pass = 1 THEN 'pass'
    WHEN lower(trim(observed)) LIKE 'pending%' THEN 'deferral'
    WHEN observed IS NULL OR observed = '' OR observed IN ('(null)', '(no expected value)') THEN 'placeholder'
    WHEN class LIKE 'fm-%' OR class LIKE 'belief-%' THEN 'detector-breach'
    ELSE 'real-fail'
  END AS verdict_kind,
  COUNT(*) AS rows_n,
  COUNT(DISTINCT class) AS contracts,
  COUNT(DISTINCT issue_id) AS issues
FROM remediation_verifications
GROUP BY day, verdict_kind;

-- The honest row-level failure rate: real failed checks over the rows that carried a verdict at all
-- (pass + real-fail), i.e. deferrals, placeholders and standing-detector audits removed from both sides.
-- Expected reading on 2026-10-18 (all time): 37469 / (73991 + 37469) = 33.6% row-level, against the 45.3%
-- that the raw pass = 0 ratio reported, and 26.4% at subject level (remediation_latest_pass_pct_7d = 73.6).

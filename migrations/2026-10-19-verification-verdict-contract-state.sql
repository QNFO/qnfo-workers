-- VERDICT-CONTRACT-STATE-1 (2026-10-19). Handoff items: docs/HANDOFF-2026-10-18-VERIFICATION-AUDIT.md §5.4 and §6.4.
--
-- WHY
-- v_verification_verdict_split (2026-10-18) classifies a verification row from the ROW alone: pass, deferral,
-- placeholder, detector-breach, else real-fail. It cannot see the state of the contract that wrote the row, and on
-- 2026-10-18 production moved 1,039 contracts into states that no row-level classifier knows about:
--   superseded 545 (contract-on-closed-issue), 243 (contract-on-missing-issue), 87 (PROBE-TRANSPORTS-1),
--   75 (closure-superseded), 42 (probe-unusable), 22 (issue-wontfix); escalated 91; monitoring 68.
-- Every fail row written by those contracts lands in 'real-fail'. The audit's own next action says so: "Extend the
-- CASE before quoting any rate from it."
--
-- WHAT THIS ADDS (additive; nothing is dropped, so no historical series moves)
--   v_verification_verdict_split_v2  the same shape as v1, plus contract state, plus two honest buckets
--                                    ('fail-on-closed-issue', 'real-fail-open-issue')
--   v_verification_failure_rate      one row per day: outcome rows, failed rows, failure_pct, and the non-outcome
--                                    rows (deferral/placeholder/parked/superseded/detector) counted separately
--
-- WHY v1 IS LEFT IN PLACE
-- v1 is quoted in the 2026-10-18 audit and in several closeouts. Redefining it would silently rewrite numbers that
-- were published with reasoning attached; a second, correctly-scoped view keeps both the old reading and the new
-- one reproducible. Quote v2 from now on.
--
-- SAFETY
--   Additive only: CREATE VIEW IF NOT EXISTS, no table, trigger or row is touched, so a re-apply is a no-op and the
--   rollback below is exactly the two views this file creates.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_verification_failure_rate; DROP VIEW IF EXISTS v_verification_verdict_split_v2;
--
-- Verify after apply:
--   SELECT verdict_kind, count(*) FROM v_verification_verdict_split_v2 GROUP BY 1 ORDER BY 2 DESC;
--   SELECT * FROM v_verification_failure_rate ORDER BY day DESC LIMIT 7;

CREATE VIEW IF NOT EXISTS v_verification_verdict_split_v2 AS
SELECT substr(v.verified_at, 1, 10) AS day,
       CASE
         WHEN v.pass = 1 THEN 'pass'
         -- a deferral is a documented verdict, never a failure (REMEDIATION-PENDING-PREFIX-1)
         WHEN lower(trim(COALESCE(v.observed, ''))) LIKE 'pending%' THEN 'deferral'
         WHEN v.observed IS NULL OR v.observed = '' OR v.observed IN ('(null)', '(no expected value)') THEN 'placeholder'
         -- the contract's own state: parked, superseded or escalated is not a failed check
         WHEN c.status = 'superseded' THEN 'superseded-contract'
         WHEN c.status = 'escalated' THEN 'escalated-contract'
         WHEN c.status = 'monitoring' THEN 'monitoring-contract'
         WHEN c.status = 'holding' THEN 'holding-contract'
         -- a standing detector class audits forever; it is not a remedy that can pass
         WHEN v.class LIKE 'fm-%' OR v.class LIKE 'belief-%' THEN 'detector-breach'
         -- a real failed check, split by whether the issue it guards is still open: the two need different work
         WHEN a.status = 'closed' THEN 'fail-on-closed-issue'
         ELSE 'real-fail-open-issue'
       END AS verdict_kind,
       COUNT(*) AS rows_n,
       COUNT(DISTINCT v.class) AS contracts,
       COUNT(DISTINCT v.issue_id) AS issues
  FROM remediation_verifications v
  LEFT JOIN remediation_contracts c ON c.class = v.class
  LEFT JOIN agent_issues a ON a.id = v.issue_id
 GROUP BY day, verdict_kind;

CREATE VIEW IF NOT EXISTS v_verification_failure_rate AS
SELECT day,
       SUM(CASE WHEN verdict_kind IN ('pass', 'real-fail-open-issue', 'fail-on-closed-issue') THEN rows_n ELSE 0 END) AS outcome_rows,
       SUM(CASE WHEN verdict_kind IN ('real-fail-open-issue', 'fail-on-closed-issue') THEN rows_n ELSE 0 END) AS failed_rows,
       SUM(CASE WHEN verdict_kind IN ('deferral', 'placeholder', 'superseded-contract', 'escalated-contract',
                                      'monitoring-contract', 'holding-contract', 'detector-breach')
                THEN rows_n ELSE 0 END) AS non_outcome_rows,
       ROUND(100.0 * SUM(CASE WHEN verdict_kind IN ('real-fail-open-issue', 'fail-on-closed-issue') THEN rows_n ELSE 0 END)
             / NULLIF(SUM(CASE WHEN verdict_kind IN ('pass', 'real-fail-open-issue', 'fail-on-closed-issue') THEN rows_n ELSE 0 END), 0),
             1) AS failure_pct
  FROM v_verification_verdict_split_v2
 GROUP BY day;

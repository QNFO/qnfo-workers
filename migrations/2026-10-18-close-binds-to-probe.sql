-- CLOSE-BINDS-TO-PROBE-1 (2026-10-18, pillar autonomy)
--
-- Root cause found by auditing v_failure_mode_status: 5 of the 12 recurring failure modes were one defect seen from
-- five angles -- closure-relapse-unreopened, closure-while-contract-fails, two-closers-disagree, metric-close-flap,
-- reopen-hits-open-twin. The fleet had no rule binding a "this is fixed" claim to the evidence that says so.
--
-- issue_close_evidence_required already existed and only required that issue_triage.close_evidence was non-empty. A
-- session could paste any sentence into that column and close an issue whose own remediation contract was failing.
-- That is how fix_hold_rate_30d (0.49), remedy_efficacy_30d (0.23) and the 256-row issue churn were manufactured: a
-- "remedy" closes the issue without the metric moving, then the recurrence guard reopens it.
--
-- This REPLACES the existing trigger in place. It does not add one: AGENT-ISSUES-TRIGGER-DEPTH-1 (agent_issues 2817)
-- records that the agent_issues trigger graph already sits at D1's depth limit, and appending a sixth close-path
-- trigger is the change that previously produced "triggers nested too deep" and blocked remediation_verifications
-- writes. The trigger count on agent_issues stays at 23.
--
-- wontfix is deliberately exempt: declining to fix is a decision, not a claim of resolution. A wontfix may still be
-- closed, subject only to the pre-existing evidence requirement.
--
-- Revert: restore issue_close_evidence_required from bak_20261018_triggers (or the SQL quoted below).
--   CREATE TRIGGER issue_close_evidence_required BEFORE UPDATE OF status ON agent_issues
--   WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
--   AND NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL
--                   AND TRIM(t.close_evidence) <> '')
--   BEGIN SELECT RAISE(ABORT,'close-without-evidence'); END;
--
-- VERIFY AFTER APPLY (run by hand or from the audit tick):
--   1. the guard exists and still counts once:
--      SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='issue_close_evidence_required';  -- 1
--   2. the agent_issues trigger count did not grow (depth budget, issue 2817):
--      SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND tbl_name='agent_issues';                -- 23
--   3. the defect it prevents is visible before and after:
--      SELECT COUNT(*) FROM agent_issues a JOIN remediation_contracts c ON c.issue_id=a.id
--        WHERE a.status IN ('closed','resolved') AND c.status IN ('active','holding')
--          AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error',
--               'probe-not-machine-executable','probe-same-account-host');
--      That count can only FALL over the following days. If it rises, a loop is closing through
--      wontfix to escape the guard and the exemption needs revisiting.

DROP TRIGGER IF EXISTS issue_close_evidence_required;

CREATE TRIGGER issue_close_evidence_required
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  -- unchanged: a closure must record what was observed
  SELECT RAISE(ABORT,'close-without-evidence')
    WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');

  -- new: a claim that the defect is GONE must agree with the fleet's own probe
  SELECT RAISE(ABORT,'close-while-contract-fails')
    WHERE NEW.status IN ('closed','resolved')
      AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id
                    AND c.status IN ('active','holding')
                    AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END;

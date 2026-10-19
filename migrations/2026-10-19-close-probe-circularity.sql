-- CLOSE-PROBE-CIRCULAR-1 (2026-10-19). Owner-facing effect: an issue whose verification contract can only pass AFTER
-- the issue closes stops blocking that close.
--
-- WHY
-- The generic probe template generated contracts of this exact shape for issues with no machine-executable remedy:
--
--   SELECT 'closed' AS expected,
--          (SELECT CASE WHEN status IN ('closed','resolved') THEN 'closed' ELSE NULL END
--             FROM agent_issues WHERE id = <N>) AS observed
--
-- The probe passes only once agent_issues.status is closed. issue_close_evidence_required (CLOSE-BINDS-TO-PROBE-1)
-- refuses a close while the issue's contract has last_verdict in (fail, vacuous-probe-result, probe-error,
-- probe-not-machine-executable, probe-same-account-host). So the contract cannot pass until the close, and the close
-- cannot happen until the contract passes: measured on issue 2967 on 2026-10-18 (filed as 3011) and reproduced on
-- issue 3004 on 2026-10-19 while closing it after its migration applied ok -
-- "close-while-contract-fails: SQLITE_CONSTRAINT".
--
-- MEASURED BEFORE (qnfo-audit, 2026-10-19 13:5xZ)
--   68 contracts on 68 distinct issues carry the template signature ('closed' AS expected + FROM agent_issues WHERE id =)
--   and are in active (33), escalated (27) or holding (8); 59 of those issues are open. Every one is uncloseable by any
--   evidence, however good, and every one is counted as a failed verification by v_verification_verdict_split.
--
-- WHAT THIS DOES
--   Retires those 68 contracts as superseded, naming the rule in last_verdict. Superseded is the right state: the
--   contract verifies nothing (it observes the effect, not the remedy), so the issue's evidence comes from what its
--   closer can read - close_evidence is still required by issue_close_evidence_required, and the CLOSE-BINDS-TO-PROBE-1
--   check only inspects active/holding contracts.
--
-- WHAT THIS DOES NOT DO (stated so it is not read as complete)
--   The GENERATOR is not fixed here. A new issue that gets the same template will file the same contract again; this
--   migration cleans up the standing population, not the source. The source is the probe-template path
--   (module LIKE 'probe-template-%') whose probes are written by the fleet loops; the durable fix is to make the
--   template refuse to emit a probe that reads the guarded issue's own status, which is a worker change and a separate
--   issue. Until then the supersede is what keeps closes possible, and v_verification_verdict_split_v2 reports these
--   rows as superseded-contract rather than a failure.
--
-- SAFETY
--   One UPDATE over a signature-selected set, plus a backup of exactly the rows it can touch. Re-running is a no-op:
--   the WHERE clause requires status IN ('active','escalated','holding'), and the rows are 'superseded' afterwards.
--   Nothing is deleted; no trigger is created or dropped.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_close_probe_circular
-- Rollback: UPDATE remediation_contracts SET status=(SELECT b.status FROM bak_20261019_close_probe_circular b WHERE b.class=remediation_contracts.class), last_verdict=(SELECT b.last_verdict FROM bak_20261019_close_probe_circular b WHERE b.class=remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_close_probe_circular);
--
-- Verify after apply:
--   SELECT status, count(*) FROM remediation_contracts WHERE instr(verify_probe,'''closed'' AS expected')>0
--     AND instr(verify_probe,'FROM agent_issues WHERE id =')>0 GROUP BY 1;      -- expect only 'superseded'
--   SELECT count(*) FROM remediation_contracts WHERE status IN ('active','holding')
--     AND instr(verify_probe,'FROM agent_issues WHERE id =')>0;                 -- expect 0

CREATE TABLE IF NOT EXISTS bak_20261019_close_probe_circular AS
SELECT class, status, last_verdict, verify_probe, issue_id
  FROM remediation_contracts
 WHERE instr(COALESCE(verify_probe, ''), '''closed'' AS expected') > 0
   AND instr(COALESCE(verify_probe, ''), 'FROM agent_issues WHERE id =') > 0
   AND status IN ('active', 'escalated', 'holding');

UPDATE remediation_contracts
   SET status = 'superseded',
       last_verdict = 'superseded:closure-observing-probe (CLOSE-PROBE-CIRCULAR-1: the probe reads the guarded issue''s own status, so it cannot pass before the close it is blocking; evidence now comes from close_evidence)'
 WHERE instr(COALESCE(verify_probe, ''), '''closed'' AS expected') > 0
   AND instr(COALESCE(verify_probe, ''), 'FROM agent_issues WHERE id =') > 0
   AND status IN ('active', 'escalated', 'holding');

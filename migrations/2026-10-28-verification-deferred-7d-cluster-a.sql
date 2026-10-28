-- VERIFICATION-DEFERRED-7D-1 cluster A (2026-10-28, charter pillar autonomy; issues 2954, 1000463, 1000570, 1000590, 1000722-1000733).
-- WHAT WAS FOUND (read 2026-10-28 19:15Z from live qnfo-audit): three kinds of contract had read 'pending' for 7+ days.
--   (1) CONTRACT-BACKFILL-1 contracts (class issue-<n>-BACKFILL-1, 12 of them named by the cluster and more by the umbrella issue 2954) whose probe ends ELSE 'pending' (a bare pending, no reason). Their
--       condition is "issue <n> is closed with close_evidence"; while the issue is open that is a real, known answer (not yet), not "cannot judge", so the probe has been deferring a verdict it can give.
--   (2) issue-100314 (guards PROBE-NEEDED-1 for issue 100308) and research-terminal-rem-0039 (guards issue 100205): the guarded issues 100314, 100308 and 100205 are all closed with evidence, so both contracts
--       guard a closed issue and wait for a state nobody will supply (rem-0039 is parked by PARKED-POISON-1 with recover_count 3 and terminal_rearms 0, so the re-arm branch of its probe can never fire).
--   (3) goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1 waits on a real external date: its 30-day no-lockout window from 2026-10-06T06:30Z ends 2026-11-05 06:30Z. It already names its unblocker ('pending: 30-day window ...').
-- WHAT THIS FILE DOES: (1) every active, deferring BACKFILL-1 contract of an OPEN issue gets a probe that gives a real verdict: 'closed-with-evidence' when the issue is closed with close_evidence, else
--   'open: issue <n> is not closed with close_evidence yet (doer: <escalate_to>)' (a verdict that is not pending, so the consumer records pass or fail instead of a deferral); deferred_since is cleared and the contract is
--   due now. (2) the two contracts on closed issues are superseded with the established disposition text. (3) the TP-9 contract is parked as 'holding' (a status the PARKED-REARM-1 step 6 does not re-arm; probing continues
--   hourly, the probe is unchanged and still reaches a verdict the first tick after 2026-11-05 06:30Z), with a decision_log row naming the class, as the lever of VERIFICATION-DEFERRED-7D-1 allows.
-- PREDICTION: within two remediation-consumer runs the 15 named contracts are no longer 'active and deferred', contracts of the form issue-1000xxx for 1000463..1000733 read 'cleared' and close their issues, and the
--   umbrella contract issue-2954 observed count falls by the number of BACKFILL-1 contracts converted. Guard: remediation_latest_pass_pct_7d must not fall by more than the converted count / verified rows (checked after).
-- spof-review: none added. No DELETE or DROP runs in this file; the BACKUP table below is created first for the Rollback.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261028_vd7d_cluster_a
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261028_vd7d_cluster_a b WHERE b.class = remediation_contracts.class), status = (SELECT b.status FROM bak_20261028_vd7d_cluster_a b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261028_vd7d_cluster_a b WHERE b.class = remediation_contracts.class), deferred_since = (SELECT b.deferred_since FROM bak_20261028_vd7d_cluster_a b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261028_vd7d_cluster_a b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261028_vd7d_cluster_a);

-- 0. Backup for the Rollback: every contract this file may touch.
CREATE TABLE IF NOT EXISTS bak_20261028_vd7d_cluster_a AS
SELECT class, issue_id, verify_probe, status, last_verdict, deferred_since, next_due_at FROM remediation_contracts
WHERE class IN ('issue-100314', 'research-terminal-rem-0039', 'goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1')
   OR (class LIKE 'issue-%-BACKFILL-1' AND status = 'active' AND last_verdict LIKE 'deferred%');

-- 1. BACKFILL-1 contracts of open issues: give the real verdict now.
UPDATE remediation_contracts
SET verify_probe = 'SELECT ''closed-with-evidence'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id WHERE a.id = ' || issue_id || ' AND a.status = ''closed'' AND COALESCE(t.close_evidence, '''') <> '''') THEN ''closed-with-evidence'' ELSE ''open: issue ' || issue_id || ' is not closed with close_evidence yet (doer: ' || escalate_to || ')'' END AS observed',
    deferred_since = NULL, next_due_at = datetime('now')
WHERE class LIKE 'issue-%-BACKFILL-1' AND status = 'active' AND last_verdict LIKE 'deferred%'
  AND instr(verify_probe, 'ELSE ''pending'' END AS actual') > 0
  AND issue_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open');

-- 2. Contracts on closed issues: superseded (the established disposition).
UPDATE remediation_contracts
SET status = 'superseded', deferred_since = NULL, next_due_at = NULL,
    last_verdict = 'superseded:contract-on-closed-issue (issue already closed with close_evidence; VERIFICATION-DEFERRED-7D-1 cluster A)'
WHERE class IN ('issue-100314', 'research-terminal-rem-0039') AND status = 'active'
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'closed');

-- 3. TP-9: genuinely awaiting 2026-11-05 06:30Z. Parked as holding with a recorded decision; the probe stays unchanged.
UPDATE remediation_contracts
SET status = 'holding', deferred_since = NULL
WHERE class = 'goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1' AND status = 'active' AND last_verdict LIKE 'deferred%';

-- 4. The decision (append-only, one row, guarded against a replay).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'cluster-a (VERIFICATION-DEFERRED-7D-1 session 2026-10-28)',
  'a deferral is for a condition that cannot be judged yet; a known answer (issue still open) is a verdict, a contract on a closed issue is superseded, and a real external date window is parked with its reason',
  'VERIFICATION-DEFERRED-7D-1 cluster A: BACKFILL-1 contracts of open issues now return open:/closed-with-evidence, issue-100314 and research-terminal-rem-0039 superseded (guarded issues closed), goal-TP-9-DEPLOY-PATH-NO-LOCKOUT-1 parked as holding until its window ends 2026-11-05T06:30Z (names issue-1000463)',
  'read 2026-10-28 19:15Z: contracts deferred since 2026-10-19..21 with 327-438 attempts; issues 100205, 100308, 100314 closed; research_queue rem-0039 stage parked recover_count 3 terminal_rearms 0; TP-9 probe: datetime now < 2026-11-05 06:30',
  'applied through the canonical path on merge',
  'qnfo-audit remediation_contracts rows listed in bak_20261028_vd7d_cluster_a',
  'Rollback header of migrations/2026-10-28-verification-deferred-7d-cluster-a.sql restores probe, status, verdict, deferred_since and next_due_at from the backup table',
  'deferral-to-verdict',
  'deferring active contracts older than 7 days falls by at least 15 within 2 hours of apply; issue-2954 observed falls accordingly',
  NULL,
  'qnfo-audit remediation_contracts, v_remediation_evidence_all'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'VERIFICATION-DEFERRED-7D-1 cluster A:%');

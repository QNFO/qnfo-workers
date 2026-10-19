-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_detector_restore
-- Rollback: UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261019_detector_restore b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261019_detector_restore b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261019_detector_restore b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_detector_restore)
-- spof-review: removes a single point of failure (one out-of-band sweep switched off every standing detector at once); adds none
--
-- DETECTOR-RESTORE-1 (2026-10-19, pillar autonomy; agent_issues 2987, docs/HANDOFF-2026-10-18-VERIFICATION-AUDIT.md section 5.1).
-- WHY
-- At 2026-10-18 12:17-12:19Z an out-of-band contract-lifecycle rewrite (in no file of main and no D1 trigger) superseded 1,039 contracts.
-- 245 of them were set 'superseded:contract-on-missing-issue (issue_id points at no row; nothing to fix and nothing to verify)'. For 241 of
-- those the premise is false: they are standing detectors whose issue_id is NULL by design, not a pointer to a deleted issue. Measured
-- 2026-10-19 04:40Z: 178 failure-mode detectors (fm-*, ANTIFRAGILE-1 "every failure mode gets an fm-<key> detector"), 51 runtime liveness
-- probes (rt-*, runtime_verified_share_24h), 9 belief probes (belief-*, DOCTRINE-1 belief_registry), plane-living-paper-fresh and
-- EVID-GATE-A2-PUBLISHV2, each with 120-376 hourly attempts before the sweep and none after it. v_failure_mode_status and every metric fed
-- by those probes have been blind since 12:17Z on 2026-10-18; only 2 fm-* contracts (both tied to an issue) still run.
-- WHAT
--   bak_20261019_detector_restore  the 241 rows as the sweep left them (status, verdict, next_due_at kept for the rollback)
--   the same rows                  status 'active', due now, verdict naming this file; attempts and probes untouched
--   fm-standing-detector-superseded  a failure mode and its detector: no contract with issue_id NULL carries the missing-issue verdict
-- The three issue-NNNN contracts with the same verdict point at issue ids that are absent; they are left to 2987, as are the other
-- 794 supersedes, the escalated and monitoring moves, and the CLOSE-BINDS-TO-PROBE-1 trigger.

CREATE TABLE IF NOT EXISTS bak_20261019_detector_restore AS
  SELECT * FROM remediation_contracts
   WHERE status = 'superseded' AND issue_id IS NULL AND last_verdict LIKE 'superseded:contract-on-missing-issue%';

UPDATE remediation_contracts
   SET status = 'active', next_due_at = datetime('now'),
       last_verdict = 'restored: DETECTOR-RESTORE-1 (a standing detector has no issue by design; superseded by the 2026-10-18 12:17Z out-of-band rewrite, agent_issues 2987)'
 WHERE status = 'superseded' AND issue_id IS NULL AND last_verdict LIKE 'superseded:contract-on-missing-issue%'
   AND class IN (SELECT class FROM bak_20261019_detector_restore);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('standing-detector-superseded',
  'a contract-lifecycle sweep supersedes standing detectors (fm-*, rt-*, belief-* and peers) as contracts on a missing issue, so every failure-mode, liveness and belief probe stops at once',
  'the 2026-10-18 12:17Z rewrite read issue_id NULL as a pointer to a deleted issue; a standing detector carries no issue by design',
  'DETECTOR-RESTORE-1 (migrations/2026-10-19-detector-restore.sql): the 241 detectors re-activated from bak_20261019_detector_restore; a lifecycle sweep exempts issue_id NULL contracts (agent_issues 2987)',
  'no remediation_contracts row with issue_id NULL carries the verdict superseded:contract-on-missing-issue',
  'fm-standing-detector-superseded', '2026-10-19', 2987,
  'a sweep or script supersedes contracts whose issue_id is NULL',
  '2026-10-18 12:17Z to 2026-10-19 04:40Z: 178 fm-*, 51 rt-*, 9 belief-* and 3 other standing detectors superseded, 2 fm-* left running',
  'every failure-mode detector, runtime liveness probe and belief probe');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-standing-detector-superseded', NULL, 'DETECTOR-RESTORE-1', 'failure-mode detector',
  'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM remediation_contracts WHERE issue_id IS NULL AND status = ''superseded'' AND last_verdict LIKE ''superseded:contract-on-missing-issue%'') = 0 THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA',
  'a contract with issue_id NULL is a standing detector, so "contract on a missing issue" never applies to it',
  'DETECTOR-RESTORE-1: re-activate the 241 standing detectors the 2026-10-18 out-of-band rewrite superseded as contract-on-missing-issue, with a backup and a detector against recurrence',
  'remediation_contracts 2026-10-19 04:40Z: 178 fm-*, 51 rt-*, 9 belief-* and 3 other issue_id NULL contracts superseded at 12:17:08Z on 2026-10-18 after 120-376 hourly attempts each; 2 fm-* still active',
  'migration merged', '241 contract rows (status, verdict, due time); probes and attempts unchanged', 'the Rollback header (from bak_20261019_detector_restore)',
  'the fleet''s failure-mode, liveness and belief probes run again',
  'within 70 minutes of the apply at least 200 of the 241 restored contracts have a last_attempt_at after the apply, and fm-standing-detector-superseded reads pass',
  'the owner''s dashboard shows live failure-mode and liveness state again', 'd1:qnfo-audit remediation_contracts, remediation_verifications'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'DETECTOR-RESTORE-1:') = 1);

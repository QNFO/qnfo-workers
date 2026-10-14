-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-backlog-close-on-stale-pass'; DELETE FROM failure_modes WHERE fm_key = 'backlog-close-on-stale-pass'; UPDATE issue_triage SET close_evidence = (SELECT close_evidence FROM bak_20261014_triage_latest_pass b WHERE b.issue_id = issue_triage.issue_id) WHERE issue_id IN (2222, 2050); DELETE FROM decision_log WHERE instr(action, 'BACKLOG-LATEST-PASS-1:') = 1
-- BACKLOG-LATEST-PASS-1 (2026-10-14, pillar autonomy; agent_issues 2222). qnfo-lifecycle 1.11.2 (backlog member 2.0.7, same pull request) closes an
-- issue on a verified remediation only when the issue's latest verification passed within 3 hours. Before, any pass in 7 days closed it:
-- 2222 (companion stall) at 2026-10-14 02:01 UTC on a 2026-10-09 pass while its 01:44 verification failed, and 2050, 1947 and 2086 in the week
-- before. 1947 and 2086 have passed since. 2222 and 2050 still fail, so their close records are corrected to name the issue that carries the
-- live defect (the old text is kept in the backup table first). Failure mode with a code-read detector, and the decision.
CREATE TABLE IF NOT EXISTS bak_20261014_triage_latest_pass AS SELECT * FROM issue_triage WHERE issue_id IN (2222, 2050);
UPDATE issue_triage SET close_evidence = 'superseded by 2552 (COMPANION-PUBLISH-STALL-AUTO-1, refiled 2026-10-14 02:11 UTC; the stall continues there). The 02:01 UTC auto-close of 2222 rested on a 2026-10-09 pass while its latest verification (01:44 UTC, "companion_hours_since_last_piece reads 93.1") failed; BACKLOG-LATEST-PASS-1 removes that rule. Prior record: ' || COALESCE(close_evidence, '')
WHERE issue_id = 2222 AND instr(COALESCE(close_evidence, ''), 'superseded by 2552') = 0;
UPDATE issue_triage SET close_evidence = 'superseded by 2116 (PROMPT-CACHE-PREFIX-1): the latest verification of 2050 (2026-10-14 02:08 UTC) reads "pending: check 3 (PROMPT-CACHE-1) waits on open issues 2116", its only unmet check. The 2026-10-09 auto-close rested on an older pass; BACKLOG-LATEST-PASS-1 removes that rule. Prior record: ' || COALESCE(close_evidence, '')
WHERE issue_id = 2050 AND instr(COALESCE(close_evidence, ''), 'superseded by 2116') = 0;
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('backlog-close-on-stale-pass', 'the backlog drain closed issues on a verification pass days old while the latest verification failed, so live defects left the open count',
  'VERIFIED-REMEDIATION-CLOSURE-1 in backlogMod selected any remediation_verifications row with pass=1 in 7 days instead of the latest row',
  'BACKLOG-LATEST-PASS-1 (qnfo-lifecycle 1.11.2, member 2.0.7): only the latest verification counts, it must pass and be at most 3 hours old, and the close evidence names it',
  'qnfo-lifecycle/worker.js on main reads the latest verification row', 'fm-backlog-close-on-stale-pass', '2026-10-14', 2222,
  'an open issue with an old passing verification and a newer failing one', 'agent_issues 2222 closed 2026-10-14 02:01 UTC with its 01:44 verification failing; 2050, 1947, 2086 closed the same way in the week before', 'every open issue the drain reads');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-backlog-close-on-stale-pass', NULL, 'BACKLOG-LATEST-PASS-1', 'failure-mode detector', '{"paths": ["qnfo-lifecycle/worker.js"], "contains": "FROM remediation_verifications WHERE issue_id=?1 ORDER BY id DESC LIMIT 1"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'an issue is fixed when its latest verification passes, not when any past one did; closing on a stale pass lowers the open count while the defect stays live',
  'BACKLOG-LATEST-PASS-1: qnfo-lifecycle 1.11.2 (backlog member 2.0.7) closes on a verified remediation only when the issue''s latest verification passed within 3 hours; the close records of 2222 and 2050 are corrected to superseded by 2552 and 2116',
  'issue_triage 2222 close_evidence "backlog-exec v1.6.1 evidence-first auto-close 2026-10-14T02:01:00Z" with remediation_verifications issue-2222 pass=0 at 01:44:22 and pass=1 rows only from 2026-10-09; same pattern for 2050, 1947, 2086 in 7 days',
  'merged through the canonical path', 'the backlog drain''s verified-remediation closure', 'revert of qnfo-lifecycle 1.11.2',
  'the backlog drain closes only issues whose latest verification proves the fix',
  'in the 7 days after the deploy, no issue_triage row closed by the backlog drain has a failing latest verification at its close time',
  'none', 'd1:issue_triage, remediation_verifications, issue_lifecycle; code:qnfo-lifecycle backlogMod run'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'BACKLOG-LATEST-PASS-1:') = 1);

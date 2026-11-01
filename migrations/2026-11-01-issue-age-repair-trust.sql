-- ISSUE-AGE-REPAIR-TRUST-1 (2026-11-01, charter pillar autonomy; issue 99945).
-- Live qnfo-audit read: issue_auto_close_2h_share_24h = 0.262 and 180 open ISSUE-AGE-24H-REPAIR-1 notices had plan outcome untrusted.
-- qnfo-code-orchestrator and the merge runner share code_merge_trusted_sources. Admit only these generated notice titles, then re-arm their
-- stale untrusted verdicts so the normal planner, deny list, WIP/daily caps, and merge checks decide each one. No issue is closed here.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_issue_age_repair_trust_plans
-- Rollback: UPDATE ops_config SET value = REPLACE(value, ',qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:', ''), updated_at = datetime('now') WHERE key = 'code_merge_trusted_sources' AND instr(COALESCE((SELECT value FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261101-issue-age-repair-trust'), ''), 'qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:') = 0; UPDATE issue_plans SET planned_at = (SELECT b.planned_at FROM bak_20261101_issue_age_repair_trust_plans b WHERE b.issue_id = issue_plans.issue_id), outcome = (SELECT b.outcome FROM bak_20261101_issue_age_repair_trust_plans b WHERE b.issue_id = issue_plans.issue_id), detail = (SELECT b.detail FROM bak_20261101_issue_age_repair_trust_plans b WHERE b.issue_id = issue_plans.issue_id), task_id = (SELECT b.task_id FROM bak_20261101_issue_age_repair_trust_plans b WHERE b.issue_id = issue_plans.issue_id), path = (SELECT b.path FROM bak_20261101_issue_age_repair_trust_plans b WHERE b.issue_id = issue_plans.issue_id), model = (SELECT b.model FROM bak_20261101_issue_age_repair_trust_plans b WHERE b.issue_id = issue_plans.issue_id), attempts = (SELECT b.attempts FROM bak_20261101_issue_age_repair_trust_plans b WHERE b.issue_id = issue_plans.issue_id) WHERE issue_id IN (SELECT issue_id FROM bak_20261101_issue_age_repair_trust_plans) AND instr(COALESCE(detail, ''), 'ISSUE-AGE-REPAIR-TRUST-1 re-arm') > 0; UPDATE control_registry SET alternate_path = (SELECT b.alternate_path FROM bak_20261101_issue_age_repair_trust_control b WHERE b.control = control_registry.control), evidence = (SELECT b.evidence FROM bak_20261101_issue_age_repair_trust_control b WHERE b.control = control_registry.control), reviewed_at = (SELECT b.reviewed_at FROM bak_20261101_issue_age_repair_trust_control b WHERE b.control = control_registry.control) WHERE control = 'code-merge-trusted-sources' AND alternate_path = 'none needed' AND evidence LIKE '%ISSUE-AGE-REPAIR-TRUST-1%'

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at)
SELECT 'code_merge_trusted_sources--bak-20261101-issue-age-repair-trust', value, note, updated_at
FROM ops_config
WHERE key = 'code_merge_trusted_sources'
  AND trim(COALESCE(value, '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261101-issue-age-repair-trust');

UPDATE ops_config
SET value = value || ',qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:',
    updated_at = datetime('now')
WHERE key = 'code_merge_trusted_sources'
  AND trim(COALESCE(value, '')) <> ''
  AND instr(value, 'qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:') = 0
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261101-issue-age-repair-trust');

CREATE TABLE IF NOT EXISTS bak_20261101_issue_age_repair_trust_plans AS
SELECT p.issue_id, p.planned_at, p.outcome, p.detail, p.task_id, p.path, p.model, p.attempts
FROM issue_plans p
JOIN agent_issues a ON a.id = p.issue_id
WHERE 0;

INSERT OR IGNORE INTO bak_20261101_issue_age_repair_trust_plans
SELECT p.issue_id, p.planned_at, p.outcome, p.detail, p.task_id, p.path, p.model, p.attempts
FROM issue_plans p
JOIN agent_issues a ON a.id = p.issue_id
WHERE a.status = 'open'
  AND a.source = 'qnfo-fleet-control'
  AND a.title LIKE 'ISSUE-AGE-24H-REPAIR-1:%'
  AND p.outcome = 'untrusted'
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources' AND instr(value, 'qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:') > 0);

UPDATE issue_plans
SET planned_at = '2000-01-01T00:00:00Z',
    detail = substr('ISSUE-AGE-REPAIR-TRUST-1 re-arm (was untrusted at ' || planned_at || '): ' || COALESCE(detail, ''), 1, 600)
WHERE outcome = 'untrusted'
  AND instr(COALESCE(detail, ''), 'ISSUE-AGE-REPAIR-TRUST-1 re-arm') = 0
  AND issue_id IN (
    SELECT a.id
    FROM agent_issues a
    WHERE a.status = 'open'
      AND a.source = 'qnfo-fleet-control'
      AND a.title LIKE 'ISSUE-AGE-24H-REPAIR-1:%'
  )
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources' AND instr(value, 'qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:') > 0);

CREATE TABLE IF NOT EXISTS bak_20261101_issue_age_repair_trust_control AS
SELECT control, alternate_path, evidence, reviewed_at
FROM control_registry
WHERE control = 'code-merge-trusted-sources' AND 0;

INSERT OR IGNORE INTO bak_20261101_issue_age_repair_trust_control
SELECT control, alternate_path, evidence, reviewed_at
FROM control_registry
WHERE control = 'code-merge-trusted-sources'
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources' AND instr(value, 'qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:') > 0);

UPDATE control_registry
SET alternate_path = 'none needed',
    evidence = evidence || ' | ISSUE-AGE-REPAIR-TRUST-1 2026-11-01: ALTERNATE-NOT-EXERCISABLE: planner and merge runner share this single provenance list; a session PR changes policy but is not a second issue-planning executor',
    reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'code-merge-trusted-sources'
  AND instr(evidence, 'ISSUE-AGE-REPAIR-TRUST-1') = 0
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources' AND instr(value, 'qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:') > 0);

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES
  ('issue-age-repair-untrusted', 'age-repair notices are never considered by the trusted code planner',
   'qnfo-fleet-control age-repair notices had no exact source/title pair in the shared code_merge_trusted_sources list, so the planner recorded untrusted verdicts that it would not revisit for seven days',
   'admit only the generated ISSUE-AGE-24H-REPAIR-1 title prefix and re-arm its open untrusted plans for normal planner review',
   'fm-issue-age-repair-untrusted', 'fm-issue-age-repair-untrusted', '2026-11-01', 99945,
   'an open qnfo-fleet-control ISSUE-AGE-24H-REPAIR-1 notice has an untrusted plan verdict that was not re-armed',
   'age-repair notices have no planner doer and remain open beyond their two-hour SLA',
   'issue-age repair notices and issue_auto_close_2h_share_24h');

INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES
  ('fm-issue-age-repair-untrusted', 99945,
   'SELECT ''0'' AS expected, CAST((CASE WHEN instr(COALESCE((SELECT value FROM ops_config WHERE key = ''code_merge_trusted_sources''), ''''), ''qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:'') = 0 THEN 1 ELSE 0 END) + (SELECT COUNT(*) FROM issue_plans p JOIN agent_issues a ON a.id = p.issue_id WHERE a.status = ''open'' AND a.source = ''qnfo-fleet-control'' AND a.title LIKE ''ISSUE-AGE-24H-REPAIR-1:%'' AND p.outcome = ''untrusted'' AND p.planned_at <> ''2000-01-01T00:00:00Z'') AS TEXT) AS observed',
   'd1-query', 1000, 1, 'active',
   'The shared trusted-source list and issue plans are readable in qnfo-audit.',
   'Keep the issue-age repair title prefix narrowly trusted and re-arm stale verdicts only for matching open notices.',
   'qnfo-code-orchestrator');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot:99945',
  'The internal age-repair notices contain generated issue identifiers, and their planner rejection is caused by one missing exact source/title rule rather than an unsafe source-wide trust gap.',
  'ISSUE-AGE-REPAIR-TRUST-1: append qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1: to the shared trust list and re-arm only matching open untrusted plans.',
  'Live qnfo-audit read 2026-11-01: issue_auto_close_2h_share_24h = 0.262; 180 open age-repair notices had outcome untrusted; code_merge_trusted_sources lacked their title prefix.',
  'The normal planner can re-evaluate these notices under its existing deny, WIP, daily-cap, and merge checks; closures remain governed by their existing outcome probes.',
  'One exact trusted-source prefix, matching open issue_plans rows, the shared control record, and one failure-mode detector contract.',
  'The Rollback line removes only this prefix, restores plans still carrying this migration marker, and restores the control-record values from their backups.',
  'Age-repair notices become eligible for existing planner review without trusting other qnfo-fleet-control issues or closing issues without evidence.',
  'issue_auto_close_2h_share_24h > 0.262 within 24 h',
  'No direct external reach gain.',
  'Read-only qnfo-audit metric, issue_plans, and trust-list reads; migrations/issue-age-repair-trust.test.mjs; scripts/apply_migrations.py --check'
WHERE EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources' AND instr(value, 'qnfo-fleet-control|ISSUE-AGE-24H-REPAIR-1:') > 0)
  AND NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'ISSUE-AGE-REPAIR-TRUST-1:%');

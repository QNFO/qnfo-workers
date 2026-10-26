-- BREACH-DOCTOR-TRUST-1 (2026-10-26, charter pillar: autonomy; agent_issues 1000266 BREACH-DOCTOR-1; second file of that change, the first is migrations/2026-10-26-breach-doctor.sql).
-- The breach doctor (qnfo-fleet-control 0.52.0) files one kind of issue by itself: "BREACH-DOCTOR-1: self <rule> <code>", after 3 failed cases of one issue; and, only if the generic
-- playbook-gap row is ever switched to mode on, "BREACH-DOCTOR-1: playbook gap <family>". Both are built only from playbook constants, ids, counts and enum codes (the doctor's taint rule:
-- bdFactsSafe and bdWriteWhy, counted by doctor_taint_violations_24h), so they carry no text from outside the fleet. Without a trusted (source, title-prefix) pair the planner records them as
-- untrusted and ignores them for 7 days, which would leave the doctor's own work items without a doer. This appends the single pair qnfo-fleet-control|BREACH-DOCTOR-1: to
-- ops_config.code_merge_trusted_sources (a comma list; the same shape as qnfo-fleet-control|METRIC-REGRESSION-1:, qnfo-fleet-control|METRIC-FIX-RELAPSED-1: and qnfo-fleet-control|METRIC-TRIGGER-).
-- No bare source is added, and no cloud_ops_events:* source. PLAN_TRUSTED code is unchanged. The planner (qnfo-code-orchestrator) and the merge runner (qnfo-fleet-control cmTrusted) read this
-- same row; the planner's deny list and the merge runner's checks apply to a doctor issue exactly as to any other. Live value read 2026-10-26 10:00Z (SELECT only): the pair was absent.
-- The previous value is kept in ops_config under the backup key below, and the Rollback line restores it. A replay changes nothing: the append is guarded by instr, the backup by its key.
-- A missing or empty row is left alone (an append would shrink the planner's list to this one pair): the file then writes no backup, no append and no decision_log row.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = (SELECT value FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261026T0800Z'), updated_at = datetime('now') WHERE key = 'code_merge_trusted_sources' AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261026T0800Z');

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at)
SELECT 'code_merge_trusted_sources--bak-20261026T0800Z', value, 'backup before BREACH-DOCTOR-TRUST-1 (migrations/2026-10-26-breach-doctor-trust.sql) appended qnfo-fleet-control|BREACH-DOCTOR-1:; restore by copying value back to code_merge_trusted_sources', datetime('now')
FROM ops_config WHERE key = 'code_merge_trusted_sources' AND trim(COALESCE(value, '')) <> ''
  AND NOT EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261026T0800Z');

UPDATE ops_config SET value = value || ',qnfo-fleet-control|BREACH-DOCTOR-1:', updated_at = datetime('now')
WHERE key = 'code_merge_trusted_sources' AND trim(COALESCE(value, '')) <> ''
  AND instr(value, 'qnfo-fleet-control|BREACH-DOCTOR-1:') = 0
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources--bak-20261026T0800Z');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'an issue titled BREACH-DOCTOR-1: from source qnfo-fleet-control holds only playbook constants, ids, counts and enum codes (the doctor''s taint rule), so the planner may read it as trusted like the other qnfo-fleet-control prefixes; a bare source or a cloud_ops_events:* source would trust text from outside the fleet and is not added',
  'BREACH-DOCTOR-TRUST-1: append the single pair qnfo-fleet-control|BREACH-DOCTOR-1: to ops_config code_merge_trusted_sources, with the previous value kept under the key code_merge_trusted_sources--bak-20261026T0800Z; PLAN_TRUSTED code and every other entry unchanged',
  'live qnfo-audit 2026-10-26 10:00Z: code_merge_trusted_sources lists 35 entries and not this pair; the same source already has METRIC-TRIGGER-, REACH-IDEA-, TP-, METRIC-FIX-RELAPSED-1: and METRIC-REGRESSION-1:; the doctor''s only issue by itself is the self issue after 3 failed cases (playbook-gap is seeded in measure and files none)',
  'migration merged and applied by CI (migration_runs ok); the planner and the merge runner read the same row',
  'issues titled BREACH-DOCTOR-1: from source qnfo-fleet-control: none today (the tracking issue 1000266 has source claude-session and is unaffected), the doctor''s self issue later; the planner deny list and the merge runner checks apply unchanged',
  'the Rollback header line restores the value from the backup key; removing the pair by hand has the same effect',
  'the planner reads the breach doctor''s own issues as trusted, so they get a doer',
  'doctor_taint_violations_24h = 0 within 24 h',
  'none', 'ops_config code_merge_trusted_sources; migrations/breach-doctor-trust.test.mjs'
WHERE EXISTS (SELECT 1 FROM ops_config WHERE key = 'code_merge_trusted_sources' AND instr(value, 'qnfo-fleet-control|BREACH-DOCTOR-1:') > 0)
  AND NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'BREACH-DOCTOR-TRUST-1%');

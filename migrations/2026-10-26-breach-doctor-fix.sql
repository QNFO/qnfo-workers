-- BREACH-DOCTOR-FIX-1 (2026-10-26, charter pillar autonomy; agent_issues 1000266; review of PR 4558, qnfo-fleet-control 0.52.0 -> 0.53.0).
-- The data half of three review findings; the engine half is qnfo-fleet-control/worker.js (block BREACH-DOCTOR-1) and is covered by qnfo-fleet-control/breach-doctor.test.mjs.
-- migrations/2026-10-26-breach-doctor.sql is applied and is not edited (a changed file would hash as a new run); every change to its rows is made here, guarded so a replay changes nothing.
--
--   1. WRITE ALLOWLIST (S1). bdWriteWhy only checked that ?1 appeared somewhere, so "UPDATE ops_config SET value = 'off' WHERE key = 'breach_doctor' AND ?1 > 0" passed, and the ledger said every
--      applied action was "bound to the issue". 0.53.0 requires a top-level id = ?1 predicate and no OR in every action and revert statement, and takes ops_config (the kill switch and the
--      trusted-source list) and human_actions off the tables a playbook may write; no v1 rule needs them. This file corrects the control row that described the old gate. No decision_log row
--      carrying the old wording exists (live read 2026-10-26 10:51Z: 0 rows by actor qnfo-fleet-control:breach-doctor, 120 cases, none applied), so there is nothing append-only to correct.
--   2. AUTO-DEMOTION WAS A HOLD WITH NO EXPIRY (ANTIFRAGILE-1). Two failed or reverted cases in 24 hours set a playbook to measure and nothing ever set it back; fm-breach-doctor-rule-demoted
--      counted the demote events of the last 24 hours and went green while the rule stayed latched. 0.53.0 releases a demoted rule to a trial after 60 minutes (one case a tick; a failed trial case
--      demotes it again; a verified one lifts the cap) and treats an action that changed no row on an issue closed meanwhile (ISSUE-HYGIENE-1 runs hourly on the same families) as a supersede,
--      not a failure. The pause is a control_registry row with its reason and expiry, and fm-breach-doctor-rule-latched reads the durable row state, so a release that itself fails is seen.
--   3. 180-MINUTE DIAGNOSIS THRESHOLD. breaches_undiagnosed_over_60m flagged an unowned issue at breach_doctor_min_age_min + 60 = 180 minutes. No threshold exceeds 120 minutes (SLA-120M-1,
--      ISSUE-SLA-2H-1), and the doctor starting at 120 left no time to verify (two passes, 20 minutes) inside the 2-hour issue SLA. The age gate is now 60 minutes and the metric flags at
--      min(120, age gate + 60) = 120 minutes; the formula text says so. The metric name keeps its "60": it is the grace past the age gate.
--
-- Revert of the data: the Rollback line. The engine half reverts with the deploy of the previous VERSION (canary revert) or ops_config breach_doctor = off.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = '120' WHERE key = 'breach_doctor_min_age_min' AND value = '60'; UPDATE metric_registry SET formula = replace(formula, 'min(120, breach_doctor_min_age_min + 60) minutes (120 by default: the age gate is 60 minutes and the flag comes 60 minutes after it, never later than 120)', 'breach_doctor_min_age_min + 60 minutes (180 by default)') WHERE metric = 'breaches_undiagnosed_over_60m'; UPDATE control_registry SET location = 'qnfo-fleet-control bdWriteWhy(): the only writes a playbook can make are one INSERT or UPDATE on six named tables, plus the three action kinds written in code' WHERE control = 'breach-doctor-action-allowlist'; DELETE FROM control_registry WHERE control IN ('breach-doctor-auto-demotion', 'breach-doctor-age-gate'); DELETE FROM remediation_contracts WHERE class = 'fm-breach-doctor-rule-latched'; DELETE FROM failure_modes WHERE fm_key = 'breach-doctor-rule-latched'; DELETE FROM capability_ledger WHERE capability = 'breach-doctor:release-demoted-rule'; the decision_log row stays (append-only), and a rule left in trial is set to measure by UPDATE breach_playbooks SET mode = 'measure' WHERE note LIKE 'trial %' before the engine is rolled back.
-- spof-review: no new cron, worker or binding; the release rides the existing */10 tick of qnfo-fleet-control.

-- 3. the age gate. Compare-and-set: a value another migration or the owner changed is not overwritten, and a replay does nothing.
UPDATE ops_config SET value = '60', updated_at = datetime('now'),
  note = 'BREACH-DOCTOR-FIX-1 (2026-10-26): 60 minutes, was 120. ' || COALESCE(note, '') || ' The doctor starts at 60 minutes so a case has the rest of the 120-minute issue SLA to be applied and verified twice; breaches_undiagnosed_over_60m flags 60 minutes after the gate, never later than 120.'
WHERE key = 'breach_doctor_min_age_min' AND value = '120';

UPDATE metric_registry SET formula = replace(formula, 'breach_doctor_min_age_min + 60 minutes (180 by default)',
  'min(120, breach_doctor_min_age_min + 60) minutes (120 by default: the age gate is 60 minutes and the flag comes 60 minutes after it, never later than 120)')
WHERE metric = 'breaches_undiagnosed_over_60m';

-- 1. the write allowlist control now describes what bdWriteWhy enforces
UPDATE control_registry SET
  location = 'qnfo-fleet-control bdWriteWhy(): the only writes a playbook can make are one INSERT or UPDATE on four named tables (issue_triage, agent_issues UPDATE only, remediation_contracts, issue_plans), each statement with a top-level id = ?1 or issue_id = ?1 predicate and no OR beside it, plus the three action kinds written in code; ops_config and human_actions are not writable',
  evidence = 'playbooks are data, the action kinds are code (S1, S2). Review 2026-10-26: the first gate only required ?1 to appear, so a statement on ops_config (the kill switch, the trusted-source list) or an update with WHERE ?1 > 0 passed; 0.53.0 refuses them (table-not-allowed, no-id-predicate, or-widens), proved by the refusal cases of qnfo-fleet-control/breach-doctor.test.mjs'
WHERE control = 'breach-doctor-action-allowlist';

-- 2. the demotion is a pause with a release
INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence) VALUES
 ('breach-doctor-auto-demotion', 'qnfo-fleet-control bdLoadRules(): breach_playbooks.mode = measure with a note starting "demoted <time>" after 2 failed or reverted cases of one rule in 24 hours (1 in a trial)', 'pause',
  'a playbook whose guard or verify_sql does not match live data acting again at once and spending the tick''s action budget on cases that fail', 0, 'replace', 'applied',
  'automatic release: BD_RELEASE_MIN (60) minutes after the demotion the engine sets the row back to on as a trial of one case a tick (event selected, release=trial); a failed trial case demotes it again, a verified one restores it (release=restored) and lifts the cap; failures count from the last change of the rule''s standing; breach_playbooks.enabled = 0 stops a rule for good; fm-breach-doctor-rule-latched files an issue when a demotion outlives 120 minutes (the release did not run)',
  NULL,
  'recorded reason: 0.52.0 latched the rule with no release and fm-breach-doctor-rule-demoted went green after 24 hours while it stayed latched (review 2026-10-26), a hold with no expiry (ANTIFRAGILE-1); two benign races or transient D1 errors could latch it. Expiry: a demotion lasts at most 60 minutes plus one tick; review by 2026-11-02 against doctor_actions_failed_24h and the demote and selected events');

-- 3. the age gate is a filter and gets its row (reason, disposition, expiry)
INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence) VALUES
 ('breach-doctor-age-gate', 'ops_config breach_doctor_min_age_min (10..120, default 60), read by qnfo-fleet-control bdConfig() and bdLoadState()', 'filter',
  'the doctor classifying an issue its owning loop (the code loop, ISSUE-HYGIENE-1, a session) is still working in its first hour', 0, 'keep', 'planned',
  'backpressure, not a stop: the gate is a minute count a migration changes with its note; breach_doctor_max_cases bounds a tick; the metric breaches_undiagnosed_over_60m flags 60 minutes past the gate and never later than 120 minutes', NULL,
  'recorded reason: SLA-120M-1 and ISSUE-SLA-2H-1 bound an issue to 120 minutes, and a case needs the action plus two verify passes (about 20 minutes) inside them, so the gate was lowered from 120 to 60 by BREACH-DOCTOR-FIX-1. Expiry: review by 2026-11-02 against issues_open_over_120m and the share of cases the owners closed first');

-- 2. the durable detector of a latched demotion (reads row state, not events)
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('breach-doctor-rule-latched', 'a doctor playbook stays demoted to measure for more than 120 minutes',
  'the release step of bdLoadRules did not run or failed: breach_doctor = off, a doctor tick that throws before the rule load, or a refused write on breach_playbooks',
  'the tick releases a demoted rule to a one-case trial after 60 minutes (control breach-doctor-auto-demotion); fm-breach-doctor-rule-latched reads the durable row state every hour, so it stays red until the rule is released or disabled, unlike fm-breach-doctor-rule-demoted, which counts the demote events of the last 24 hours',
  'fm-breach-doctor-rule-latched: no enabled playbook demoted for more than 120 minutes', 'fm-breach-doctor-rule-latched', '2026-10-26', 1000266,
  'a breach_playbooks row with mode measure, enabled 1 and a note starting "demoted" whose time is more than 120 minutes old', 'the rule diagnoses but never acts again', 'the issues that rule would have closed');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to, module) VALUES
 ('fm-breach-doctor-rule-latched', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM breach_playbooks WHERE enabled = 1 AND mode = ''measure'' AND note LIKE ''demoted 20%'' AND substr(note, 9, 20) < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'BREACH-DOCTOR-1', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode');

-- the older failure mode and root cause no longer say "until a migration sets it back"
UPDATE failure_modes SET remediation = 'the engine demotes the rule (event demote), releases it to a one-case trial after 60 minutes (event selected) and demotes it again when the trial case fails; files nothing for the owner; a migration fixes the row'
WHERE fm_key = 'breach-doctor-rule-demoted';
UPDATE breach_causes SET plain = replace(plain, 'so it changes nothing further until its row is fixed', 'and after 60 minutes it tries one case a tick again, so it changes nothing further only while its row is broken')
WHERE cause_key = 'breach-doctor';

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('breach-doctor:release-demoted-rule', 'BREACH-DOCTOR-FIX-1 (qnfo-fleet-control 0.53.0 bdLoadRules, migrations/2026-10-26-breach-doctor-fix.sql)',
  'a breach_playbooks row the engine demoted (note starting "demoted"), qnfo-fleet-control */10 slot, ops_config breach_doctor = on or measure', 'unmeasured until the first release: a breach_diagnosis_events row of event selected with release=trial in its detail', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'a demoted playbook returns to work on its own after 60 minutes as a one-case trial, is demoted again when the trial case fails and restored when it verifies, with no session and no migration');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a reversible fix to the doctor core that review found wrong in three places is taken at once (DECISION-AUTOPROCEED-1): the write gate must enforce what the ledger says, a pause needs a release (ANTIFRAGILE-1), and no threshold exceeds 120 minutes (SLA-120M-1)',
  'BREACH-DOCTOR-FIX-1: bdWriteWhy requires a top-level id = ?1 predicate and no OR and drops ops_config and human_actions from the playbook write tables; a demoted rule is released to a one-case trial after 60 minutes; the age gate is 60 minutes and breaches_undiagnosed_over_60m flags at 120',
  'review of PR 4558 (qnfo-fleet-control 0.52.0): bdWriteWhy accepted five statements that touch the kill switch, the trust list, human_actions or any issue (WHERE ?1 > 0, ?1 = ?1); breach_playbooks had no path from measure back to on; the metric flagged at 180 minutes; live 2026-10-26 10:51Z: 0 playbooks demoted, 0 doctor decision_log rows, 120 cases diagnosed (all unclassified, none applied), 4 per-issue playbooks on',
  'migration merged and qnfo-fleet-control 0.53.0 deployed through the canonical path',
  'breach_playbooks (mode and note of a demoted rule), ops_config breach_doctor_min_age_min (120 to 60), metric_registry formula text, control_registry (2 rows added, 1 reworded), failure_modes and remediation_contracts (one detector), capability_ledger; no issue is closed or changed by this file',
  'the Rollback header: ops_config breach_doctor_min_age_min back to 120, the formula text back, the registry rows this file added deleted; ops_config breach_doctor = off stops the engine; the previous VERSION is restored by the canary revert',
  'a demoted playbook returns to work on its own after 60 minutes (one case a tick) and a playbook can no longer write the kill switch, the trust list or an unbound row',
  'no enabled playbook stays demoted for more than 120 minutes (fm-breach-doctor-rule-latched reads 0) and breaches_undiagnosed_over_60m flags an unowned issue at 120 minutes, not 180',
  'none', 'qnfo-fleet-control/breach-doctor.test.mjs, migrations/breach-doctor-fix.test.mjs, migrations/breach-doctor.test.mjs; the six refusal statements of the review'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'BREACH-DOCTOR-FIX-1%');

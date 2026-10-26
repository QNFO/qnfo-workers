-- CHAOS-DRILL-CALIBRATION-2 (2026-10-26, pillar autonomy and security; follows migrations/2026-10-26-chaos-drill-calibration.sql; agent_issues 100482, 1000057, 1000214, 1000328)
--
-- WHY THIS FILE EXISTS
--   An independent adversarial review of CHAOS-DRILL-CALIBRATION-1 reported three majors: (1) the budget-promote origin was skipped whole, which blanked the scan of the owner's own typed
--   text, (2) the research-quality-gate probe was decorative and would stamp an unverified critical-path alternate as tested, (3) the park-rearm-tick check kept in research-floor-rearm
--   is logged only when a row was re-armed, so it can only fail. The review read the first revision of that pull request. The file that merged (875f5e39, applied on live as migration_runs
--   ok) is the revision that already fixes all three, and this file does not redo them. Verified by SELECT on qnfo-audit 2026-10-26 11:00Z (not assumed):
--   1. control_alternate_probes ops-jobs-payload-redaction (1560 bytes) holds the whole-payload scan for every origin but budget-promote or an invalid payload, plus a json_each scan of
--      $.messages where role is user or system with the same eight patterns. Run on live it reads ok (218 ms, 4769 rows read), and live budget-promote payloads carry the keys messages,
--      model, control, reason (only messages holds typed text), so nothing typed sits outside the scanned branch.
--   2. research-quality-gate has no control_alternate_probes row, its evidence ends in ALTERNATE-NOT-EXERCISABLE, and the live view v_control_alternate_status (definition read from
--      sqlite_master) reads not-exercisable with alternate_tested_at null. The review's option B is therefore in force, and no probe stamps that control.
--   3. research-floor-rearm (542 bytes) reads the hourly idea-to-publish event of the same minute-0 branch in a 180-minute window (3 events in the last 180 minutes at the read) and the
--      park_rearm value. It reads ok on live. park-rearm-tick was last logged 2026-10-26T03:01Z, so the replaced check would be failing today. PARK-REARM-HEARTBEAT-1 (issue 1000328) is
--      filed for the emitter and the fate of floorRearmTick. The minors are in too: evolve-wip-recovery counts merged_at (30 tasks merged in 24 hours at the read), the old probes are kept as
--      disabled history rows, and the Rollback of file 1 reads those rows, not a bak_ table, so it does not depend on a table the fleet purges.
--   The hygiene-3 pair is in the same state: migrations/2026-10-26-issue-hygiene-3.sql already keeps a recommended model with no ladder row, treats a duplicate catalog row as the model,
--   logs its decision and files MODEL-EVAL-FILE-AFTER-WITHDRAW-1 (issue 1000329), and its suite already holds the recommended-with-no-ladder fixture.
--
-- WHAT IS LEFT, AND MADE HERE (text and records only, no probe, trigger or cron changes)
--   a. The window note of ops-jobs-payload-redaction called the tool messages repository content. They are the tool results of the owner session. redactJobBody masks a code, a login-path
--      URL and a token in them when the job is written, so the phrases that remain are explanatory text, and GitHub secret scanning does not cover D1 rows. The note now says that.
--   b. The register evidence of research-floor-rearm gains why the frozen list bak_20261019_research_parked is gone (a one-shot input, no automated dropper found, the only retention text is
--      the plan item in docs/TRANSFORMATION-PROGRAM.md) and why the drill reads idea-to-publish. The evidence of evolve-wip-recovery gains what its probe proves (planner liveness by merged_at)
--      and what it does not (independence from recoverWip).
--   c. The failure mode drill-probe-conditional-heartbeat (a probe on an event that its emitter writes only on the work path) gets its row and a detector contract that fails if an enabled
--      drill probe reads park-rearm-tick again. It reads 0 on live.
--   d. One decision_log row. The new suite migrations/chaos-drill-calibration-2.test.mjs pins the review's four cases against the stored probes (a tool-role bundle reads ok, a user-role
--      leak fires, a malformed payload reads ok, an origin-NULL leak fires), the not-exercisable state under a simulated drill that stamps every passing probe, and the healthy-but-idle
--      sweep, and every assertion is mutation-tested.
--
-- The table bak_20261026_chaos_calib2 holds the rewritten window note and the two evidence texts first. The Rollback line below does not read it (the purge risk the review named): it restores
-- from the literal texts. Every UPDATE is anchored on the text it replaces or on a marker, so a second apply, or a text someone has since changed, is left alone. No trigger, no cron, no DROP.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_chaos_calib2
-- Rollback: UPDATE control_alternate_probes SET window_note = replace(window_note, 'while its tool messages are not scanned: they are the tool results of the owner session (repository files, CLI help, test text), redactJobBody masks a code, a login-path URL and a token in them when the job is written, and the phrases that remain are explanatory text, not values (the six false positives of 2026-10-26 were all role tool, no digit followed a phrase). GitHub secret scanning does not cover D1 rows, so that write-time masking and this scan are the controls on what ops_jobs holds.', 'while its tool messages (repository files, CLI help, test text that mention the phrases) are not: the six false positives of 2026-10-26 were all role tool.') WHERE control = 'ops-jobs-payload-redaction'; UPDATE control_registry SET evidence = replace(evidence, ' CHAOS-DRILL-CALIBRATION-2 2026-10-26: bak_20261019_research_parked was the frozen one-shot input of floorRearmTick (34 rows re-armed on 2026-10-19), so its absence is expected and not a fault. No automated dropper of bak tables exists in the repository (the retention text is a plan item in docs/TRANSFORMATION-PROGRAM.md). The drill reads the hourly idea-to-publish event of the same minute-0 branch because park-rearm-tick is logged only when a row was re-armed. PARK-REARM-HEARTBEAT-1 tracks an unconditional heartbeat and the fate of floorRearmTick.', '') WHERE control = 'research-floor-rearm'; UPDATE control_registry SET evidence = replace(evidence, ' CHAOS-DRILL-CALIBRATION-2 2026-10-26: the drill probe counts code tasks merged by merged_at in 24 hours. That is liveness evidence that the code planner drains. It does not show that the planner works independently of recoverWip, because any merged task satisfies it whether or not recovery is on.', '') WHERE control = 'evolve-wip-recovery'; DELETE FROM remediation_contracts WHERE class = 'fm-drill-probe-conditional-heartbeat'; DELETE FROM failure_modes WHERE fm_key = 'drill-probe-conditional-heartbeat'

CREATE TABLE IF NOT EXISTS bak_20261026_chaos_calib2 AS
  SELECT 'probe.window_note' AS field, control AS control, window_note AS old_text FROM control_alternate_probes WHERE control = 'ops-jobs-payload-redaction'
  UNION ALL
  SELECT 'registry.evidence', control, evidence FROM control_registry WHERE control IN ('research-floor-rearm', 'evolve-wip-recovery');

-- a. The window note of the payload probe says what the unscanned tool messages are. Anchored on the sentence of file 1, so a replay or a note someone has since rewritten is left alone.
UPDATE control_alternate_probes SET window_note = replace(window_note, 'while its tool messages (repository files, CLI help, test text that mention the phrases) are not: the six false positives of 2026-10-26 were all role tool.', 'while its tool messages are not scanned: they are the tool results of the owner session (repository files, CLI help, test text), redactJobBody masks a code, a login-path URL and a token in them when the job is written, and the phrases that remain are explanatory text, not values (the six false positives of 2026-10-26 were all role tool, no digit followed a phrase). GitHub secret scanning does not cover D1 rows, so that write-time masking and this scan are the controls on what ops_jobs holds.')
WHERE control = 'ops-jobs-payload-redaction' AND instr(window_note, 'while its tool messages (repository files, CLI help, test text that mention the phrases) are not: the six false positives of 2026-10-26 were all role tool.') > 0;

-- b. What the two probes prove, in the register where the next session reads it.
UPDATE control_registry SET evidence = COALESCE(evidence, '') || ' CHAOS-DRILL-CALIBRATION-2 2026-10-26: bak_20261019_research_parked was the frozen one-shot input of floorRearmTick (34 rows re-armed on 2026-10-19), so its absence is expected and not a fault. No automated dropper of bak tables exists in the repository (the retention text is a plan item in docs/TRANSFORMATION-PROGRAM.md). The drill reads the hourly idea-to-publish event of the same minute-0 branch because park-rearm-tick is logged only when a row was re-armed. PARK-REARM-HEARTBEAT-1 tracks an unconditional heartbeat and the fate of floorRearmTick.'
WHERE control = 'research-floor-rearm' AND instr(COALESCE(evidence, ''), 'CHAOS-DRILL-CALIBRATION-2') = 0;

UPDATE control_registry SET evidence = COALESCE(evidence, '') || ' CHAOS-DRILL-CALIBRATION-2 2026-10-26: the drill probe counts code tasks merged by merged_at in 24 hours. That is liveness evidence that the code planner drains. It does not show that the planner works independently of recoverWip, because any merged task satisfies it whether or not recovery is on.'
WHERE control = 'evolve-wip-recovery' AND instr(COALESCE(evidence, ''), 'CHAOS-DRILL-CALIBRATION-2') = 0;

-- c. The failure mode the first file removed from one probe, and a detector that fails if it comes back.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('drill-probe-conditional-heartbeat',
  'a chaos-drill probe reads an event that its emitter logs only when it did work, so a healthy idle loop reads as dead and the drill ticket is filed again and again',
  'research-floor-rearm probed park-rearm-tick, which qnfo-research-exec logs only when parkRearmTick re-armed a row, so once the parked backlog had nothing left to re-arm the sweep ran healthy and logged nothing: 11 ticks in the 48 hours to 2026-10-26 11:00Z, the last at 03:01Z, and the probe had failed since 2026-10-24 (issue 1000057). The review of CHAOS-DRILL-CALIBRATION-1 found the same check kept in the first revision of that file',
  'CHAOS-DRILL-CALIBRATION-1: probe the unconditional hourly idea-to-publish event of the same minute-0 branch in a 180-minute window, and PARK-REARM-HEARTBEAT-1 (issue 1000328) gives the sweep its own unconditional heartbeat',
  'fm-drill-probe-conditional-heartbeat: no enabled control_alternate_probes row reads park-rearm-tick',
  'fm-drill-probe-conditional-heartbeat', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 1000057,
  'a control_alternate_probes row that is enabled and names a cloud_ops_events kind which its emitter writes only on the work path',
  'CHAOS-DRILL-FAILED-1 control:research-floor-rearm fails every 6 hours while the loop is healthy and the register counts the control as failing',
  'one control drill, its CHAOS-DRILL-FAILED-1 issue and the register line that counts the control as failing');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-drill-probe-conditional-heartbeat', NULL, 'CHAOS-DRILL-CALIBRATION-2', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM control_alternate_probes WHERE enabled = 1 AND instr(probe_sql, ''park-rearm-tick'') > 0) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- d. The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-code-session_015kWmGuAq2fNuvzu4MrD7x3',
  'a review finding is checked against the merged file and the live rows before any fix is written, because a review of the first revision of a pull request can describe a defect that the merged revision no longer has, and a forward fix that redoes it adds a second path for the same thing',
  'CHAOS-DRILL-CALIBRATION-2: the three majors of the review (budget-promote user and system messages scanned, research-quality-gate recorded as ALTERNATE-NOT-EXERCISABLE with no decorative probe, research-floor-rearm on the idea-to-publish heartbeat) were verified present in the merged file and on live and are pinned by a new suite instead of being redone. The window note of ops-jobs-payload-redaction now says what the unscanned tool messages are, the register evidence of research-floor-rearm and evolve-wip-recovery says what their probes prove, and the failure mode drill-probe-conditional-heartbeat has a detector',
  'live qnfo-audit 2026-10-26 11:00Z: the stored ops probe holds the json_each branch and reads ok (218 ms, 4769 rows read), research-quality-gate has no probe row and v_control_alternate_status reads not-exercisable with alternate_tested_at null (view definition read from sqlite_master), the research-floor-rearm probe reads ok with 3 idea-to-publish events in the last 180 minutes while park-rearm-tick was last logged 2026-10-26T03:01Z, 30 code tasks merged by merged_at in 24 hours, issues 1000328 and 1000329 exist, migration_runs holds both reviewed files as ok. The new suite replays the four cases of the review against the stored probes and every assertion was mutation-tested',
  'migration merged, the next 6-hourly drill pass reads the stored probes',
  'one window note, two register evidence texts, one failure mode row, one detector contract and one backup table, text and records only, no probe, trigger or cron change',
  'the Rollback header restores the window note and the two evidence texts from their literal text and removes the failure mode and its detector (decision_log stays: append-only)',
  'a probe on a conditional heartbeat is caught by a detector instead of a person, and the register says what each calibrated probe does and does not prove',
  'the next drill pass reads ok for ops-jobs-payload-redaction and research-floor-rearm, issues 100482 and 1000057 close on that pass, and the contract fm-drill-probe-conditional-heartbeat reads 0',
  'none',
  'd1:qnfo-audit control_alternate_probes, control_registry, v_control_alternate_status (definition from sqlite_master), ops_jobs (payload keys and the stored probe, SELECT only), cloud_ops_events, code_tasks, agent_issues, migration_runs, failure_modes, remediation_contracts, qnfo-ops/worker.js redactJobBody, qnfo-research-exec/worker.js, offline node:sqlite suite with mutation checks'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CHAOS-DRILL-CALIBRATION-2:') = 1);

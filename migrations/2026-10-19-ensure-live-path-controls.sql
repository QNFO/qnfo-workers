-- REOPEN-LIVE-PATH-3 registry rows (2026-10-19, pillar autonomy; agent_issues 100271). qnfo-fleet-control 0.41.0 files one deduped "PROBE-NEEDED-1: issue-<id>" issue per open issue that has no contract in
-- status active, holding, monitoring or escalated (rtEnsureLivePath in the remediation tick). The filer is a gate and a cap, so DOCTRINE-1 asks for their control_registry rows with the tested alternate:
--   * rt-ensure-live-path: the off switch ops_config rt_ensure_live_path (kind kill-switch, off the critical path).
--   * rt-ensure-live-path-bounds: 3 issues per tick and 12 per 1440 minutes (kind cap).
-- The alternate of both is the first term of the detector fm-reopen-without-live-path, which keeps counting an orphan the filer skips, stops filing for or is switched off for (it reads the same contract
-- statuses over the same 60 minutes). Both get a read-only expected/observed probe in control_alternate_probes in the shape of migrations/2026-10-19-control-alternate-probes3.sql (state checks on the
-- alternate's own objects plus a run inside a window stated in minutes), so neither adds an untested alternate to v_control_alternate_untested; the drill stamps alternate_tested_at on a pass.
-- Also: one decision_log row with a parseable prediction.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_alternate_probes WHERE control IN ('rt-ensure-live-path', 'rt-ensure-live-path-bounds'); DELETE FROM control_registry WHERE control IN ('rt-ensure-live-path', 'rt-ensure-live-path-bounds');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES
 ('rt-ensure-live-path',
  'qnfo-fleet-control/worker.js rtEnsureLivePath (remediation tick) and ops_config rt_ensure_live_path',
  'kill-switch',
  'a PROBE-NEEDED-1 issue filed for an issue whose own loop closes it, or a flood of them, if the filer misreads the contract statuses',
  0, 'keep', 'applied',
  'the first term of the detector fm-reopen-without-live-path keeps counting every open issue older than 60 minutes with no contract in status active, holding, monitoring or escalated, whether or not the filer files for it, and v_issue_dead_end lists it',
  NULL,
  'Reason and expiry recorded 2026-10-19: the D1 trigger cannot file the issue (D1 refuses an INSERT into agent_issues inside a deep trigger chain), so an orphan was named only by a measure and nobody was told which probe to write. The switch stays until fm-reopen-without-live-path and the filed issues have agreed for seven days; it is an off switch for a filer, not a limit on the fleet.',
  100271),
 ('rt-ensure-live-path-bounds',
  'qnfo-fleet-control/worker.js RT_LIVEPATH_MAX_PER_TICK (3) and RT_LIVEPATH_MAX_PER_DAY (12)',
  'cap',
  'a burst of PROBE-NEEDED-1 issues that adds to open_agent_issues and issues_open_over_120m faster than doers can write probes',
  0, 'keep', 'applied',
  'the first term of the detector fm-reopen-without-live-path keeps counting the orphans the cap leaves for the next tick; nothing is dropped, the condition is read afresh from the contracts on every tick',
  NULL,
  'Reason recorded 2026-10-19: the bounds are the ones rtEscalateStaleDeferrals uses (3 per tick, 12 per day); 9 open issues stood without a live contract at 22:0xZ, of which 3 already had a PROBE-NEEDED-1 issue, 6 are left to the model-health sweep or REOPEN-LIVE-PATH-2, and 1 (cf-model-eval, no closer) is filed first. Raising either number is a migration with its measurement, not a silent edit.',
  100271);

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
SELECT c.control,
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-reopen-without-live-path'' AND status = ''active'' AND instr(verify_probe, ''remediation_contracts'') > 0 AND instr(verify_probe, ''monitoring'') > 0) THEN ''the detector fm-reopen-without-live-path is missing, not active or no longer counts orphans by contract status'' WHEN COALESCE((SELECT last_attempt_at FROM remediation_contracts WHERE class = ''fm-reopen-without-live-path''), '''') < datetime(''now'', ''-120 minutes'') THEN ''the detector fm-reopen-without-live-path did not run in 120 minutes'' WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''view'' AND name = ''v_issue_dead_end'') THEN ''the view v_issue_dead_end is missing'' ELSE ''ok'' END AS observed',
  '120 minutes: the detector contract runs every few minutes (cadence 1 h at most), its text and the dead-end view are state checks',
  1
FROM control_registry c WHERE c.control IN ('rt-ensure-live-path', 'rt-ensure-live-path-bounds');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'an open issue with no live verification path is a dead end that nobody is told how to resolve, and the fleet files the work item itself, bounded, instead of leaving the measure red',
  'REOPEN-LIVE-PATH-3: qnfo-fleet-control 0.41.0 files one deduped PROBE-NEEDED-1 issue per orphan (open, no contract in status active, holding, monitoring or escalated, over 60 minutes), 3 per tick and 12 per 24 hours, with the skips of REOPEN-LIVE-PATH-2 and for the model-health families closed by MODEL-HEALTH-SWEEP-1; control rows rt-ensure-live-path and rt-ensure-live-path-bounds with their alternate probes',
  'qnfo-audit 2026-10-19 22:0xZ read-only: 9 open issues without a live contract (2832, 2925 and 100140 with a PROBE-NEEDED-1 issue already, 100238 to 100241 and 100262 [ai-cal] copies, 100250 cf-model-eval); fm-reopen-without-live-path reads them; qnfo-fleet-control/ensure-live-path.test.mjs 36 checks and migrations/ensure-live-path-controls.test.mjs',
  'migration merged',
  'one issue a tick at most three, twelve a day; agent_issues rows with source qnfo-fleet-control and their closing contracts; no existing contract is changed',
  'set ops_config rt_ensure_live_path = off, or revert qnfo-fleet-control to 0.40.3; the Rollback header removes the control rows and their probes',
  'every orphan issue gets a named work item with a doer and a closing probe',
  'issues_without_next_action <= 63 within 12 h',
  'none',
  'd1:qnfo-audit read-only (agent_issues, remediation_contracts, issue_lifecycle, issue_source_hosts), node:sqlite fixtures'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REOPEN-LIVE-PATH-3:') = 1);

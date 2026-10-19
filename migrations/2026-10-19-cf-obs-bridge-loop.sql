-- CF-OBS-BRIDGE-LOOP-1 (2026-10-19, pillar autonomy; QNFO/qnfo-workers issues behind clusters observability-raw/cf-obs-bridge-refile-before-resolve,
-- metrics-sla-queue/cf-obs-bridge-open-close-flapping, gateway-paper-render/cf-obs-bridge-track-before-resolve-livelock,
-- roadmap-failure-modes/cf-obs-bridge-reopen-flap).
--
-- WHAT WAS WRONG (read 2026-10-19 from scripts/cf_obs_issue_bridge.py on main and from qnfo-audit)
-- The bridge filed a Cloudflare group while it had been seen within LIVE_H = 24 h, but the issue's own probe passes after QUIET_H = 6 h
-- quiet and the autoclose trigger then closes the issue. For a group quiet 6 to 24 h the next sweep INSERTed the same title, the D1
-- trigger issue_refile_reopen (title closed within 24 h) reopened it and ignored the INSERT, the probe closed it again, and so on. The
-- RESOLVE step (PATCH the group resolved) reads closed rows after the FILE step, so it saw nothing to do while the FILE step kept
-- reopening them: Cloudflare was never told 'resolved' and every reopen re-dispatched the code-loop task and added an issue comment.
-- Measured 2026-10-19 on issue_lifecycle: 145 'reopened' events on 27 distinct CF-OBS-ISSUE-1 issues in 24 h, each counted as new inflow
-- by issue_drain_ratio_24h.
-- The fix is in the bridge (scripts/cf_obs_issue_bridge.py): FILE and RESOLVE share the QUIET_H boundary (a group quiet for 5.5 h or more
-- is never filed; a closed issue for a quiet group is PATCHed resolved at once), and a title closed within 24 h is inserted only when the
-- group was observed after the close (a relapse; the sweep counts it as relapsed, not filed). issue_drain_ratio_24h is deliberately left
-- alone: counting reopens as inflow is METRIC-RECOVERY-CONFIRM-1 / INTEGRITY-GUARDS-1.
-- Not changed here: qnfo-fleet-control cfObsClassify keeps qnfo-gateway groups with 'json' in the title active (a live code-loop claim holds
-- that file); the bridge PATCH now resolves them once their issue closes, so the rule is no longer on the loop's path.
--
-- WHAT THIS FILE ADDS (inserts, plus one UPDATE of the fm-cf-obs-untracked probe with its rollback)
--   failure_modes fm-cf-obs-bridge-refile-loop + detector contract fm-cf-obs-bridge-refile-loop: a CF-OBS-ISSUE-1 issue reopened in the last
--       120 minutes while its group had not been observed for 6 h before the reopen (the flap signature; a relapse is observed at the
--       reopen and does not match). Reads 0 once the fixed bridge runs, within one 120-minute window of the deploy.
--   metric cf_obs_reopen_churn_24h (guard, produced by the bridge each sweep) + analytics_metric_triggers row: the most reopened events one
--       CF-OBS-ISSUE-1 issue logged in the last 24 h AFTER the trigger row was born (plus a 15-minute grace for a bridge run that began on
--       the old script); above 2 is a loop. Counting the churn the old bridge logged before this fix would have been a breach born at
--       the deploy that cannot clear for about 22 h, a METRIC-TRIGGER issue that must break the 120-minute issue SLA (SLA-120M-2) by
--       design (second review, 2026-10-19). Live proof before the PR: the metric query reads 0 for the post-birth window and 13 for a
--       window opened 24 h ago, so it only sees reopens the fixed bridge could cause. The detector contract uses the same cut.
--   fm-cf-obs-untracked (UPDATE of one probe, rollback restores the old text): aligned with the bridge gate. The old detector counted a
--       group last seen up to 6 h ago and knew nothing of closed issues, so a group quiet 5.5 to 6 h, or one whose closed issue the bridge
--       holds (group not observed since the close), read as untracked while the bridge would not file it. It now uses the 5.5 h FILE_H
--       boundary and skips a group whose CF-OBS issue was closed within 24 h at or after its last observation (matched on the cf-obs-id;
--       the bridge also matches on the title, a rarer superset).
--   control_registry cf-obs-bridge-quiet-gate: the FILE gate and the closed-title guard are filters on filing, so they carry a disposition.
--   decision_log: the decision, with its prediction.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-cf-obs-bridge-refile-loop'; DELETE FROM failure_modes WHERE fm_key = 'cf-obs-bridge-refile-loop'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'cf_obs_reopen_churn_24h'; DELETE FROM metric_registry WHERE metric = 'cf_obs_reopen_churn_24h'; DELETE FROM metric_authorship WHERE metric = 'cf_obs_reopen_churn_24h'; UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM fleet_issue_dispatch d WHERE d.category = ''worker-observability'' AND d.state <> ''resolved'' AND json_valid(d.payload) AND CAST(json_extract(d.payload, ''$.lastObserved'') AS INTEGER) > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 21600) * 1000 AND CAST(json_extract(d.payload, ''$.firstObserved'') AS INTEGER) < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 7200) * 1000 AND instr(lower(COALESCE(json_extract(d.payload, ''$.title''), '''')), ''potential vulnerability scan'') = 0 AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.status = ''open'' AND a.source = ''cf-obs-bridge'' AND instr(a.description, ''cf-obs-id: '' || json_extract(d.payload, ''$.id'')) > 0)) AS TEXT) AS observed' WHERE class = 'fm-cf-obs-untracked'; DELETE FROM control_registry WHERE control = 'cf-obs-bridge-quiet-gate'; decision_log is append-only and keeps its row; revert scripts/cf_obs_issue_bridge.py to restore LIVE_H = 24.
-- spof-review: no new critical path. The bridge stays one filer; its second paths are qnfo-fleet-control pollObservability (*/10 mirrors and
-- auto-resolves groups, CF-OBS-SWEEP-1) and the detectors fm-cf-obs-untracked, fm-cf-obs-bridge-stale and the one added here.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius) VALUES
 ('cf-obs-bridge-refile-loop', 'the Cloudflare Observability bridge files, closes and reopens the same issue for a group that has gone quiet, and never resolves the group in Cloudflare',
  'cf_obs_issue_bridge.py filed groups seen within 24 h (LIVE_H) while the issue probe passes after 6 h quiet (QUIET_H); a title closed within 24 h is reopened by issue_refile_reopen, and the RESOLVE step only saw closed rows the FILE step had just reopened',
  'CF-OBS-BRIDGE-LOOP-1: groups quiet for 5.5 h or more are not filed and a closed one is PATCHed resolved at once; a title closed within 24 h is inserted only when the group was observed after the close; scripts/cf_obs_issue_bridge_test.py models the reopen trigger and asserts zero reopens over three sweeps',
  'remediation_contracts fm-cf-obs-bridge-refile-loop (d1-query, hourly) and metric cf_obs_reopen_churn_24h', 'fm-cf-obs-bridge-refile-loop', '2026-10-19',
  'a Cloudflare group with a tracked issue stops occurring for 6 to 24 h',
  'issue_lifecycle shows the same CF-OBS-ISSUE-1 issue reopened every bridge run (145 reopens on 27 issues in 24 h on 2026-10-19); the group stays active in Cloudflare; the code loop is re-dispatched on every reopen',
  'every CF-OBS-ISSUE-1 issue, issue_drain_ratio_24h, the code-task dispatch for the worker concerned');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-cf-obs-bridge-refile-loop', NULL, 'CF-OBS-BRIDGE-LOOP-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(DISTINCT l.issue_id) FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id JOIN fleet_issue_dispatch d ON d.category = ''worker-observability'' AND json_valid(d.payload) AND instr(a.description, ''cf-obs-id: '' || substr(d.fingerprint, 8)) > 0 WHERE l.event = ''reopened'' AND a.title LIKE ''CF-OBS-ISSUE-1:%'' AND l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'') AND l.ts > COALESCE((SELECT strftime(''%Y-%m-%dT%H:%M:%SZ'', t.created_at, ''+15 minutes'') FROM analytics_metric_triggers t WHERE t.metric_key = ''cf_obs_reopen_churn_24h''), strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'')) AND CAST(strftime(''%s'', l.ts) AS INTEGER) * 1000 - CAST(json_extract(d.payload, ''$.lastObserved'') AS INTEGER) > 21600000) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');

UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM fleet_issue_dispatch d WHERE d.category = ''worker-observability'' AND d.state <> ''resolved'' AND json_valid(d.payload) AND CAST(json_extract(d.payload, ''$.lastObserved'') AS INTEGER) > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 19800) * 1000 AND CAST(json_extract(d.payload, ''$.firstObserved'') AS INTEGER) < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 7200) * 1000 AND instr(lower(COALESCE(json_extract(d.payload, ''$.title''), '''')), ''potential vulnerability scan'') = 0 AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.status = ''open'' AND a.source = ''cf-obs-bridge'' AND instr(a.description, ''cf-obs-id: '' || json_extract(d.payload, ''$.id'')) > 0) AND NOT EXISTS (SELECT 1 FROM agent_issues c WHERE c.title LIKE ''CF-OBS-ISSUE-1:%'' AND c.status IN (''closed'', ''resolved'', ''wontfix'') AND typeof(c.updated_at) = ''integer'' AND c.updated_at > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 86400) * 1000 AND instr(c.description, ''cf-obs-id: '' || json_extract(d.payload, ''$.id'')) > 0 AND CAST(json_extract(d.payload, ''$.lastObserved'') AS INTEGER) <= c.updated_at)) AS TEXT) AS observed'
WHERE class = 'fm-cf-obs-untracked' AND instr(verify_probe, '- 21600) * 1000') > 0;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class)
VALUES ('cf_obs_reopen_churn_24h', 'operational', 'guard',
 'the largest number of issue_lifecycle event reopened rows that one CF-OBS-ISSUE-1 issue logged in the last 24 hours, counted from the birth of its trigger row plus 15 minutes (0 or 1 is a relapse, 3 or more is a loop)',
 'qnfo-audit.issue_lifecycle JOIN agent_issues; producer scripts/cf_obs_issue_bridge.py (every remediation-consumer run)',
 '145 reopens on 27 issues in 24 h before the fix (2026-10-19; history, not counted)', '<= 2', 'qnfo-fleet-control', 'agent:cf-obs-bridge', 'hourly', '2', '> 2', 'MEASURED', 'worker-written');

UPDATE metric_registry SET last_value = '0', last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE metric = 'cf_obs_reopen_churn_24h' AND last_value IS NULL;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'cf_obs_reopen_churn_24h', 'A CF-OBS-ISSUE-1 issue was reopened three or more times in 24 hours: the Cloudflare Observability bridge is looping', 'registry', 'gt', 2, 2,
 'Read the loop: SELECT l.issue_id, COUNT(*) AS reopens, MIN(l.ts), MAX(l.ts) FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE l.event = ''reopened'' AND a.title LIKE ''CF-OBS-ISSUE-1:%'' AND l.ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'') GROUP BY 1 ORDER BY 2 DESC; then the group behind the worst issue (fleet_issue_dispatch fingerprint cf-obs-<id from the description>: lastObserved against the reopen times). A reopen with the group quiet for 6 h or more is the bridge filing a quiet group again (fm-cf-obs-bridge-refile-loop): fix scripts/cf_obs_issue_bridge.py so FILE_H and QUIET_H agree and the closed-title guard holds. A reopen with the group observed after the close is a real relapse: fix the worker named in the title. Done: the metric reads 2 or less at two refreshes (it counts only reopens after the fix shipped, so a fixed bridge clears it within two refreshes; fm-cf-obs-bridge-refile-loop is the 120-minute probe).' || char(10) || 'code-task: repo=qnfo-workers path=scripts/cf_obs_issue_bridge.py' || char(10) || 'code-anchor: FILE_H = QUIET_H - 0.5',
 'qnfo-fleet-control', 'agent_issues', 2, 1, 'CF-OBS-BRIDGE-LOOP-1 (migrations/2026-10-19-cf-obs-bridge-loop.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'cf_obs_reopen_churn_24h');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence)
VALUES ('cf-obs-bridge-quiet-gate', 'scripts/cf_obs_issue_bridge.py FILE_H and the closed-title guard in sweep()', 'filter',
 'filing a CF-OBS-ISSUE-1 issue for a Cloudflare group that has been quiet since its issue closed (reopened by issue_refile_reopen and closed again by its probe)',
 0, 'keep', 'applied',
 'qnfo-fleet-control pollObservability (*/10) mirrors every group into fleet_issue_dispatch and auto-resolves quiet ones; fm-cf-obs-untracked files any live group with no open issue after 2 h; a recurrence after a close is still filed (reopened by issue_refile_reopen, counted as relapsed)',
 '2026-10-19',
 'live evidence 2026-10-19: 145 reopens on 27 CF-OBS-ISSUE-1 issues in 24 h, all by cf-obs-bridge; the gate drops only groups quiet for 5.5 h or more, which the issue probe would already pass; scripts/cf_obs_issue_bridge_test.py asserts zero reopens over three sweeps and that a relapse is still filed');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766', 'a group the issue probe already passes (quiet 6 h) must not be filed again, and a recurrence after a close must still be',
 'CF-OBS-BRIDGE-LOOP-1: scripts/cf_obs_issue_bridge.py files only groups quieter than 5.5 h, never inserts a title closed within 24 h unless the group was observed after the close, and PATCHes a quiet group with a closed issue resolved in the same sweep; migrations/2026-10-19-cf-obs-bridge-loop.sql adds fm-cf-obs-bridge-refile-loop, metric cf_obs_reopen_churn_24h and control cf-obs-bridge-quiet-gate',
 'issue_lifecycle: 145 reopened events on 27 CF-OBS-ISSUE-1 issues in 24 h (2026-10-19); the four auditors and their verifiers upheld the diagnosis; the old selftest asserted that an 8 h quiet group is filed',
 'applied through the canonical path on merge', 'CF-OBS-ISSUE-1 issues, the code-loop dispatch they trigger, issue_drain_ratio_24h inflow; no Cloudflare group is hidden (a recurrence is filed again)',
 'revert scripts/cf_obs_issue_bridge.py; the migration rollback line deletes the detector, metric and control rows',
 'the bridge tells Cloudflare a quiet group is resolved and stops reopening closed issues',
 'cf_obs_reopen_churn_24h <= 2 within 24 h', 'none',
 'sqlite model of issue_refile_reopen and issue_lifecycle_au in scripts/cf_obs_issue_bridge_test.py; live issue_lifecycle read'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CF-OBS-BRIDGE-LOOP-1:') = 1);

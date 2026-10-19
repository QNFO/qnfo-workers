-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks_canonical SET definition = (SELECT b.definition FROM bak_20261019_remedy_eff_canon b WHERE b.id = 'metric-refresh') WHERE id = 'metric-refresh' AND EXISTS (SELECT 1 FROM bak_20261019_remedy_eff_canon WHERE id = 'metric-refresh'); UPDATE fleet_tasks SET definition = (SELECT b.definition FROM bak_20261019_remedy_eff_task b WHERE b.id = 'metric-refresh'), version = (SELECT b.version FROM bak_20261019_remedy_eff_task b WHERE b.id = 'metric-refresh') WHERE id = 'metric-refresh' AND EXISTS (SELECT 1 FROM bak_20261019_remedy_eff_task WHERE id = 'metric-refresh'); UPDATE metric_registry SET formula = (SELECT b.formula FROM bak_20261019_remedy_eff_metric b WHERE b.metric = 'remedy_efficacy_30d') WHERE metric = 'remedy_efficacy_30d' AND EXISTS (SELECT 1 FROM bak_20261019_remedy_eff_metric WHERE metric = 'remedy_efficacy_30d'); DELETE FROM metric_authorship WHERE metric = 'remedy_efficacy_firing_30d'; DELETE FROM metric_registry WHERE metric = 'remedy_efficacy_firing_30d'; UPDATE analytics_metric_triggers SET action = (SELECT b.action FROM bak_20261019_remedy_eff_trigger b WHERE b.id = 371), notes = (SELECT b.notes FROM bak_20261019_remedy_eff_trigger b WHERE b.id = 371) WHERE id = 371 AND EXISTS (SELECT 1 FROM bak_20261019_remedy_eff_trigger WHERE id = 371); UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261019_remedy_eff_contracts b WHERE b.class = remediation_contracts.class), status = (SELECT b.status FROM bak_20261019_remedy_eff_contracts b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261019_remedy_eff_contracts b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261019_remedy_eff_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261019_remedy_eff_contracts); DELETE FROM remediation_contracts WHERE class = 'fm-remedy-efficacy-counts-dedupes'; DELETE FROM failure_modes WHERE fm_key = 'remedy-efficacy-counts-dedupes'
-- spof-review: none added. The per-firing figure stays as a second measurement of the same remedies (remedy_efficacy_firing_30d), so the metric has two readings and no single critical path.
--
-- REMEDY-EFFICACY-PER-TRIGGER-1 (2026-10-19, pillar autonomy; agent_issues 2244, metric trigger 371, metric remedy_efficacy_30d).
-- Owner directive 2026-10-19: audit, resolve and remediate every failure mode that affects the fleet's own loops, and their root causes.
--
-- WHAT WAS WRONG (read from qnfo-audit 2026-10-19 11:05Z-11:55Z, read only)
-- The metric-refresh workflow (fleet_tasks 'metric-refresh', step 3) computed remedy_efficacy_30d as the mean, over every
-- analytics_action_log row 7-30 days old with status dispatched or deduped, of "1 if the trigger is no longer hit now, else 0", plus
-- one vote per decided PERFORMANCE-LOOP-1 experiment. Every hourly deduped re-log of a standing breach is therefore a vote:
--   429 joined firings over 57 triggers; four triggers (3059 stuck_items_over_sla, 3060 issues_unprobed_60m, 3061
--   unverified_blocker_claims, 3072 failure_modes_recurring) hold 228 of them (53 percent) as 51-60 deduped repeats each, logged
--   2026-10-08..12 and still hit now. Per firing the value read 0.22 (registry, 11:01Z; 0.56 on 10-12 before that block crossed the
--   7-day mark); per trigger the same data reads 0.55 at 11:50Z and 0.57 at 12:00Z (the new formula run read-only on D1).
-- The metric trigger (371, lt 0.5) therefore filed and kept open METRIC-TRIGGER-371 (agent_issues 2244) on a figure that measured how
-- long four breaches had stood, not whether remedies work; the lever text on the trigger had not changed since 2026-10-09, and the
-- METRIC-CLOSED-LOOP-1 rule is that a remedy that did not move its metric is replaced, not repeated. A monitoring twin of the same
-- title (agent_issues 2665) restated the same breach.
--
-- WHAT THIS CHANGES
--   1. fleet_tasks metric-refresh, step 3 (the remedy_efficacy_30d branch): one vote per trigger. The action-log branch now keeps only
--      the latest firing of each trigger inside the 7-30 day window (ORDER BY fired_at DESC, id DESC LIMIT 1), so a trigger counts once
--      however often it was re-logged. The vote itself is unchanged (1 when the trigger is not hit now, else 0) and the perf_experiments
--      branch is untouched. The rewrite is one replace() on a 43-character anchor that occurs exactly once in the live definition
--      (checked against D1 on 2026-10-19: 1 occurrence, definition 11306 characters, JSON valid, version 1) and it is guarded three
--      ways: the anchor must be present, must occur exactly once, and the marker REMEDY-EFFICACY-PER-TRIGGER-1 must be absent. If the
--      definition has drifted so that the rewrite did not take, the SELECT json(...) that follows (statement 7) fails the file loudly
--      instead of leaving the defect in place; nothing after it runs. The failure the operator sees is D1's generic one, "statement 7:
--      malformed JSON: SQLITE_ERROR" in MIGRATION-APPLY-FAILED-1, and the explanation is the comment at 1b below, not the failure text.
--      fleet_tasks.version goes 1 -> 2 (fleet-exec reads only the definition; the version is the audit trail) and
--      fleet_tasks_canonical follows, because the drift gate (fleet-tasks-drift-gate) files WORKFLOW-DEFINITION-DRIFT for any live
--      definition that differs from its canonical row.
--   2. A new step appended to the same workflow keeps the old per-firing figure as metric remedy_efficacy_firing_30d, with its first
--      value taken from that formula at apply time. The two figures are comparable, and the old series continues under its own name instead of
--      stepping at the apply. remedy_efficacy_30d steps up when this applies: that is the correction, not an improvement in the remedies.
--      remedy_efficacy_firing_30d is EXEMPT from a metric trigger (METRIC-CLOSED-LOOP-1 exemption, named here): it is a report-only
--      continuity series over the same remedies that trigger 371 already acts on, and a second trigger on one producer is the double
--      signal CLAUDE.md rules out. Its registry target starts with n/a, so the improvement loop does not judge it either.
--      metric_trigger_coverage_pct moves from 72.6 to 72.3 (180 of 248 metrics have a trigger, 180 of 249 after) and stays above its 70 target.
--   3. analytics_metric_triggers 371: the lever text is replaced with a different, concrete one: a query that lists the still-hit
--      triggers behind each failing vote (owner, last firing in the window, firings in the window), the rule to rewrite their action
--      oldest first with a code-task line when the lever is a change in one file, and the 7-day replace-not-repeat rule.
--   4. failure_modes remedy-efficacy-counts-dedupes with its detector contract fm-remedy-efficacy-counts-dedupes (the metric-refresh
--      definition carries the marker and the per-trigger predicate); remediation_contracts issue-2244 gets its closing probe (the
--      registry value is at least 0.5 and the marker is in the definition) and is made active again, because it had been left
--      superseded by contract-on-closed-issue after the issue was reopened on 2026-10-18.
--   5. (taken out of this file on landing, 2026-10-19) the monitoring twin 2665 of 2244 is no longer handled here: it is one of 33 parked
--      METRIC-TRIGGER twins (an older 'monitoring' ticket beside the newer 'open' one of the same trigger) that
--      migrations/2026-10-19-metric-twin-supersede.sql supersedes in one bounded, backed-up statement set, so no row is closed by two files.
--      This file writes no agent_issues and no issue_triage row.
--   6. decision_log: one append-only row with a machine-checkable prediction (remedy_efficacy_30d >= 0.5 within 3 hours).
--
-- WHAT THIS DOES NOT DO
--   It does not close 2244. TRIGGER-RECOVERY-1 closes it after 60 minutes of hit = 0, and the closing probe must pass first. The
--   value after this applies is the per-trigger figure of the day (0.55 when read), which is near the 0.5 line: the replaced lever text
--   on trigger 371 is what moves it if it falls back. docs/fleet-tasks-canonical.json is a dated snapshot and is regenerated by
--   scripts/export_fleet_tasks_canonical.py, not by hand; it lags this one row until the exporter runs.
--
-- Backups (rows this file can change): bak_20261019_remedy_eff_task, _canon, _metric, _trigger, _contracts (issue-2244 only).

CREATE TABLE IF NOT EXISTS bak_20261019_remedy_eff_task AS SELECT * FROM fleet_tasks WHERE id = 'metric-refresh';
CREATE TABLE IF NOT EXISTS bak_20261019_remedy_eff_canon AS SELECT * FROM fleet_tasks_canonical WHERE id = 'metric-refresh';
CREATE TABLE IF NOT EXISTS bak_20261019_remedy_eff_metric AS SELECT * FROM metric_registry WHERE metric = 'remedy_efficacy_30d';
CREATE TABLE IF NOT EXISTS bak_20261019_remedy_eff_trigger AS SELECT * FROM analytics_metric_triggers WHERE id = 371;
CREATE TABLE IF NOT EXISTS bak_20261019_remedy_eff_contracts AS SELECT * FROM remediation_contracts WHERE class = 'issue-2244';

-- 1. One vote per trigger. The anchor '''deduped'') UNION ALL SELECT CASE e.decision' is the end of the action-log branch and the start of
-- the perf_experiments branch; the new predicate and the marker go between them.
UPDATE fleet_tasks SET
  definition = json_insert(
    replace(definition, '''deduped'') UNION ALL SELECT CASE e.decision',
      '''deduped'') AND a.id = (SELECT b.id FROM analytics_action_log b WHERE b.trigger_id = a.trigger_id AND b.fired_at >= datetime(''now'', ''-30 days'') AND b.fired_at < datetime(''now'', ''-7 days'') AND b.status IN (''dispatched'', ''deduped'') ORDER BY b.fired_at DESC, b.id DESC LIMIT 1) /* REMEDY-EFFICACY-PER-TRIGGER-1: one vote per trigger, the latest firing in the window decides */ UNION ALL SELECT CASE e.decision'),
    '$.steps[#]',
    json('{"type":"sql","db":"AUDIT","name":"remedy-efficacy-firing-30d","sql":"UPDATE metric_registry SET last_value = COALESCE(CAST((SELECT ROUND(AVG(o), 2) FROM (SELECT CASE WHEN s.hit = 0 THEN 1.0 WHEN s.hit = 1 THEN 0.0 END AS o FROM analytics_action_log a JOIN v_metric_trigger_state s ON s.id = a.trigger_id WHERE a.fired_at >= datetime(''now'', ''-30 days'') AND a.fired_at < datetime(''now'', ''-7 days'') AND a.status IN (''dispatched'', ''deduped'') UNION ALL SELECT CASE e.decision WHEN ''kept'' THEN 1.0 ELSE 0.0 END AS o FROM perf_experiments e WHERE e.decision IN (''kept'', ''reverted'') AND e.decided_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 days''))) AS TEXT), ''n/a''), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric = ''remedy_efficacy_firing_30d''"}')),
  version = version + 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'metric-refresh'
  AND json_valid(definition)
  AND instr(definition, 'REMEDY-EFFICACY-PER-TRIGGER-1') = 0
  AND instr(definition, '''deduped'') UNION ALL SELECT CASE e.decision') > 0
  AND length(definition) - length(replace(definition, '''deduped'') UNION ALL SELECT CASE e.decision', '')) = length('''deduped'') UNION ALL SELECT CASE e.decision');

-- 1b. Drift assertion (statement 7 as scripts/apply_migrations.py counts: five backups, the rewrite, this). The rewrite must have
-- taken. json() of a non-JSON string raises "malformed JSON" and that generic error is all D1 reports: migration_runs and the
-- MIGRATION-APPLY-FAILED-1 issue read "failed after 6 statement(s): statement 7: malformed JSON: SQLITE_ERROR", never the sentence in
-- the literal below. So this comment is the explanation: that failure at statement 7 of this file means the metric-refresh definition
-- has drifted from the 2026-10-19 reading (the anchor absent or not unique, the definition not JSON, or the row missing); the
-- rewrite did not take, nothing after statement 7 ran, and the five backup tables exist. Re-read the live definition, re-anchor step 1
-- and merge a new file. When the marker is present (first apply succeeded, or a re-run) the WHERE is false and the statement does nothing.
SELECT json('REMEDY-EFFICACY-PER-TRIGGER-1: the metric-refresh definition was not rewritten because the live text drifted from the 2026-10-19 reading (anchor absent or not unique)')
WHERE COALESCE((SELECT instr(definition, 'REMEDY-EFFICACY-PER-TRIGGER-1') FROM fleet_tasks WHERE id = 'metric-refresh'), 0) = 0;

-- 1c. The drift gate's canonical row follows (only while it still equals the pre-change definition).
UPDATE fleet_tasks_canonical SET
  definition = (SELECT t.definition FROM fleet_tasks t WHERE t.id = 'metric-refresh'),
  repo_path = 'migrations/2026-10-19-remedy-efficacy-per-trigger.sql',
  exported_at = datetime('now')
WHERE id = 'metric-refresh'
  AND definition = (SELECT b.definition FROM bak_20261019_remedy_eff_task b WHERE b.id = 'metric-refresh')
  AND instr((SELECT t.definition FROM fleet_tasks t WHERE t.id = 'metric-refresh'), 'REMEDY-EFFICACY-PER-TRIGGER-1') > 0;

-- 2. Registry: the formula text of the new reading, and the old reading as its own metric.
UPDATE metric_registry SET
  formula = 'mean over (a) one vote per trigger (REMEDY-EFFICACY-PER-TRIGGER-1, 2026-10-19): each trigger with an analytics_action_log firing 7-30 days old (dispatched or deduped) votes once, the latest such firing deciding: 1 if the trigger is no longer hit now (v_metric_trigger_state.hit = 0), 0 if it still is; until that date every firing voted, and that per-firing figure is kept as remedy_efficacy_firing_30d, and (b) PERFORMANCE-LOOP-1 lever experiments decided in the last 30 days: 1 if kept (the metric improved beyond noise), 0 if reverted; n/a when there are none'
WHERE metric = 'remedy_efficacy_30d'
  AND instr(formula, 'REMEDY-EFFICACY-PER-TRIGGER-1') = 0
  AND instr((SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'), 'REMEDY-EFFICACY-PER-TRIGGER-1') > 0;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class)
SELECT 'remedy_efficacy_firing_30d', 'system', 'lagging',
  'mean over (a) analytics_action_log firings 7-30 days old (dispatched or deduped), one vote per firing: 1 if their trigger is no longer hit now (v_metric_trigger_state.hit = 0), 0 if it still is, and (b) PERFORMANCE-LOOP-1 lever experiments decided in the last 30 days: 1 if kept, 0 if reverted; n/a when there are none. This is the figure remedy_efficacy_30d reported until 2026-10-19, kept for continuity and comparison: a trigger re-logged hourly while its breach stays open counts once per re-log here (REMEDY-EFFICACY-PER-TRIGGER-1)',
  'qnfo-audit.analytics_action_log + v_metric_trigger_state + perf_experiments',
  '0.22 (registry reading of remedy_efficacy_30d on 2026-10-19 11:01Z, before the per-trigger change)',
  'n/a (continuity series, report only; the >= 0.5 target applies to remedy_efficacy_30d)',
  'qnfo-fleet-control',
  'report only: it replaces no remedy of its own; trigger 371 acts on the same remedies through remedy_efficacy_30d',
  'hourly', NULL, NULL,
  COALESCE(CAST((SELECT ROUND(AVG(o), 2) FROM (SELECT CASE WHEN s.hit = 0 THEN 1.0 WHEN s.hit = 1 THEN 0.0 END AS o FROM analytics_action_log a JOIN v_metric_trigger_state s ON s.id = a.trigger_id WHERE a.fired_at >= datetime('now', '-30 days') AND a.fired_at < datetime('now', '-7 days') AND a.status IN ('dispatched', 'deduped') UNION ALL SELECT CASE e.decision WHEN 'kept' THEN 1.0 ELSE 0.0 END AS o FROM perf_experiments e WHERE e.decision IN ('kept', 'reverted') AND e.decided_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days'))) AS TEXT), 'n/a'),
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed'
WHERE instr((SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'), 'REMEDY-EFFICACY-PER-TRIGGER-1') > 0;

-- 3. The unmoved lever on trigger 371 is replaced, not repeated.
UPDATE analytics_metric_triggers SET
  action = 'Pillar autonomy. remedy_efficacy_30d gives every trigger one vote (REMEDY-EFFICACY-PER-TRIGGER-1, 2026-10-19): the share of triggers fired 7-30 days ago whose metric is back inside its threshold now, the latest firing in the window deciding, so an hourly deduped re-log no longer counts again. Under half means most remedies fired 7-30 days ago did not move their metric. Run: SELECT s.id, s.metric_key, s.val, s.operator, s.threshold, s.owner, MAX(a.fired_at) AS last_fired, COUNT(*) AS firings FROM v_metric_trigger_state s JOIN analytics_action_log a ON a.trigger_id = s.id WHERE s.hit = 1 AND a.status IN (''dispatched'', ''deduped'') AND a.fired_at >= datetime(''now'', ''-30 days'') AND a.fired_at < datetime(''now'', ''-7 days'') GROUP BY s.id ORDER BY last_fired. Each row is a remedy that did not work, with its owner on the row. Take the rows oldest first, one owner at a time: read analytics_metric_triggers.action for that id, then write a different, concrete lever there (a lever that is a change in one file ends with a code-task line and a code-anchor line, ACT-BRIDGE-1), or correct a wrong threshold with evidence in a migration. A lever already replaced once that still did not move its metric in 7 days is replaced again, never repeated. remedy_efficacy_firing_30d keeps the old per-firing figure for comparison. Definition of done: remedy_efficacy_30d is at or above 0.5 in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).',
  notes = COALESCE(notes, '') || ' | REMEDY-EFFICACY-PER-TRIGGER-1 2026-10-19: lever replaced (it had not changed since 2026-10-09); backup bak_20261019_remedy_eff_trigger.'
WHERE id = 371 AND metric_key = 'remedy_efficacy_30d'
  AND instr(action, 'REMEDY-EFFICACY-PER-TRIGGER-1') = 0
  AND instr((SELECT definition FROM fleet_tasks WHERE id = 'metric-refresh'), 'REMEDY-EFFICACY-PER-TRIGGER-1') > 0;

-- 4. Failure mode and detector.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('remedy-efficacy-counts-dedupes',
   'remedy_efficacy_30d counts every hourly deduped re-log of a standing breach as a vote, so a few long-lived breaches decide the metric',
   'metric-refresh step 3 averaged analytics_action_log rows 7-30 days old per firing: four triggers (3059, 3060, 3061, 3072) held 228 of 429 joined firings (53 percent) as 51-60 deduped repeats each, so the value read 0.22 per firing against 0.55 per trigger and fell from 0.56 to 0.21 when that block crossed the 7-day mark',
   'REMEDY-EFFICACY-PER-TRIGGER-1: one vote per trigger (the latest firing in the window decides), the per-firing figure kept as remedy_efficacy_firing_30d, and the trigger 371 lever replaced by a list of the still-hit remedies by owner',
   'fm-remedy-efficacy-counts-dedupes: the metric-refresh definition carries REMEDY-EFFICACY-PER-TRIGGER-1 and its latest-firing predicate',
   'fm-remedy-efficacy-counts-dedupes', '2026-10-19', 2244,
   'a metric is the mean over append-only log rows of a loop that logs again each cycle while a condition persists',
   'remedy_efficacy_30d below 0.5 and unmoved for days while the remedies themselves are unchanged; the figure changes when old rows cross a window edge',
   'metric trigger 371 and its issue, metrics_in_breach, and the autonomy area focus on fleet.qnfo.org');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to, module)
VALUES ('fm-remedy-efficacy-counts-dedupes', NULL,
  'SELECT ''1'' AS expected, CASE WHEN instr((SELECT definition FROM fleet_tasks WHERE id = ''metric-refresh''), ''REMEDY-EFFICACY-PER-TRIGGER-1'') > 0 AND instr((SELECT definition FROM fleet_tasks WHERE id = ''metric-refresh''), ''b.trigger_id = a.trigger_id'') > 0 THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 1, 'active', 'REMEDY-EFFICACY-PER-TRIGGER-1', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode');

-- 4b. The closing probe of issue 2244: the registry value is back at the line and the per-trigger step is live.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric=''remedy_efficacy_30d'') AS REAL) >= 0.5 AND instr((SELECT definition FROM fleet_tasks WHERE id=''metric-refresh''),''REMEDY-EFFICACY-PER-TRIGGER-1'')>0 THEN ''1'' ELSE ''0'' END AS observed',
  verify_transport = 'd1-query',
  status = 'active',
  last_verdict = NULL,
  attempts = 0,
  next_due_at = datetime('now')
WHERE class = 'issue-2244' AND issue_id = 2244
  AND instr(verify_probe, 'REMEDY-EFFICACY-PER-TRIGGER-1') = 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2244 AND status IN ('open', 'monitoring'));

-- 5. (removed on landing) the monitoring twin 2665 is superseded by migrations/2026-10-19-metric-twin-supersede.sql with the other 32 twins.

-- 6. The decision (append-only). The prediction is in the form decision_predictions_parse reads: metric, operator, value, within N hours.
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-session-01QpQv19uh1padRwZ3u1r766',
  'a metric that votes once per hourly re-log of a standing breach measures how long breaches have stood, not whether remedies work; the trigger is the unit a remedy is attached to, so it gets one vote',
  'REMEDY-EFFICACY-PER-TRIGGER-1: remedy_efficacy_30d counts one vote per trigger (the latest firing in the 7-30 day window decides); the per-firing figure is kept as remedy_efficacy_firing_30d; the lever on trigger 371 is replaced',
  'read-only D1 on 2026-10-19: 429 joined firings over 57 triggers, 228 (53 percent) from triggers 3059, 3060, 3061 and 3072; 0.22 per firing against 0.55 per trigger; the anchor occurs once in the 11306-character live definition; node:sqlite replay in migrations/remedy-efficacy-per-trigger.test.mjs',
  'migration merged',
  'fleet_tasks metric-refresh (one step rewritten, one added), its canonical row, metric_registry (one formula, one new row), analytics_metric_triggers 371, remediation_contracts issue-2244 and the new fm detector',
  'the Rollback header, restoring from the bak_20261019_remedy_eff_* tables',
  'the fleet reads its remedy effectiveness per trigger and keeps the per-firing series for comparison',
  'remedy_efficacy_30d >= 0.5 within 3 hours',
  'none',
  'd1:qnfo-audit analytics_action_log, v_metric_trigger_state, fleet_tasks, fleet_tasks_canonical, remediation_contracts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REMEDY-EFFICACY-PER-TRIGGER-1:') = 1);

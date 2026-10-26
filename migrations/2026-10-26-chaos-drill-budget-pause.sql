-- CHAOS-DRILL-BUDGET-PAUSE-1 (2026-10-26, pillar autonomy; agent_issues 1000119 and 1000120, CHAOS-DRILL-FAILED-1 twice reopened by issue_refile_reopen)
--
-- WHAT WAS MEASURED (qnfo-audit SELECT only, 2026-10-26 18:10-18:20Z)
--   The COST-SUSTAIN-1 daily research budget is spent: the executor logs cloud_ops_events kind research-budget (job qnfo-research-exec, status ok, text "daily budget exhausted: spent=414726
--   budget=360000 (COST-SUSTAIN-1; work resumes at 00:00 UTC)") on every 10-minute tick (newest 18:01:10Z) and starts no stage: the last done event and the last revise-patch event are 04:32Z, and 192 rows
--   wait in research_queue. The budget gate is refusing by design (qnfo-research-exec runLeased returns before any stage, so no done and no revise-patch event can exist), and two chaos-drill probes
--   read that silence as a dead loop:
--   1. spof_alternate_probes "qnfo-research-exec single executor" (968 bytes), clause 3: work waits and no done event in 120 minutes reads "the cron and the watchdog both failed to move it". Issue 1000119.
--      Clauses 1 and 2 pass (a research-watchdog event with status ok at 16:20:58Z, the research_exec_watchdog state written at 18:10:54Z with reason budget-held).
--   2. control_alternate_probes research-revise-refs-extend (593 bytes), clause 2: no revise-patch event in 120 minutes reads "the switch guards a route that is not running". Issue 1000120.
--      Only qnfo-research-exec logs revise-patch (inside a stage), so the same hold silences it. The sibling probes of the revise route (research-kimi-last-resort, research-revise-shrink-guard) read 48 hours and pass.
--   Both failed at the 13:01Z drill (last_pass 0, last_observed as above) and the issues were closed and reopened by the loop that files them.
--
-- WHAT THIS FILE CHANGES (data only, no worker, trigger or cron)
--   Clause 3 of the single-executor probe and clause 2 of the refs-extend probe gain one condition: the clause fails only when NO pause is currently recorded. A pause is recorded when a research-budget event
--   from job qnfo-research-exec, status ok, text starting "daily budget exhausted", is 30 minutes old or younger (the executor's own record, refreshed every tick, so the reason expires 30 minutes after the
--   executor stops logging it and a stalled executor is not excused). With no such record both clauses fail exactly as before (same observed text). Every other clause is untouched: the watchdog's forced stage
--   (1560 minutes) and its state (30 minutes) still have to be there, and the ops_config value of the refs-extend switch is still checked, so the alternate is still exercised and the lever still read.
--   The pause is a recorded reason with an expiry and a live evidence source, which is what ANTIFRAGILE-1 asks of a hold; the probe never needs the budget to be exhausted to pass.
--   Also: the failure mode drill-probe-blames-budget-pause with a detector (counts enabled drill probes that read a research stage event in a 120-minute window and not the research-budget event), one decision_log
--   row, and the issue RESEARCH-WATCHDOG-PROOF-HELD-1 for a latent defect found while checking clause 1 (see its text): the watchdog's daily proof stage is pre-empted by the budget hold, so clause 1 would fail
--   at 18:21Z on 2026-10-27 and issue 1000119 would reopen. It is a code change in qnfo-cloud-ops, filed with a code-task line for the code loop, not made here.
--
-- Not touched: the COST-SUSTAIN-1 pace gate (agent_issues 100622), the executor, the watchdog, the first two clauses, the 120-minute window, the observed texts.
-- The old probe texts and window notes are in bak_20261026_chaos_probe_sql first. The Rollback line below does not read it (the fleet purges bak tables): it restores by replacing the new fragment with the old one.
-- Every UPDATE is anchored on the text it replaces or on a marker, so a second apply, or a probe someone has since changed, is left alone.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_chaos_probe_sql
-- Rollback: UPDATE spof_alternate_probes SET probe_sql = replace(probe_sql, ' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''research-budget'' AND status = ''ok'' AND instr(COALESCE(text, ''''), ''daily budget exhausted'') = 1 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')) THEN ''research work waits', ' THEN ''research work waits'), window_note = replace(window_note, ' | CHAOS-DRILL-BUDGET-PAUSE-1 2026-10-26: clause 3 (work waits and no done event in 120 minutes) fails only while no pause is recorded. A pause is a research-budget event from job qnfo-research-exec, status ok, text starting with daily budget exhausted, 30 minutes old or younger: the executor logs it on every 10-minute tick while the COST-SUSTAIN-1 daily budget is spent and starts no stage, so the idle executor is by design. With no such event the clause fails as before and a stalled executor is not excused. Clauses 1 and 2 are unchanged.', '') WHERE component = 'qnfo-research-exec single executor'; UPDATE control_alternate_probes SET probe_sql = replace(probe_sql, ' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''research-budget'' AND status = ''ok'' AND instr(COALESCE(text, ''''), ''daily budget exhausted'') = 1 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')) THEN ''the revise route recorded no revise-patch', ' THEN ''the revise route recorded no revise-patch'), window_note = replace(window_note, ' | CHAOS-DRILL-BUDGET-PAUSE-1 2026-10-26: clause 2 (no revise-patch event in 120 minutes) fails only while no pause is recorded. A pause is a research-budget event from job qnfo-research-exec, status ok, text starting with daily budget exhausted, 30 minutes old or younger: the executor logs it on every 10-minute tick while the COST-SUSTAIN-1 daily budget is spent and starts no stage, and only a stage logs revise-patch, so the idle route is by design. With no such event the clause fails as before. The ops_config check of clause 1 is unchanged.', '') WHERE control = 'research-revise-refs-extend'; DELETE FROM remediation_contracts WHERE class = 'fm-drill-probe-blames-budget-pause'; DELETE FROM failure_modes WHERE fm_key = 'drill-probe-blames-budget-pause'
-- Rollback note: decision_log stays (append-only) and the issue RESEARCH-WATCHDOG-PROOF-HELD-1 stays open until its code-probe or a closing record resolves it.

CREATE TABLE IF NOT EXISTS bak_20261026_chaos_probe_sql AS
  SELECT 'spof_alternate_probes' AS src, component AS name, probe_sql AS old_probe_sql, window_note AS old_window_note FROM spof_alternate_probes WHERE component = 'qnfo-research-exec single executor'
  UNION ALL
  SELECT 'control_alternate_probes', control, probe_sql, window_note FROM control_alternate_probes WHERE control = 'research-revise-refs-extend';

-- 1. single executor, clause 3: work waits, no done event in 120 minutes, and no pause recorded in the last 30 minutes.
UPDATE spof_alternate_probes SET probe_sql = replace(probe_sql, ' THEN ''research work waits', ' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''research-budget'' AND status = ''ok'' AND instr(COALESCE(text, ''''), ''daily budget exhausted'') = 1 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')) THEN ''research work waits')
WHERE component = 'qnfo-research-exec single executor' AND instr(probe_sql, 'research-budget') = 0 AND instr(probe_sql, 'kind = ''done'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) THEN ''research work waits') > 0;

-- 2. refs-extend, clause 2: no revise-patch event in 120 minutes, and no pause recorded in the last 30 minutes.
UPDATE control_alternate_probes SET probe_sql = replace(probe_sql, ' THEN ''the revise route recorded no revise-patch', ' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''research-budget'' AND status = ''ok'' AND instr(COALESCE(text, ''''), ''daily budget exhausted'') = 1 AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')) THEN ''the revise route recorded no revise-patch')
WHERE control = 'research-revise-refs-extend' AND instr(probe_sql, 'research-budget') = 0 AND instr(probe_sql, 'kind = ''revise-patch'' AND status IN (''ok'', ''warn'') AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) THEN ''the revise route recorded no revise-patch') > 0;

-- 3. The window notes say what changed, once.
UPDATE spof_alternate_probes SET window_note = window_note || ' | CHAOS-DRILL-BUDGET-PAUSE-1 2026-10-26: clause 3 (work waits and no done event in 120 minutes) fails only while no pause is recorded. A pause is a research-budget event from job qnfo-research-exec, status ok, text starting with daily budget exhausted, 30 minutes old or younger: the executor logs it on every 10-minute tick while the COST-SUSTAIN-1 daily budget is spent and starts no stage, so the idle executor is by design. With no such event the clause fails as before and a stalled executor is not excused. Clauses 1 and 2 are unchanged.'
WHERE component = 'qnfo-research-exec single executor' AND instr(window_note, 'CHAOS-DRILL-BUDGET-PAUSE-1') = 0;

UPDATE control_alternate_probes SET window_note = window_note || ' | CHAOS-DRILL-BUDGET-PAUSE-1 2026-10-26: clause 2 (no revise-patch event in 120 minutes) fails only while no pause is recorded. A pause is a research-budget event from job qnfo-research-exec, status ok, text starting with daily budget exhausted, 30 minutes old or younger: the executor logs it on every 10-minute tick while the COST-SUSTAIN-1 daily budget is spent and starts no stage, and only a stage logs revise-patch, so the idle route is by design. With no such event the clause fails as before. The ops_config check of clause 1 is unchanged.'
WHERE control = 'research-revise-refs-extend' AND instr(window_note, 'CHAOS-DRILL-BUDGET-PAUSE-1') = 0;

-- 4. The failure mode and a detector that fails if a drill probe reads a research stage event again without reading the pause.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('drill-probe-blames-budget-pause',
  'a chaos-drill probe reads the silence of a research stage as a dead executor or route while the daily neuron budget (COST-SUSTAIN-1) is deliberately holding every stage, so the drill files a ticket against a loop that is healthy by design and the ticket reopens every day',
  'clause 3 of spof_alternate_probes qnfo-research-exec single executor (work waits and no done event in 120 minutes) and clause 2 of control_alternate_probes research-revise-refs-extend (no revise-patch event in 120 minutes) were written when the executor ran all day. Since the budget was spent at 04:11Z on 2026-10-26 the executor logs daily budget exhausted on every tick and starts no stage, so both read a refusal as a stall at every drill (issues 1000119 and 1000120)',
  'both clauses pass while a research-budget event from job qnfo-research-exec with status ok and text starting daily budget exhausted is 30 minutes old or younger, a recorded reason that expires when the executor stops logging it. With no such event they fail as before (CHAOS-DRILL-BUDGET-PAUSE-1)',
  'fm-drill-probe-blames-budget-pause: no enabled drill probe reads a done or revise-patch event in a 120-minute window without reading the research-budget event',
  'fm-drill-probe-blames-budget-pause', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 1000119,
  'an enabled spof_alternate_probes or control_alternate_probes row that reads a research stage event (done or revise-patch) in a 120-minute window and does not read the research-budget event',
  'CHAOS-DRILL-FAILED-1 qnfo-research-exec single executor and control:research-revise-refs-extend are filed at every drill from the hour the budget is spent until 00:00Z, and reopened by issue_refile_reopen after each close',
  'two drill probes, their two CHAOS-DRILL-FAILED-1 issues and the register line that counts both alternates as failing');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-drill-probe-blames-budget-pause', NULL, 'CHAOS-DRILL-BUDGET-PAUSE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM spof_alternate_probes WHERE enabled = 1 AND instr(probe_sql, ''qnfo-research-exec'') > 0 AND instr(probe_sql, ''kind = ''''done'''''') > 0 AND instr(probe_sql, ''research-budget'') = 0) + (SELECT COUNT(*) FROM control_alternate_probes WHERE enabled = 1 AND instr(probe_sql, ''revise-patch'') > 0 AND instr(probe_sql, ''-120 minutes'') > 0 AND instr(probe_sql, ''research-budget'') = 0) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- 5. A latent defect found while checking clause 1 of the single-executor probe: the daily proof stage never runs while a budget hold is on. A code change for qnfo-cloud-ops, filed for the code loop.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'RESEARCH-WATCHDOG-PROOF-HELD-1: the budget hold pre-empts the watchdog daily proof stage, so the single-executor alternate goes unexercised and its drill fails 26 hours after the last forced stage',
  'Charter pillar: autonomy. RESEARCH-WATCHDOG-HELD-1 (qnfo-cloud-ops 1.40.1) makes researchWatchdogDecide return budget-held when the queue holds work, no stage finished in 30 minutes and the executor logged a daily-budget hold in the last 15 minutes, and that branch returns before the daily proof branch is read. The budget is spent at about 04:11Z and the hold lasts until 00:00Z, so while rows wait the proof stage (the second path runs once a day so it stays exercised) cannot run. Measured 2026-10-26 18:12Z: the research_exec_watchdog state reads reason budget-held, active 192, held_at 18:01:10Z, last_forced_at 16:20:58Z (the last stall kick before 1.40.1), kicks 449. spof_alternate_probes qnfo-research-exec single executor reads a research-watchdog event with status ok in the last 1560 minutes, so clause 1 fails at 18:21Z on 2026-10-27 if no forced stage lands before then, and CHAOS-DRILL-FAILED-1 qnfo-research-exec single executor (issue 1000119) refiles. A stage forced while the budget is spent is answered by runLeased with budgetHeld (an empty stage list, HTTP 200) and spends nothing, so exercising the service binding during a hold is safe and is what the proof is for. Fix in qnfo-cloud-ops/worker.js: inside the budget-held branch of researchWatchdogDecide, return kick true with reason proof-held when sinceOk is above RESEARCH_WATCHDOG_PROOF_MIN and sinceAny is at least RESEARCH_WATCHDOG_RETRY_MIN, otherwise keep budget-held; keep the 15-minute freshness of the hold. Extend qnfo-cloud-ops/research-watchdog-held.test.mjs: active 192, a fresh hold, no forced stage in 1441 minutes gives kick true and reason proof-held, a forced stage 60 minutes ago gives no kick, a stale hold keeps the stall path. Raise the patch version and keep deployed-current.worker.js identical. Definition of done: the marker proof-held is on main in qnfo-cloud-ops/worker.js.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-cloud-ops/worker.js' || char(10) ||
  'code-anchor: if (sinceHeld <= RESEARCH_WATCHDOG_HELD_FRESH_MIN) return { kick: false, reason: "budget-held",' || char(10) ||
  'code-probe: {"paths": ["qnfo-cloud-ops/worker.js"], "contains": "proof-held"}',
  'session', 'autonomy', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'RESEARCH-WATCHDOG-PROOF-HELD-1:%');

-- 6. The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a3-drills',
  'a drill probe that blames a loop for silence is honest only while the loop is expected to run. A reason for the silence that is recorded by the loop itself, current and expiring (the executor budget-hold event, 30 minutes old or younger) is a legitimate exemption, an unrecorded one is not, and the clauses that exercise the alternate stay as they were so the probe can still fail',
  'CHAOS-DRILL-BUDGET-PAUSE-1: clause 3 of the single-executor probe and clause 2 of the refs-extend probe fail only while no COST-SUSTAIN-1 pause is recorded, the failure mode drill-probe-blames-budget-pause has a detector, and the latent proof-stage defect is filed as RESEARCH-WATCHDOG-PROOF-HELD-1 with a code-task line',
  'live qnfo-audit 2026-10-26 18:10-18:20Z: research-budget events every 10 minutes from job qnfo-research-exec, status ok, newest 18:01:10Z, spent=414726 budget=360000, last done and last revise-patch event 04:32Z, 192 rows queued or researching, both probes read last_pass 0 at the 13:01Z drill (observed: research work waits and no stage finished in 120 minutes, and the revise route recorded no revise-patch event in 120 minutes), the watchdog state reads budget-held with last_forced_at 16:20:58Z, the detector reads 2 before the change. The offline suite migrations/chaos-drill-budget-pause.test.mjs replays both probes with a current pause (pass), an expired pause (fail), no pause (fail) and every other clause failing on its own',
  'migration merged, the next 6-hourly drill reads both probes',
  'two stored probe texts and two window notes in spof_alternate_probes and control_alternate_probes, one failure mode row, one detector contract, one backup table and one filed issue, read by the drill only. No worker, trigger or cron change',
  'the Rollback header replaces the new fragment by the old one in both probes, removes the two window note texts, the failure mode and its detector (decision_log stays: append-only)',
  'the drill tells a deliberate budget pause from a stalled executor and says why on the row, and a stalled executor is still caught after the pause record expires',
  'the next drill pass reads ok for qnfo-research-exec single executor and research-revise-refs-extend while the hold is recorded, issues 1000119 and 1000120 close on that pass, and the detector reads 0',
  'none',
  'd1:qnfo-audit spof_alternate_probes, control_alternate_probes, cloud_ops_events, scheduler_state, research_queue, remediation_contracts (SELECT only), qnfo-research-exec/worker.js runLeased and the /run route, qnfo-cloud-ops/worker.js researchWatchdogDecide, qnfo-fleet-control/worker.js chaosDrill, offline node:sqlite suite with mutation checks'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CHAOS-DRILL-BUDGET-PAUSE-1:') = 1);

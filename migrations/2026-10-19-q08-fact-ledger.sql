-- Q08-FACT-LEDGER-1 (pillar research; agent_issues 2606 Q08-PUBLISH-STALL-AUTO-1; q08-signal-engine 0.32.0). Companion to the worker change.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_alternate_probes WHERE control = 'q08-ground-precheck'; DELETE FROM control_registry WHERE control = 'q08-ground-precheck'; DELETE FROM remediation_contracts WHERE class = 'fm-q08-factcheck-late-failure'; DELETE FROM failure_modes WHERE fm_key = 'q08-factcheck-late-failure'; DELETE FROM capability_ledger WHERE capability = 'q08-ground-precheck'; DELETE FROM ops_config WHERE key = 'q08_ground_precheck';
--
-- WHAT THE WORKER CHANGE IS. q08-signal-engine 0.32.0 runs the free deterministic grounding check (groundingProblems: names, years, figures) on the
-- writer's draft BEFORE the reader panel instead of after it, prunes an essay once, and ends the run as an accuracy failure (no panel call) when the
-- draft still names what the source does not hold; a forecast is refused the same way. It also numbers the source into a ledger in the writer prompt.
-- The pre-check is a new refusal on the publish path of every essay and forecast, so it is registered here as a control with its alternate, a drill
-- probe for that alternate, its failure mode and its detector (DOCTRINE-1 section "before adding a gate", ANTIFRAGILE-1, OWNER-NO-LOOSE-ENDS-1).
--
-- THE ALTERNATE PATH (the finding of the first review of this change: "no off switch and no tested alternate"). ops_config q08_ground_precheck:
--   on    (default, and what an unset, unknown or unreadable row means)  the stage as shipped
--   prune  keeps the essay prune but passes the draft to the panel unchanged when the prune cannot clear the problems, and never refuses a forecast
--   off   no pre-check call at all: the 0.31.3 flow, in which verifyAndRevise prunes an essay and sends one model revision after the panel
-- Read like q08_panel_order (cached five minutes, a failing read keeps the last known mode). Each mode, the read, its cache and `off` making zero
-- pre-check calls are tested offline in q08-signal-engine/fact-ledger.test.mjs (essay and forecast, end to end). That is not a live drill, so this
-- file stamps no alternate_tested_at: control_registry q08-ground-precheck is inserted with alternate_tested_at NULL and gets a read-only row in
-- control_alternate_probes (the shape of migrations/2026-10-19-ensure-live-path-controls.sql), which the drill of qnfo-fleet-control (chaosDrill, every
-- 360 minutes) runs and, on a pass, stamps alternate_tested_at itself. The probe returns ok only while the switch row q08_ground_precheck exists and holds
-- on, prune or off, the detector contract fm-q08-factcheck-late-failure is active, the control row exists AND the latest successful deploy of
-- q08-signal-engine in deployment_history (action 'deploy', status 'success': the row qnfo-ops cf_worker_deploy writes for the canonical path) is 0.32.0
-- or later; it names the first part that is not. The in-code fail-safe (a throw inside the check lets the draft go to the panel) stays as well. This file
-- inserts the switch row with its default, so the switch is visible and flipped by one UPDATE.
--
-- WHY THE PROBE READS THE DEPLOY (the finding of the third review). The first three parts are all rows this very file inserts, so a probe made of them alone
-- reads ok the moment the file applies: with the worker still on 0.31.3, and the first drill would have stamped a
-- critical_path = 1 control as tested with nothing exercised or observed. Every neighbouring probe checks a trace the code leaves (a detector's
-- last_attempt_at, an event inside a window, a steward run). The trace here is the deploy ledger: the part reads the latest successful q08-signal-engine
-- deploy as major and minor numbers (numeric, so 0.100.0 passes and 0.9.0 does not) and fails while it is below 0.32, including when no deploy row exists.
-- Read-only SELECT on qnfo-audit, 2026-10-19 23:35Z: the latest successful q08-signal-engine deploy is 0.31.3-codeagent (id 1856, 2026-10-19T18:46Z), minor
-- 31, so the probe fails today and passes only after the 0.32.0 deploy. The migration applies on merge and the worker deploys from the same push; a drill
-- that runs in the gap fails by design and files its own deduped CHAOS-DRILL-FAILED-1: control:q08-ground-precheck issue,
-- which the next passing drill closes (qnfo-fleet-control chaosPlan). No hand-stamp stands in for that.
-- What the deploy part can and cannot tell. It reads the LATEST successful deploy row, so it fails before the 0.32.0 deploy lands and it passes after. It cannot tell a
-- later rollback: the live ledger trigger deployment_history_version_monotonic_ins (VERSION-MONOTONIC-1) refuses a row whose version is below the highest already
-- recorded for the worker unless the notes say ROLLBACK-OK, and qnfo-ops never writes that word, so a revert of q08-signal-engine leaves 0.32.0 as the latest row
-- (a revert PR also needs a VERSION above the bad one, VERSION-AHEAD-1, so it lands as 0.32.1 or later and the probe keeps passing). A rollback is read by the detector
-- fm-q08-factcheck-late-failure, the q08_ground_precheck switch row and the next deploy, not by this part. One more gap: the ledger write of cf_worker_deploy is
-- fail-open, so if the 0.32.0 row is ever not written the probe fails until the next q08 deploy and the drill files a high CHAOS-DRILL-FAILED-1 issue that no pass can
-- close before then.
--
-- WHY NOT STAMP IT (the finding of the second review): a critical_path = 1 control with a hand-written alternate_tested_at and no probe row keeps
-- v_control_alternate_untested.controls_on_critical_path_untested at its value with no measurement behind it, and is what the column
-- controls_hand_stamped_without_probe counts. Read-only SELECTs on qnfo-audit, 2026-10-19 23:10Z, before this file: critical_untested_by_register 1,
-- critical_untested_by_probe 17, critical_probe_not_drilled 1, critical_without_probe 16, controls_hand_stamped_without_probe 58, probes_total 39. Left
-- NULL with its probe row, the new control reads probe-never-run in v_control_alternate_status and alternate-untested in v_path_coverage_gaps until the next
-- drill: critical_untested_by_register 1 -> 2, critical_untested_by_probe 17 -> 18 and critical_probe_not_drilled 1 -> 2 until the first drill that passes,
-- which cannot be before the 0.32.0 deploy (a drill that runs earlier reads probe-failing and counts the same in those figures), then drilled with a stamp
-- from a passing probe (after the deploy, one cycle, 360 minutes). The three existing q08 controls are stamped by hand and are off the critical path
-- (critical_path 0); this file does not touch them.
--
-- PRE-APPLY COUNTS (read-only SELECTs on qnfo-audit, 2026-10-19 22:45Z; every name this file adds is absent):
--   control_registry          control LIKE 'q08%' = 3 (q08-source-sufficiency-pregate, q08-repeat-class-repair-stop, q08-reviewer-health-order); q08-ground-precheck = 0
--   control_alternate_probes  control LIKE 'q08%' = 0 (23:10Z); q08-ground-precheck = 0
--   failure_modes             fm_key LIKE 'q08%' = 10; q08-factcheck-late-failure = 0
--   remediation_contracts     class LIKE 'fm-q08%' = 10, all status active; fm-q08-factcheck-late-failure = 0
--   capability_ledger         capability LIKE 'q08%' = 2 (q08-reviewer-health-order, q08-run-yield-log); q08-ground-precheck = 0
--   decision_log              action beginning 'Q08-FACT-LEDGER-1:' = 0
--   ops_config                key LIKE 'q08%' = q08_max_per_day, q08_compose_temperature, q08_panel_order; q08_ground_precheck = 0
--   deployment_history        latest resource_name = 'q08-signal-engine' AND action = 'deploy' AND status = 'success' = 0.31.3-codeagent (id 1856), no 0.32 row (23:35Z); this file writes none
-- After this file: one row more in each of the first five tables, in control_alternate_probes and in ops_config (7 inserts), and a replay changes nothing
-- (INSERT OR IGNORE, and the decision_log insert is guarded by NOT EXISTS). No issue, card or contract is closed, reopened or dismissed. decision_log is
-- append-only: the Rollback line does not touch it, the decision row stays.
--
-- LIVE EVIDENCE FOR THE GATE, AND WHAT IS NOT KNOWN (q08-signal engine_runs, read-only, 2026-10-19 22:45Z). Seven days: 317 runs, 17 ok, 265 gate_failed,
-- 207 of them ending on an 'accuracy:' message; 25 of those 265 name a deterministic item ('name/figure/year not in the source') in the final problem
-- list, 1 of them in the last 24 hours (none after run 642 of 2026-10-19 09:36Z). So the refused class is real but small: about 9 percent of failed runs, and
-- the larger share of fact-check failures (the stall digest of the last 24 hours reads fact-check 28) is the two-family review listing paraphrases,
-- which the SOURCE LEDGER in the writer prompt is meant to reduce and the pre-check does not touch. NOT MEASURED: what the refusal costs where a model
-- revision used to run. Today a flagged draft reaches verifyAndRevise, which prunes (essay) and then spends one model revision; a forecast gets the
-- revision and no prune. ok rows keep no repair trail, so it is unknown whether any of the 17 ok runs passed through that revision. That is why the
-- gate ships with the switch above and is reviewed (not assumed right) once logged runs exist: compare the share of engine_runs ending 'accuracy'
-- with and without 'pre-check:' in the error, and compose_calls and verify_calls per gate_failed run, before and after.
--
-- THE DETECTOR (fm-q08-factcheck-late-failure, d1-query@q08-signal, hourly). It counts gate_failed runs of the last 24 hours that logged their model
-- calls (compose_calls IS NOT NULL, written since 0.31.0), that ended on an 'accuracy:' message holding a name, year or figure the source does not
-- hold, and that did NOT end at the pre-check (no 'pre-check:' in the error): a draft that was read by the reader panel and then refused by a free
-- check. With the pre-check on it should be 0 apart from a name an editor rewrite introduced after the pre-check (the editor draft is gated but not
-- grounded until verifyAndRevise), so a nonzero reading is a finding, not noise: it is either the editor round or the pre-check being off or in
-- prune mode. First due 1800 minutes (30 hours) after the file is applied, after a full UTC day on the new flow: a run that ended before the deploy has no 'pre-check:' marker and would read as a
-- late failure, so an earlier read could be red once. Until then v_failure_mode_status reads the detector as unprobed, which raises failure_modes_unprobed_pct by one contract.
--
-- ASCII only. The detector's probe and the drill's probe are each one SELECT with an expected and an observed column, no semicolon, no write keyword (the suite checks).

INSERT OR IGNORE INTO ops_config (key, value, note)
VALUES ('q08_ground_precheck', 'on', 'Q08-FACT-LEDGER-1 (q08-signal-engine 0.32.0): on = the deterministic grounding pre-check runs on the writer draft before the reader panel and refuses a draft it cannot clear (essay: after one prune, forecast: no prune) | prune = keeps the essay prune but passes the draft to the panel unchanged when the prune cannot clear it, never refuses a forecast | off = no pre-check call, the 0.31.3 flow. Read by groundPreCheckMode, cached five minutes, an unset or unknown value means on. The alternate path of control_registry q08-ground-precheck.');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('q08-ground-precheck', 'q08-signal-engine/worker.js generate, generateForecast (groundPreCheck, groundPreCheckMode)', 'filter',
 'reading a draft with the reader panel (up to six judge calls and an editor rewrite) when its names, years or figures are not in the source material, a draft the deterministic grounding check refuses later anyway',
 1, 'keep', 'applied',
 'ops_config q08_ground_precheck: on (default) | prune (the essay prune stays, a draft the prune cannot clear goes to the panel unchanged, a forecast is never refused) | off (no pre-check call, the 0.31.3 flow in which verifyAndRevise prunes an essay and sends one model revision after the panel); read like q08_panel_order, cached five minutes, an unset or unknown value means on, a failing read keeps the last known mode, no deploy needed to flip it; behind it the in-code fail-safe (a throw inside the check lets the draft go to the panel as before) and the unchanged later stages (verifyAndRevise with its prune and revision, the two-family fact-check, the final read), so a draft the pre-check lets through is still checked and a draft it refuses was one the free check would have refused anyway',
 NULL,
 'Q08-FACT-LEDGER-1 2026-10-19 (agent_issues 2606): q08-signal engine_runs seven days to 2026-10-19 22:45Z: 317 runs, 17 ok, 265 gate_failed, 207 ending on an accuracy message, 25 naming a name, year or figure not in the source in the final problem list (1 in the last 24 hours, run 642 of 2026-10-19 09:36Z, and none after it); stall digest of the last 24 hours fact-check 28, reader panel 12, writer gate 4; no piece since 2026-10-18T20:15Z. The gate is on the critical path of every essay and forecast (critical_path 1) because it refuses before the panel. Unmeasured and stated so: the yield cost of refusing where a model revision used to run (ok rows keep no repair trail, so it is unknown whether any of the 17 ok runs passed through that revision); the live evidence for the refused class is thin (about 9 percent of failed runs), which is why the switch exists and why the gate is reviewed, not assumed. The alternate is tested offline in q08-signal-engine/fact-ledger.test.mjs (each mode on an essay and a forecast, end to end, off making zero pre-check calls, the read, its cache and fail-open) and is not yet drilled live: alternate_tested_at is NULL on purpose, the control_alternate_probes row q08-ground-precheck reads the switch row, the detector contract, this row and the latest successful q08-signal-engine deploy in deployment_history (0.32.0 or later as the latest row, so it fails until the worker is live; a later rollback is not read by this part), and the drill stamps a passing probe (360 minute cadence). Review again when 20 logged runs exist after the deploy, with fm-q08-factcheck-late-failure and the share of engine_runs ending accuracy with and without pre-check in the error.',
 2606, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO control_alternate_probes (control, probe_sql, window_note, enabled)
VALUES ('q08-ground-precheck',
 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM control_registry WHERE control = ''q08-ground-precheck'') THEN ''the control_registry row q08-ground-precheck is missing'' WHEN NOT EXISTS (SELECT 1 FROM ops_config WHERE key = ''q08_ground_precheck'') THEN ''the ops_config switch q08_ground_precheck is missing'' WHEN COALESCE((SELECT lower(trim(value)) FROM ops_config WHERE key = ''q08_ground_precheck''), '''') NOT IN (''on'', ''prune'', ''off'') THEN ''the ops_config switch q08_ground_precheck reads '' || COALESCE((SELECT value FROM ops_config WHERE key = ''q08_ground_precheck''), ''NULL'') || '', not on, prune or off'' WHEN NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = ''fm-q08-factcheck-late-failure'' AND status = ''active'') THEN ''the detector fm-q08-factcheck-late-failure is missing or not active'' WHEN d.major < 1 AND d.minor < 32 THEN ''q08-signal-engine 0.32.0 or later is not the latest successful deploy (latest: '' || d.v || ''), so the pre-check is not live'' ELSE ''ok'' END AS observed FROM (SELECT v, CAST(substr(v, 1, instr(v, ''.'') - 1) AS INTEGER) AS major, CAST(substr(r, 1, instr(r, ''.'') - 1) AS INTEGER) AS minor FROM (SELECT v, substr(v, instr(v, ''.'') + 1) AS r FROM (SELECT COALESCE((SELECT version_id FROM deployment_history WHERE resource_name = ''q08-signal-engine'' AND action = ''deploy'' AND status = ''success'' ORDER BY id DESC LIMIT 1), ''none'') AS v))) AS d',
 '360 minutes: four checks read when the drill of qnfo-fleet-control runs, every 360 minutes: the switch row q08_ground_precheck holds on, prune or off, the detector contract fm-q08-factcheck-late-failure is active, the control row exists, and the latest successful deploy of q08-signal-engine in deployment_history is 0.32.0 or later (the trace the code leaves: the probe fails with the worker on 0.31.3 and before the deploy lands, and files its own CHAOS-DRILL-FAILED-1 issue until a drill passes); v_control_alternate_status calls a pass stale after 480 minutes. No event inside a window is read, so the offline suite q08-signal-engine/fact-ledger.test.mjs stays the proof that each mode works and this probe proves the worker is deployed with its switch and its detector in place',
 1);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('q08-factcheck-late-failure',
 'q08 reads a draft with the reader panel and its editor rounds and only then fails it at the fact-check on a name, year or figure the source does not hold, a check that costs no model call',
 'the deterministic grounding check (groundingProblems) ran last, inside verifyPiece after runLevels, so a draft whose names, years or figures the source lacks was read by up to six judges and rewritten by an editor first, and the writer was never shown which source sentences it could rely on',
 'q08-signal-engine 0.32.0 runs groundPreCheck on the writer draft before the panel (one prune for an essay, else the run ends as an accuracy failure with no panel call) and numbers the source into a ledger in the writer prompt; ops_config q08_ground_precheck = prune or off relaxes or removes the pre-check without a deploy; a name an editor rewrite introduces after the pre-check still reaches verifyAndRevise, which is why this detector exists',
 'remediation_contracts fm-q08-factcheck-late-failure (d1-query@q08-signal, hourly)',
 'fm-q08-factcheck-late-failure', '2026-10-19', 2606,
 'a draft that passes the writer gate holds a name, year or figure that is not in the source material, or an editor rewrite adds one, or q08_ground_precheck is off or prune',
 'gate_failed runs that logged their model calls and ended on an accuracy message with a name, year or figure not in the source without a pre-check line in the error (25 of 265 failed runs in the 7 days to 2026-10-19 named such an item, all before the stage existed)',
 'q08.org publishing yield and the Workers AI spend of the panel and editor rounds spent on a draft the free check refuses');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-q08-factcheck-late-failure', NULL,
 'q08-signal-engine 0.32.0 or later is deployed with ops_config q08_ground_precheck on, and a gate_failed run of the last 24 hours that logged its model calls ended on an accuracy message holding a name, year or figure not in the source without a pre-check line',
 'groundPreCheck refuses such a draft before the panel on the next tick, if the count stays above 0 the editor round or the q08_ground_precheck switch is reviewed (an editor rewrite that adds a name after the pre-check is the known gap)',
 'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM engine_runs WHERE compose_calls IS NOT NULL AND status = ''gate_failed'' AND ran_at >= datetime(''now'', ''-24 hours'') AND instr(error, ''accuracy:'') > 0 AND instr(error, ''pre-check:'') = 0 AND (instr(error, ''name not in the source'') > 0 OR instr(error, ''figure not in the source'') > 0 OR instr(error, ''year not in the source'') > 0)',
 'd1-query@q08-signal', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now', '+1800 minutes'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('q08-ground-precheck', 'migrations/2026-10-19-q08-fact-ledger.sql (Q08-FACT-LEDGER-1, q08-signal-engine 0.32.0)',
 'q08-signal-engine 0.32.0 deployed, the writer prompt carries the numbered SOURCE LEDGER, ops_config q08_ground_precheck readable through the AUDIT binding it already holds (an unreadable row means on)',
 'the free deterministic grounding check refuses a draft that names what the source does not hold before any reader-panel call, with a switch (on, prune, off) that restores the previous flow without a deploy and an hourly detector, fm-q08-factcheck-late-failure, for a draft that is refused late',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
 'q08 stops spending a reader panel and an editor round on a draft its own free check would refuse, and can say which share of failed runs ended at the pre-check (pre-check line in engine_runs.error) and which reached the panel first (the detector). Not claimed: that this restores publishing.');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766:q08-fact-ledger',
 'a check that costs no model call should run before the checks that do, and a new refusal on the publish path needs its own off switch because the yield cost of refusing where a model revision used to run cannot be measured from the run log',
 'Q08-FACT-LEDGER-1: q08-signal-engine 0.32.0 runs the deterministic grounding check on the writer draft before the reader panel (one prune for an essay, no prune for a forecast, refusal with no panel call otherwise), numbers the source into a ledger in the writer prompt, strips grouped and ranged ledger tags, and ships ops_config q08_ground_precheck (on, prune, off) as the alternate (tested offline in q08-signal-engine/fact-ledger.test.mjs; to be drilled by its control_alternate_probes row on the next 360-minute drill after the 0.32.0 deploy, alternate_tested_at left NULL); control q08-ground-precheck, failure mode q08-factcheck-late-failure with detector fm-q08-factcheck-late-failure, capability q08-ground-precheck',
 'q08-signal engine_runs 7 days to 2026-10-19 22:45Z: 317 runs, 17 ok, 265 gate_failed, 207 ending on accuracy, 25 naming a name/year/figure not in the source (1 in 24 hours); stall digest 24 hours fact-check 28, reader panel 12, writer gate 4; last ok run 2026-10-18T20:15Z; review findings by content, all fixed in this change: a grouped ledger tag made the pre-check refuse a draft over a cosmetic tag; no registry rows and no off switch; the alternate was hand-stamped on a critical-path control (replaced by a drill probe row, alternate_tested_at left NULL); and the drill probe read only rows this file inserts, so it passed before the worker was deployed (it now also requires the latest successful q08-signal-engine deploy to be 0.32.0 or later)',
 'pending',
 'q08-signal-engine essay and forecast generation (q08.org and reading.q08.org drafts): a draft with an unsupported name, year or figure ends before the panel; no spend added (the pre-check makes no model call), panel and editor calls fall for those drafts; the unmeasured cost is a refusal where a model revision used to run, bounded by the switch',
 'ops_config q08_ground_precheck = off (no deploy, the 0.31.3 flow) or prune; or revert the q08-signal-engine change through the canonical path; the Rollback line of migrations/2026-10-19-q08-fact-ledger.sql removes the registry rows, the probe row and the config row (this decision row stays: decision_log is append-only)',
 'q08 refuses a draft its own free check would refuse before spending a reader panel and an editor on it, with a switch that returns the previous flow by itself',
 'q08_gate_pass_rate_7d >= 0.05 within 168 h',
 'none',
 'qnfo-audit D1 control_registry, failure_modes, remediation_contracts, capability_ledger, decision_log and ops_config (SELECT, 2026-10-19), q08-signal D1 engine_runs (SELECT), offline suites q08-signal-engine/fact-ledger.test.mjs (every mode, essay and forecast, end to end) and migrations/q08-fact-ledger.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'Q08-FACT-LEDGER-1:') = 1);

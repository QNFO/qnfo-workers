-- REM-A5-METRIC-TRIGGERS-1 (2026-10-26, pillar autonomy; session rem-a5 of the 2026-10-26 remediation wave; cluster: the METRIC-TRIGGER-* outcome tickets).
-- Read 2026-10-26 17:55Z to 19:10Z against live qnfo-audit, origin/main, the fleet graph and GitHub (v_metric_trigger_state hit = 1: 59 to 64 triggers over the session).
-- Every ticket's contract is monitoring:metric-condition (TRIGGER-RECOVERY-1 closes it when the metric stays clear), so a ticket closes only when its metric moves.
-- This file records what the read found and applies the three changes that are the cluster's to make from D1:
--   1. ACT-BRIDGE-1 (breach_code_task_pct, ticket 99926): the metric is the share of breaching triggers whose action ends in a code-task line; it read 6 of 64 (9.4, floor 10).
--      Three breaching triggers whose lever is one code change in one worker, and whose change already has a queued code task or a named owner, gain a lever sentence inside
--      the 300 characters of prose that triggerIssueDescription keeps, a code-task line and a code-anchor line that occurs exactly once on main
--      (guard: migrations/code-anchor-once.test.mjs, which also lists qnfo-fleet-dashboard in WATCHED from this PR on):
--        388   fix_hold_rate_30d                 qnfo-fleet-control triggerRecoveryDue (the 60-minute clean streak closed 26 of the 44 tickets reopened in 7 days: TRIGGER-FLAP-1, 1000459)
--        1867  attention_channels_stopped         qnfo-fleet-dashboard atChannelStats (counts unmeasured posts as zero engagement: ATTENTION-UNMEASURED-1, task ct_im1000458 queued)
--        10931 research_neurons_per_publication_7d qnfo-research-exec stageRevise (revise-noop re-queues forever: REVISE-NOOP-BOUND-1, task ct_rvnp3b02c956c0 queued)
--      Left out on purpose: 9262 (62 fleet-graph findings spread over 19 wrangler.toml files, no single file), 4982 and 357 (no verified code lever: the three false-stop hits are
--      4 to 6 days old and the watchmaker count is a 30-day person-merge window), 361 (qnfo-ops/worker.js:501 is held by rem-a6, who is told on PR 4764).
--   2. unverified_blocker_claims (guard, ticket 3001): v_blocker_claims is a keyword match. Four of its 17 rows are tickets of this cluster whose text holds the word in a
--      diagnosis note or a column name (1798, 2455, 99934, 99948). Each gets a blocker_redteam verdict false-belief-removed that names the sentence, what was read and the
--      closing path, with the text_sig the view reads, so it holds while the text is unchanged and is written only if the text is still the one that was read. The keyword
--      list is not touched (it is a guard); the other 13 rows belong to other clusters and stay counted.
--   3. Dated dispositions in decision_log (one parsed prediction each) and a one-paragraph note on the tickets whose cause the read found (below).
-- CLUSTER READ (class, one line each; the live number moves hourly, so each class names the evidence and not a promise):
--   TIME-GATED, nothing left to fix (clears by itself, dated in the notes): tick_completion_24h, tick_slot_coverage_24h, tick_sequence_completion_24h (one 8-slot fleet_tick gap
--     2026-10-26 04:40Z to 05:59Z, every slot filled since 06:00Z), false_stops_7d (3 hits, last 2026-10-22T05:00Z), ops_agent_empty_answers_7d (4 rows, last 2026-10-24T14:14Z),
--     code_task_success_rate_30d (0.49 against 0.5, a 30-day ratio that rises as failed tasks age out), research_neurons_per_publication_7d (the 10-19 to 10-21 burst). owner_dispatch_7d is not
--     time-gated: it counts owner cards created in 7 days and read 12 at 17:55Z and 14 at 18:57Z, so it is the owner-task cluster's rate (rem-a7).
--   CAUSE FOUND, owner is another session: guard_rcs (PR 4764 added qnfo-ops/worker.js:501 [write-200-only]; commented there), watchmaker_index (code-task-merge by_person is a
--     30-day window of 44 person or session merges, last 2026-10-26T11:05Z), golden_run_complement_share_30d (research-exec stageVerify sets two quantities from one count; code
--     task is on the trigger), attention_channels_stopped (queued task), fix_hold_rate_30d (TRIGGER-FLAP-1), unverified_blocker_claims (13 of 17 are other clusters' issues).
--   ROLL-UP of another cluster's fix, no double count found: sla_breaches_over_120m is the sum of five distinct item sets (v_sla_over_120m read 19:00Z: issues_open_over_120m 290 +
--     content_items_over_sla 1034 + code_tasks_queued_over_120m 2 + cadence_overdue_over_120m 3 + research_head_stalled 1 = total_over_120m 1330); stuck_items_over_sla is research_queued_180m
--     133 + issues_without_doer_3h 61 + research_head_stalled 1 (trigger queue_sla_tick_10m); issues_unprobed_60m (169 open issues unprobed at 18:42Z, 89 of them METRIC-TRIGGER or
--     METRIC-REGRESSION tickets parked as monitoring that no prober reads by design); open_agent_issues, issues_over_24h_no_doer, issue_drain_ratio_24h,
--     issue_auto_close_2h_share_24h, mttr_h_7d (backlog family, drained by the other clusters: 333 open at 17:55Z, 314 at 18:56Z);
--     content_items_over_stage_sla, idea_to_publish_h_p50_7d, publish_rate_ratio_24h, papers_with_open_high_errata_pct, research_deferred_pool (research cluster, rem-a1);
--     cost family (workers_ai_cost_30d_usd, monthly_cost_run_rate_usd, external_impact_per_dollar, fleet_cost_bound_month_usd: Workers AI is 22.0 USD a day over the last 7 complete
--     days against 10.9 under the caps, 65.7 percent of it qnfo-research-exec, and 777 of the 1467 USD all-billing run rate is owner-stated direct providers 450, plan 5 and the
--     owner's own gateway clients 322, which no fleet change moves); q08 trio (q08-signal-engine, rem-a7); failure_modes_recurring (49 fm detectors, each its own failure);
--     cadence_overdue_over_120m (q08.org, papers.qnfo.org, reading.q08.org producers stalled: three other clusters).
--   REAL, structural, left open with the lever named: worker_count (36 against 30: qnfo-artifacts retired by PR 4800, ranked list in the report), roster_capabilities_single_executor
--     (178 to 179 against a ratchet of 157, rising with each new worker; the worker: placeholders are already excluded by the metric SQL), spofs_total (15 registered),
--     fleet_graph_findings_warn (57 env-undeclared in 19 workers: 30 token- or key-shaped, 27 knobs without a declared default), orphaned_leases (guard: 215 to 222 expired unreleased
--     claims; BP26-SQL-PRODUCERS-1 decided that a sweeper would erase the evidence, so none is added here).
--   NO CLOSE HERE: no ticket is closed by this file; none of its changes touches a guard, a probe, a cap or a target.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET action = (SELECT b.action FROM bak_20261026_rem_a5_triggers b WHERE b.id = analytics_metric_triggers.id), notes = (SELECT b.notes FROM bak_20261026_rem_a5_triggers b WHERE b.id = analytics_metric_triggers.id) WHERE id IN (SELECT id FROM bak_20261026_rem_a5_triggers); UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_rem_a5_issues b WHERE b.id = agent_issues.id) WHERE id IN (SELECT id FROM bak_20261026_rem_a5_issues); DELETE FROM blocker_redteam WHERE actor = 'rem-a5'
-- spof-review: adds no cron, D1 trigger, external host or credential; three trigger action texts, four verdict rows, twelve issue notes and seven decision rows.

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a5_triggers AS SELECT id, metric_key, action, notes FROM analytics_metric_triggers WHERE id IN (388, 1867, 10931);
CREATE TABLE IF NOT EXISTS bak_20261026_rem_a5_issues AS SELECT id, description FROM agent_issues WHERE id IN (2670, 2861, 2875, 3001, 99909, 99926, 99927, 99936, 99940, 100084, 100122);

-- 1. ACT-BRIDGE-1 lines. The lever sentence sits right after the Pillar header (388 has none, so it leads); both marker lines end the action.
UPDATE analytics_metric_triggers SET
  action = 'Lever: in qnfo-fleet-control/worker.js triggerRecoveryDue hold a recovered METRIC-TRIGGER ticket open for a clean streak longer than the metric''s refresh scatter (TRIGGER_RECOVERY_MIN is 60): 26 of 44 tickets reopened in 7 days closed on that streak (TRIGGER-FLAP-1, issue 1000459). ' ||
    action || char(10) ||
    'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) ||
    'code-anchor: function triggerRecoveryDue(streakStartIso, nowMs, minMinutes) {',
  notes = COALESCE(notes, '') || ' | REM-A5-METRIC-TRIGGERS-1 2026-10-26: lever, code-task and code-anchor added (hysteresis of TRIGGER-RECOVERY-1; the cause is TRIGGER-FLAP-1)'
WHERE id = 388 AND metric_key = 'fix_hold_rate_30d' AND instr(action, char(10) || 'code-task:') = 0 AND action NOT LIKE 'code-task:%';

UPDATE analytics_metric_triggers SET
  action = substr(action, 1, instr(action, ').') + 1) || ' ' ||
    'Lever: in qnfo-fleet-dashboard/worker.js atChannelStats count an item only when it is measured (a post with no reach_signals or Buffer metric row is left out, not scored 0), so an unmeasured channel reads INSUFFICIENT, not STOP (issue 1000458).' ||
    substr(action, instr(action, ').') + 2) || char(10) ||
    'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js' || char(10) ||
    'code-anchor: function atVerdict(stats, prev, th, nowIso) {',
  notes = COALESCE(notes, '') || ' | REM-A5-METRIC-TRIGGERS-1 2026-10-26: lever, code-task and code-anchor appended (atChannelStats counts unmeasured posts as zero engagement; task ct_im1000458 is queued)'
WHERE id = 1867 AND metric_key = 'attention_channels_stopped' AND substr(action, 1, 7) = 'Pillar ' AND instr(action, ').') BETWEEN 10 AND 120
  AND instr(action, char(10) || 'code-task:') = 0 AND action NOT LIKE 'code-task:%';

UPDATE analytics_metric_triggers SET
  action = substr(action, 1, instr(action, '. ')) || ' ' ||
    'Lever: in qnfo-research-exec/worker.js stageRevise count a revise-noop on research_queue.revise_count and park the row at 2 instead of re-queuing it, so a paid call that edits nothing stops repeating (task ct_rvnp3b02c956c0).' ||
    substr(action, instr(action, '. ') + 1) || char(10) ||
    'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
    'code-anchor: return { ok: false, stage: "revise", withheld: "revise-noop", fixes: _fx.length, fixIds: _hardIds.slice(0, 8), proposed: _p.proposed };',
  notes = COALESCE(notes, '') || ' | REM-A5-METRIC-TRIGGERS-1 2026-10-26: lever, code-task and code-anchor appended (REVISE-NOOP-BOUND-1; task ct_rvnp3b02c956c0 is queued)'
WHERE id = 10931 AND metric_key = 'research_neurons_per_publication_7d' AND substr(action, 1, 12) = 'Pillar cost.' AND instr(action, char(10) || 'code-task:') = 0 AND action NOT LIKE 'code-task:%';

-- 2. Red-team verdicts for four tickets of this cluster that v_blocker_claims counts on a keyword. Written only when the ticket is open and its text is the one that was read
-- (title length : description length is the text_sig the view compares).
INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:1798', 'owner-blocked: "Most remaining open items are owner-blocked (1716 dated, 1750, 1816, 1724), time-gated (1821, 1785, 1754, 1732)"',
  'Read the sentence in the ticket text and then the four ids it names. It describes other issues in an old backlog note and asserts no owner, credential or token step on this ticket. Checked the claim against D1: 1716, 1724 and 1750 are closed and 1816 is wontfix, so the sentence is stale as well. The ticket''s closing path is the metric open_agent_issues (contract issue-1798, monitoring, TRIGGER-RECOVERY-1), which fleet loops move by closing issues.',
  'false-belief-removed',
  'agent_issues 1716 closed, 1724 closed, 1750 closed, 1816 wontfix (read 2026-10-26 18:56Z); open issues 314 of which 2 carry an IDENTITY-BOUND line and 1 owner card is open; v_metric_trigger_state id 362 open_agent_issues gt 260 is in breach and closes with the backlog, not with an owner step',
  'rem-a5', '82:3405'
WHERE EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 1798 AND a.status = 'open' AND length(a.title) = 82 AND length(COALESCE(a.description, '')) = 3405)
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:1798' AND r.actor = 'rem-a5');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:2455', 'blocked: "alternates ... declared failed by obsolete probe SQL or blocked by a stopped research-exec loop"',
  'Read the sentence in context. It is a root-cause note about which chaos-drill alternates fail, not an owner, credential or token requirement on this ticket, and the stopped research-exec loop it names is not stopped now: the SPOF row for the research-exec single executor records its alternate (the qnfo-cloud-ops watchdog) tested at 2026-10-25T12:01Z. The ticket closes when the spof_alternate_probes rows pass within 24 h (contract issue-2455, monitoring), which the drill loops do without a person.',
  'false-belief-removed',
  'spof_registry component "qnfo-research-exec single executor" alternate_tested_at 2026-10-25T12:01:00.499Z; v_metric_trigger_state id 5182 spof_alternates_untested_24h = 1 (one probe not passing, read 2026-10-26 18:57Z)',
  'rem-a5', '130:5480'
WHERE EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 2455 AND a.status = 'open' AND length(a.title) = 130 AND length(COALESCE(a.description, '')) = 5480)
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:2455' AND r.actor = 'rem-a5');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:99934', 'owner-only: "Nine of the 12 cards were real owner-only steps (domain renewal, Zenodo withdrawal, GitHub settings, Mastodon token ...)"',
  'Read the note. It counts the cards that the metric counts (human_actions that v_human_action_gate grades owner in the last 7 days); they are the subject of owner_dispatch_7d, not a step that blocks closing this ticket. The ticket closes when the cards created in 7 days fall to 5 or fewer, by ageing out of the window and by fewer being filed (contract issue-99934, monitoring); the fleet does both and no owner act is needed to close the ticket. No card was closed, rerouted or edited by this verdict.',
  'false-belief-removed',
  'v_metric_trigger_state id 3454 owner_dispatch_7d = 14 gt 5 (read 2026-10-26 18:57Z, 12 at 17:55Z); 1 owner card is open in human_actions; the metric is a 7-day window over cards created, so it falls as they age out unless new ones are filed',
  'rem-a5', '105:1131'
WHERE EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 99934 AND a.status = 'open' AND length(a.title) = 105 AND length(COALESCE(a.description, '')) = 1131)
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:99934' AND r.actor = 'rem-a5');

INSERT INTO blocker_redteam (target, claim, attempt, verdict, evidence, actor, text_sig)
SELECT 'issue:99948', 'blocked: "SELECT property, stage, in_flight, waiting, held, blocked, over_sla, oldest_age_h, enforced_by FROM v_content_stage_summary"',
  'Read the sentence in context. The word is the name of a column of the view v_content_stage_summary in a query the trigger action tells the doer to run, not a statement that this ticket is blocked. Confirmed the column exists with PRAGMA table_info on the view. The closing path is the metric content_items_over_stage_sla (contract issue-99948, monitoring), which the three stalled loops it counts move.',
  'false-belief-removed',
  'pragma_table_info(v_content_stage_summary) lists blocked, held, waiting, over_sla (read 2026-10-26 18:53Z); v_metric_trigger_state id 5915 content_items_over_stage_sla in breach and falling (2479 at 17:55Z, 1179 at 18:57Z)',
  'rem-a5', '98:2775'
WHERE EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 99948 AND a.status = 'open' AND length(a.title) = 98 AND length(COALESCE(a.description, '')) = 2775)
  AND NOT EXISTS (SELECT 1 FROM blocker_redteam r WHERE r.target = 'issue:99948' AND r.actor = 'rem-a5');

-- 3. Notes on the tickets whose cause the read found. Appended once (the instr guard); none carries a probe or code-task marker line.
UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26: time-gated, no defect left to fix. The only fleet_tick gap in the 24 h window is 2026-10-26 04:40Z to 05:59Z (8 ten-minute slots); read 18:40Z, every slot from 06:00Z is present and all eleven tick_runs steps are ok in every hour since. tick_completion_24h and tick_slot_coverage_24h count that gap until about 2026-10-27T05:00Z (95 and 0.95 are met once two of its slots leave the window, about 99 once all do). tick_sequence_completion_24h counts five hours (10-25T22, 10-26T02, T03 and T04 with the pull step ok 0, T05 with no row), reaches 0.9 at about 2026-10-27T03:00Z and 1.0 at 06:00Z. A reading still under its floor after those times means a new gap: look at fleet_tick slots first.'
WHERE id IN (2861, 2875, 99936) AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26: time-gated. The 3 hits in the 7-day window are all ops_ai_log conditional-offer rows (false_stop_hits 21 and 22 at 2026-10-20T11:00Z, 35 at 2026-10-22T05:00Z); none since. The count falls to 1 at 2026-10-27T11:00Z and to 0 at 2026-10-29T05:00Z if no new hit lands. A new hit is the emitter (the qnfo-ops agent-tools prompt), not this ticket.'
WHERE id = 99940 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26: time-gated after the fix. qnfo-ops 2.58.3 (OPS-AGENT-EMPTY-RECOVER-1) was live at 17:58Z (worker_live_audit); the 4 rows in the 7-day window are ops_ai_log agent-tools answers with ok 0 at 2026-10-21T14:08Z, 2026-10-24T13:10Z, 13:51Z and 14:14Z, none since. The window empties at 2026-10-31T14:14Z if no new failed answer lands.'
WHERE id = 100122 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26: cause found. guard_rcs is the latest completed main run of five guard workflows and reads 1 each time a push to main fails one. The 18:41:08Z deploy-gate run 40379913871 (sha 5de2acaa, PR 4764, qnfo-ops 2.59.0) failed at WORKERS-STANDARDS-GUARD-1: qnfo-ops/worker.js:501 [write-200-only], the line if (cl2.status !== 200) after the PATCH in github_pr_close. Later pushes pass because the guard compares each push with HEAD~1, so the violation stays in the file until it is fixed. Reported on PR 4764; qnfo-ops/worker.js is held by rem-a6 and is not edited here. The ticket reopens with every push that fails a guard.'
WHERE id = 2670 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26: cause read. The one counted operation is code-task-merge (fleet.qnfo.org/api/watchmaker at 07:01Z: index 1, counted [code-task-merge]). Its heartbeat is ok and code tasks in needs_human are 0 (read 18:56Z); what counts is by_person, code-loop PRs merged or closed by anyone but the runner in a 30-day window: 44 now (github:rwnq8 21, merged_by null 13, closed by a person 9, session 1), the last at 2026-10-26T11:05Z, against 174 merged by qnfo-fleet-control. The window does not empty while a person or session keeps merging one, so the index does not reach 0 by itself for 30 days after the last such merge. Levers: let the runner merge them, or decide the by_person window in qnfo-fleet-dashboard WATCHMAKER code-task-merge (stuck_min 43200). Not changed here.'
WHERE id = 99909 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26: read at 18:42Z, 62 warn findings = 57 env-undeclared in 19 workers (qnfo-cloud-ops 12, personal-api 6, qnfo-ai 6, q08-signal-engine 5, qnfo-ops 5, 14 workers with 1 to 3), 2 sql-table-missing (qnfo-research-exec reads bak_20261019_research_parked and bibliography), 2 trigger-depth, 1 untracked-worker (voice-stt). 30 of the 57 names are token- or key-shaped (BSKY_APP_PASS, BUFFER_TOKEN, GMAIL_PASS ...): a value that is not set on the worker, so the path it guards is off (OPTIONAL-ENV-1 keeps those a warn on purpose). 27 are knobs or alternate names (PILOT_RPM, OPS_T2_DAILY_CAP, SPEND_SOFT_FRACTION, AUDIT_DB ...) that the code reads with a fallback or a truthiness test; each is fixed by declaring it in the worker''s wrangler.toml [vars] with the code default. One is a dead path: qnfo-ai reads env.CAL_API (a service binding to the folded calendar-api) inside a try that returns null, so its calendar context is silently off. No single-file lever, so no code-task line. qnfo-artifacts leaves with PR 4800 (one finding).'
WHERE id = 100084 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26: 17 rows counted at 18:35Z are keyword matches of v_blocker_claims (the phrases are listed in the view). Four are tickets of the METRIC-TRIGGER cluster (1798, 2455, 99934, 99948): the word sits in a diagnosis note or a column name, not in a statement that the ticket waits on someone, and each now has a blocker_redteam verdict false-belief-removed with its text_sig (actor rem-a5). The other 13 are issues of other clusters (GH-WEBHOOK-INTAKE-1, GH-APP-FLEET-2, MAIN-RULESET-PUSH-IDENTITY-1, TP-1.17, TP-2.3, CODE-LOOP-EXHAUSTED-1 100392, 100455, 100456, 1000004, 1000167, 1000266, 1000317, 1000360); blocker-redteam-runner clears an issue that has a doer every hour and leaves the rest counted on purpose. The keyword list is unchanged.'
WHERE id = 3001 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26: lever applied (ACT-BRIDGE-1). 6 of 64 breaching triggers carried a code-task line at 18:42Z (9.4, floor 10). REM-A5-METRIC-TRIGGERS-1 gives triggers 388 (qnfo-fleet-control triggerRecoveryDue), 1867 (qnfo-fleet-dashboard atChannelStats) and 10931 (qnfo-research-exec stageRevise) a lever sentence, a code-task and a code-anchor that occurs once on main (checked by migrations/code-anchor-once.test.mjs); each lever already has a queued code task or a named owner. 9 of 64 is 14.1, at or above 10 while fewer than 90 triggers breach. The ticket closes through TRIGGER-RECOVERY-1 after its clean streak.'
WHERE id = 99926 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26: the cause is TRIGGER-FLAP-1 (agent_issues 1000459, session-old-issues-6d-2038): 26 of the 44 tickets reopened in 7 days were closed by the 60-minute streak of TRIGGER-RECOVERY-1 and 14 by MANAGEMENT-PERSONAS-2 (PR 4753 gives that view the same streak). Trigger 388 now names the code lever (triggerRecoveryDue in qnfo-fleet-control) for the code loop. fix_hold_rate_30d is a 30-day ratio of closures that held: it rises as relapsing closures stop and old ones age out, and no write here moves it faster.'
WHERE id = 99927 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

-- 4. Decisions with their predictions (decision_predictions_parse reads the first claim of predicted_outcome; calibration-scorer scores it).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'a breach whose lever is one code change in one worker names that lever, the path and an anchor that still occurs once in the trigger text the code loop receives (ACT-BRIDGE-1), when the change already has a queued task or a named owner',
  'REM-A5-ACT-BRIDGE-1: lever, code-task and code-anchor added to triggers 388, 1867 and 10931',
  'v_metric_trigger_state 2026-10-26 18:42Z: 64 breaching, 6 with a code-task line (9.4, floor 10); code_tasks ct_im1000458 (atChannelStats) and ct_rvnp3b02c956c0 (stageRevise) queued; agent_issues 1000459 attributes 26 of 44 reopened tickets to the 60-minute streak; each anchor occurs once on main (migrations/code-anchor-once.test.mjs)',
  'applied by migration', 'three trigger action texts and their notes; no worker code', 'the Rollback line restores the three rows from bak_20261026_rem_a5_triggers',
  'three more breaches hand a verified lever and anchor to the code loop', 'breach_code_task_pct >= 10 within 3 h', 'none',
  'd1:v_metric_trigger_state, analytics_metric_triggers, code_tasks; code:qnfo-fleet-control, qnfo-fleet-dashboard, qnfo-research-exec anchors'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-ACT-BRIDGE-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'a keyword match on a METRIC-TRIGGER ticket is a blocker claim only if the ticket asserts a blocker; a verdict is recorded after reading the text and checking the claim, tied to the text by text_sig, never by loosening the guard keywords',
  'REM-A5-BLOCKER-REDTEAM-1: blocker_redteam verdicts false-belief-removed for tickets 1798, 2455, 99934 and 99948',
  'v_blocker_claims 18:35Z: 17 rows, 4 of this cluster; 1716, 1724, 1750 closed and 1816 wontfix; v_content_stage_summary has the column blocked; spof_registry research-exec alternate_tested_at 2026-10-25T12:01Z; 1 open owner card, 2 open issues with an IDENTITY-BOUND line',
  'applied by migration', 'four blocker_redteam rows; the view, its keywords and the runner are unchanged', 'the Rollback line deletes the rows of actor rem-a5',
  'unverified_blocker_claims counts only claims nobody has read', 'unverified_blocker_claims <= 15 within 3 h', 'none',
  'd1:v_blocker_claims, blocker_redteam, agent_issues, spof_registry, human_actions'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-BLOCKER-REDTEAM-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'the three heartbeat metrics read a gap that has already closed; nothing in the producers is wrong, so the lever is time and a check that no new gap opens',
  'REM-A5-TICK-WINDOW-1: tick_completion_24h, tick_slot_coverage_24h and tick_sequence_completion_24h dated as time-gated',
  'fleet_tick slots 2026-10-25T16:0 to 10-26T17:5 read 18:40Z: the only missing slots are T04:4, T04:5 and T05:0 to T05:5; tick_runs: 11 of 11 steps ok in every hour from 06:00Z, pull ok 0 in 10-25T22 and 10-26T02, T03, T04, no row for T05; metric values 93.8, 0.935 and 0.792',
  'applied by migration', 'a note on tickets 2861, 2875 and 99936; no behaviour change', 'the Rollback line restores the notes',
  'the heartbeat tickets state when they clear and what a later reading means', 'tick_sequence_completion_24h >= 0.9 within 12 h; tick_completion_24h >= 95 and tick_slot_coverage_24h >= 0.95 by 2026-10-27T05:10Z, all three clean by 06:10Z', 'none',
  'd1:fleet_tick, tick_runs, metric_registry'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-TICK-WINDOW-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'a 7-day count whose events are all older than the last fix empties by itself; the ticket needs a date, not a lever',
  'REM-A5-FALSE-STOPS-1: false_stops_7d dated as time-gated',
  'false_stop_hits 2026-10-20T11:00:26Z (ids 21 and 22) and 2026-10-22T05:00:26Z (id 35), all source ops_ai_log pattern conditional-offer; none since',
  'applied by migration', 'a note on ticket 99940', 'the Rollback line restores the note',
  'ticket 99940 states when it clears', 'false_stops_7d <= 1 within 48 h; 0 at 2026-10-29T05:00Z if no new hit lands', 'none',
  'd1:false_stop_hits'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-FALSE-STOPS-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'the 7-day Workers AI run rate still holds the 2026-10-19 to 10-21 burst; the present burn is lower, and the all-billing run rate has a floor that no fleet change moves',
  'REM-A5-COST-WINDOW-1: workers_ai_run_rate_usd and monthly_cost_run_rate_usd read as a rolling window plus a fixed floor',
  'ai_call_counters neurons by day: 10-19 5.45M, 10-20 4.22M, 10-21 2.13M, 10-22 0.67M, 10-23 0.71M, 10-24 1.06M, 10-25 1.13M, 10-26 0.98M by 18:00Z; v_cost_run_rate 7-day: workers_ai 660.09, owner_gateway 321.89, direct_providers_external 450, ai_gateway deepseek 29.86, plan 5, all-billing 1466.84; qnfo-research-exec is 65.7 percent of the neurons of the last 7 days; v_cost_forecast fleet bound 10.97 USD a day',
  'recorded, no change: caps, thresholds and the owner-stated figure are not touched', 'one decision row; no ticket, cap or threshold changes', 'none to revert',
  'the cost tickets state which part is a window and which part is fixed', 'workers_ai_run_rate_usd < 450 within 4 days; monthly_cost_run_rate_usd stays above 650 because 777 of it (direct providers, plan, owner clients) is outside fleet control', 'none',
  'd1:ai_call_counters, v_cost_run_rate, v_cost_forecast, fleet_budget, ops_config'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-COST-WINDOW-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'guard_rcs reads a real failing main run, so the fix is in the change that failed and the session that owns the file is told where; the guard is not touched',
  'REM-A5-GUARD-RCS-1: guard_rcs cause traced to deploy-gate run 40379913871 (PR 4764) and reported on the pull request',
  'gh api actions/runs/40379913871: failure at WORKERS-STANDARDS-GUARD-1, qnfo-ops/worker.js:501 [write-200-only]; five later main runs of deploy-gate succeed because the guard compares with HEAD~1; the line is still in the file at origin/main; qnfo-ops/worker.js is claimed by rem-a6',
  'comment on PR 4764 and a note on ticket 2670; no file edit', 'one pull request comment and one issue note', 'the Rollback line restores the note; the comment is information and stays',
  'the flapping ticket names its cause', 'guard_rcs <= 0 within 6 h', 'none',
  'github:actions runs of deploy-gate, mirror-guard, version-bump-guard, workflow-lint, dup-worker-name-gate; qnfo-ops/worker.js'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-GUARD-RCS-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'a 4 to 6 day old set of failed answers is the window, not a live defect, once the fix is live',
  'REM-A5-OPS-EMPTY-1: ops_agent_empty_answers_7d dated as time-gated after qnfo-ops 2.58.3',
  'ops_ai_log agent-tools rows with ok 0: 2026-10-19T09:55, 10-21T14:08, 10-24T13:10, 13:51 and 14:14 (4 inside the 7-day window); worker_live_audit qnfo-ops 2.58.3-ops-empty-recover at 17:58Z; none since 10-24T14:14Z',
  'applied by migration', 'a note on ticket 100122', 'the Rollback line restores the note',
  'ticket 100122 states when it clears', 'ops_agent_empty_answers_7d < 1 within 6 days', 'none',
  'd1:ops_ai_log, worker_live_audit'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-OPS-EMPTY-1:%');

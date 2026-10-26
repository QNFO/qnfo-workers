-- REM-A7-Q08-1 (2026-10-26, charter pillar reach (cost), session rem-a7-f2, agent_issues 100439, 100453, 100455, 100607, 100064, 1000268). q08 and the reading surface: what the live data
-- say, what was changed, what stays open and why. Every number below was read from qnfo-audit or the q08-signal and personal-life D1 between 18:00Z and 18:45Z on 2026-10-26.
--   100453 (q08: evaluate the structural gate before the compose call) is closed as superseded by 100439. Its hypothesis is falsified: the "structural gate" (min refs, prior-work
--     section, table-or-code) does not exist in q08-signal-engine; structuralPreflight (merged as 0.34.3, PR 3916) had no call site, and 256 finished runs of the last 7 days that logged a source
--     size held none under 2208 characters, so a source preflight refuses nothing. It is removed in 0.37.2 (PR 4752, deployed, q08.org/health read 0.37.2-arxiv-pool at 18:34Z). What fails: of 249 gate
--     failures since 2026-10-20, 175 (70 percent) end at the accuracy checks (80 deterministic, 95 LLM fact-check) and 57 (23 percent) at the reader panel and final read.
--   100439 (q08 gate economics) stays open as the carrier of the outcome. Its DoD (pass rate >= 0.5, <= 6000 neurons a piece) was set on 2026-10-12 when the 7-day pass rate was 0.43, under the gates
--     the owner replaced on 2026-10-13 (q08_retraction_rate_30d reads 0.78, all of it from pieces published before 2026-10-14; none published since is retracted); at today's quality bar no lever
--     reaches the DoD, and nothing is edited to pass. The lever applied:
--     Q08-ARXIV-POOL-1 (since 2026-10-14 an arXiv run published 8 of 102 finished runs, a Hacker News run 5 of 362; arXiv had 22 percent of the runs because the scrape read the 30 newest submissions).
--     ops_config q08_arxiv_pool is written with its default (100) so the knob is visible; 30 restores the earlier pool.
--   100455 (cadence surfaces have no fleet_crons owner) is closed as superseded by 3003 (METRIC-TRIGGER-6050): owner, SLA and breach trigger exist in cadence_sla (SLA-120M-7); fleet_crons is the
--     fleet scheduler's own job table and holds no cf-native cron by design; the four stalls are gate-bound, so the second path it asks for (a manual re-fire) would add failing attempts.
--   100607 and 100064 (loop-filed stall tickets) stay open; the measured cause is recorded on their triage rows (the detectors rewrite the descriptions every hour).
--   1000268 (researched forecasts): its placeholder probe is replaced by its own closing probe (engine-created open forecasts in 7 days); the engine-side build is not part of this file.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'open', close_channel = NULL WHERE id IN (100453, 100455) AND close_channel LIKE 'auto:triage-sync%'; UPDATE issue_triage SET rc = 'AUTOTRIAGE-2', triage_state = 'triaged', close_evidence = NULL WHERE issue_id IN (100453, 100455) AND rc LIKE 'rem-a7:superseded-by-%'; UPDATE remediation_contracts SET status = 'active', last_verdict = 'fail' WHERE class IN ('issue-100453', 'issue-100455') AND last_verdict LIKE 'superseded:%REM-A7-Q08-1%'; UPDATE remediation_contracts SET status = 'superseded' WHERE class = 'issue-1000268' AND instr(verify_probe, 'q08_forecasts') > 0; DELETE FROM ops_config WHERE key = 'q08_arxiv_pool' AND note LIKE 'Q08-ARXIV-POOL-1%'

-- 1. ops_config: the arXiv pool knob, written with its default so it is visible and documented. The worker reads it at most once a minute.
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('q08_arxiv_pool', '100',
  'Q08-ARXIV-POOL-1 (q08-signal-engine 0.37.2): how many of the newest arXiv submissions the scrape reads, an integer 30 to 200, absent or invalid = 100 (was a fixed 30). Revert: set the value to 30 (no deploy). Why: since 2026-10-14 an arXiv run published 8 of 102 finished runs (7.8 percent), a Hacker News run 5 of 362 (1.4 percent), and the 30 newest submissions are a few hours of papers, so papers had 22 percent of the runs.');

-- 2. 100439: the finding, appended once to the issue text; the triage row names the owner and the next action.
UPDATE agent_issues SET description = COALESCE(description, '') || char(10) || char(10) ||
  'FINDING 2026-10-26 (REM-A7-Q08-1, session rem-a7-f2; corrects the finding above). Where the neurons go: 7 days, 256 finished runs with a logged source size, 3 published; since 2026-10-20 of 249 gate failures 175 (70 percent) end at the accuracy checks (80 deterministic name, figure or year not in the source; 95 LLM fact-check unsupported claim, about 4 compose and 13 reviewer calls a run), 57 (23 percent) at the reader panel and final read, 10 forecast, 7 style. Rejected on the data: a floor on the first panel read (runs whose first read averaged 2.0 passed the second panel in 28 of 42, those at 2.5 in 36 of 68, those at 3.0 in 68 of 115, so the editor pass rescues them); a lower compose temperature (perf experiment 2 on q08-temperature was reverted 2026-10-26 09:01Z); publishing on a timer or lowering a bar (OUTPUT-QUALITY-LEDGER-1); fewer attempts (neurons per piece would not move). The structural gate of issue 100453 does not exist in this engine: structuralPreflight had no caller and is removed (0.37.2, PR 4752). Shipped: writer order by end-to-end yield (0.36.0); Q08-ARXIV-POOL-1 (0.37.2, live 18:34Z): since 2026-10-14 an arXiv run published 8 of 102 finished runs and a Hacker News run 5 of 362, and papers had 22 percent of the runs because the scrape read the 30 newest submissions, a few hours of them; the pool is now ops_config q08_arxiv_pool (default 100); Q08-DOTTED-NAMES-1 (0.37.3, PR 4763): the grounding check refused names with a dot that stand in the source (reproduced on engine_runs 930, whose story title names Qwen3.8-27B; run 1001 at 18:30Z was refused for Qwen3.8, whether it stood in that source was not re-read). Prediction, read on engine_runs by source prefix: arXiv share of finished runs from 22 percent to 40 percent or more within 3 days, q08_gate_pass_rate_7d from 0.012 to 0.03-0.05 and q08_neurons_per_published_piece_7d from about 178,000 to 80,000-110,000 within 7 days; replace the lever if it has not moved them by 2026-11-02. DoD status: pass rate >= 0.5 and 6,000 neurons a piece were set on 2026-10-12 against a pass rate of 0.43 under the gates the owner replaced on 2026-10-13 (q08_retraction_rate_30d reads 0.78, all of it from pieces published before 2026-10-14; none published since is retracted); no lever on this list reaches them at the present bar, so this issue stays open as the carrier of the outcome (the same metrics are carried by 99929, 99930, 100518 and 3003) and no target is edited to pass. Supersedes 100453.',
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 100439 AND status = 'open' AND instr(COALESCE(description, ''), 'REM-A7-Q08-1') = 0;

UPDATE issue_triage SET owner = 'q08-signal-engine',
  remediation = 'REM-A7-Q08-1 (rem-a7-f2, 2026-10-26): owner q08-signal-engine. Outcome-bound. Applied: ops_config q08_arxiv_pool 30 -> 100 (q08-signal-engine 0.37.2, PR 4752) and the dotted-name grounding fix (0.37.3, PR 4763). Next action: read engine_runs by source prefix on 2026-10-29 (arXiv share of finished runs, expected 40 percent or more) and q08_gate_pass_rate_7d and q08_neurons_per_published_piece_7d on 2026-11-02; a lever that has not moved them by then is replaced. Not on the list: lowering a bar, publishing on a timer, raising a cap.'
WHERE issue_id = 100439 AND instr(COALESCE(remediation, ''), 'REM-A7-Q08-1') = 0;

-- 3. 100453: closed as superseded by 100439. The contract is superseded first (issue_close_evidence_required refuses a close while an active contract fails); the evidence starts with
-- the word "superseded", which the live triage triggers read.
UPDATE remediation_contracts SET status = 'superseded',
  last_verdict = 'superseded:100439 (REM-A7-Q08-1: the structural-gate hypothesis was falsified and the two metrics of this issue are carried by 100439 and the metric-trigger issues 99929, 99930 and 100518)'
WHERE class = 'issue-100453' AND status IN ('active', 'holding')
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 100453 AND status = 'open')
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 100439 AND status = 'open');

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT 100453, 'rem-a7:superseded-by-100439', 'closed', 'q08-signal-engine', datetime('now'),
  'Superseded by 100439 (REM-A7-Q08-1). Read 2026-10-26: (1) the structural gate this issue names (min refs, prior-work section, table-or-code) does not exist in q08-signal-engine; structuralPreflight, merged as 0.34.3 (PR 3916), had no call site and the 256 finished runs of the last 7 days that logged a source size held none under 2208 characters, so a source preflight would have refused none; it is removed in 0.37.2 (PR 4752, live: q08.org/health version 0.37.2-arxiv-pool). (2) What fails is the accuracy checks (175 of 249 gate failures since 2026-10-20) and the reader panel and final read (57), see 100439. (3) The metrics of its definition of done are q08_gate_pass_rate_7d = ' || COALESCE((SELECT last_value FROM metric_registry WHERE metric = 'q08_gate_pass_rate_7d'), 'unmeasured') || ' and q08_neurons_per_published_piece_7d = ' || COALESCE((SELECT last_value FROM metric_registry WHERE metric = 'q08_neurons_per_published_piece_7d'), 'unmeasured') || ' (target 25000 here, 6000 in the registry); they stay open and measured in 100439, 99929, 99930 and 100518. Closed because the hypothesis and its only code lever are resolved, not because the definition of done is met.'
WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = 100453 AND status = 'open')
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 100439 AND status = 'open')
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

-- 4. 100455: closed as superseded by 3003 only while the ownership facts it asked for hold at apply time (four cadence_sla rows with a producer and an SLA of 120 minutes or less, the breach
-- trigger enabled, 3003 open); otherwise nothing changes.
UPDATE remediation_contracts SET status = 'superseded',
  last_verdict = 'superseded:3003 (REM-A7-Q08-1: owner, SLA and breach trigger exist in cadence_sla and trigger 6050; the outcome is carried by 3003 and the stall tickets)'
WHERE class = 'issue-100455' AND status IN ('active', 'holding')
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 100455 AND status = 'open')
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 3003 AND status = 'open')
  AND (SELECT COUNT(*) FROM cadence_sla WHERE surface IN ('q08.org', 'continuity-snapshot', 'papers.qnfo.org', 'reading.q08.org') AND trim(COALESCE(producer, '')) <> '' AND sla_min BETWEEN 10 AND 120) = 4
  AND COALESCE((SELECT enabled FROM analytics_metric_triggers WHERE metric_key = 'cadence_overdue_over_120m'), 0) = 1;

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT 100455, 'rem-a7:superseded-by-3003', 'closed', 'qnfo-fleet-control', datetime('now'),
  'Superseded by 3003 (METRIC-TRIGGER-6050 cadence_overdue_over_120m, REM-A7-Q08-1). The defect in the title no longer holds, read 2026-10-26. Owner and SLA: cadence_sla holds ' ||
  (SELECT COUNT(*) FROM cadence_sla WHERE surface IN ('q08.org', 'continuity-snapshot', 'papers.qnfo.org', 'reading.q08.org') AND trim(COALESCE(producer, '')) <> '' AND sla_min BETWEEN 10 AND 120) ||
  ' of 4 rows for q08.org, continuity-snapshot, papers.qnfo.org and reading.q08.org, each with a producer and an sla_min of 120 or less (SLA-120M-7); worker_schedules holds ' ||
  COALESCE((SELECT COUNT(*) FROM worker_schedules WHERE name IN ('q08-signal-engine', 'personal-companion', 'qnfo-research-exec')), 0) ||
  ' of the 3 cf-native cron owners with their cron expressions and exec_engine; fleet_crons is the fleet scheduler''s own job table and holds no cf-native cron by design. Watchdog: trigger 6050 enabled=' ||
  COALESCE((SELECT enabled FROM analytics_metric_triggers WHERE metric_key = 'cadence_overdue_over_120m'), 'none') || ' files an issue per breach every 2 hours and names each producer''s lever (3003 is open); the stall detectors of q08 (100607) and of the companion (100064) file their own; continuity-snapshot no longer reads overdue (CADENCE-SLA-CONTINUITY-1). The second path (a manual re-fire when the cron path is silent) is not built: the four stalls are gate-bound and the producers are firing (q08-signal-engine ran 34 times and the companion 33 failed runs on 2026-10-26), so a re-fire adds attempts that fail the same gates; silent-cron detection exists (cronDrift, workerCensus FIRING-NO-OUTPUT, scheduled-no-run). The outcome is still open and measured: cadence_overdue_over_120m = ' ||
  COALESCE((SELECT last_value FROM metric_registry WHERE metric = 'cadence_overdue_over_120m'), 'unmeasured') || ', over SLA now: ' ||
  COALESCE((SELECT group_concat(surface || ' ' || overdue_min || ' min', ', ') FROM v_cadence_overdue WHERE over_sla = 1), 'none') || '; it is carried by 3003, 100439, 100607, 100064 and the research queue. Closed because its premise (no owner, no watchdog) is false, not because the surfaces publish on time.'
WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = 100455 AND status = 'open')
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 3003 AND status = 'open')
  AND (SELECT COUNT(*) FROM cadence_sla WHERE surface IN ('q08.org', 'continuity-snapshot', 'papers.qnfo.org', 'reading.q08.org') AND trim(COALESCE(producer, '')) <> '' AND sla_min BETWEEN 10 AND 120) = 4
  AND COALESCE((SELECT enabled FROM analytics_metric_triggers WHERE metric_key = 'cadence_overdue_over_120m'), 0) = 1
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

-- 5. 100607 and 100064: the loop rewrites their descriptions every hour, so the measured cause goes on the triage row, which it does not touch.
UPDATE issue_triage SET owner = 'q08-signal-engine',
  remediation = 'REM-A7-Q08-1 (rem-a7-f2, 2026-10-26): the stall is gate-bound, not silent: the engine ran 34 times on 2026-10-26 by 18:02Z (all gate_failed) and 7 days hold 252 gate_failed runs and 3 published. Stage split of the 249 failures since 2026-10-20: accuracy 175 (80 deterministic, 95 LLM fact-check), reader panel and final read 57, forecast 10, style 7. The reading of this issue as engine or model metadata leaking into drafts is wrong: run 930 had the story title "Five Qwen3.8-27B models match Fable 5 ..." and the grounding check refused every dotted name (Qwen3.8-27B, PLAN.md, Node.js) even with it in the ground (reproduced offline); run 1001 (18:30Z) was refused for a dotted name again, Qwen3.8 (whether it stood in that source was not re-read); fixed in q08-signal-engine 0.37.3 (PR 4763, Q08-DOTTED-NAMES-1). Also shipped: arXiv candidate pool (0.37.2, PR 4752). Recovery closes itself: stallDetector in q08-signal-engine/worker.js closes this issue with evidence when one of the last three finished runs published (the SIGNAL-SQL-ARITY-1 binding bug that blocked it is fixed). The outcome levers are tracked in 100439.'
WHERE issue_id = 100607 AND instr(COALESCE(remediation, ''), 'REM-A7-Q08-1') = 0;

UPDATE issue_triage SET owner = 'personal-companion',
  remediation = 'REM-A7-Q08-1 (rem-a7-f2, 2026-10-26): chronic gate-bound stall, measured in the personal-life D1. 7 days: 12 ok and 300 failed finished generation runs (3.8 percent publish; essay 7 ok and 152 failed, notes 4 ok and 113 failed, serial 1 ok and 35 failed), 32 to 49 failed runs a day, each 413 to 523 s. Rejected attempts a day 69 to 141: fact-check 17 to 120, validation 21 to 38 (over-length notes: 42 length-only attempts of 3202 to 3760 words against the 3200 ceiling in 7 days), critique 0 to 17. Because two pieces never land without two failed runs between them at this yield, the detector recovery rule (two pieces since the filing with no two consecutive failed runs between them, COMPANION-STALL-YIELD-1) cannot fire: the issue stays open and is refreshed hourly by design, the stall is chronic and not a lost close. Levers shipped today and waiting for their effect: COMPANION-REVIEWER-HYGIENE-1 (1000298, PR 4447 and 4574), COMPANION-SERIAL-TITLE-1 (1000299), both closed. Estimated and small: a deterministic cut of over-length drafts would save about 10 attempts a day, +0.2 pieces a day at the roughly 2 percent of validated drafts that go on to publish. No code-loop doer exists: the planner refuses this issue''s code-task line (source personal-companion is not a trusted origin, PLAN_TRUSTED); the next doer is a session.'
WHERE issue_id = 100064 AND instr(COALESCE(remediation, ''), 'REM-A7-Q08-1') = 0;

-- 6. 1000268: the placeholder probe becomes the issue's own closing probe, read from the q08-signal D1 by the consumer (d1-query@q08-signal is a trusted data-plane read). An engine-created forecast is a
-- q08_forecasts row whose audit stage is publish; the three hand-researched forecasts carry stage claude-research and are not counted. It reads 0 of 3 today.
UPDATE remediation_contracts SET
  verify_transport = 'd1-query@q08-signal',
  verify_probe = 'SELECT ''>=3 engine-created open forecasts in 7 days, none retracted'' AS expected, CASE WHEN n >= 3 THEN ''>=3 engine-created open forecasts in 7 days, none retracted'' ELSE n || '' of 3 engine-created open forecasts in the last 7 days (audit stage publish, none retracted)'' END AS observed FROM (SELECT COUNT(*) AS n FROM q08_forecasts f WHERE f.status = ''open'' AND f.created_at >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-7 days'') AND EXISTS (SELECT 1 FROM q08_audits a WHERE a.slug = f.slug AND a.stage = ''publish'' AND a.verdict = ''pass'') AND NOT EXISTS (SELECT 1 FROM q08_retractions r WHERE r.slug = f.slug))',
  precondition = 'REM-A7-Q08-1: the issue''s own closing probe, replacing the closure-observing placeholder',
  action = 'the engine-side research ledger (research step, ledger as fact-check ground, re-audit from the stored ground, seeding from the 30-day archive) in q08-signal-engine/worker.js; the probe passes when the engine itself has published three open forecasts in a week',
  status = 'active', last_verdict = NULL, attempts = 0, next_due_at = datetime('now')
WHERE class = 'issue-1000268' AND status = 'superseded' AND instr(verify_probe, 'q08_forecasts') = 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 1000268 AND status = 'open');

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) || char(10) ||
  'REM-A7-Q08-1 (2026-10-26, session rem-a7-f2): the placeholder probe is replaced by this issue''s own closing probe (d1-query@q08-signal: engine-created open forecasts of the last 7 days, audit stage publish, none retracted; 0 today, the three live forecasts carry stage claude-research and are not counted by design). The engine side is not built in this pass. Why: the four follow-ups (a research step with 6 to 15 sources and a numbered ledger of verbatim sentences, the ledger as the fact-check ground with ground_json for the re-audit, seeding from the 30-day archive, a q08_forecast_claims table) change the ground every forecast is checked against, and the first slice needs the fetch scope decided (which domains may be read, how many bytes a source, which sentences count as verbatim); the existing EVIDENCE_SOURCES fetchers return titles and snippets, not sentences, so the ledger needs a new fetch-and-extract step with its own offline suite. Until the ledger exists the engine''s own forecast attempts only spend neurons: 28 of 28 finished forecast runs since 2026-10-14 ended gate_failed (the writer may state nothing the single source essay does not). Standing risk for the owner: the interim "q08 daily research desk" is a scheduled task run by a session, and NO-CLAUDE-RUNTIME-DEPENDENCY-1 (owner directive 2026-10-01) forbids a session as a recurring runner; it was set up on the owner direction of 2026-10-26, so it is reported here and not removed. The engine-side ledger is the fleet-side replacement and is what closes this issue.',
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 1000268 AND status = 'open' AND instr(COALESCE(description, ''), 'REM-A7-Q08-1') = 0;

UPDATE issue_triage SET owner = 'q08-signal-engine',
  remediation = 'REM-A7-Q08-1 (rem-a7-f2, 2026-10-26): owner q08-signal-engine. Closing probe is live (0 of 3). Next action: design note for the fetch scope of the research ledger (domains, bytes a source, verbatim sentence rule), then the ledger builder as a pure function with an offline suite, then the ground and re-audit wiring. The three hand-researched forecasts stay as the interim.'
WHERE issue_id = 1000268 AND instr(COALESCE(remediation, ''), 'REM-A7-Q08-1') = 0;

-- 7. The decision and the capability (decision_log and capability_ledger are append-only: INSERT only).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f2',
  'q08 output quality is a fixed constraint (OUTPUT-QUALITY-LEDGER-1), so cost per published piece can only move by raising the chance that an attempt passes the gates it already faces',
  'REM-A7-Q08-1: ops_config q08_arxiv_pool written at 100 (q08-signal-engine 0.37.2 reads the 100 newest arXiv submissions, was 30); structuralPreflight removed; 100453 superseded by 100439 and 100455 by 3003; 1000268 given its own closing probe; the grounding false positives on dotted names fixed in 0.37.3 (PR 4763)',
  'q08-signal D1 engine_runs from 2026-10-14: arXiv 8 published of 102 finished runs (7.8 percent), Hacker News 5 of 362 (1.4 percent), forecast 0 of 28; 249 gate failures since 2026-10-20: accuracy 175, reader panel and final read 57; first panel read floor falsified (second panel passes 28 of 42, 36 of 68, 68 of 115 at first-read means 2.0, 2.5, 3.0); structuralPreflight has no caller; live arXiv API at 17:50Z: 30 newest submissions all dated 2026-10-23, arxiv.org/html present for 11 of 12 top candidates; PR 4752 merged 18:31Z, q08.org/health 0.37.2-arxiv-pool 18:34Z',
  'pending: arXiv share of finished runs read on 2026-10-29, the metrics on 2026-11-02',
  'q08 candidate mix (more papers, within the existing source alternation); no gate, cap or model order changes',
  'ops_config q08_arxiv_pool = 30 (no deploy); revert the 0.37.3 commit for the grounding change; the Rollback header of migrations/2026-10-26-rem-a7-q08.sql reopens 100453 and 100455',
  'a reversible, measured source-mix lever for q08 (ops_config q08_arxiv_pool) and a closing probe for forecast research that reads the q08-signal D1',
  'arXiv share of finished runs 22 percent -> 40 percent or more within 3 days; q08_gate_pass_rate_7d 0.012 -> 0.03-0.05 and q08_neurons_per_published_piece_7d about 178000 -> 80000-110000 within 7 days',
  'q08.org: more published pieces a week at the same neuron budget',
  'q08-signal D1 engine_runs, q08_reader_tests, q08_forecasts, q08_audits (SELECT only); qnfo-audit metric_registry, cadence_sla, v_cadence_overdue, worker_schedules, fleet_crons; personal-life companion_runs (SELECT only); offline node:sqlite suite migrations/rem-a7-q08.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REM-A7-Q08-1:') = 1);

INSERT INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
SELECT 'q08 arXiv candidate pool switch (ops_config q08_arxiv_pool)',
  'q08-signal-engine 0.37.2 (PR 4752), session rem-a7-f2, REM-A7-Q08-1',
  'ops_config row q08_arxiv_pool (30 to 200, absent = 100); the worker reads it at most once a minute and falls back to 100 when it cannot read',
  'offline suite q08-signal-engine/arxiv-pool.test.mjs (24 checks); live read pending',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'q08.org/health version 0.37.2-arxiv-pool at 2026-10-26T18:34Z; arXiv yield 7.8 percent against 1.4 percent for Hacker News since 2026-10-14'
WHERE NOT EXISTS (SELECT 1 FROM capability_ledger WHERE capability = 'q08 arXiv candidate pool switch (ops_config q08_arxiv_pool)');

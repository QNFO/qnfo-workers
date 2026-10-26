-- REM-A7-Q08-3 (2026-10-26, charter pillar reach, session rem-a7-f2, agent_issues 100439, 100607, 100453, 1000268). The follow-ups of REM-A7-Q08-1 and -2 that were written down and are now implemented:
--   (1) the four q08 failure modes found in this pass get their failure_modes row and an fm- detector contract (CLAUDE.md: every failure mode gets a row and a detector in the change that fixes it);
--   (2) the engine-side research ledger of 1000268, which the first note left without a doer, becomes an issue with a code-task line, a default approved design decision and a default-off switch.
-- The daily neuron budget was cut from 150000 to 50000 at 19:51Z by COST-LEVER-Q08-1 (rem-a4, migration 733); the 20:00Z run was deferred by the pace (spent 140318 of 50000). Nothing here touches a cap.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rolled back (REM-A7-Q08-3)' WHERE class IN ('fm-q08-ground-blind-gate-ban', 'fm-q08-arxiv-lane-blocked-by-thin', 'fm-q08-dotted-name-refused', 'fm-q08-uncalled-preflight')
-- (the failure_modes rows and the decision_log row stay: history. The new issue Q08-FORECAST-LEDGER-1 stays too: if the plan changes, close it through issue_triage with its evidence.)

-- 1. The failure modes found in this pass, with their detectors. The two code-read detectors fail if the fix is reverted; the d1 detector reads 0 until a run ends at a removed check again.
INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'q08-ground-blind-gate-ban',
  'the q08 writer gate refuses a comma-grouped dollar amount or a "score of 0.85" that the source states, and spends all six composes on it',
  'gate() banned both patterns without reading the source; the grounding check that refuses a figure the source does not hold was added later (Q08-VERIFY-1) and runs before any panel call and on the final text, so the bans only rejected faithful drafts (runs 958, 993, 821, 834, 940, 785)',
  'Q08-GATE-GROUND-BLIND-1 (q08-signal-engine 0.37.4, PR 4835): the two checks removed, the grounding check decides',
  'engine_runs ending at "large currency amount" or "invented decimal metric" since 2026-10-26 19:20Z (the detector d1-query@q08-signal below, expected 0)',
  'fm-q08-ground-blind-gate-ban', '2026-10-26', 100607,
  'a story whose source states a dollar amount of 1,000 or more, or a paper that reports a result as a score, ratio or rating with a decimal',
  'a run ends gate_failed at the writer gate with 6 compose calls and no panel call',
  'q08 yield on the stories with figures and on the arXiv lane; no other worker'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'q08-ground-blind-gate-ban');

INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'q08-arxiv-lane-blocked-by-thin',
  'one arXiv paper without an HTML rendering holds the whole q08 arXiv lane for a day',
  'generate() marked measured-thin candidates only when no candidate qualified, so a thin candidate passed over for a richer one was measured again every tick; only the first unprocessed paper of the lane is ever tried (the stories come before the rest of it in the order); on 2026-10-26 the lane ran at 02:02 and 03:04 and then not for 16 hours with 9 renderable papers behind 2610.32638 (arxiv.org/html answers 404)',
  'Q08-THIN-PASSED-OVER-1 (q08-signal-engine 0.37.5, PR 4848): a passed-over thin candidate is marked for the 24-hour retry',
  'code-read: q08-signal-engine/worker.js carries the call that marks the passed-over candidates',
  'fm-q08-arxiv-lane-blocked-by-thin', '2026-10-26', 100439,
  'the first unprocessed paper of the pool has no HTML rendering, or its article fetch fails',
  'the arXiv share of finished runs stays near 20 percent while unprocessed renderable papers sit in the pool',
  'q08 yield (an arXiv run publishes 7.8 percent of the time against 1.4 percent for a story); no other worker'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'q08-arxiv-lane-blocked-by-thin');

INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'q08-dotted-name-refused',
  'the q08 grounding check refuses a name with a dot (Qwen3.8-27B, PLAN.md, Node.js) even when the source states it',
  'the name check turns every character outside a-z0-9 into a space and looks the pieces up, while the ground word set kept a dotted token whole and split it only at a hyphen',
  'Q08-DOTTED-NAMES-1 (q08-signal-engine 0.37.3, PR 4763): a dotted token also grants its dot- and hyphen-separated parts; a closing apostrophe is stripped before the lookup',
  'code-read: q08-signal-engine/worker.js carries the Q08-DOTTED-NAMES-1 note and logic',
  'fm-q08-dotted-name-refused', '2026-10-26', 100607,
  'a source or its title names a tool, file or version with a dot',
  'a run ends at the grounding pre-check with "name not in the source" for a name that stands in the source (engine_runs 930, 1001)',
  'about 5 percent of the accuracy failures of q08; no other worker'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'q08-dotted-name-refused');

INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'q08-uncalled-preflight',
  'a code task is merged and counted as the issue''s lever although the function it added has no caller, and the issue''s definition of done (a preflight that runs before any model call) was never exercised',
  'the merge runner and the version canary prove that the new VERSION arrived, not that the new code is reachable; structuralPreflight (0.34.3, PR 3916) described a gate the engine does not have and was never called',
  'the function is removed in q08-signal-engine 0.37.2 (PR 4752); 100453 is closed as superseded with the measurement that the real pre-compose source checks are MIN_GROUND_CHARS, THIN_MIN_ARTICLE and learnedSourceFloor',
  'code-read: structuralPreflight is absent from q08-signal-engine/worker.js (a general check for functions with no caller is not built)',
  'fm-q08-uncalled-preflight', '2026-10-26', 100453,
  'a code task adds a function and its offline suite does not call it through the entry point it is meant to guard',
  'an issue reads as done on its merged PR while its metric does not move',
  'the issue record only; no runtime effect'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'q08-uncalled-preflight');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at) VALUES
 ('fm-q08-ground-blind-gate-ban', NULL, 'REM-A7-Q08-3: q08-signal-engine 0.37.4 or later is deployed (2026-10-26 19:19Z)', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM engine_runs WHERE status = ''gate_failed'' AND ran_at >= ''2026-10-26 19:20:00'' AND (instr(error, ''large currency amount'') > 0 OR instr(error, ''invented decimal metric'') > 0)) AS TEXT) AS observed',
  'd1-query@q08-signal', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now')),
 ('fm-q08-arxiv-lane-blocked-by-thin', NULL, 'REM-A7-Q08-3: q08-signal-engine 0.37.5 or later is deployed (2026-10-26 19:29Z)', 'failure-mode detector',
  '{"paths": ["q08-signal-engine/worker.js"], "contains": "var passedOver = thinPassedOver(evaluated, story)"}',
  'code-read', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now')),
 ('fm-q08-dotted-name-refused', NULL, 'REM-A7-Q08-3: q08-signal-engine 0.37.3 or later is deployed (2026-10-26 18:40Z)', 'failure-mode detector',
  '{"paths": ["q08-signal-engine/worker.js"], "contains": "Q08-DOTTED-NAMES-1 (0.37.3"}',
  'code-read', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now')),
 ('fm-q08-uncalled-preflight', NULL, 'REM-A7-Q08-3: q08-signal-engine 0.37.2 or later is deployed (2026-10-26 18:31Z)', 'failure-mode detector',
  '{"paths": ["q08-signal-engine/worker.js"], "absent": "function structuralPreflight("}',
  'code-read', 3, 'q08-signal-engine', 1, 'active', 'failure-mode', datetime('now'));

-- 2. The engine-side research ledger of 1000268, as an issue with a doer: a code-task line for the code loop, a design decision taken by default (reversible, behind a default-off switch), a bounded first slice.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'Q08-FORECAST-LEDGER-1: forecast ground = the source essay + a research ledger of verbatim sentences (slice 1, default off)',
  'Charter pillar: reach. Parent: 1000268 (owner direction 2026-10-22: forecasts researched to the quality of papers.qnfo.org/papers/computing-machines). REM-A7-Q08-3 (session rem-a7-f2) takes the design decision by default (DECISION-AUTOPROCEED-1; reversible, behind a switch that is off): ' || char(10) ||
  'FETCH SCOPE: the four existing EVIDENCE_SOURCES (Hacker News Algolia, GDELT doc API, Wikipedia search API, arXiv API), queried with at most 6 capitalised names taken from the source essay and its signal, plus the https public pages those results link (publicHttpsUrl; no private or local host), at most 10 documents, at most 40000 characters read of each, 15 s timeout each, all fetches failing independently. LEDGER: verbatim sentences of 25 to 280 characters copied from the fetched text, at most 60 lines, each "[R<n>] <sentence> (<host>, <date>)", numbered in order; no model writes or rewords a ledger line. ' || char(10) ||
  'SLICE 1 (this issue): in q08-signal-engine/worker.js add researchLedger(env, src, signalText) returning {lines, sources}; in generateForecast, when ops_config q08_forecast_ledger = on (absent or anything else = off), append the ledger text to fcGround and to the forecast prompt, with the FACTS rule extended so that a fact may also come from a ledger line, cited by its tag; strip the tags before any check like the S tags (stripLedgerTags); store the ledger in a new nullable column q08_forecasts.ground_json (the ensure-column pattern of RUN_COLUMNS) and make groundForPublished read it for the re-audit of a forecast; add the sources to sources_json. An offline suite with stubbed fetches. ' || char(10) ||
  'DEFINITION OF DONE: with the switch off the existing forecast suites pass unchanged and no request is made; with it on, in the offline suite, a forecast draft stating a ledger fact passes the grounding check and one stating a fact in neither the essay nor the ledger is refused; the re-audit of the stored forecast reads the same ledger. SLICE 2 (later, not this issue): turn the switch on after a dry run, q08_forecast_claims. Closes 1000268 only when engine-created forecasts reach its own probe (3 open in 7 days, none retracted).' || char(10) ||
  'code-task: repo=qnfo-workers path=q08-signal-engine/worker.js' || char(10) ||
  'code-anchor: var fcGround = [src.title || "", src.body_md || "", signalText].join("\n");' || char(10) ||
  'code-probe: {"paths": ["q08-signal-engine/worker.js"], "contains": "function researchLedger("}',
  'session', 'reach', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'Q08-FORECAST-LEDGER-1: forecast ground = the source essay + a research ledger of verbatim sentences (slice 1, default off)' AND status = 'open');

UPDATE issue_triage SET remediation = COALESCE(remediation, '') || ' REM-A7-Q08-3: the engine-side build now has a doer: Q08-FORECAST-LEDGER-1 (slice 1, code-task line for qnfo-code-orchestrator, fetch scope decided by default, switch default off).'
WHERE issue_id = 1000268 AND instr(COALESCE(remediation, ''), 'REM-A7-Q08-3') = 0;

-- 3. The decision.
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f2',
  'a defect found in a pass is recorded with a detector, and a follow-up that was written down is given a doer in the same pass',
  'REM-A7-Q08-3: four failure_modes rows with fm- detector contracts for the q08 defects of this pass (ground-blind gate bans, arXiv lane blocked by a thin paper, dotted names refused, an uncalled preflight); the engine-side research ledger of 1000268 filed as Q08-FORECAST-LEDGER-1 with a code-task line and a default approved design (fetch scope, ledger rule, switch off by default)',
  'q08-signal-engine 0.37.2 to 0.37.5 merged and live (PR 4752, 4763, 4835, 4848; canonical-deploy runs 40378457010, 40379680066, 40385286121, 40387136162); migration_runs 678 and 716 ok; the 20:00Z engine run deferred by the pace after the budget cut to 50000 at 19:51Z; anchor var fcGround = [...] occurs once in q08-signal-engine/worker.js',
  'pending: the detectors run hourly; Q08-FORECAST-LEDGER-1 is planned by the code loop',
  'the issue and failure-mode records and four hourly detector reads; no runtime change',
  'the Rollback header supersedes the four contracts; the new issue is closed through issue_triage with its evidence if the plan changes; the failure_modes rows and this row stay',
  'every q08 defect of this pass has a recurrence detector; the forecast research build has a doer',
  'a reverted fix or a returning refusal is seen within the hour; engine-created researched forecasts begin when slice 1 and its switch land',
  'q08.org forecasts', 'offline node:sqlite suite migrations/rem-a7-q08-3.test.mjs (the d1 detector is run against a q08-signal fixture)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REM-A7-Q08-3:') = 1);

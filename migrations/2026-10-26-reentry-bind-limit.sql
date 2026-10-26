-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-reentry-in-list-over-bind-limit', 'fm-producer-backpressure-counts-cooling-rows'); DELETE FROM failure_modes WHERE fm_key IN ('reentry-in-list-over-bind-limit', 'producer-backpressure-counts-cooling-rows');
--
-- REENTRY-BIND-LIMIT-1 (2026-10-26, charter pillar autonomy, agent_issues 1000244 CHAOS-DRILL-FAILED-1 control idea-triaged-hold-owner-and-reentry).
-- Companion to idea-hub 1.14.3 (idea-hub/worker.js, idea-hub/reentry-drain.test.mjs, idea-hub/proposal-headroom.test.mjs) in the same pull request.
-- decision_log is append-only, so the Rollback line above leaves the decision row. No DELETE or DROP runs in this file, so it names no BACKUP table.
--
-- WHAT WAS WRONG (read 2026-10-26 from live qnfo-audit and living-paper, read-only)
--   idea-hub runReentry bound the 5 owner identifier types plus up to 200 owner-pipeline DOIs as one IN (?,?,...) list in a single query on living-paper.
--   D1 allows 100 bound parameters per query. A SELECT with 105 placeholders on the living-paper D1 answered "too many SQL variables at offset 248:
--   SQLITE_ERROR", and the same SELECT with the list as one JSON parameter, IN (SELECT value FROM json_each(?)), answered. The owner pipeline reached 99
--   DOIs at the 2026-10-19 00:25Z cycle and 201 on 2026-10-26, so the query threw on every hourly cycle from then on, ideationCycle caught the throw into
--   r.reentry (a value scheduled() discards), and neither emission nor the two drain legs ran: signals with source artifact_reentry stand at consumed 361
--   (last ts 2026-10-18T22:24Z), expired 372 and new 17, all new rows weight 0 with ts frozen at 2026-10-18T23:23:44Z. Nothing recorded the failure, so only
--   the 6-hourly chaos drill saw it ("no re-entry signal was consumed in 7 days"), as agent_issues 1000244.
--   A second cause stood behind the first. runConsume and every batch producer pause when the rows of idea_proposals in status new or deferred_budget
--   exceed PROPOSAL_BACKPRESSURE (30), and the room is PROPOSAL_FILL_TO (25) minus that count. On 2026-10-26 33 rows were new, 24 of them carrying the
--   "[scoring-error" marker IDEA-SCORING-POISON-1 writes into rationale when no model can score a row (5 of them past their third failure, so tried
--   once a day), so the count read 33 with 9 rows really waiting for triage. Restarting emission alone would have emitted signals that runConsume could
--   not consume, and the 7-day TTL would have expired them. Found by the independent review of the first idea-hub commit (dfdd6e9b).
--
-- WHAT THIS CHANGES (the worker change is idea-hub 1.14.2 and 1.14.3, not this file)
--   1. Failure mode reentry-in-list-over-bind-limit and its code-read detector fm-reentry-in-list-over-bind-limit: idea-hub/worker.js on main must not
--      contain the removed bind form. The consumer reads it from its checkout of main each hour.
--   2. Failure mode producer-backpressure-counts-cooling-rows and its detector fm-producer-backpressure-counts-cooling-rows: idea-hub/worker.js on main
--      must keep the exclusion clause in PROPOSAL_PENDING_WHERE that the five producer counts share.
--   3. One decision_log row.
--   The live signal of the re-entry leg is the cloud_ops_events row id idea-reentry that idea-hub 1.14.3 writes each cycle (status error when the leg
--   threw or its emission block failed). No contract reads it here because the row does not exist until the release is deployed, and a contract born
--   before its data would read as a failure.
--
-- Limits that stay: the chaos drill of issue 1000244 closes only on a consumed re-entry signal, which also depends on triage draining the real queue,
-- so this file does not close the issue. A probe that reads a code marker proves the code on main, not the behaviour, and the idea-reentry row is the
-- behaviour. spof-review: no new loop, cap, hold or gate, no new worker, no new binding.

-- 1. The bind-limit failure mode and its detector (a code-read contract: the removed form must stay absent).
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('reentry-in-list-over-bind-limit',
  'a query builds one bound placeholder per element of a set that grows with the data, runs on D1, which refuses more than 100 bound parameters per query, and the caller swallows the error so a whole leg of a loop stops without a trace',
  'idea-hub runReentry bound the 5 owner identifier types plus up to 200 owner-pipeline DOIs as IN (?,?,...) in one query on living-paper. The owner pipeline reached 99 DOIs at the 2026-10-19 00:25Z cycle, so the query threw "too many SQL variables" on every hourly cycle after it. ideationCycle caught the throw into r.reentry, which scheduled() discards, so emission and both drain legs never ran and nothing persisted the result: only the chaos drill (control idea-triaged-hold-owner-and-reentry) saw it, as agent_issues 1000244',
  'REENTRY-BIND-LIMIT-1 (idea-hub 1.14.2): the DOIs bind as one JSON array read by IN (SELECT value FROM json_each(?)), so the query binds 6 parameters at any DOI count, and the emission block is guarded so a failure there no longer stops the drain legs. REENTRY-EVENT-1 (idea-hub 1.14.3): the leg result is written each cycle to cloud_ops_events id idea-reentry (status error when the leg threw or its emission block failed) and a cut DOI list or a capped scan is reported in owner_dois_capped and scan_capped. idea-hub/reentry-drain.test.mjs replays 250 owner DOIs against a D1 shim that refuses more than 100 bound parameters',
  'the code-read contract fm-reentry-in-list-over-bind-limit reads idea-hub/worker.js on main for the removed bind form, which must stay absent (the consumer reads it from its checkout of main), and the cloud_ops_events row idea-reentry carries the live status of the leg',
  'fm-reentry-in-list-over-bind-limit', '2026-10-19', 1000244,
  'a statement binds one placeholder per element of a list that is derived from a table and grows (IN (?,?,...) built with map, or bind(...rows)) and runs on D1, whose limit is 100 bound parameters per query',
  'D1 answers "too many SQL variables", the caller turns it into a result object nobody reads, the leg does nothing on every cycle and the numbers downstream stop moving (here the artifact_reentry signals emitted, expired and consumed all stood still from 2026-10-18T23:24Z)',
  'idea-hub re-entry: no new artifact_reentry signal, no drain of the 17 weight-0 rows and no re-entry proposal since the 2026-10-19 00:25Z cycle, so the alternate path of the control idea-triaged-hold-owner-and-reentry showed no evidence (agent_issues 1000244). The other IN lists in idea-hub are bounded (the weight-0 batch reads at most 50 references, the owner types are 5)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-reentry-in-list-over-bind-limit', NULL, 'REENTRY-BIND-LIMIT-1', 'failure-mode detector',
  '{"paths":["idea-hub/worker.js"],"absent":"bind(...REENTRY_OWNER_TYPES, ...ownDois)"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- 2. The backpressure failure mode and its detector (a code-read contract: the shared clause keeps its exclusion).
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('producer-backpressure-counts-cooling-rows',
  'a backpressure count includes rows that wait for something other than the capacity it protects, so the producers and the re-entry consumer stay paused while the real queue is short',
  'runConsume, proposalRoom, runOwnerCorpus, thinkLoop and runAskGap each counted the idea_proposals in status new or deferred_budget against PROPOSAL_BACKPRESSURE (30) and PROPOSAL_FILL_TO (25). A row that IDEA-SCORING-POISON-1 could not score keeps status new with a "[scoring-error" marker in rationale for as long as no model can read it. On 2026-10-26 24 of the 33 new rows carried the marker (5 of them past their third failure, tried once a day), so the count read 33 against a limit of 30 with 9 rows really waiting for triage, and runConsume paused on every cycle',
  'PROPOSAL-COOLING-1 (idea-hub 1.14.3): the five counts share one clause, PROPOSAL_PENDING_WHERE, which leaves out the rows whose rationale carries the scoring-error marker. Triage still selects and scores those rows on its own schedule, and a row counts again once a score replaces the marker. idea-hub/proposal-headroom.test.mjs replays 24 marked and 9 unmarked rows through each of the five producers and through runConsume, and shows 31 unmarked rows still pause them',
  'the code-read contract fm-producer-backpressure-counts-cooling-rows reads idea-hub/worker.js on main for the exclusion clause, and idea-hub/proposal-headroom.test.mjs in CI',
  'fm-producer-backpressure-counts-cooling-rows', '2026-10-26', 1000244,
  'a queue limit counts every row in a status, although some of those rows are parked on a dependency that the limit does not protect, so they never leave the count',
  'the pause flag of the producers and of runConsume stays set although triage has capacity, and the signals, ask gaps and notebook notes that wait for room are consumed late or expire on their time limit',
  'idea-hub: runConsume (re-entry questions into proposals), the notebook feeder, the think loop and the ask-gap feeder were paused or short of room on every cycle while 24 marked rows sat in status new. Their rows stay where they are, nothing is dropped');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-producer-backpressure-counts-cooling-rows', NULL, 'REENTRY-BIND-LIMIT-1', 'failure-mode detector',
  '{"paths":["idea-hub/worker.js"],"contains":"COALESCE(rationale, '''') NOT LIKE ''%[scoring-error%''"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- 3. The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015kWmGuAq2fNuvzu4MrD7x3',
  'a leg that fails inside a cycle must leave a record outside Workers Logs, a producer count must not include rows that wait for a model instead of for capacity, and a regression to a per-row placeholder list must be caught from the code on main and not by the 6-hourly chaos drill',
  'REENTRY-BIND-LIMIT-1: idea-hub 1.14.2 binds the owner-pipeline DOIs of runReentry as one json_each parameter (6 bound parameters at any DOI count) and guards the emission block so the drain legs run, and idea-hub 1.14.3 excludes rows with a scoring-error marker from the five producer backpressure counts (PROPOSAL_PENDING_WHERE) and writes the re-entry leg result each cycle to cloud_ops_events id idea-reentry, with this file adding the failure modes reentry-in-list-over-bind-limit and producer-backpressure-counts-cooling-rows, their code-read detectors fm-reentry-in-list-over-bind-limit and fm-producer-backpressure-counts-cooling-rows, and this row',
  'read 2026-10-26: ownerPipelineDois returned 201 DOIs, a SELECT with 105 placeholders on the living-paper D1 failed with "too many SQL variables at offset 248" and the json_each(?) form answered, the artifact_reentry signals stood at consumed 361 (last 2026-10-18T22:24Z), expired 372 and new 17 (weight 0, ts 2026-10-18T23:23:44Z), and idea_proposals held 33 new rows of which 24 carried a scoring-error marker (5 past their third failure) against PROPOSAL_BACKPRESSURE 30, which the independent review of commit dfdd6e9b found to keep runConsume paused, and the suites migrations/reentry-bind-limit.test.mjs, idea-hub/reentry-drain.test.mjs and idea-hub/proposal-headroom.test.mjs with their mutation checks',
  'applied through the canonical path on merge: the migration runner applies this file and canonical-deploy deploys idea-hub 1.14.3',
  'two failure_modes rows, two code-read detector contracts and one decision row in qnfo-audit. Worker change in idea-hub only: the re-entry leg, five producer counts, and one cloud_ops_events row (id idea-reentry) replaced each cycle. No agent_issues or issue_triage change, no secret, no new binding, no other worker. The producers may fill the queue to 25 unmarked rows, as designed, so the proposal rate rises to the capacity of triage',
  'revert the idea-hub release through the canonical path, or run the migration Rollback header: it removes the two detector contracts and the two failure modes (decision_log is append-only and keeps this row)',
  'the result of the re-entry leg is a queryable cloud_ops_events row each cycle, and a return to a per-row placeholder list or to a backpressure count that includes marked rows is detected hourly from the code on main',
  'the idea-reentry event reads status ok at the first hourly cycle after the deploy, artifact_reentry signals are emitted again (20 a cycle until the owner papers without a signal are covered), runConsume is no longer paused by the marked rows, and the chaos drill of 1000244 closes only after a signal is consumed, which also needs triage to keep draining the real queue',
  'none',
  'a read-only SELECT on the living-paper D1 with 105 placeholders (refused) and with json_each(?) (answered), read-only counts on qnfo-audit, node:sqlite replays of idea-hub/reentry-drain.test.mjs (D1 shim that refuses more than 100 bound parameters) and idea-hub/proposal-headroom.test.mjs with their mutation checks, and the consumer functions parse_code_probe and run_code_probe on both detectors (migrations/reentry-bind-limit.test.mjs)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REENTRY-BIND-LIMIT-1:') = 1);

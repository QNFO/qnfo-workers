-- IDEAS-CAP-RATE-1 (2026-10-19, pillar research; agent_issues 100047; control_registry research-admission-cap; ANTIFRAGILE-1).
-- idea-hub 1.12.0 turns the research admission cap from a hold with no expiry into a rate. enqueueAccepted holds a generated ACCEPT as
-- triaged_hold ('[research admission cap n/120]') while research_queue holds 120 or more active or deferred rows; the 1.11.1 release
-- (IDEAS-CAP-GENERATED-RELEASE-1) re-queued held rows only as far as they fit under 120, and the queue never gets under 120.
-- MEASURED 2026-10-19 12:39Z (qnfo-audit, read-only): research_queue queued+researching+review+deferred 473 (deferred 260), 80 held cap
-- rows, oldest 2026-10-17T15:23:48Z (about 45 h), 76 older than 120 minutes, 38 older than 24 h, none older than 72 h, 42 new in the last 24 h
-- (about 1.75 an hour); the 12:31Z idea-triage-budget event read '0 released'. So room was never positive and the release was a no-op.
-- RE-MEASURED 2026-10-19 14:40Z before landing (read-only): research_queue 471 (queued 190, researching 24, deferred 257), 83 held cap rows, 80 older
-- than 120 minutes, none older than 72 h, oldest 2026-10-17T15:23:48Z, 42 new in 24 h; the 14:33Z idea-triage-budget event again read released_run 0
-- on idea-hub 1.11.3. The defect is unchanged and nothing on main touches capRelease. Row counts this file touches: control_registry 1 (the cap row,
-- evidence marker absent), failure_modes 0 present -> 1 inserted, remediation_contracts 'fm-ideas-cap-hold-no-expiry' 0 -> 1 inserted and 'issue-100047'
-- 1 updated (its probe still holds the 'pending: research_queue at the admission cap' text), decision_log 0 -> 1 inserted. No issue, card or contract
-- is closed, reopened or dismissed in bulk.
-- Cost: no Workers AI call is added. The rows the trickle admits are already ACCEPTed; admission puts a row in research_queue, where the research
-- executor's own throughput and research_ready_cap / deferral (RESEARCH-BACKPRESSURE-1, POOL-BOUND-1) meter what is researched.
-- Revert without a deploy: ops_config ideas_cap_trickle_per_run (idea-hub reads it each run; 0 = the old hold, 1 to 12 = the rate, no row = 3).
-- The fix, in the worker: at or over the cap, capRelease admits the CAP_TRICKLE_PER_RUN (3) oldest held rows per hourly run, logs each such run
-- to cloud_ops_events (kind idea-cap-trickle: queue size, admitted proposal ids, rows still held) and puts cap_trickled_run in the
-- idea-triage-budget event. Executor load is not raised by this: research_ready_cap (192) and deferral meter what the executor takes,
-- as they did for the 260 deferred rows. A run with room is unchanged.
-- Drain time, stated so the probe is not read as broken: 3 admitted against about 1.75 held an hour is a net 1.25 an hour, so the 80-row
-- backlog needs about 64 hours and the issue-100047 probe (a held row older than 120 minutes) reads non-zero until then; it never reads
-- 0 while the trickle is dead. The fm- detector below is the backstop on the same hold with a 72-hour bound (it reads 0 today).
-- This file records the rest of the change: the control_registry disposition (demote to a rate, review date, tested alternate), the failure
-- mode with its fm- detector, the replacement probe of issue 100047 (the generated contract probe returned 'pending' while the queue was at the cap,
-- so it could not pass while the defect existed), and the decision.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE status IN (''queued'',''researching'',''review'',''deferred'')) >= 120 THEN ''pending: research_queue at the admission cap, nothing to release yet'' ELSE CAST((SELECT COUNT(*) FROM idea_proposals WHERE decision = ''ACCEPT'' AND status = ''triaged_hold'' AND rationale LIKE ''[research admission cap %'' AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) AS TEXT) END AS observed' WHERE class = 'issue-100047'; DELETE FROM remediation_contracts WHERE class = 'fm-ideas-cap-hold-no-expiry'; DELETE FROM failure_modes WHERE fm_key = 'ideas-cap-hold-no-expiry'; UPDATE control_registry SET evidence = substr(evidence, 1, instr(evidence, ' | IDEAS-CAP-RATE-1') - 1), alternate_tested_at = NULL, location = substr(location, 1, instr(location, ' ; capRelease trickle') - 1), alternate_path = 'a generated accept over the cap waits in idea_proposals as triaged_hold with its rationale intact; an owner-authored idea (proposalKind direct) skips the cap and is queued on the same triage run', reviewed_at = '2026-10-19T04:56:02Z' WHERE control = 'research-admission-cap' AND instr(evidence, ' | IDEAS-CAP-RATE-1') > 0
-- Rollback scope: the registry and probe rows only; the behaviour is the worker change (revert idea-hub/worker.js to 1.11.3 through the canonical path, or set
-- ops_config ideas_cap_trickle_per_run to 0). decision_log is append-only (triggers decision_log_no_delete and decision_log_no_update abort), so the Rollback never touches it.
-- spof-review: none added. The trickle is one more step in the existing hourly idea-hub triage (no new cron, binding or table); the rows it admits
-- were already accepted by triage and only wait on the cap. The control it changes is the research-admission-cap row, disposition demote.

-- 1. The cap row: demoted to a rate, with a review date and the tested alternate.
UPDATE control_registry SET
  location = location || ' ; capRelease trickle CAP_TRICKLE_PER_RUN = 3 (IDEAS-CAP-RATE-1, idea-hub 1.12.0)',
  disposition = 'demote',
  disposition_state = 'applied',
  alternate_path = 'a generated accept over the cap waits in idea_proposals as triaged_hold with its rationale intact and is admitted by rate: at or over RESEARCH_ADMISSION_CAP the hourly triage queues the CAP_TRICKLE_PER_RUN (3) oldest held rows (room above the cap still releases up to TRIAGE_BATCH); every trickle run writes a cloud_ops_events row of kind idea-cap-trickle; an owner-authored idea (proposalKind direct) skips the cap and is queued on the same triage run; research_ready_cap and deferral meter executor load; ops_config ideas_cap_trickle_per_run (0 to 12) overrides the rate and 0 restores the old hold without a deploy',
  alternate_tested_at = '2026-10-19',
  evidence = evidence || ' | IDEAS-CAP-RATE-1 (idea-hub 1.12.0, agent_issues 100047), MEASURED 2026-10-19 12:39Z: research_queue active+deferred 473 of 120, 80 cap-held accepts, oldest about 45 h, 76 older than 120 minutes, about 1.75 new held an hour, so the 1.11.1 release (room under the cap only) released 0 and the hold had no expiry. Now a rate: 3 oldest per hourly run at or over the cap, net drain about 1.25 an hour (about 64 h for the current backlog). idea-hub/cap-trickle.test.mjs: 38 assertions, 29 fail on 1.11.3 and all pass on 1.12.0 (10 held rows over the cap release exactly 3 oldest per run; room path unchanged; each run logged). REVIEW BY 2026-10-26: keep the rate while idea-cap-trickle events show held_left falling and fm-ideas-cap-hold-no-expiry reads 0; if research_queue deferred grows faster than before, lower CAP_TRICKLE_PER_RUN; if held_left does not fall, raise it.',
  reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'research-admission-cap' AND instr(evidence, 'IDEAS-CAP-RATE-1') = 0;

-- 2. The failure mode: a cap that holds work with no expiry and no rate.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('ideas-cap-hold-no-expiry',
  'a generated ACCEPT held by the research admission cap waits with no expiry and no rate, so the ideas the fleet scored highest are never researched',
  'enqueueAccepted parks an accept over RESEARCH_ADMISSION_CAP (120) as triaged_hold and the only release (IDEAS-CAP-GENERATED-RELEASE-1, 1.11.1) fitted rows under that same cap; research_queue counts the deferred overflow too and sat at 473, so room was never positive and the release was a no-op while 80 accepts waited, the oldest about 45 hours (ANTIFRAGILE-1: a hold needs an expiry, prefer a rate)',
  'IDEAS-CAP-RATE-1 (idea-hub 1.12.0): at or over the cap capRelease admits CAP_TRICKLE_PER_RUN (3) oldest held rows per hourly run and logs each run to cloud_ops_events (kind idea-cap-trickle); research_ready_cap and deferral keep metering executor load; control_registry research-admission-cap is demote/applied with a review date',
  'no ACCEPT proposal held by the research admission cap is older than 72 hours (the trickle drains a backlog at a net 1.25 an hour; a row older than that means the rate is dead or the inflow outran it)',
  'fm-ideas-cap-hold-no-expiry', '2026-10-19', 100047,
  'research_queue at or over 120 active and deferred rows for longer than the time one triage run needs, with generated accepts still arriving',
  'idea_proposals rows with decision ACCEPT, status triaged_hold and a rationale starting [research admission cap, the oldest more than a day old; the idea-triage-budget event reads 0 released',
  'every machine-generated accept while the queue is full: about 42 a day were held on 2026-10-18 and 19');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-ideas-cap-hold-no-expiry', NULL, 'IDEAS-CAP-RATE-1', 'failure mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM idea_proposals WHERE decision = ''ACCEPT'' AND status = ''triaged_hold'' AND rationale LIKE ''[research admission cap %'' AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-72 hours'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- 3. The closing probe of issue 100047 measures the hold. UPDATE on the class, as ORPHAN-GUARD-BIRTH-1 requires (an INSERT OR IGNORE would be ignored).
-- The replaced probe returned 'pending: research_queue at the admission cap' whenever the queue was at the cap, which is the defect, so it could not pass.
UPDATE remediation_contracts SET ts = datetime('now'),
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM idea_proposals WHERE decision = ''ACCEPT'' AND status = ''triaged_hold'' AND rationale LIKE ''[research admission cap %'' AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) AS TEXT) AS observed',
  next_due_at = strftime('%Y-%m-%d %H:%M:%S', 'now')
WHERE class = 'issue-100047' AND instr(verify_probe, 'pending: research_queue at the admission cap') > 0;

-- 4. The decision.
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a held accept the triage already scored should be researched at a bounded rate, not wait for a queue that the deferred overflow keeps above the cap for good; the executor is metered by research_ready_cap and deferral, so three more queued rows an hour add no executor load the 260 deferred rows did not already add',
  'IDEAS-CAP-RATE-1: capRelease admits the CAP_TRICKLE_PER_RUN (3) oldest cap-held ACCEPTs per hourly run when research_queue is at or over RESEARCH_ADMISSION_CAP, logs each run to cloud_ops_events (idea-cap-trickle), keeps the room path and the cap; control_registry research-admission-cap demote/applied with a review date; failure mode ideas-cap-hold-no-expiry with fm- detector (72 h); the probe of issue 100047 measures held rows older than 120 minutes',
  'D1 2026-10-19 12:39Z: research_queue active+deferred 473 (deferred 260) against a cap of 120; 80 held cap rows, oldest 2026-10-17T15:23:48Z, 76 older than 120 minutes, 42 new in 24 h; idea-triage-budget event 12:31Z "0 released"; research_ready_cap 192; main idea-hub 1.11.3 capRelease returns when room is not positive; idea-hub/cap-trickle.test.mjs 38 assertions, 29 fail on 1.11.3',
  'merged to main, deployed by the canonical path; expected after the deploy: idea-triage-budget carries cap_trickled_run 3 within one hourly run, idea-cap-trickle events appear hourly, held cap rows older than 120 minutes (80 at 14:40Z) fall by about 1.25 an hour and reach 0 in about 64 hours (the issue-100047 probe), fm-ideas-cap-hold-no-expiry stays 0',
  'idea-hub triage queues up to 3 more research_queue rows an hour (the oldest held accepts); no other worker, table or cron changes; the rows were already ACCEPTed by triage',
  'revert idea-hub/worker.js to 1.11.3 through the canonical path (the trickle then stops; held rows stay held, none is lost); the Rollback header restores the probe and registry rows',
  'the fleet researches its held high-score ideas at a bounded rate instead of leaving them parked with no expiry',
  'issue 100047 closed within 72 h',
  'none',
  'offline suites idea-hub/cap-trickle.test.mjs and cap-release.test.mjs; d1:qnfo-audit research_queue, idea_proposals, cloud_ops_events, control_registry, ops_config research_ready_cap'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'IDEAS-CAP-RATE-1:') = 1);

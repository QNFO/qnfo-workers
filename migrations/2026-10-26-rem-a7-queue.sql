-- REM-A7-QUEUE-1 (2026-10-26, charter pillars research and autonomy; rem-a7 fork F3; owner cards 100129, 1000159, 1000231, 1000094 and INTENT-TASK 1000457).
-- FINDING (qnfo-audit, SELECT only, 2026-10-26 18:00Z to 18:25Z). Four owner cards asked, three times in 24 hours, why 192 queued research items and 640 to 750 errata do not move.
--   * The 192 queued rows are not ideas: 174 are errata remediation rows (source remediation, source_id errata:N), 10 completeness rows and 8 revision rows. The 183 ideas wait in status deferred
--     because research_ready_cap = 192 is full and the backpressure order ranks every remediation row first.
--   * None of the 233 errata rows (149 papers, 90 created today) has ever been claimed or published: claimed_at is set on 0, published_at on 0, cloud_ops_events kind claim holds 0 claims of one in 8 days.
--   * ops_config research_daily_neurons = 360000 was spent by 04:32:42Z today (spent=414499 at 17:51Z) and by 13:01:09Z on 10-25; research-exec 290,494, errata-hub 104,823 (25 percent) and
--     qnfo-paper-reviser 20,112 neurons count against it; eight publications are 51.9k neurons each (7-day mean 46,737 against a target of 20,000).
--   * The cards are one defect. They are closed as superseded by one successor issue, RESEARCH-ERRATA-CLAIM-1, which carries the numbers, the doer (a code-task line) and a probe on the outcome
--     (7 or more errata corrections published in 7 days). The old 30-a-day probe of 100129 cannot pass under a 360000-neuron day at 46,737 neurons per publication (the 20k target would give 18 a day);
--     it is replaced by an outcome probe, not hidden. No cap is raised, no gate or probe is weakened.
--   * 1000457 is routed: the intent becomes a research_queue row of source idea (the owner-directive path of 99956: ranked first by backpressure, never parked by POOL-BOUND, claimed before the 72 hour FIFO
--     tier), with the video provenance phrase reworded so the paper does not mention how the brief arrived. The pipeline is not run inline. A contract keeps watching that the row is not parked or lost.
-- Mechanism: before-states go to bak_20261026_rem_a7_queue_*; contracts leave the closing path (status superseded); the close goes through issue_triage so the live trigger triage_close_sync_issue_upd
-- closes the issue with its close_evidence; decision_log gets one row. Nothing is deleted or dropped.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261026_rem_a7_queue_contracts b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261026_rem_a7_queue_contracts b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261026_rem_a7_queue_contracts b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261026_rem_a7_queue_contracts b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261026_rem_a7_queue_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261026_rem_a7_queue_contracts); UPDATE issue_triage SET triage_state = (SELECT b.triage_state FROM bak_20261026_rem_a7_queue_triage b WHERE b.issue_id = issue_triage.issue_id), close_evidence = (SELECT b.close_evidence FROM bak_20261026_rem_a7_queue_triage b WHERE b.issue_id = issue_triage.issue_id) WHERE issue_id IN (SELECT issue_id FROM bak_20261026_rem_a7_queue_triage); UPDATE agent_issues SET status = 'open', close_channel = NULL WHERE id IN (SELECT id FROM bak_20261026_rem_a7_queue_issues WHERE status = 'open'); UPDATE research_queue SET status = 'wontfix', stage = 'parked', error = 'REM-A7-QUEUE-1 rollback' WHERE id = 'idea-int-022429ffmvpihdfe' AND claimed_at IS NULL

-- 1. Before-states (idempotent: a replay keeps the first snapshot)
CREATE TABLE IF NOT EXISTS bak_20261026_rem_a7_queue_contracts AS
  SELECT class, issue_id, status, verify_probe, verify_transport, last_verdict, action
  FROM remediation_contracts
  WHERE class IN ('issue-100129', 'issue-1000159', 'issue-1000231', 'issue-1000094', 'issue-1000457');
CREATE TABLE IF NOT EXISTS bak_20261026_rem_a7_queue_triage AS
  SELECT issue_id, rc, triage_state, owner, close_evidence, reopened_count
  FROM issue_triage
  WHERE issue_id IN (100129, 1000159, 1000231, 1000094, 1000457);
CREATE TABLE IF NOT EXISTS bak_20261026_rem_a7_queue_issues AS
  SELECT id, status, close_channel, updated_at
  FROM agent_issues
  WHERE id IN (100129, 1000159, 1000231, 1000094, 1000457);

-- 2. 1000457: queue the intent the way an owner directive reaches the executor (source idea, score above the 0.95 remediation convention so the ready cap does not defer it)
INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at)
SELECT 'idea-int-022429ffmvpihdfe', 'idea', 'math-invented-or-discovered-20261026',
  substr(replace(replace(i.desire, 'Consolidated from a video thesis (10 arguments for discovery: ', 'Arguments for discovery to weigh ('), ') and a critique arguing the dichotomy is false (', ') against the critique that the dichotomy is false ('), 1, 3000),
  'Owner research task (intent int-022429ffmvpihdfe, agent_issues 1000457): a defensible position on whether mathematics is invented or discovered, with each research sub-question answered from the literature.',
  0.97, 'accept', 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM intents i
WHERE i.id = 'int-022429ffmvpihdfe' AND length(trim(COALESCE(i.desire, ''))) >= 200;

-- 3. The successor issue: the one defect behind the four cards, with its doer and its numbers
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'RESEARCH-ERRATA-CLAIM-1: none of the 233 errata remediation rows has ever been claimed (0 in 8 days, 0 corrections published); they hold 174 of 192 ready slots and the neuron budget is spent by 04:32Z',
  'Charter pillar: research (a correction reaches readers only when it is published; OUTPUT-QUALITY-LEDGER-1, PAPER-LEDGER-1). Successor of the owner cards 100129, 1000159, 1000231 and 1000094, which asked why 192 queued research items and 640 to 750 errata do not move. Measured 2026-10-26 18:00Z to 18:25Z in qnfo-audit (SELECT only) by session rem-a7-f3.' || char(10) ||
  '1 WHAT THE 192 ARE. research_queue holds 192 rows in status queued: 174 errata remediation rows (source remediation, source_id errata:N; 96 at stage ground, 78 with no stage), 10 completeness rows (oldest rem-a0d00390, created 2026-10-13) and 8 revision rows. None is a new idea. The 183 research ideas (source proposal) wait in status deferred, with 66 other deferred rows (59 more errata rows, 7 others). research_ready_cap is 192, so the ready queue is exactly full, and the backpressure order (RB_ORDER_SQL in qnfo-fleet-control) ranks every remediation row ahead of a proposal.' || char(10) ||
  '2 NO ERRATA ROW HAS EVER MOVED. Of the 233 errata rows (created 2026-10-18 to 10-26, 90 of them today, over 149 papers) claimed_at is set on 0 and published_at on 0, and cloud_ops_events kind claim holds 0 claims of an errata: row. errata_actions holds 233 routed (risk high) and 30 drafted. errata_queue holds 562 internal-open, 162 detected and 30 audited; internal_errata took 245 new rows today from qnfo-lifecycle PAPER-LEARN-1 (324 on 10-20, 242 on 10-21).' || char(10) ||
  '3 WHY. (a) The budget: ops_config research_daily_neurons is 360000 and the day was spent by 04:32:42Z (first research-budget event reading daily budget exhausted; at 17:51Z spent=414499); all 26 claims and all 8 publications of the day fell between 00:01Z and 04:14Z. Yesterday the budget ran out at 13:01Z. (b) The claim order: claimNew takes re-armed proposals older than 72 hours, revision rows and resumable-stage rows before the FIFO tier where the errata rows sit. (c) The price of one correction: a remediation row re-runs the pipeline from ground (RESUME-STAGE-1 measured about 12.3k neurons per re-run; the 7-day mean is 46,737 neurons per publication against a target of 20,000), so the 233 rows cost 2.9M to 10.9M neurons: 8 to 30 days of the whole daily budget with nothing else running. They are 233 rows for 149 papers; ERRATA-ROUTE-PER-PAPER-1 (1000293) removes 84 of them.' || char(10) ||
  '4 WHERE THE 415,429 NEURONS OF 2026-10-26 WENT (ai_call_counters, the three workers COST-SUSTAIN-1 counts): qnfo-research-exec 290,494 (review about 88k, revise 63k, verify 49k, ensemble 45k, reconcile 23k, complete 20k), errata-hub 104,823 (25 percent; confirm calls that feed the rows above; 182,577 or 39 percent on 10-25), qnfo-paper-reviser 20,112. Eight publications are 51.9k neurons each. There were 61 review-to-revise rounds for 21 papers (cycles 0 to 5: 21, 18, 11, 5, 3, 3) and 3 papers stopped at the 6-cycle cap.' || char(10) ||
  'LEVERS (none raises a cap; fleet_cost_pace_30d_usd and workers_ai_cost_30d are already in breach): (1) claim fairness: give errata rows a bounded share of the claims so they are not behind every other class; (2) one remediation row per paper (1000293); (3) apply an erratum at stage revise instead of re-running from ground; (4) hold errata-hub confirm at its floor while the errata rows it feeds are unclaimed (BREACH-SELFHEAL-1 owns errata_confirm_max); (5) REVISE-NOOP-BOUND-1 and issue 100615 free the budget that revision rows burn.' || char(10) ||
  'Definition of done: the closing probe on this issue reads 7 or more errata: rows with published_at in the trailing 7 days (one correction a day, about 3.4 percent of the daily budget at 12.3k neurons per re-run), reached without raising research_daily_neurons or any other cap.' || char(10) ||
  'Doer: qnfo-code-orchestrator through the code-task below (take the work claim on qnfo-research-exec/worker.js first, WORK-CLAIM-1).' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: async function claimNew(env) {',
  'claude-session-rem-a7-f3', 'research', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title LIKE 'RESEARCH-ERRATA-CLAIM-1:%' AND a.status = 'open');

-- 4. Its closing probe: corrections published, never claims alone
INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at)
SELECT 'issue-' || a.id, a.id,
  'REM-A7-QUEUE-1: the errata remediation rows of research_queue are never claimed',
  'qnfo-code-orchestrator through the code-task line on the issue (qnfo-research-exec claim order and errata routing); the probe measures published corrections, so a claim that loops does not pass it',
  'SELECT ''ok'' AS expected, CASE WHEN (SELECT COUNT(*) FROM research_queue WHERE source = ''remediation'' AND source_id LIKE ''errata:%'' AND published_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) >= 7 THEN ''ok'' ELSE ''fewer than 7 errata corrections published in 7 days: '' || (SELECT COUNT(*) FROM research_queue WHERE source = ''remediation'' AND source_id LIKE ''errata:%'' AND published_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) || '' published, '' || (SELECT COUNT(*) FROM research_queue WHERE source = ''remediation'' AND source_id LIKE ''errata:%'' AND claimed_at IS NOT NULL) || '' ever claimed, '' || (SELECT COUNT(*) FROM research_queue WHERE source = ''remediation'' AND source_id LIKE ''errata:%'' AND status IN (''queued'', ''deferred'')) || '' waiting'' END AS observed',
  'd1-query', 3, 'qnfo-research-exec', 1, 'active', datetime('now')
FROM agent_issues a
WHERE a.title LIKE 'RESEARCH-ERRATA-CLAIM-1:%' AND a.status = 'open'
ON CONFLICT(class) DO UPDATE SET issue_id = excluded.issue_id, precondition = excluded.precondition, action = excluded.action, verify_probe = excluded.verify_probe,
  verify_transport = 'd1-query', max_attempts = excluded.max_attempts, escalate_to = excluded.escalate_to, expected_cadence_h = excluded.expected_cadence_h,
  status = 'active', last_verdict = NULL, next_due_at = datetime('now');

-- 5. The four cards leave the closing path (their probes measured outcomes of the successor, or nothing) and close as superseded
UPDATE remediation_contracts
   SET status = 'superseded', last_verdict = 'superseded:REM-A7-QUEUE-1 (the four owner cards are one defect, carried by RESEARCH-ERRATA-CLAIM-1 with a probe on the outcome)', last_attempt_at = datetime('now')
 WHERE class IN ('issue-100129', 'issue-1000159', 'issue-1000231', 'issue-1000094')
   AND status IN ('active', 'holding', 'monitoring', 'escalated')
   AND EXISTS (SELECT 1 FROM agent_issues s WHERE s.title LIKE 'RESEARCH-ERRATA-CLAIM-1:%' AND s.status = 'open');

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT v.id, 'queue-finding:RESEARCH-ERRATA-CLAIM-1', 'closed', 'qnfo-research-exec', datetime('now'), 'superseded by ' || s.id || ' (RESEARCH-ERRATA-CLAIM-1), which carries the fix, its doer and a probe on the outcome. ' || v.ev
FROM (
  SELECT 100129 AS id, 'Investigation delivered, measured 2026-10-26 18:00Z to 18:25Z in qnfo-audit. Stalled workers: no. qnfo-research-exec logged 295 stage done-ok events, 26 claims and 8 publications in the trailing 24 h (last stage completion 2026-10-26T04:32:42Z) and research-exec-watchdog 103 ok events; worker_logs since 10-22 show 323 exceptions (last 04:02:12Z) and 59 cancellations for qnfo-research-exec, none after the budget stop. Resource limit: yes. ops_config research_daily_neurons = 360000 was spent by 04:32:42Z today (research-budget event: daily budget exhausted: spent=414499 budget=360000; 155 hold events since) and by 13:01:09Z on 10-25; qnfo-research-exec 290,494, errata-hub 104,823 (25 percent) and qnfo-paper-reviser 20,112 neurons count against it. Pending reviews: 61 review-to-revise rounds for 21 papers today and 3 papers stopped at the 6-cycle cap. The 192 queued rows are not ideas: 174 errata remediation rows (0 ever claimed), 10 completeness and 8 revision rows; the 183 ideas wait in status deferred because research_ready_cap = 192 is full. Publications: 8 in the trailing 24 h and 4 to 11 a day since 10-22, against 56 to 89 on 10-19 to 10-21. The earlier probe (30 or more in 24 h) cannot pass under a 360000-neuron day at 46,737 neurons per publication (the 20k target would give 18 a day); it is replaced by the successor probe, not hidden.' AS ev
  UNION ALL
  SELECT 1000159, 'Review delivered, measured 2026-10-26 18:00Z to 18:25Z. Why throughput is low: the 360000-neuron day was spent by 04:32:42Z (spent=414499), 8 publications in 24 h at 51.9k neurons each; the 192 queued rows are 174 errata remediation rows that were never claimed in 8 days, 10 completeness and 8 revision rows, and the 183 ideas wait in status deferred behind them (research_ready_cap = 192). The oldest queued item, rem-a0d00390-938a-4836-978d-e5426be60cc4 (completeness sweep of numeral-systems-as-evolving-cognitive-technologies-error-propagation-compactness, created 2026-10-13T08:47Z, stage ground, recover_count 2, last error: verify: unresolved after revision - mismatch=true gates=gate-fulltext-citation), was not processed first: claimNew ranks 8 revision rows and 1 revise-stage row ahead of it and it leads the FIFO tier after them; the budget stopped at 04:32:42Z. Moving it ahead needs a claim-order change in qnfo-research-exec/worker.js (live work claim and queued code-loop task ct_rvnp3b02c956c0); setting its source to idea would send a correction of an existing paper through publishStageV2 (a new paper) instead of remediationPublish (a new version), so the row was left as it is. The claim-order change is the code-task of the successor.' AS ev
  UNION ALL
  SELECT 1000231, 'Findings, measured 2026-10-26 18:00Z to 18:25Z. Backpressure: the research chain reads stuck (integration_state 1105, 18:15Z: 192 waiting, oldest 321.5 h, no consumer progress in 3 h) because the 360000-neuron day is spent by 04:32Z; the errata chain reads draining with 751 waiting (oldest 162.2 h); the causes and levers are in the successor. Published papers withdrawn or unpublished after 2026-10-21: yes, transiently. paper_change_ledger: 356 papers went published to quarantined on 10-25 between 17:21Z and 20:21Z (publication gate v2, qnfo-cloud-ops pub-gate-v2-structure: quality:internal-artifact and structure findings) and 31 more on 10-26; 387 went back to published on 10-26 (252 written live, 135 backfilled); all 364 distinct papers read status published now, there are 0 delete rows and 0 withdrawal flags since 10-21 and 704 papers are published. Workers: qnfo-code-orchestrator 71 exception outcomes since 10-23 (last 10-26 17:31Z; open issue 1000079 carries it), 43 cancellations and 13 exceededWallTime; qnfo-observability 3 exceptions, all at 2026-10-25 19:40:56Z and none since, and 51 cancellations; qnfo-gateway exceededMemory 68 events, one an hour from 10-21 19:00Z to the last at 10-25 08:01:20Z and none since (root cause and fix in closed issue 1000158: PLAIN-FILL-MEMORY-1, gateway 3.29.7, and 3.43.2 which limits the page-time plain fill to one paper).' AS ev
  UNION ALL
  SELECT 1000094, 'Findings, measured 2026-10-26 18:00Z to 18:25Z. Errata watch -> respond -> publish: errata_queue holds 562 internal-open, 162 detected, 30 audited and 233 implemented, which means routed; integration_state 1105 reads draining with 751 waiting, oldest 162.2 h, the consumer having advanced 13 minutes before an earlier read. Root cause: the producer outruns every consumer. internal_errata took 245 rows today from qnfo-lifecycle PAPER-LEARN-1 (324 on 10-20, 242 on 10-21); errata-hub confirms 12 rows an hour (errata_confirm_max, v_breach_selfheal chain-backlog drain-too-slow, backlog 542); and the 233 high-risk errata routed into research_queue were never claimed, so 0 corrections have been published. Research chain: 192 waiting, stuck because the 360000-neuron day is spent by 04:32Z; see the successor. qnfo-gateway exceededMemory: 68 events (the 29 of the card were the post-deploy subset), last 2026-10-25 08:01:20Z and none since; fixed by PLAIN-FILL-MEMORY-1 (gateway 3.29.7) and 3.43.2, recorded in closed issues 1000158, 1000105 and 1000078. Restore publishing throughput: not restored by this card (8 publications in 24 h); the fix and its probe are the successor, and the errata inflow is held by issues 1000019, 100449 and 1000293.' AS ev
) v
JOIN agent_issues a ON a.id = v.id AND a.status = 'open'
JOIN (SELECT id FROM agent_issues WHERE title LIKE 'RESEARCH-ERRATA-CLAIM-1:%' AND status = 'open' ORDER BY id DESC LIMIT 1) s
WHERE 1
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

-- 6. 1000457: the contract watches that the owner-directed row stays routed; the close names the queue row
UPDATE remediation_contracts
   SET status = 'active', last_verdict = NULL, attempts = 0, next_due_at = datetime('now'), verify_transport = 'd1-query',
       precondition = 'REM-A7-QUEUE-1: the owner-directed research row is not parked or lost',
       action = 'the research pipeline claims the row when the daily neuron budget reopens at 00:00 UTC; a parked or missing row fails this probe and REMEDIATION-REOPEN-2 reopens the issue',
       verify_probe = 'SELECT ''routed'' AS expected, COALESCE((SELECT CASE WHEN status IN (''queued'', ''deferred'', ''researching'', ''review'', ''published'') THEN ''routed'' ELSE ''row status '' || status END FROM research_queue WHERE id = ''idea-int-022429ffmvpihdfe''), ''row missing'') AS observed'
 WHERE class = 'issue-1000457'
   AND EXISTS (SELECT 1 FROM research_queue q WHERE q.id = 'idea-int-022429ffmvpihdfe');

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'intent-routed:REM-A7-QUEUE-1', 'closed', 'qnfo-research-exec', datetime('now'),
  'Routed, not run inline. research_queue row ' || q.id || ' (source ' || q.source || ', source_id ' || q.source_id || ', status ' || q.status || ', score ' || q.score || ', decision ' || q.decision || ', created ' || q.created_at || ') was queued from intent int-022429ffmvpihdfe by migration 2026-10-26-rem-a7-queue, with the video provenance phrase of the brief reworded so the paper does not describe how the brief arrived; the six research sub-questions and the target output are kept as written. A row of source idea is the owner-directive path of issue 99956: qnfo-fleet-control backpressure ranks it first (RB_ORDER_SQL rank 0, then score), POOL-BOUND never parks it (0.41.1) and claimNew takes it ahead of the 72 hour FIFO tier; the pipeline claims it when the daily neuron budget reopens at 00:00 UTC (the 10-19 precedent, idea-reality-idempotent-exchange-symmetry-20261019, was published 2.3 h after its claim). The contract on this issue watches that the row is not parked or lost and reopens the issue if it is.'
FROM agent_issues a
JOIN research_queue q ON q.id = 'idea-int-022429ffmvpihdfe'
WHERE a.id = 1000457 AND a.status = 'open'
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;

-- 7. The decision
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f3',
  'four owner cards that describe the same stalled queue are one defect; a report the owner asked for is delivered once and its fix is carried by one issue with a doer and a probe on the outcome; a brief the owner sent through an intent is a research directive and goes to the executor through the owner-directive path, never through an inline run',
  'REM-A7-QUEUE-1: issue RESEARCH-ERRATA-CLAIM-1 filed with a code-task line and a probe on published errata corrections; issues 100129, 1000159, 1000231 and 1000094 closed as superseded with their findings; intent int-022429ffmvpihdfe queued as research_queue row idea-int-022429ffmvpihdfe and issue 1000457 closed on the row',
  'qnfo-audit 2026-10-26 18:00Z to 18:25Z: research_queue 192 queued (174 errata, 10 completeness, 8 revision), 249 deferred, 233 errata rows with claimed_at set on 0 and published_at on 0; research-budget event spent=414499 budget=360000, first exhausted 04:32:42Z; ai_call_counters 415,429 neurons (research-exec 290,494, errata-hub 104,823, paper-reviser 20,112); paper_change_ledger 387 demotions and 387 restorations since 10-21; worker_logs outcomes for code-orchestrator, observability, gateway and research-exec since 10-22',
  'applied by migration',
  'five agent_issues rows closed through issue_triage and one opened; remediation_contracts of the four cards superseded, one probe rewritten, one inserted; one research_queue row inserted; no worker, cron, cap or gate changed',
  'the Rollback line (restores the contracts, triage rows and issue status from the bak_20261026_rem_a7_queue_* tables and parks the new research row)',
  'the owner cards of one stalled queue have one carrier, one doer and a probe that only publication can pass',
  'the idea row is claimed within one budget day (claimed_at set after 00:00Z) and its paper follows the 2.3 h claim-to-publish of the 10-19 precedent; the four closed cards stay closed; RESEARCH-ERRATA-CLAIM-1 stays open until 7 errata corrections are published in 7 days',
  'research: the owner research brief on mathematics reaches the executor with the ranking of an owner directive',
  'd1:qnfo-audit research_queue, errata_queue, errata_actions, internal_errata, ai_call_counters, cloud_ops_events, integration_state, worker_logs, remediation_contracts (SELECT only); d1:living-paper paper_change_ledger, plain_summary (SELECT only); qnfo-research-exec/worker.js claimNew and remediationPublish and qnfo-fleet-control RB_ORDER_SQL read on main; offline node:sqlite suite migrations/rem-a7-queue.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A7-QUEUE-1:%');

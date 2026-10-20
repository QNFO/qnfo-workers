-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261020_deferral_contracts
-- Rollback: UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id = 2346 AND status = 'closed'; UPDATE issue_triage SET close_evidence = (SELECT b.close_evidence FROM bak_20261020_deferral_triage b WHERE b.issue_id = issue_triage.issue_id), triage_state = (SELECT b.triage_state FROM bak_20261020_deferral_triage b WHERE b.issue_id = issue_triage.issue_id), rc = (SELECT b.rc FROM bak_20261020_deferral_triage b WHERE b.issue_id = issue_triage.issue_id) WHERE issue_id = 2346; UPDATE goals SET status = 'retired', retired_at = datetime('now') WHERE goal_key = 'WORKERS-STANDARDS-ADVISORY-0'; UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261020_deferral_contracts b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261020_deferral_contracts b WHERE b.class = remediation_contracts.class), status = (SELECT b.status FROM bak_20261020_deferral_contracts b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261020_deferral_contracts b WHERE b.class = remediation_contracts.class), deferred_since = (SELECT b.deferred_since FROM bak_20261020_deferral_contracts b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261020_deferral_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN ('issue-2068', 'issue-2111', 'issue-2446', 'issue-2346', 'EVID-GATE-A2-PUBLISHV2')
-- (the decision_log row is append-only and stays)
-- spof-review: adds no cron, binding, credential or loop; it restates five contract probes and parks one, and every row it touches is copied to bak_20261020_deferral_contracts and bak_20261020_deferral_triage first.
--
-- DEFERRAL-HONEST-1 (2026-10-20, charter pillar autonomy; agent_issues 2068, 2111, 2346, 2446, 2954, 100203, 100204, 100244, 100245, 100246, 100266).
-- Owner directive 2026-10-20: "The system shall always clear all open issues server-side automatically within 24 hours."
--
-- WHAT WAS READ (qnfo-audit, 2026-10-20 05:40Z to 06:10Z, read only)
--   The cluster is one family: a verification contract that reads 'pending' and so produces no verdict, for a reason that is not "the condition has
--   not happened yet". After 7 days the tick files a VERIFICATION-DEFERRED-7D-1 issue that is about the probe, not the defect, and has no doer.
--   Five contracts had crossed the line (deferred_since) and each was a different cause:
--   issue-2446  unmanaged_direct_spend_share. The probe measures the defect and reads 0.5058 against a target of 0.5, but its text starts with 'pending: ',
--               so the tick deferred it for 8 days (352 attempts) while scripts/remediation_consumer.py, which reads the same shape as a failure, stamped
--               'fail' every 22 minutes. The metric fell from 0.6114 (2026-10-18) to 0.5058 when the owner's own client keys were excluded from it
--               (cost_daily scope 'external'); the issue text says OBJECTIVE-CONSTRAINTS-1 closes it on the first hourly tick within target.
--   issue-2346  the workers best-practice umbrella: 41 advisory findings (27 limits-not-declared, 7 unbounded-body-buffer, 5 redundant-nodejs-compat,
--               2 ai-run-no-token-budget, 1 swallowed-catch), 0 fail. The probe is right and also reads 'pending: ... (target 0)'. The issue is a research
--               backlog ("each needs measurement first"), the shape ROADMAP-TO-GOALS-1 and SLA-DRAIN-2 moved to goals: it becomes the adopted goal
--               WORKERS-STANDARDS-ADVISORY-0 with the same probe as its DoD, and the issue closes naming the goal.
--   issue-2111  SEARCH text not found. EDIT-INDENT-TOLERANT-1, SEARCH-FUZZY-1 and SEARCH-NEAREST-1 (live 2026-10-19T11:47Z) are deployed. The probe counted
--               attempt-level events ("occurs 0 times in the shown content"), which include every miss a retry then repaired, and it had a time gate that kept it
--               deferred until a full day after the deploy. At task level: 9 tasks ended failed on that text between 2026-10-12 and the deploy, 0 since;
--               5 tasks that hit it before and 4 that hit it after merged on a later attempt. The probe now counts tasks that END on it, since the deploy.
--   issue-2068  qnfo-ops context compaction. 2.50.5-context-compact-2 deployed 2026-10-19T13:23Z (qnfo-ops/context-compact.test.mjs replays the
--               1,593,580-token job shape and shows 60 percent fewer prompt tokens). The probe waits for 3 owner-started job rows after the deploy; there
--               have been none since 2026-10-17 18:01Z, so it would wait for ever. It now judges what the rows say when there are any (a job at or above
--               800000 prompt tokens, or an ok share below the 7 days before) and no longer waits for a count that owner traffic decides.
--   EVID-GATE-A2-PUBLISHV2  waits for a 'publish-v2-metadata' event. No worker emits that event: NOZ-DOI-1 (2026-10-11, qnfo-research-exec publishV2)
--               publishes revisions in-house with no Zenodo deposit, the metadata the gate asserted (related identifiers, keywords, funnel link) is
--               gone with it, zenodo-metadata events stopped on 2026-10-06 and cloud_ops_events holds no row of that kind at any time. Parked.
--   issue-2381 is not touched: its probe is a real wait. The 72h windows of 30 pending learner rows closed on 2026-10-17 to 10-19 and the daily credit
--               (qnfo-social learnerDailyCredit, 07:00Z) reads them next; LEARNER-ARMS-2 re-queued them on 2026-10-19 after the 07:00Z run.
--   PROBE-NEEDED-1 100266 closes on its own: issue 2832 now has a probe that reads its workflow runs (PR 3218, 247d57a5). 100283 and 2954 wait for the
--               contract of issue 100277 (HELD: another session's claim; migrations/2026-10-20-ab-regression-probe.sql).
-- WHAT THIS FILE DOES
--   * restates the probes of issue-2111, issue-2446 and issue-2068 as above (a verdict, never 'pending: ' for a measured value), and clears their
--     deferral start so the escalation issues 100203 and 100245 read 'cleared' on their next probe;
--   * parks EVID-GATE-A2-PUBLISHV2 (status superseded, recorded in decision_log) so 100204 reads 'cleared';
--   * moves 2346 to the goal WORKERS-STANDARDS-ADVISORY-0 and supersedes the issue and its contract, so 100246 reads 'cleared';
--   * the tick-side half of the family (a measured pending is a verdict) is docs/handoff/patches/deferral-measured-1.patch.
-- Backups: the five contracts and the triage row are copied below. The Rollback line restores them.

CREATE TABLE IF NOT EXISTS bak_20261020_deferral_contracts AS SELECT * FROM remediation_contracts WHERE class IN ('issue-2068', 'issue-2111', 'issue-2446', 'issue-2346', 'EVID-GATE-A2-PUBLISHV2');
CREATE TABLE IF NOT EXISTS bak_20261020_deferral_triage AS SELECT * FROM issue_triage WHERE issue_id = 2346;

-- 1. issue-2111: task-level, since the SEARCH-NEAREST-1 deploy, no time gate.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN f.n <= 3 THEN ''ok'' ELSE ''SEARCH-miss tasks that ended failed since max(2026-10-19T11:47Z, 7 days ago): '' || f.n || '' (target <= 3; '' || r.n || '' other tasks hit the same miss and merged on a later attempt)'' END AS observed FROM (SELECT COUNT(*) AS n FROM code_tasks WHERE status IN (''failed'', ''needs_human'', ''publish_failed'') AND instr(COALESCE(last_error, ''''), ''occurs 0 times in the shown content'') > 0 AND updated_at >= max(''2026-10-19T11:47:00Z'', strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days''))) f, (SELECT COUNT(*) AS n FROM code_tasks WHERE status IN (''merged'', ''closed'') AND instr(COALESCE(ctx, ''''), ''occurs 0 times in the shown content'') > 0 AND updated_at >= max(''2026-10-19T11:47:00Z'', strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days''))) r',
  verify_transport = 'd1-query',
  action = 'DEFERRAL-HONEST-1: the probe counts code tasks that END on a SEARCH-not-found error since SEARCH-NEAREST-1 went live (at most 3); attempt-level misses that a retry repaired are the loop working. If it fails, classify the failing tasks by rung and by whitespace versus invented text (code-task on qnfo-code-orchestrator/worker.js nearestWindow)',
  status = 'active', last_verdict = NULL, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-2111' AND instr(COALESCE(action, ''), 'DEFERRAL-HONEST-1') = 0;

-- 2. issue-2446: the measurement was right; its text said 'pending'. A value above target is a verdict.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric = ''unmanaged_direct_spend_share'') AS REAL) <= 0.5 THEN ''ok'' ELSE ''above target: unmanaged_direct_spend_share reads '' || COALESCE((SELECT last_value FROM metric_registry WHERE metric = ''unmanaged_direct_spend_share''), ''?'') || '' (target <= 0.5, lever: throttle BYOK callers through the qnfo-ai spend governor)'' END AS observed',
  verify_transport = 'd1-query',
  action = 'DEFERRAL-HONEST-1: the probe reads the metric against its target and a value above it is a failure, not a pending. 0.5058 at 2026-10-20 05:00Z, falling from 0.6114 on 2026-10-18; OBJECTIVE-CONSTRAINTS-1 closes the issue on the first hourly tick within target, and this contract passes on the same read',
  status = 'active', last_verdict = NULL, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-2446' AND instr(COALESCE(action, ''), 'DEFERRAL-HONEST-1') = 0;

-- 3. issue-2068: judge the rows there are; the 3-row wait was owner traffic.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN d.t IS NULL THEN ''pending: qnfo-ops context-compact-2 is not deployed yet'' WHEN j.mx >= 800000 THEN ''job prompt tokens above the ceiling: max '' || j.mx || '' since the compaction release '' || d.t || '' (target < 800000)'' WHEN j.n >= 3 AND j.share < COALESCE(b.share, 1.0) THEN ''job ok share '' || j.share || '' is below the 7 days before the release ('' || COALESCE(b.share, 1.0) || '')'' ELSE ''ok'' END AS observed FROM (SELECT MIN(deployed_at) AS t FROM deployment_history WHERE resource_name = ''qnfo-ops'' AND status = ''success'' AND version_id LIKE ''%context-compact-2%'') d LEFT JOIN (SELECT COUNT(*) AS n, MAX(prompt_tokens) AS mx, AVG(ok) AS share FROM ops_ai_log WHERE source = ''job'' AND ts >= (SELECT MIN(deployed_at) FROM deployment_history WHERE resource_name = ''qnfo-ops'' AND status = ''success'' AND version_id LIKE ''%context-compact-2%'')) j ON 1 = 1 LEFT JOIN (SELECT AVG(ok) AS share FROM ops_ai_log WHERE source = ''job'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', (SELECT MIN(deployed_at) FROM deployment_history WHERE resource_name = ''qnfo-ops'' AND status = ''success'' AND version_id LIKE ''%context-compact-2%''), ''-7 days'') AND ts < (SELECT MIN(deployed_at) FROM deployment_history WHERE resource_name = ''qnfo-ops'' AND status = ''success'' AND version_id LIKE ''%context-compact-2%'')) b ON 1 = 1',
  verify_transport = 'd1-query',
  action = 'DEFERRAL-HONEST-1: passes while the compaction release is deployed and no job row since it reached 800000 prompt tokens or lost ok share; the original wait for 3 job rows depended on owner-started jobs (none since 2026-10-17) and never ended. Proof of the mechanism: qnfo-ops/context-compact.test.mjs (60 percent fewer prompt tokens on the 1,593,580-token job shape). The contract keeps running after the close, so a later job over the ceiling reopens the issue',
  status = 'active', last_verdict = NULL, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-2068' AND instr(COALESCE(action, ''), 'DEFERRAL-HONEST-1') = 0;

-- 4. EVID-GATE-A2-PUBLISHV2: the event it waits for has no emitter since NOZ-DOI-1.
UPDATE remediation_contracts SET
  status = 'superseded',
  last_verdict = 'superseded:publish-v2-metadata-obsolete (DEFERRAL-HONEST-1: NOZ-DOI-1 2026-10-11 removed the Zenodo deposit this gate asserted; no worker emits a publish-v2-metadata event; decision_log DEFERRAL-HONEST-1)',
  action = 'DEFERRAL-HONEST-1: parked by a recorded decision. ' || COALESCE(action, ''),
  deferred_since = NULL, next_due_at = NULL
 WHERE class = 'EVID-GATE-A2-PUBLISHV2' AND status = 'active' AND instr(COALESCE(action, ''), 'DEFERRAL-HONEST-1') = 0;

-- 5. issue 2346 becomes a goal (a research backlog, not a defect; owner directive ISSUE-SLA-2H-1: "never closed as wontfix", moved with the successor id).
INSERT INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, priority, status, dod, owner, adopted_at)
SELECT 'WORKERS-STANDARDS-ADVISORY-0',
  'Workers best-practice audit reads 0 fail and 0 advisory findings: a measured [limits] cpu_ms in each wrangler.toml (27 workers), request bodies read with a size guard (7 sites), nodejs_compat removed where it is the default (5), a token budget on env.AI.run (2), no swallowed catch (1); moved from agent_issues 2346, whose text keeps the full research pass',
  'instrumental', 'mission',
  'research backlog moved from the issue queue by DEFERRAL-HONEST-1 (ISSUE-SLA-2H-1: a roadmap item belongs in goals with the successor id); the audit (scripts/fleet_best_practices_audit.py) already files each fail finding as an issue',
  'agent_issues 2346 (DEFERRAL-HONEST-1, ISSUE-SLA-2H-1)', 2, 'adopted',
  'Done when this query reads ok or 1: SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT MAX(run_at) FROM workers_bp_runs), '''') <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-26 hours'') THEN ''pending: no workers best-practice audit run in 26 h'' WHEN (SELECT fail_count + advisory_count FROM workers_bp_runs ORDER BY run_at DESC LIMIT 1) = 0 THEN ''ok'' ELSE ''above target: the newest workers best-practice audit reads '' || (SELECT fail_count || '' fail and '' || advisory_count || '' advisory findings at '' || run_at FROM workers_bp_runs ORDER BY run_at DESC LIMIT 1) || '' (target 0)'' END AS observed',
  'qnfo-code-orchestrator (one wrangler.toml or worker.js per code task); the limits item needs a per-worker P99 CPU measurement first',
  datetime('now')
WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = 2346 AND status = 'open')
  AND NOT EXISTS (SELECT 1 FROM goals WHERE goal_key = 'WORKERS-STANDARDS-ADVISORY-0');

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'DEFERRAL-HONEST-1', 'closed', g.owner, datetime('now'),
  'superseded by goal ' || g.goal_key || ' (goals.id ' || g.id || '): a research backlog with no single defect (the audit reads 0 fail, 41 advisory findings at 2026-10-20T05:37Z); the goal keeps this issue''s probe as its DoD and ' || g.owner || ' as its doer. Closed by migrations/2026-10-20-deferral-honest-verdicts.sql.'
FROM agent_issues a JOIN goals g ON g.source = 'agent_issues 2346 (DEFERRAL-HONEST-1, ISSUE-SLA-2H-1)'
WHERE a.id = 2346 AND a.status = 'open'
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence, triage_state = 'closed', rc = excluded.rc;

-- The contract first (a close is refused while an active contract reads fail), then the issue.
UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded', last_attempt_at = datetime('now'), deferred_since = NULL, next_due_at = NULL
 WHERE class = 'issue-2346' AND status IN ('active', 'holding')
   AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = 2346 AND t.rc = 'DEFERRAL-HONEST-1' AND instr(t.close_evidence, 'superseded by goal') = 1);

UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
 WHERE id = 2346 AND status = 'open'
   AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = 2346 AND t.rc = 'DEFERRAL-HONEST-1' AND instr(t.close_evidence, 'superseded by goal') = 1);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01MQYeWxrMd4mVYPCphyaYes',
  'a contract that defers is acceptable only while the condition it waits for can still happen; a measured value above target is a verdict, an unsatisfiable wait is a probe to restate, an obsolete gate is parked by a recorded decision, and a research backlog is a goal',
  'DEFERRAL-HONEST-1: probes of issue-2111, issue-2446 and issue-2068 restated as verdicts; EVID-GATE-A2-PUBLISHV2 parked (publish-v2-metadata has no emitter since NOZ-DOI-1); issue 2346 moved to goal WORKERS-STANDARDS-ADVISORY-0',
  'qnfo-audit 2026-10-20 read only: issue-2446 reads 0.5058 (metric_history 0.6114 on 10-18); code_tasks ended failed on SEARCH-not-found 9 in 10-12..10-19T11:47, 0 since, 4 recovered since; ops_ai_log source job last row 2026-10-17T18:01Z, none since the 2026-10-19T13:23Z compaction deploy; cloud_ops_events has no publish-v2-metadata row; workers_bp_runs 608 reads 0 fail and 42 advisory',
  'migration merged', 'five remediation_contracts rows, one goals row, one agent_issues row, one issue_triage row',
  'the Rollback header of migrations/2026-10-20-deferral-honest-verdicts.sql (backups bak_20261020_deferral_contracts, bak_20261020_deferral_triage)',
  'the escalation issues of the deferral family close on a probe that reads the defect, not the probe',
  'issues 100203, 100204, 100245 and 100246 read cleared on their next probe and close; 2111 and 2068 close on their next two passes; 2446 closes when the metric reaches 0.5',
  'none', 'd1:qnfo-audit read-only probes run live; node:sqlite fixtures in migrations/deferral-honest-verdicts.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'DEFERRAL-HONEST-1:') = 1);

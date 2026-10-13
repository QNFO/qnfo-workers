-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'open', close_channel = NULL, updated_at = CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id IN (1726, 2037, 2325) AND status = 'closed' AND close_channel = 'issue-triage-20261013'; UPDATE remediation_contracts SET status = 'active' WHERE class IN ('issue-1726', 'issue-2037') AND status = 'superseded'; UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261013_issue_triage_contracts b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261013_issue_triage_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN ('issue-2130', 'issue-2272', 'issue-2346', 'issue-2366', 'issue-2409', 'issue-2419')
-- ISSUE-TRIAGE-20261013 (2026-10-13, session_01Kddqwk5gQT5qSSHVKjT2EA, pillar autonomy): triage of every open agent_issues row
-- (141 open at 07:05Z) with evidence read live between 06:50Z and 07:05Z. Every closure below is guarded: it is applied only
-- if the issue is still open when this file runs (and, for 2325, only if no named model is degraded then). A probe change is
-- applied only while the issue is open and the old probe text is still in place. issue_triage close_evidence stays on rollback.
--
-- CLOSED (3)
--   1726 SUPERSEDED by #1796. CODE-LOOP-ON-CLAUDE-1: no defect repair or verification runs as a Claude session any more:
--        GET https://fleet.qnfo.org/api/watchmaker (200, snapshot 2026-10-12T07:00:54Z) maps the Daily fleet issue sweep to
--        fleet-defects + backlog-drain and the 13 check-ins to time-gated-verification, all ok. The one unmet DoD clause,
--        watchmaker_index 0 (reads 1: code-task-merge), is exactly what #1796 METRIC-TRIGGER-357-WATCHMAKER-INDEX tracks.
--   2037 SUPERSEDED by #2052 (items A, D) and #1798 (item C). Item B is measured: cost_attribution_gap_pct = 0 (MEASURED
--        06:01Z), cost_source_registry 8 rows, COST-ATTRIBUTION-GAP-1 #1833 closed. The umbrella holds no work of its own.
--   2325 DONE. MODEL-DEGRADED deepseek-v4-flash-wa: ai_model_health 06:01Z reads status ok, consecutive_failures 0 for
--        deepseek-v4-flash-wa, deepseek-v4-flash-thinking and deepseek-v4-pro; 0 degraded rows fleet-wide. This is the
--        closer rule of qnfo-backlog-exec/worker.js:419-431, which had not closed it in 31 h.
-- PROBE CORRECTED, ISSUE LEFT OPEN (6): the contract closes the issue itself when its corrected probe passes.
--   2130 HOST-CENSUS-BROKEN-1: the probe read the issue's own status (vacuous). Now it reads the newest host census (pending:
--        8 broken at 03:40Z). The fix has no doer: ipatent.me dns and empoweringchange.today tls are lapsed spare domains
--        whose owner cards 65 and 73 are resolved, yet the census still lists them; 4 census timeouts answered from this
--        session at 07:0xZ (ipatent.qnfo.org 200, www.qwav.org 301, www.q-wave.tech 301, qnfo-system-health 410).
--   2272 ACCURACY-FLEET-1d: the probe wanted a marker in jnl-referee/worker.js, a RETIRED directory. The grounding fixes are on
--        main in the five live files (IPATENT-GROUND-1 qnfo-ipatent/worker.js:495-505 headings-only RAG, ASK-GROUND-2/3,
--        REVISER-GROUND-1, ERRATA-GROUND-1, REVISE-PATCH-GROUND-1); none of the five carried a -GROUND- marker at
--        2c088ea7 (main 2026-10-10T07:14Z, before the issue). The new probe reads ok on main b52b707.
--   2346 WORKERS-STANDARDS-FOLLOWUP-1: the probe read metric workers_bp_findings, which is not registered (the metric is
--        workers_bp_findings_open, fail-class only). Now it reads the newest workers_bp_runs total (5 fail + 535 advisory).
--        Items 2-5 of the issue (AI gateway, D1 telemetry, polling crons, source maps) have no detector and no doer line.
--   2366 STANDARDS-GUARD-CALL-ONLY-1: the code-probe held four backslashes, so after JSON decoding it looked for
--        "\\.passThroughOnException", which no file contains. The call-only pattern is on main at
--        scripts/workers_standards_guard.py:39 and scripts/fleet_best_practices_audit.py:68, and the shim test at
--        scripts/workers_standards_guard.test.py:71. The new probe reads ok on main and also requires the old pattern gone.
--   2409 IDEA-NOVELTY-1: probe and code-task point at qnfo-idea-triage/worker.js, which is FOLDED (never deployed); the triage
--        score runs in idea-hub/worker.js:345 and :357. The probe now reads idea-hub (pending). The code-task line still
--        names the folded file: the code loop should take idea-hub/worker.js instead.
--   2419 SESSION-HANDOFF-01GMK-1: all ten handed-off PRs are on main and live (943 946 960 989 992 1000 1005 1014 1016
--        merged; 984 closed, its commit 085011ca shipped inside stacked PR 992: router_timeout and tick-sequence-ledger in
--        qnfo-fleet-dashboard/worker.js). The probe counted deployment_history only, and qnfo-code-orchestrator deploys
--        through its own workflow (fleet_deploys 0.14.0 ok=1 2026-10-12T16:53:52Z). The new probe reads 8 of 8.
-- OPEN, NO CHANGE (34): doer / blocker. Every contract below is a machine probe that can pass.
--   1779 qnfo-ipatent describe/run/score/page (no code-task line: session work) + owner DOI (identity-bound) / steps 2-4 unbuilt.
--        Probe is weak: it passes as soon as table ipatent_benchmark_results exists.
--   1818 personal-api twin traffic / 8 of the 10 glm-5.3-flash calls the probe needs (0 errors).
--   1857, 1951, 1952, 1953 personal-companion and radar-hub / calendar_feedback has 0 rows: no owner answer to the triage
--        mails (sent 2026-10-04 and 2026-10-11) and 0 after-event questions.
--   1876 qnfo-code-orchestrator / a task in the last 7 days still ended as a collision or duplicate.
--   1895 q08-signal-engine / q08_panel_effective_votes_30d state UNMEASURED (value 1.74 at 06:40Z, under 20 paired reads).
--   1996 code loop (code-task personal-api) / depends on #1818.
--   2004 TP-1 / code_task_success_rate_30d 0.25 (needs 0.6 on 14 days). 2007 TP-1c / window to 2026-10-20.
--   2008 TP-1d / 14-day window from 2026-10-13. 2010 TP-3 / worker_count 28 (needs 24).
--   2011 TP-4 / fleet_ai_run_rate_30d_usd 102.61, workers_ai_cost_30d_usd 74.98. 2012 TP-5 / breach_code_task_pct 5.1 (30).
--   2014 TP-6 / ops_tool_budget_bail_7d 6, levers 2-4 not started. 2015 TP-7 / subscribers_growth_monthly 0, credibility n/a.
--   2025 TP-9 / window to 2026-11-05; lever 3 is a canonical-deploy.yml change (session PR).
--   2061 qnfo-research-exec pipeline / row rem-2061-agentic-collapse-consistency deferred by RESEARCH-BACKPRESSURE-1.
--   2067 qnfo-code-orchestrator / 9 dead-on-arrival tasks in 14 days.
--   2101 code loop / no scripts/* code task has ever been created (0 rows), so the probe waits on an event nothing schedules.
--   2165 qnfo-ai-search ASK-LOOP / 2.5.1 measured at 06:47Z; fewer than 20 judged claims since 2.5.x.
--   2281 code loop (code-task idea-hub) / IDEA_TOPIC_CLUSTERS still at idea-hub/worker.js:377, qnfo-cloud-ops/worker.js:870.
--   2339 qnfo-ai-search / 24 h window since 2.5.x first ran.
--   2342 no doer line / 496 swallowed-catch advisories across 22 workers; the CI guard only refuses new ones.
--   2371 code loop (code-task scripts/continuity_snapshot.py) / EXPORT_DATABASES absent.
--   2372 code loop (code-task dashboard) / WATCHMAKER_OPS entry missing; conflict-repair ran 17 ok ticks since 10-12 14:57Z.
--   2373 session (qnfo-email drafter; no code-task line) / 0 of the next 10 inbound threads carry a tier.
--   2379, 2380 code loop fixes live / 7-day windows to 2026-10-19T16:53Z.
--   2382 owner (IDENTITY-BOUND GA4 access or report email), then qnfo-email / no GA report mail since 2026-09-18.
--   2397 qnfo-fleet-control LOOP-WATCH-1 (no executor line) / fleet_heartbeat 7 rows (needs 10).
--   2412 code loop (code-task dashboard) / WATCHMAKER_OPS entry missing (first_due 2026-10-14).
--   2446 qnfo-fleet-control OBJECTIVE-CONSTRAINTS-1 / unmanaged_direct_spend_share 0.5884 (target 0.5).
-- SKIPPED (98), not closed or edited:
--   loop-owned titles (51): 1753 1780 1796 1798 1834 1838 1872 1873 1875 1978 2022 2089 2155 2157 2158 2167 2168 2196 2199
--     2201 2218 2223 2226 2228 2237 2256 2267 2284 2288 2313 2322 2323 2324 2326 2327 2328 2375 2376 2377 2435 2442 2447
--     2456 2457 2458 2462 2463 2464 2466 2467 2476.
--   Q08 and companion (6): 1716 1760 2222 2354 2477 2478.
--   issue claimed (10): 2338 2343 2362 2402 2411 2420 2421 2451 2468 2472.
--   fix in a claimed file (22): qnfo-research-exec 2052 2105 2116 2211 2264 2340 2347 2393 2399 2403 2404 2405 2406 2407 2408
--     2432; qnfo-social 2036 2225 2374 2381; qnfo-ops 2033 2398. Of these, 2340 and 2347 are duplicates of each other (same
--     probe) and of #2432: all 5 remaining secret-compare findings (workers_bp_runs 07:03Z) are in qnfo-research-exec.
--     2033 closes itself when its fix is 7 days old (09:08Z today).
--   filed or reopened in the last 12 h (9): 2368 2369 2391 2465 2471 2473 2474 2475 2480 (2368, 2369, 2391 reopened by
--     qnfo-deploy-guard at 07:01Z).
-- 2192 (METRIC-REGISTRY-STALENESS-1) was closed by its own contract during this triage and is not touched here.

CREATE TABLE IF NOT EXISTS bak_20261013_issue_triage_contracts AS SELECT * FROM remediation_contracts
WHERE class IN ('issue-1726', 'issue-2037', 'issue-2325', 'issue-2130', 'issue-2272', 'issue-2346', 'issue-2366', 'issue-2409', 'issue-2419');

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, close_evidence)
SELECT 1726, 'ISSUE-TRIAGE-20261013', 'resolved', 'session_01Kddqwk5gQT5qSSHVKjT2EA', datetime('now'),
  'ISSUE-TRIAGE-20261013: superseded by #1796; the Claude-run operations are retired and replaced by fleet runners.',
  'superseded by #1796 (METRIC-TRIGGER-357-WATCHMAKER-INDEX, open), which carries the only unmet clause of the definition of done: watchmaker_index 0. Live read 2026-10-13T06:55Z: GET https://fleet.qnfo.org/api/watchmaker answered 200 (snapshot 2026-10-12T07:00:54Z, index 1, counted [code-task-merge] = code-loop PRs that needed a person). Its retired list maps every Claude operation this issue names to a fleet runner: Daily fleet issue sweep -> fleet-defects (cron:qnfo-fleet-control, ok) + backlog-drain (cron:qnfo-backlog-exec, ok); 13 one-shot claude.ai check-ins -> time-gated-verification (workflow:remediation-consumer, ok). No defect repair or verification runs as a Claude session. [ISSUE-TRIAGE-20261013]'
WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = 1726 AND status = 'open')
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence, triage_state = 'resolved',
  remediation = COALESCE(issue_triage.remediation || ' | ', '') || excluded.remediation;

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, close_evidence)
SELECT 2037, 'ISSUE-TRIAGE-20261013', 'resolved', 'session_01Kddqwk5gQT5qSSHVKjT2EA', datetime('now'),
  'ISSUE-TRIAGE-20261013: umbrella superseded by its children; item B measured.',
  'superseded by #2052 (CITATION-EXISTENCE-GATE-1, open; its definition of done is items A and D) and #1798 (METRIC-TRIGGER-362-OPEN-AGENT-ISSUES, open; item C, backlog size). Item B is measured, read 2026-10-13T06:55Z: metric_registry cost_attribution_gap_pct = 0 (state MEASURED, refreshed 2026-10-13T06:01:06Z), cost_source_registry holds 8 rows, child COST-ATTRIBUTION-GAP-1 #1833 is closed. Item E was linked, not owned. Contract issue-2037 read at the same time: pending: items A/D child CITATION-EXISTENCE-GATE-1 open, item B cost_attribution_gap_pct 0, item C is trigger 362 (issue 1798). The umbrella holds no work of its own. [ISSUE-TRIAGE-20261013]'
WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = 2037 AND status = 'open')
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence, triage_state = 'resolved',
  remediation = COALESCE(issue_triage.remediation || ' | ', '') || excluded.remediation;

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, remediation, close_evidence)
SELECT 2325, 'ISSUE-TRIAGE-20261013', 'resolved', 'session_01Kddqwk5gQT5qSSHVKjT2EA', datetime('now'),
  'ISSUE-TRIAGE-20261013: the named models recovered; closed by the rule qnfo-backlog-exec applies to MODEL-DEGRADED issues.',
  'Live read 2026-10-13T06:58Z of ai_model_health: deepseek-v4-flash-wa status ok, consecutive_failures 0, gateway_failures 0, last probe 2026-10-13 06:01:12Z; deepseek-v4-flash-thinking and deepseek-v4-pro (named in the description) status ok, consecutive_failures 0; 0 rows with status degraded fleet-wide. The closing rule is the one qnfo-backlog-exec/worker.js:419-431 applies (close a MODEL-DEGRADED issue when none of its named models is degraded), which had not closed this issue in 31 h. This closure was applied only because the same condition still held when the migration ran. [ISSUE-TRIAGE-20261013]'
WHERE EXISTS (SELECT 1 FROM agent_issues WHERE id = 2325 AND status = 'open')
  AND NOT EXISTS (SELECT 1 FROM ai_model_health WHERE status = 'degraded' AND model_id IN ('deepseek-v4-flash-wa', 'deepseek-v4-flash-thinking', 'deepseek-v4-pro'))
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence, triage_state = 'resolved',
  remediation = COALESCE(issue_triage.remediation || ' | ', '') || excluded.remediation;

UPDATE agent_issues SET status = 'closed', close_channel = 'issue-triage-20261013', updated_at = CAST(strftime('%s','now') AS INTEGER)*1000
WHERE id IN (1726, 2037, 2325)
  AND (status = 'open' OR close_channel = 'auto:triage-resolved-sync')
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = agent_issues.id AND instr(COALESCE(t.close_evidence, ''), '[ISSUE-TRIAGE-20261013]') > 0);

UPDATE remediation_contracts SET verify_transport = 'd1-query', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
  verify_probe = 'SELECT ''ok'' AS expected, COALESCE((SELECT CASE WHEN ts <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-26 hours'') THEN ''pending: the newest host census is older than 26 h ('' || ts || '')'' WHEN status = ''ok'' THEN ''ok'' ELSE ''pending: '' || COALESCE(text, status) || '' at '' || ts || '' (cloud_ops_events '' || id || '')'' END FROM cloud_ops_events WHERE id >= ''host-census-'' AND id < ''host-census.'' ORDER BY ts DESC LIMIT 1), ''pending: no host census recorded'') AS observed'
WHERE class = 'issue-2130' AND instr(verify_probe, 'which owns it for 48h') > 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2130 AND status = 'open');

UPDATE remediation_contracts SET verify_transport = 'code-read', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
  verify_probe = '{"paths": ["qnfo-ipatent/worker.js", "qnfo-ai-search/worker.js", "qnfo-paper-reviser/worker.js", "qnfo-errata-respond/worker.js", "qnfo-research-exec/worker.js"], "contains": "-GROUND-"}'
WHERE class = 'issue-2272' AND instr(verify_probe, 'jnl-referee/worker.js') > 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2272 AND status = 'open');

UPDATE remediation_contracts SET verify_transport = 'd1-query', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN COALESCE((SELECT MAX(run_at) FROM workers_bp_runs), '''') <= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-26 hours'') THEN ''pending: no workers best-practice audit run in 26 h'' WHEN (SELECT fail_count + advisory_count FROM workers_bp_runs ORDER BY run_at DESC LIMIT 1) = 0 THEN ''ok'' ELSE ''pending: the newest workers best-practice audit reads '' || (SELECT fail_count || '' fail and '' || advisory_count || '' advisory findings at '' || run_at FROM workers_bp_runs ORDER BY run_at DESC LIMIT 1) || '' (target 0)'' END AS observed'
WHERE class = 'issue-2346' AND instr(verify_probe, 'metric = ''workers_bp_findings''') > 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2346 AND status = 'open');

UPDATE remediation_contracts SET verify_transport = 'code-read', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
  verify_probe = '{"paths": ["scripts/workers_standards_guard.py", "scripts/fleet_best_practices_audit.py"], "contains": "re.compile(r\"\\.passThroughOnException\\s*\\(\")", "absent": "re.compile(r\"passThroughOnException\")"}'
WHERE class = 'issue-2366' AND instr(verify_probe, '\\\\.passThroughOnException') > 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2366 AND status = 'open');

UPDATE remediation_contracts SET verify_transport = 'code-read', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
  verify_probe = '{"paths": ["idea-hub/worker.js"], "contains": "IDEA-NOVELTY-1"}'
WHERE class = 'issue-2409' AND instr(verify_probe, 'qnfo-idea-triage/worker.js') > 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2409 AND status = 'open');

UPDATE remediation_contracts SET verify_transport = 'd1-query', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
  verify_probe = 'SELECT ''8'' AS expected, CAST((SELECT COUNT(DISTINCT w) FROM (SELECT resource_name AS w FROM deployment_history WHERE deployed_at > ''2026-10-12T08:00'' AND status = ''success'' UNION SELECT worker AS w FROM fleet_deploys WHERE ts > ''2026-10-12T08:00'' AND ok = 1) WHERE w IN (''qnfo-intent-orchestrator'', ''qnfo-cloud-ops'', ''qnfo-code-orchestrator'', ''qnfo-fleet-dashboard'', ''qnfo-gateway'', ''qnfo-fleet-control'', ''qnfo-social'', ''qnfo-ops'')) AS TEXT) AS observed'
WHERE class = 'issue-2419' AND instr(verify_probe, 'fleet_deploys') = 0 AND instr(verify_probe, 'deployment_history') > 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2419 AND status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA',
   'an open issue is closed only on a live read made now, and a contract that fails only because its probe is wrong gets a corrected probe rather than a hand closure, so the closing rule stays in the machine',
   'ISSUE-TRIAGE-20261013: triaged 141 open agent_issues; closed 3 (1726 and 2037 superseded, 2325 done) with guarded closures; corrected 6 probes that could never pass or were vacuous (2130, 2272, 2346, 2366, 2409, 2419); left 34 open with doer and blocker recorded; skipped 98 under the loop-owned, claim and 12-hour rules',
   'reads 2026-10-13T06:50Z-07:05Z: qnfo-audit (agent_issues, issue_triage, remediation_contracts, remediation_verifications, metric_registry, ai_model_health, workers_bp_runs, cloud_ops_events, fleet_deploys, deployment_history), GET fleet.qnfo.org/api/watchmaker, /health of qnfo-code-orchestrator and qnfo-fleet-dashboard, GitHub PR states 943-1016, code on origin/main b52b707 and at 2c088ea7',
   'pending: closures apply when the migration runs; 2272, 2366 and 2419 close through their contracts on the next remediation tick',
   'three issue rows and six remediation_contracts rows; no worker, cron or binding changes',
   'the Rollback header line: reopen 1726, 2037, 2325 and restore the six probes from bak_20261013_issue_triage_contracts',
   'six contracts that could not close their issues now judge the live defect, so the remediation tick can close 2272, 2366 and 2419 and will keep 2130, 2346 and 2409 open on real evidence',
   'issue 2366 closed within 24 h, and 2272 and 2419 the same way through their corrected contracts',
   'none directly; 2130 and 2409 now name their real gaps (lapsed spare domains still in the census; the novelty screen belongs in idea-hub)',
   'surfaces: d1-query qnfo-audit, runner-side curl of 6 census hosts, GitHub REST pulls and contents, code-read of main');

-- METRIC-TRIGGER-AUDIT-1 (2026-10-02, pillars: reach, autonomy). Applied live against qnfo-audit by the session that wrote
-- it (session_01GqJRHvJBRdDQ7aJgq79qTh/metric-triggers), statement by statement, 2026-10-02 10:50-11:20Z. Idempotent:
-- every statement is guarded, so re-running it is a no-op.
--
-- Scope: the open METRIC-TRIGGER issues this session held a work claim on (issue:1753, 1800, 1801, 1802, 1803). The other
-- eleven open METRIC-TRIGGER issues (1754-1756, 1780, 1792-1798) were claimed by other sessions at 10:41-10:42Z and are
-- not touched here. Every number below was read live in this session.
--
-- 1803 / #414 selected_works_citation_coverage = 3 (lt 7). Real gap with a doer in flight.
--   OpenAlex readings in 3 days cover 3 of the 7 PERF_SELECTED_DOIS (zenodo.21945415, 22026592, 22261547). Two code-loop
--   PRs addressed it: PR 500 (ct_gdbfo3zvil3rcc, issue 1786) appends the seven DOIs to runImpact's list, the actual edit;
--   PR 501 (ct_a3fqmb7yp3tgxt, issue 1803) only appends the comment "// METRIC-TRIGGER-414" to the anchor line. At 10:44Z
--   another session closed ct_gdbfo3zvil3rcc as a duplicate of the comment-only task, which left the no-op PR as the one
--   the merge runner would merge (both green on all required checks at 10:50Z): it would have counted as an autonomous fix
--   in autonomous_fixes_30d while the metric stayed at 3. Statement 1 swaps them back. A second limit: OpenAlex answers
--   404 for 10.5281/zenodo.23079905 (Zenodo record created 2026-10-01; its concept 10.5281/zenodo.23000536 is indexed), so
--   PR 500 reaches 6 of 7 until OpenAlex indexes it. The trigger's Edit line now names that next lever.
-- 1802 / #403 inbound_first_response_h_median_30d = 102.2 (gt 48). Real, self-clearing, no lever.
--   Recomputed from email_reply_queue with the INBOUND-SLA-1 formula: 14 human rows in the window, median 102.2h. All 10
--   rows above 48h were received 2026-09-06..2026-09-28, before INBOUND-SLA-1's first decisions (2026-10-02 07:30Z), and
--   inbound_unactioned_72h = 0. With no new mail the median first reads <= 48 (26.2h) when the 2026-09-20 row leaves the
--   window on 2026-10-20 ~21:00Z; new mail that INBOUND-SLA-1 handles inside its 24h grace brings that earlier. The
--   trigger's own first step says such rows need no action; the issue stays open on a probe.
-- 1753 / #341 subscribers_growth_monthly = 1 (lt 10). Measurement overcount corrected (1 -> 0); real gap.
--   subscribers holds 3 rows in its life: one 'subscribed' row on a fleet domain (@qnfo.org, confirmed 3 s after sign-up
--   through qnfo-gateway, a test) and two unconfirmed owner tests (2026-09-26). The refresh counted status='subscribed' by
--   created_at, so the fleet's own test read as growth. It now counts confirmations (confirmed_at, created_at for legacy
--   rows) in 30 days and excludes the fleet's own domains (the INBOUND-SLA-1 SLA_INTERNAL_RX list); the value drops to 0,
--   so this correction makes the metric worse, not better. The pipeline works (POST /api/subscribe answers 400 to a bad
--   address on qnfo.org and papers.qnfo.org; /api/confirm answers its own "Link not recognised" page; the box is on
--   qnfo.org, papers.qnfo.org/papers, every paper page and ipatent.qnfo.org) against engaged_human_sessions_28d 5780, so
--   nobody outside submits the form: the lever is the offer and its reach, not the pipeline. The action now says so.
-- 1800 / #379 breach_code_task_pct = 6.7 (lt 10): 1 of 15 breaching triggers (#414) carries a code-task line. Real gap.
--   Classified each breaching trigger's lever (statement 3e). Only two have a one-file lever the code loop may build:
--   #409/#354 (qnfo-research-exec glm-5.3 at max reasoning effort is the top attributed neuron consumer: 30 calls,
--   110,503 neurons, 3,683 per call in 7 days) and possibly #357 (watchmaker stalled runners). Those triggers belong to
--   issues other sessions hold (1780, 1795, 1796), so their actions are left to those holders. The rest are owner
--   decisions (#11, #353), an acting loop that files its own code tasks (#392 ASK-LOOP-1), time (#403, #342), D1 or
--   process levers (#362, #379, #386, #344), a reach offer with no one-file edit chosen yet (#341), or code in a worker
--   the code loop may not merge (#343 qnfo-fleet-control).
-- 1801 / #386 autonomous_fixes_30d = 0 (lt 1). Real gap; stage found: published but not merged, with a candidate-starvation
--   defect in the merge runner (statement 3d).
--
-- Rollback: restore from the infra_state rows written in statement 0:
--   backup-metric-refresh-20261002-metric-trigger-audit (fleet_tasks metric-refresh definition),
--   backup-registry-341-20261002-metric-trigger-audit (metric_registry subscribers_growth_monthly formula, source, baseline),
--   backup-triggers-20261002-metric-trigger-audit (analytics_metric_triggers 341, 379, 386, 403, 414: action, notes),
--   backup-contracts-20261002-metric-trigger-audit (remediation_contracts issue-1800..1803),
--   backup-triage-20261002-metric-trigger-audit (issue_triage remediation for 1753, 1800-1803),
--   backup-code-tasks-1803-20261002-metric-triggers (code_tasks ct_gdbfo3zvil3rcc, ct_a3fqmb7yp3tgxt: status, last_error).

-- 0. Backups.
INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-metric-refresh-20261002-metric-trigger-audit', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'fleet_tasks-backup', definition
FROM fleet_tasks WHERE id = 'metric-refresh';
INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-registry-341-20261002-metric-trigger-audit', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'metric_registry-backup', json_object('formula', formula, 'source_of_truth', source_of_truth, 'baseline', baseline, 'last_value', last_value)
FROM metric_registry WHERE metric = 'subscribers_growth_monthly';
INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-triggers-20261002-metric-trigger-audit', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'analytics_metric_triggers-backup', json_group_array(json_object('id', id, 'action', action, 'notes', notes))
FROM analytics_metric_triggers WHERE id IN (341, 379, 386, 403, 414);
INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-contracts-20261002-metric-trigger-audit', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'remediation_contracts-backup', json_group_array(json_object('class', class, 'verify_probe', verify_probe, 'status', status, 'action', action, 'max_attempts', max_attempts, 'expected_cadence_h', expected_cadence_h, 'attempts', attempts, 'last_verdict', last_verdict))
FROM remediation_contracts WHERE class IN ('issue-1800', 'issue-1801', 'issue-1802', 'issue-1803');
INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-triage-20261002-metric-trigger-audit', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'issue_triage-backup', json_group_array(json_object('issue_id', issue_id, 'remediation', remediation))
FROM issue_triage WHERE issue_id IN (1753, 1800, 1801, 1802, 1803);
INSERT OR IGNORE INTO infra_state (id, ts, kind, data)
SELECT 'backup-code-tasks-1803-20261002-metric-triggers', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'code_tasks-backup', json_group_array(json_object('id', id, 'status', status, 'last_error', last_error, 'updated_at', updated_at))
FROM code_tasks WHERE id IN ('ct_gdbfo3zvil3rcc', 'ct_a3fqmb7yp3tgxt');

-- 1. 1803: the real edit (PR 500) back in the merge runner's queue; the comment-only PR 501 out of it.
-- updated_at goes back to its value before the 10:44Z close (2026-10-02T10:00:43.121Z), so the task keeps its place in
-- the runner's candidate order.
UPDATE code_tasks
SET status = 'published', last_error = NULL, updated_at = '2026-10-02T10:00:43.121Z'
WHERE id = 'ct_gdbfo3zvil3rcc' AND status = 'closed' AND last_error LIKE 'closed by session autonomy-audit-2026-10-02: duplicate of ct_a3fqmb7yp3tgxt%';
UPDATE code_tasks
SET status = 'closed',
    last_error = 'closed by session_01GqJRHvJBRdDQ7aJgq79qTh/metric-triggers (holder of issue:1803) 2026-10-02T10:47Z: PR 501 diff is comment-only (appends "// METRIC-TRIGGER-414" to the anchor line; no DOI added), so it cannot move selected_works_citation_coverage and would count as an autonomous fix that fixed nothing. The real edit (the seven PERF_SELECTED_DOIS appended to runImpact) is ct_gdbfo3zvil3rcc / PR 500, restored to published. Close PR 501 unmerged.',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'ct_a3fqmb7yp3tgxt' AND status = 'published';

-- 2. 1753: subscribers_growth_monthly counts confirmations in 30 days, the fleet's own domains excluded (one occurrence
--    of the old expression in the definition, checked 2026-10-02 10:53Z).
UPDATE fleet_tasks
SET definition = replace(definition,
      'FROM subscribers WHERE status=''subscribed'' AND created_at > datetime(''now'',''-30 days'')',
      'FROM subscribers WHERE status=''subscribed'' AND COALESCE(confirmed_at, created_at) > datetime(''now'',''-30 days'') AND lower(email) NOT LIKE ''%@qnfo.org'' AND lower(email) NOT LIKE ''%@qnfo.net'' AND lower(email) NOT LIKE ''%@qnfo.uk'' AND lower(email) NOT LIKE ''%@q08.org'' AND lower(email) NOT LIKE ''%@qwav.%'' AND lower(email) NOT LIKE ''%@q-wave.tech'' AND lower(email) NOT LIKE ''%@qwave.tech'''),
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'metric-refresh'
  AND instr(definition, 'FROM subscribers WHERE status=''subscribed'' AND created_at > datetime(''now'',''-30 days'')') > 0;
UPDATE metric_registry
SET formula = 'count(subscribers WHERE status=''subscribed'' AND COALESCE(confirmed_at, created_at) >= now-30d AND the address is not on a fleet domain (qnfo.org, qnfo.net, qnfo.uk, q08.org, qwav.*, q-wave.tech, qwave.tech)): confirmed double opt-ins in 30 days from outside the fleet (METRIC-TRIGGER-AUDIT-1: the created_at count read a 2026-09-12 @qnfo.org test row as growth)',
    source_of_truth = 'qnfo-audit.subscribers (status=subscribed, confirmed_at, fleet domains excluded)',
    baseline = '0 external confirmed (2026-10-02: 3 rows in the table''s life, all owner or fleet tests)'
WHERE metric = 'subscribers_growth_monthly' AND instr(COALESCE(formula, ''), 'METRIC-TRIGGER-AUDIT-1') = 0;

-- 3a. #414: the Edit line names both steps, so a re-filed issue after PR 500 asks for the step still missing.
UPDATE analytics_metric_triggers
SET action = replace(action,
      'Edit: in runImpact add the seven selected DOIs (PERF_SELECTED_DOIS in qnfo-fleet-control) to list after the flagship set, slug selected:<doi> (see agent_issues 1786).',
      'Edit: in runImpact (1) add the seven selected DOIs (PERF_SELECTED_DOIS in qnfo-fleet-control) to list after the flagship set, slug selected:<doi> (PR 500, agent_issues 1786); (2) when api.openalex.org/works/doi:<doi> answers 404 for a selected DOI, read the Zenodo record''s conceptdoi (the zn record already fetched) and take cited_by_count from OpenAlex for that concept DOI (2026-10-02: 10.5281/zenodo.23079905 404, its concept 10.5281/zenodo.23000536 200). Do (2) only when (1) is already on main; a patch that changes nothing but a comment is not a fix.'),
    notes = COALESCE(notes, '') || ' | METRIC-TRIGGER-AUDIT-1 2026-10-02: Edit line names step (2), the OpenAlex 404 fallback; backup infra_state backup-triggers-20261002-metric-trigger-audit'
WHERE id = 414 AND instr(COALESCE(notes, ''), 'METRIC-TRIGGER-AUDIT-1') = 0
  AND instr(action, 'Edit: in runImpact add the seven selected DOIs') > 0;

-- 3b. #403: what was measured, so the next reader does not chase a lever that does not exist.
UPDATE analytics_metric_triggers
SET action = replace(action, ' Definition of done:',
      ' Measured 2026-10-02 11:00Z (METRIC-TRIGGER-AUDIT-1): 14 human rows in the window, median 102.2h; all 10 rows above 48h were received 2026-09-06..2026-09-28, before INBOUND-SLA-1''s first decisions (2026-10-02 07:30Z), and inbound_unactioned_72h = 0. With no new mail the median first reads 26.2h on 2026-10-20 ~21:00Z, when the 2026-09-20 row leaves the window. Act only if a row received after 2026-10-02 07:30Z waits over 48h for its first action. Definition of done:'),
    notes = COALESCE(notes, '') || ' | METRIC-TRIGGER-AUDIT-1 2026-10-02: measured legacy backlog note; backup infra_state backup-triggers-20261002-metric-trigger-audit'
WHERE id = 403 AND instr(COALESCE(notes, ''), 'METRIC-TRIGGER-AUDIT-1') = 0 AND instr(action, ' Definition of done:') > 0;

-- 3c. #341: the lever is the offer and its reach, not the pipeline.
UPDATE analytics_metric_triggers
SET action = 'Pillar reach. Confirmed subscriber growth from outside the fleet is under +10/month (review gate 2026-12-31 needs 50 confirmed). Measured 2026-10-02 (METRIC-TRIGGER-AUDIT-1): the subscribe box is live on qnfo.org, papers.qnfo.org/papers, every paper page and ipatent.qnfo.org; POST /api/subscribe and /api/confirm answer; yet subscribers holds 3 rows in its life, all owner or fleet tests, against engaged_human_sessions_28d 5780. Nobody outside submits the form, so fix the offer and its reach, not the pipeline. Levers, cheapest first: (1) carry the subscribe offer (one line and a UTM-tagged link to a page with the box) in the qnfo-social distribution posts (distribution_posts_30d 139); (2) REACH-IDEATION-1 subscribe-box ideas on surfaces without one (ideas.qnfo.org has none); (3) read submissions (pending rows, fleet domains excluded) as the leading signal before confirmations. Never add an address that did not sign up itself. Definition of done: metric_registry.subscribers_growth_monthly >= 10; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).',
    notes = COALESCE(notes, '') || ' | METRIC-TRIGGER-AUDIT-1 2026-10-02: action re-pointed from the pipeline (works) to the offer; formula now excludes fleet test rows; backup infra_state backup-triggers-20261002-metric-trigger-audit'
WHERE id = 341 AND instr(COALESCE(notes, ''), 'METRIC-TRIGGER-AUDIT-1') = 0;

-- 3d. #386: the stage where work stops, read 2026-10-02 10:45-11:10Z (the 11:00Z merge-runner tick included).
UPDATE analytics_metric_triggers
SET action = replace(action, ' Definition of done:',
      ' Measured 2026-10-02 11:10Z (METRIC-TRIGGER-AUDIT-1): the stage is "published but not merged". All seven code tasks with status merged were merged by a session (merged_by NULL: PRs 297, 368, 381, 431, 432, 476, 485), which the formula rightly does not count. CODE-TASK-MERGE-RUNNER-1 (first ok tick 04:00Z) has merged nothing: each tick decides only the 5 oldest-updated published tasks (CM_MAX_CANDIDATES 5, ORDER BY updated_at ASC, and a wait does not touch updated_at), so PRs that wait hold every slot (473, 474, 499: no required check has started, and on 473 and 499 only CodeQL ran; 475, 498: GitHub mergeability still null) while PRs behind them (500, 523-526) are not read. Also: q08 PRs 471/472 refused on a failed guard check; two tasks on one worker (498 and 500, qnfo-paper-indexer) bump VERSION from the same base, so the second conflicts once the first merges. Levers, in qnfo-fleet-control (not code-loop mergeable, so a session PR): choose candidates least-recently-checked first (merge_checked_at) instead of oldest-updated; requeue a same-worker VERSION conflict for a rebase instead of refusing it. Definition of done:'),
    notes = COALESCE(notes, '') || ' | METRIC-TRIGGER-AUDIT-1 2026-10-02: stage recorded; backup infra_state backup-triggers-20261002-metric-trigger-audit'
WHERE id = 386 AND instr(COALESCE(notes, ''), 'METRIC-TRIGGER-AUDIT-1') = 0 AND instr(action, ' Definition of done:') > 0;

-- 3e. #379: the classification, so the next pass starts from it.
UPDATE analytics_metric_triggers
SET action = replace(action, ' Definition of done:',
      ' Classified 2026-10-02 11:00Z (METRIC-TRIGGER-AUDIT-1), 15 breaching, 1 with a code-task (#414): one-file levers the code loop may build are #409/#354 (qnfo-research-exec: glm-5.3 at max reasoning effort, 3,683 neurons per call, the top attributed consumer in 7 days) and possibly #357 (a stalled watchmaker runner); owner decisions #11, #353; acting loop #392 (ASK-LOOP-1 files its own code tasks); time #403, #342; D1 or process #362, #379, #386, #344; a reach offer with no one-file edit chosen yet #341 (see its action); code the loop may not merge #343 (qnfo-fleet-control). Definition of done:'),
    notes = COALESCE(notes, '') || ' | METRIC-TRIGGER-AUDIT-1 2026-10-02: breach classification recorded; backup infra_state backup-triggers-20261002-metric-trigger-audit'
WHERE id = 379 AND instr(COALESCE(notes, ''), 'METRIC-TRIGGER-AUDIT-1') = 0 AND instr(action, ' Definition of done:') > 0;

-- 4. The issues say what was found and what closes them.
UPDATE issue_triage SET remediation = 'METRIC-TRIGGER-AUDIT-1 2026-10-02 (real gap; doer in flight): selected_works_citation_coverage = 3 of 7 (OpenAlex readings for zenodo.21945415, 22026592, 22261547). PR 500 (code task ct_gdbfo3zvil3rcc) adds the seven DOIs to runImpact and is back in the merge runner''s queue; PR 501 (ct_a3fqmb7yp3tgxt) changed only a comment and was taken out (code_tasks closed; close the PR unmerged). After PR 500 deploys, the 04:00Z run measures 6 of 7: OpenAlex answers 404 for zenodo.23079905 (created 2026-10-01). Next lever if it still 404s on 2026-10-09: the concept-DOI fallback named in trigger #414. If PR 498 (same worker) merges first, PR 500 conflicts on VERSION and needs a rebase. Closes on remediation_contracts issue-1803 (metric >= 7, fresh).'
WHERE issue_id = 1803 AND instr(COALESCE(remediation, ''), 'METRIC-TRIGGER-AUDIT-1') = 0;
UPDATE issue_triage SET remediation = 'METRIC-TRIGGER-AUDIT-1 2026-10-02 (real, self-clearing, no lever): inbound_first_response_h_median_30d = 102.2 over 14 human rows; all 10 above 48h were received 2026-09-06..09-28, before INBOUND-SLA-1''s first decisions (2026-10-02 07:30Z); inbound_unactioned_72h = 0; INBOUND-SLA-1 ran ok at 10:45Z. With no new mail the median reads 26.2 on 2026-10-20 ~21:00Z. Act only if a row received after 2026-10-02 07:30Z waits over 48h. Closes on remediation_contracts issue-1802 (numeric value <= 48, fresh).'
WHERE issue_id = 1802 AND instr(COALESCE(remediation, ''), 'METRIC-TRIGGER-AUDIT-1') = 0;
UPDATE issue_triage SET remediation = 'METRIC-TRIGGER-AUDIT-1 2026-10-02 (real gap): autonomous_fixes_30d = 0. Stage where work stops: published but not merged. Earlier code-loop merges were all by sessions (merged_by NULL, not counted). The merge runner has merged nothing: at 11:00Z it decided only the 5 oldest-updated published tasks, all waiting (473, 474, 499 no required check started; 475, 498 mergeability null), so PRs behind them (500, green on every required check; 523-526, opened at 11:00Z) were not read. Levers on trigger #386 (candidate order by merge_checked_at; requeue same-worker VERSION conflicts, 498 vs 500), both in qnfo-fleet-control. Closes on remediation_contracts issue-1801 (metric >= 1, fresh) once a runner-merged task is verified live.'
WHERE issue_id = 1801 AND instr(COALESCE(remediation, ''), 'METRIC-TRIGGER-AUDIT-1') = 0;
UPDATE issue_triage SET remediation = 'METRIC-TRIGGER-AUDIT-1 2026-10-02 (real gap): breach_code_task_pct = 6.7 (1 of 15 breaching triggers, #414, carries a code-task). Classification of every breaching lever is on trigger #379. The one-file levers the code loop may build (#409/#354 qnfo-research-exec reasoning effort, #357 watchmaker) sit on issues other sessions hold (1780, 1795, 1796); their holders add the code-task and code-anchor lines. Closes on remediation_contracts issue-1800 (metric >= 10 or n/a with none in breach, fresh).'
WHERE issue_id = 1800 AND instr(COALESCE(remediation, ''), 'METRIC-TRIGGER-AUDIT-1') = 0;
UPDATE issue_triage SET remediation = 'METRIC-TRIGGER-AUDIT-1 2026-10-02 (measurement corrected, real gap): the refresh counted one 2026-09-12 @qnfo.org test row as growth; it now counts confirmations from outside the fleet (value 0). The pipeline works (subscribe and confirm routes answer; the box is on qnfo.org, papers.qnfo.org, paper pages, ipatent.qnfo.org), but no outside visitor has submitted the form against 5780 engaged human sessions in 28 days. Levers on trigger #341 (the offer in distribution posts, a subscribe box on ideas.qnfo.org, read submissions first). Closes on remediation_contracts issue-1753 (metric >= 10).'
WHERE issue_id = 1753 AND instr(COALESCE(remediation, ''), 'METRIC-TRIGGER-AUDIT-1') = 0;

-- 5. Closing probes (REMEDIATION-TICK-1 runs them hourly; a pass closes the issue through
--    remediation_verification_autoclose_ins). Each was executed before commit and fails today (observed '0').
UPDATE remediation_contracts
SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN CAST(last_value AS REAL) >= 7 AND julianday(last_refreshed) >= julianday(''now'', ''-6 hours'') THEN ''1'' ELSE ''0'' END AS observed FROM metric_registry WHERE metric = ''selected_works_citation_coverage''',
    action = 'PR 500 (seven selected DOIs in qnfo-paper-indexer runImpact) merges and deploys; the 04:00Z run collects OpenAlex for them; the hourly PERFORMANCE-LOOP-1 refresh reads 7 of 7 (METRIC-TRIGGER-AUDIT-1)',
    status = 'active', verify_transport = 'd1-query', max_attempts = 1000, expected_cadence_h = 6, attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1803' AND status = 'needs-machine-probe';
UPDATE remediation_contracts
SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN trim(last_value) GLOB ''[0-9]*'' AND CAST(last_value AS REAL) <= 48 AND julianday(last_refreshed) >= julianday(''now'', ''-6 hours'') THEN ''1'' ELSE ''0'' END AS observed FROM metric_registry WHERE metric = ''inbound_first_response_h_median_30d''',
    action = 'none needed: the rows above 48h predate INBOUND-SLA-1 and leave the 30-day window by 2026-10-20 ~21:00Z; the 3-hourly INBOUND-SLA-1 metric refresh reads the median (METRIC-TRIGGER-AUDIT-1)',
    status = 'active', verify_transport = 'd1-query', max_attempts = 1000, expected_cadence_h = 6, attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1802' AND status = 'needs-machine-probe';
UPDATE remediation_contracts
SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN CAST(last_value AS REAL) >= 1 AND julianday(last_refreshed) >= julianday(''now'', ''-3 hours'') THEN ''1'' ELSE ''0'' END AS observed FROM metric_registry WHERE metric = ''autonomous_fixes_30d''',
    action = 'CODE-TASK-MERGE-RUNNER-1 merges a green code-loop PR, the canonical deploy ships it and the live audit marks it verified; the hourly metric-refresh counts it (METRIC-TRIGGER-AUDIT-1)',
    status = 'active', verify_transport = 'd1-query', max_attempts = 1000, expected_cadence_h = 3, attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1801' AND status = 'needs-machine-probe';
UPDATE remediation_contracts
SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN julianday(last_refreshed) >= julianday(''now'', ''-3 hours'') AND ((trim(last_value) GLOB ''[0-9]*'' AND CAST(last_value AS REAL) >= 10) OR trim(last_value) LIKE ''n/a%'') THEN ''1'' ELSE ''0'' END AS observed FROM metric_registry WHERE metric = ''breach_code_task_pct''',
    action = 'the holders of the issues behind #409/#354/#357 add code-task and code-anchor lines where the lever is one file, or breaches clear; the hourly metric-refresh reads the share (METRIC-TRIGGER-AUDIT-1)',
    status = 'active', verify_transport = 'd1-query', max_attempts = 1000, expected_cadence_h = 3, attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-1800' AND status = 'needs-machine-probe';

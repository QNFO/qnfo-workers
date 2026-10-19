-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT b.definition FROM bak_20261019_parked_rearm2_task b WHERE b.id = 'red-drain'), version = (SELECT b.version FROM bak_20261019_parked_rearm2_task b WHERE b.id = 'red-drain') WHERE id = 'red-drain'; UPDATE fleet_tasks_canonical SET definition = (SELECT b.definition FROM bak_20261019_parked_rearm2_task b WHERE b.id = 'red-drain') WHERE id = 'red-drain'
-- spof-review: none added; removes the alternate-hour probe gap PARKED-REARM-1 left
--
-- PARKED-REARM-2 (2026-10-19, pillar autonomy; follow-up to migrations/2026-10-19-parked-contract-rearm.sql, found live by the
-- fleet failure-mode triage thread). red-drain v3 ran at 06:36:42Z: step 2 escalated the only contract of open issues still failing
-- past 5x max_attempts (issue-2068, issue-2507, issue-99991), and step 6 skipped them because they had been verified within 50
-- minutes. The next run re-arms them and the one after escalates them again, so those issues were probed every other hour and
-- stayed in issues_unprobed_60m (about 25 of 120 at 06:30Z). Step 2 now leaves alone a contract that is the only live contract of
-- an open, non-METRIC-TRIGGER issue - the same rule step 6 re-arms by - so it keeps its hourly probe. red_snapshots still counts it
-- as a breach contract (step 4 reads active failing contracts). Step 6 stays as the safety net for anything parked another way.
--
-- REPO-SLUG-BARE-1 (same file, same red-drain version; found by the triage thread, LOOP-BREAKER issue 100050). Step 3 wrote
-- code_tasks.repo as REPLACE(<repo= value>, 'qnfo-workers', 'QNFO/qnfo-workers'), so an issue whose code-task line already said
-- repo=QNFO/qnfo-workers (issues 100020, 100025) became 'QNFO/QNFO/qnfo-workers' and every raw read was refused. code_tasks
-- holds bare slugs (all 107 rows of the last 2 days read 'qnfo-workers'; trigger code_tasks_repo_slug_ai strips one 'qnfo/'), so
-- step 3 now strips every 'QNFO/' and 'qnfo/' and defaults to 'qnfo-workers'. The table-side guard (2026-10-19-repo-slug-any-depth.sql,
-- triage thread) stays as the second path.

CREATE TABLE IF NOT EXISTS bak_20261019_parked_rearm2_task AS SELECT * FROM fleet_tasks WHERE id = 'red-drain';

UPDATE fleet_tasks SET
  definition = json_set(definition,
    '$.steps[3].sql', replace(replace(json_extract(definition, '$.steps[3].sql'),
        'COALESCE(REPLACE(CASE', 'COALESCE(REPLACE(REPLACE(CASE'),
        ',''qnfo-workers'',''QNFO/qnfo-workers''),''QNFO/qnfo-workers'')', ',''QNFO/'',''''),''qnfo/'',''''),''qnfo-workers'') /* REPO-SLUG-BARE-1 */'),
    '$.steps[2].sql', 'UPDATE remediation_contracts SET status=''escalated'',
        last_verdict=''escalated:over-retried (probe re-ran past 5x max_attempts with no code task in flight; parked for RED-DRAIN while the issue stays open)'',
        last_attempt_at=datetime(''now'')
      WHERE status IN (''active'',''holding'') AND last_verdict=''fail'' AND attempts > 5*COALESCE(max_attempts,3)
        AND substr(class,1,3) <> ''fm-'' AND substr(class,1,7) <> ''belief-''
        AND NOT EXISTS (SELECT 1 FROM code_tasks ct WHERE ct.status NOT IN (''closed'',''superseded'') AND ct.goal LIKE ''%#'' || remediation_contracts.issue_id || '' %'')
        AND NOT (issue_id IS NOT NULL
                 AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = ''open'' AND a.title NOT LIKE ''METRIC-TRIGGER-%'')
                 AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = remediation_contracts.issue_id AND c2.class <> remediation_contracts.class AND c2.status IN (''active'',''holding'')))
        /* PARKED-REARM-2 */'),
  version = version + 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'red-drain' AND json_array_length(definition, '$.steps') = 7
  AND instr(definition, 'PARKED-REARM-1') > 0 AND instr(definition, 'PARKED-REARM-2') = 0
  AND instr(json_extract(definition, '$.steps[2].sql'), 'escalated:over-retried') > 0;

UPDATE fleet_tasks_canonical SET
  definition = (SELECT t.definition FROM fleet_tasks t WHERE t.id = 'red-drain'),
  repo_path = 'migrations/2026-10-19-parked-contract-rearm-2.sql',
  exported_at = datetime('now')
WHERE id = 'red-drain'
  AND definition = (SELECT b.definition FROM bak_20261019_parked_rearm2_task b WHERE b.id = 'red-drain')
  AND instr((SELECT t.definition FROM fleet_tasks t WHERE t.id = 'red-drain'), 'PARKED-REARM-2') > 0;

UPDATE remediation_contracts SET status = 'active', next_due_at = datetime('now'),
       last_verdict = 'rearmed: PARKED-REARM-2 (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || ')'
 WHERE status = 'escalated' AND issue_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = remediation_contracts.issue_id AND a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%')
   AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id = remediation_contracts.issue_id AND c2.class <> remediation_contracts.class AND c2.status IN ('active', 'holding'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01X81kqL6v2eFPmyL3JayV1i', 'the only probe of an open issue runs every hour even while it keeps failing',
  'PARKED-REARM-2: red-drain step 2 no longer escalates the only live contract of an open non-METRIC-TRIGGER issue',
  'red-drain v3 run 2026-10-19 06:36:42Z re-escalated issue-2068, issue-2507 and issue-99991 that step 6 then skipped (verified within 50 minutes), an every-other-hour probe cadence',
  'migration merged', 'red-drain step 2 and the escalated contracts it re-arms', 'the Rollback header',
  'every open issue keeps an hourly probe', 'issues_unprobed_60m falls below its 06:30Z value of 120 within 120 minutes of the apply', 'none',
  'd1:qnfo-audit fleet_tasks, remediation_contracts, remediation_verifications, fleet_runs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PARKED-REARM-2:') = 1);

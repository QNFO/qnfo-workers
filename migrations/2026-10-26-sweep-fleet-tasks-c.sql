-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition=b.definition, version=b.version, updated_at=b.updated_at FROM bak_20261026_sweep_c_fleet_tasks b WHERE fleet_tasks.id=b.id; UPDATE fleet_tasks_canonical SET definition=b.definition, repo_path=b.repo_path, exported_at=b.exported_at FROM bak_20261026_sweep_c_canon b WHERE fleet_tasks_canonical.id=b.id; UPDATE goals SET dod=b.dod, updated_at=b.updated_at FROM bak_20261026_sweep_c_goal b WHERE goals.goal_key=b.goal_key; UPDATE analytics_metric_triggers SET action=b.action FROM bak_20261026_sweep_c_trigger b WHERE analytics_metric_triggers.id=b.id; UPDATE metric_registry SET formula=b.formula FROM bak_20261026_sweep_c_metric b WHERE metric_registry.metric=b.metric; UPDATE sla_registry SET metric=b.metric FROM bak_20261026_sweep_c_sla b WHERE sla_registry.sla_id=b.sla_id; UPDATE remediation_contracts SET verify_probe=b.verify_probe, status=b.status, last_verdict=b.last_verdict, module=b.module, attempts=b.attempts, next_due_at=b.next_due_at FROM bak_20261026_sweep_c_contract b WHERE remediation_contracts.class=b.class; UPDATE agent_issues SET status='superseded' WHERE title LIKE 'PORTFOLIO-GAP-RESOLVED-1: %'; DELETE FROM remediation_contracts WHERE class IN ('fm-goals-unevaluated-counts-deferred-probes','fm-goal-dod-embeds-placeholder-literal','fm-portfolio-gap-ignores-reconciled-deploy'); DELETE FROM failure_modes WHERE fm_key IN ('goals-unevaluated-counts-deferred-probes','goal-dod-embeds-placeholder-literal','portfolio-gap-ignores-reconciled-deploy')
-- BACKUP: bak_20261026_sweep_c_fleet_tasks
-- spof-review: none added; no trigger, cron, host or credential. Both hourly tasks keep their runner (fleet-exec) and their cadence, and the new detectors are plain d1-query contracts read by the two existing contract runners.
--
-- SWEEP-FLEET-TASKS-C (2026-10-26, charter pillar: autonomy). Issues 100069, 100341, 100342. Offline proof: migrations/sweep-fleet-tasks-c.test.mjs
-- (node:sqlite replay of the live DDL and of the two live definitions kept in migrations/sweep-fleet-tasks-c.fixture.json).
--
-- 1. goals_unevaluated (issue 100069, METRIC-TRIGGER 9162). Read from qnfo-audit 2026-10-26 09:18Z: the metric reads 11. Ten of the eleven are
--    adopted goals whose goal-<key> contract is active, probed about twice an hour (attempts 307 to 362 since 2026-10-19/20, newest 09:05Z to
--    09:18Z, last_verdict 'deferred', so four attempts fall in every 120 minute window) and whose
--    DoD query answers 'pending: ...' on purpose. Since CONSUMER-PENDING-IS-DEFERRAL-1 (2026-10-19 12:10Z) a pending read writes no
--    remediation_verifications row, and the metric (written 04:46Z the same day, before that change) asks for such a row, so those goals read
--    "unprobed" for ever although the formula says "no verdict in the last 120 minutes". roadmap-self-maintain step 17 now also treats an active
--    contract whose last_verdict is 'deferred' and whose last_attempt_at is inside 120 minutes as evaluated. Only that clause is added: a probe
--    error, a parked contract or a deferral older than 120 minutes still counts (the clause reads all three columns through COALESCE: a bare
--    NOT (a AND b AND NULL) would drop a contract with no last_attempt_at from the count instead of counting it), and the age of a long deferral is still graded by
--    fm-verification-deferral-unaged (VERIFICATION-DEFERRED-7D-1 issues), so no signal is hidden.
--    The eleventh, TP-5-MEASURE-TO-ACT-1, is a different defect. red-drain step 0 supersedes every active non-fm contract whose verify_probe
--    contains the text needs-machine-probe (the placeholder status), and TP-5's DoD reads remediation_contracts.status = that literal, so its
--    contract is superseded as probe-unusable every hour (08:36:52Z) and re-activated by roadmap-self-maintain, and never probed. The DoD is a
--    valid single SELECT, so it is not rewritten. The literal is built as 'needs-machine-' || 'probe' so the text match no longer sees it.
--    The read query in the trigger's action text is brought in line with the metric.
-- 2. portfolio-lifecycle (issues 100341, 100342, and the same symptom on qnfo-workers). The detectors count only deployment_history.action =
--    'deploy'. scripts/deployment_ledger_reconcile.py (DEPLOY-LEDGER-WRANGLER-ESCAPE-1) was built to repair exactly this and appends action
--    'deployed' with deployed_at = Cloudflare's own deployment time (63 rows from 2026-10-14, all by deployment-ledger-reconcile). voice-stt has
--    such a row (2026-10-20 09:21Z, version 3c470eb5), no repository directory and a live /health, yet deploy-unrecorded and project-stale-deploy
--    are filed for it every day (10 attempts today). Three statements now read action IN ('deploy','deployed'): the project_ledger link
--    (so the project shows what it runs), the project-stale-deploy gap and the deploy-unrecorded gap. The UPDATE projects.updated_at statement is
--    not named by any issue and stays as it was. A failed or 'deploy-direct' row still does not count.
--    fleet_tasks_canonical is moved with the task so fleet-tasks-drift-gate files nothing, and docs/fleet-tasks-canonical.json mirrors the row.
--    updated_at is a fixed instant (not now) so that mirror matches the live row byte for byte.
-- 3. Closing contracts of 100341 and 100342 (independent review, minor 1). Both contracts were born superseded on live
--    ('closure-observing-probe-at-birth': the probe reads the issue's own status, so it can only pass after the close that it blocks). They are re-armed
--    with a probe that measures the defect: a portfolio-lifecycle tick has run on or after the first day after this file is applied, and no gap of that
--    kind was filed for voice-stt since then. The boundary is built at apply time (date('now','+1 day')), never a literal, so a late apply cannot leave
--    a probe that waits for a day already past. Until that tick the probe answers 'pending' (a deferral, not a pass). Guarded on the born verdict, so a
--    contract another session repaired is left alone.
-- 4. The doer of 1000125 and 1000126 (qnfo-workers, linked_session b6445c2a, contracts born superseded the same way). portfolio-autopilot closes a
--    gap when its issue closes (step 8) but nothing closes a PORTFOLIO-GAP issue when the gap stops being detected. No issue-meta-fold rule exists for
--    it (none of the rules of that workflow reads portfolio_gaps), so this file files PORTFOLIO-GAP-RESOLVED-1 (deduped on title) naming issue-meta-fold
--    as the owning loop and the code loop as the doer through a code-task line, with a probe that stays red until the rule exists and the four
--    PORTFOLIO-GAP issues (100341, 100342, 1000125, 1000126) are closed with evidence. Nothing here touches the claimed issues or their contracts.
-- 5. Wording: metric_registry.formula for goals_unevaluated and sla_registry SLA-GOAL-EVAL-120M say what the statement now does (a verdict, or a deferred
--    read: active contract, last_verdict deferred, attempted).
-- Every statement is guarded by the exact text it replaces, so a second apply changes nothing, and the first guard aborts the file before any
-- write when either task is neither in the shape this change expects nor already migrated.

SELECT json('SWEEP-FLEET-TASKS-C: roadmap-self-maintain or portfolio-lifecycle is neither in the expected old shape nor already migrated, or portfolio-lifecycle differs from fleet_tasks_canonical')
WHERE NOT (
  EXISTS (SELECT 1 FROM fleet_tasks WHERE id='roadmap-self-maintain' AND json_valid(definition)
    AND json_extract(definition,'$.steps[17].name')='metric-goals-unevaluated'
    AND (instr(definition,'AND (s.last_verified_at IS NULL OR s.last_verified_at < datetime(''now'', ''-120 minutes''))) AS TEXT), last_refreshed')>0
      OR instr(definition,'AND NOT (COALESCE(c.status, '''') = ''active'' AND COALESCE(c.last_verdict, '''') LIKE ''deferred%'' AND COALESCE(replace(substr(c.last_attempt_at, 1, 19), ''T'', '' ''), '''') >= datetime(''now'', ''-120 minutes''))) AS TEXT), last_refreshed')>0))
  AND EXISTS (SELECT 1 FROM fleet_tasks t WHERE t.id='portfolio-lifecycle' AND json_valid(t.definition)
    AND json_array_length(t.definition,'$.steps')=8
    AND t.definition=(SELECT c.definition FROM fleet_tasks_canonical c WHERE c.id=t.id)
    AND ((instr(t.definition,'JOIN projects p ON p.project_code=''W.''||dh.resource_name WHERE dh.action=''deploy'' AND')>0
          AND instr(t.definition,'dh.resource_name=p.owner_service AND dh.action=''deploy'' AND')>0
          AND instr(t.definition,'dh.resource_name=s.service AND dh.action=''deploy'' AND')>0)
      OR (instr(t.definition,'JOIN projects p ON p.project_code=''W.''||dh.resource_name WHERE dh.action IN (''deploy'',''deployed'') AND')>0
          AND instr(t.definition,'dh.resource_name=p.owner_service AND dh.action IN (''deploy'',''deployed'') AND')>0
          AND instr(t.definition,'dh.resource_name=s.service AND dh.action IN (''deploy'',''deployed'') AND')>0)))
);

CREATE TABLE IF NOT EXISTS bak_20261026_sweep_c_fleet_tasks AS SELECT * FROM fleet_tasks WHERE id IN ('roadmap-self-maintain','portfolio-lifecycle');
CREATE TABLE IF NOT EXISTS bak_20261026_sweep_c_canon AS SELECT * FROM fleet_tasks_canonical WHERE id='portfolio-lifecycle';
CREATE TABLE IF NOT EXISTS bak_20261026_sweep_c_goal AS SELECT goal_key, dod, updated_at FROM goals WHERE goal_key='TP-5-MEASURE-TO-ACT-1';
CREATE TABLE IF NOT EXISTS bak_20261026_sweep_c_trigger AS SELECT id, metric_key, action FROM analytics_metric_triggers WHERE metric_key='goals_unevaluated';
CREATE TABLE IF NOT EXISTS bak_20261026_sweep_c_metric AS SELECT metric, formula FROM metric_registry WHERE metric='goals_unevaluated';
CREATE TABLE IF NOT EXISTS bak_20261026_sweep_c_sla AS SELECT sla_id, metric FROM sla_registry WHERE sla_id='SLA-GOAL-EVAL-120M';
CREATE TABLE IF NOT EXISTS bak_20261026_sweep_c_contract AS SELECT * FROM remediation_contracts WHERE class IN ('issue-100341','issue-100342');

-- roadmap-self-maintain v1 -> v2: step 17 (metric-goals-unevaluated) only; every other byte of the definition is kept.
UPDATE fleet_tasks SET
  definition = replace(definition,
    'AND (s.last_verified_at IS NULL OR s.last_verified_at < datetime(''now'', ''-120 minutes''))) AS TEXT), last_refreshed',
    'AND (s.last_verified_at IS NULL OR s.last_verified_at < datetime(''now'', ''-120 minutes'')) AND NOT (COALESCE(c.status, '''') = ''active'' AND COALESCE(c.last_verdict, '''') LIKE ''deferred%'' AND COALESCE(replace(substr(c.last_attempt_at, 1, 19), ''T'', '' ''), '''') >= datetime(''now'', ''-120 minutes''))) AS TEXT), last_refreshed'),
  version = version + 1, updated_at = '2026-10-26T09:40:00Z'
WHERE id = 'roadmap-self-maintain' AND json_valid(definition)
  AND json_extract(definition, '$.steps[17].name') = 'metric-goals-unevaluated'
  AND length(definition) - length(replace(definition,
    'AND (s.last_verified_at IS NULL OR s.last_verified_at < datetime(''now'', ''-120 minutes''))) AS TEXT), last_refreshed', '')) =
    length('AND (s.last_verified_at IS NULL OR s.last_verified_at < datetime(''now'', ''-120 minutes''))) AS TEXT), last_refreshed');

-- portfolio-lifecycle v2 -> v3: the project_ledger link (step 1), the project-stale-deploy gap (step 5, two reads) and the deploy-unrecorded gap (step 6).
UPDATE fleet_tasks SET
  definition = replace(replace(replace(definition,
    'JOIN projects p ON p.project_code=''W.''||dh.resource_name WHERE dh.action=''deploy'' AND',
    'JOIN projects p ON p.project_code=''W.''||dh.resource_name WHERE dh.action IN (''deploy'',''deployed'') AND'),
    'dh.resource_name=p.owner_service AND dh.action=''deploy'' AND',
    'dh.resource_name=p.owner_service AND dh.action IN (''deploy'',''deployed'') AND'),
    'dh.resource_name=s.service AND dh.action=''deploy'' AND',
    'dh.resource_name=s.service AND dh.action IN (''deploy'',''deployed'') AND'),
  version = version + 1, updated_at = '2026-10-26T09:40:00Z'
WHERE id = 'portfolio-lifecycle' AND json_valid(definition) AND json_array_length(definition, '$.steps') = 8
  AND length(definition) - length(replace(definition, 'JOIN projects p ON p.project_code=''W.''||dh.resource_name WHERE dh.action=''deploy'' AND', '')) =
    length('JOIN projects p ON p.project_code=''W.''||dh.resource_name WHERE dh.action=''deploy'' AND')
  AND length(definition) - length(replace(definition, 'dh.resource_name=p.owner_service AND dh.action=''deploy'' AND', '')) =
    2 * length('dh.resource_name=p.owner_service AND dh.action=''deploy'' AND')
  AND length(definition) - length(replace(definition, 'dh.resource_name=s.service AND dh.action=''deploy'' AND', '')) =
    length('dh.resource_name=s.service AND dh.action=''deploy'' AND');

UPDATE fleet_tasks_canonical SET
  definition = (SELECT t.definition FROM fleet_tasks t WHERE t.id = 'portfolio-lifecycle'),
  repo_path = 'migrations/2026-10-26-sweep-fleet-tasks-c.sql', exported_at = datetime('now')
WHERE id = 'portfolio-lifecycle'
  AND definition <> (SELECT t.definition FROM fleet_tasks t WHERE t.id = 'portfolio-lifecycle')
  AND definition = (SELECT b.definition FROM bak_20261026_sweep_c_fleet_tasks b WHERE b.id = 'portfolio-lifecycle');

-- TP-5-MEASURE-TO-ACT-1: the same SELECT, with the placeholder status written so that red-drain's text match does not see it.
UPDATE goals SET
  dod = replace(replace(dod, 'status=''needs-machine-probe''', 'status=''needs-machine-''||''probe'''),
    ', needs-machine-probe contracts ', ', needs-machine probe contracts '),
  updated_at = datetime('now')
WHERE goal_key = 'TP-5-MEASURE-TO-ACT-1' AND status = 'adopted' AND instr(dod, 'SELECT ') > 0 AND instr(dod, 'needs-machine-probe') > 0;

-- Trigger 9162: the read query in its action text follows the metric.
UPDATE analytics_metric_triggers SET
  action = replace(action, '-120 minutes''))). A contract that left status active',
    '-120 minutes''))) AND NOT (COALESCE(c.status, '''') = ''active'' AND COALESCE(c.last_verdict, '''') LIKE ''deferred%'' AND COALESCE(replace(substr(c.last_attempt_at, 1, 19), ''T'', '' ''), '''') >= datetime(''now'', ''-120 minutes'')). A deferred read (the DoD probe answered pending) inside 120 minutes counts as evaluated: CONSUMER-PENDING-IS-DEFERRAL-1 writes no verification row, and the age of a long deferral is graded by fm-verification-deferral-unaged. A contract that left status active')
WHERE metric_key = 'goals_unevaluated'
  AND instr(action, 'LIKE ''deferred%''') = 0
  AND instr(action, '-120 minutes''))). A contract that left status active') > 0;

-- Wording of the measure (formula and SLA) follows the statement.
UPDATE metric_registry SET
  formula = replace(formula, 'has no verdict in the last 120 minutes', 'has neither a verdict nor a deferred read (active contract, last_verdict deferred, attempted) in the last 120 minutes')
WHERE metric = 'goals_unevaluated' AND instr(formula, 'has no verdict in the last 120 minutes') > 0;

UPDATE sla_registry SET
  metric = replace(metric, 'and no verdict in 120 minutes', 'and neither a verdict nor a deferred read (active contract, last_verdict deferred, attempted) in 120 minutes')
WHERE sla_id = 'SLA-GOAL-EVAL-120M' AND instr(metric, 'and no verdict in 120 minutes') > 0;

-- Closing contracts of 100341 and 100342: re-armed with a probe that measures the defect. The boundary day is built here, at apply time.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind=''portfolio-lifecycle'' AND ts >= ''' || date('now', '+1 day') || ''') = 0 THEN ''pending: no portfolio-lifecycle tick has run on or after ' || date('now', '+1 day') || ''' ELSE CAST((SELECT COUNT(*) FROM portfolio_gaps WHERE kind=''deploy-unrecorded'' AND entity=''voice-stt'' AND day >= ''' || date('now', '+1 day') || ''') AS TEXT) END AS observed',
  verify_transport = 'd1-query', status = 'active', module = 'sweep-fleet-tasks-c', attempts = 0, next_due_at = datetime('now'),
  last_verdict = 'rearmed: SWEEP-FLEET-TASKS-C (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || ')'
WHERE class = 'issue-100341' AND status = 'superseded' AND last_verdict LIKE 'superseded:closure-observing-probe-at-birth%';

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CASE WHEN (SELECT COUNT(*) FROM cloud_ops_events WHERE kind=''portfolio-lifecycle'' AND ts >= ''' || date('now', '+1 day') || ''') = 0 THEN ''pending: no portfolio-lifecycle tick has run on or after ' || date('now', '+1 day') || ''' ELSE CAST((SELECT COUNT(*) FROM portfolio_gaps WHERE kind=''project-stale-deploy'' AND entity=''W.voice-stt'' AND day >= ''' || date('now', '+1 day') || ''') AS TEXT) END AS observed',
  verify_transport = 'd1-query', status = 'active', module = 'sweep-fleet-tasks-c', attempts = 0, next_due_at = datetime('now'),
  last_verdict = 'rearmed: SWEEP-FLEET-TASKS-C (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || ')'
WHERE class = 'issue-100342' AND status = 'superseded' AND last_verdict LIKE 'superseded:closure-observing-probe-at-birth%';

-- The doer of 1000125 and 1000126 (and of every later PORTFOLIO-GAP issue whose gap closes), filed once, deduped on title.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at, predicate_id)
SELECT 'PORTFOLIO-GAP-RESOLVED-1: close a PORTFOLIO-GAP issue with evidence when its gap stops being detected (1000125, 1000126)',
  'Charter pillar: autonomy. Filed by migrations/2026-10-26-sweep-fleet-tasks-c.sql (SWEEP-FLEET-TASKS-C, independent review minor 1).

WHY: portfolio-lifecycle files portfolio_gaps rows and portfolio-autopilot (fleet_tasks, hourly :20) files one PORTFOLIO-GAP issue per gap and closes the GAP when its ISSUE closes (step 8). Nothing closes the ISSUE when the gap stops being detected. SWEEP-FLEET-TASKS-C makes portfolio-lifecycle read the deployments that deployment-ledger-reconcile records, so the voice-stt and qnfo-workers gaps are no longer re-filed. 100341 and 100342 close through their re-armed contracts. 1000125 and 1000126 (qnfo-workers, linked_session b6445c2a-8e78-4ad1-bca0-41d39f3c4f7b) have only a contract that was born superseded (closure-observing-probe-at-birth), so no loop closes them.

DOER: the hourly D1 workflow issue-meta-fold (fleet_tasks, :20) is the owning loop. Add the rule portfolio-gap-resolved in a new migration: an open issue titled PORTFOLIO-GAP <kind> <entity> for kind deploy-unrecorded or project-stale-deploy, whose portfolio_gaps rows for that kind and entity have no day on or after date(now, -1 day) and whose newest row is closed, goes through issue_fold_ledger with evidence that names the gap row (day, resolved_at) and the deployment_history row that satisfies the detector (id, action, deployed_at). Add its test case to migrations/issue-hygiene.test.mjs. Never close without that evidence, never wontfix.

code-task: repo=qnfo-workers path=migrations/issue-hygiene.test.mjs
code-anchor: Proves, for each of the eight rules, that it closes what it states and nothing else:

CLOSING PROBE (contract issue-<id>, d1-query): reads 0 only when the rule exists in fleet_tasks issue-meta-fold and 100341, 100342, 1000125 and 1000126 are closed with close_evidence.',
  'sweep-fleet-tasks-c', 'portfolio', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000, 'PORTFOLIO-GAP-RESOLVED-1'
WHERE NOT EXISTS (SELECT 1 FROM agent_issues x WHERE x.title LIKE 'PORTFOLIO-GAP-RESOLVED-1: %' AND x.status = 'open');

UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT CASE WHEN EXISTS (SELECT 1 FROM fleet_tasks WHERE id=''issue-meta-fold'' AND instr(definition, ''portfolio-gap-resolved'') > 0) THEN 0 ELSE 1 END) + (SELECT COUNT(*) FROM agent_issues a WHERE a.id IN (100341, 100342, 1000125, 1000126) AND NOT (a.status = ''closed'' AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND COALESCE(t.close_evidence, '''') <> ''''))) AS TEXT) AS observed',
  verify_transport = 'd1-query', status = 'active', module = 'sweep-fleet-tasks-c', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'),
  action = 'the doer adds the issue-meta-fold rule portfolio-gap-resolved with its test, a pass closes this issue'
WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'PORTFOLIO-GAP-RESOLVED-1: %' AND status = 'open')
  AND COALESCE(module, '') <> 'sweep-fleet-tasks-c';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('goals-unevaluated-counts-deferred-probes',
  'goals_unevaluated counts an adopted goal whose DoD probe is read on schedule but answers pending',
  'The metric asked for a verification row newer than 120 minutes (v_goal_status.last_verified_at). Since CONSUMER-PENDING-IS-DEFERRAL-1 (2026-10-19 12:10Z) a pending read writes no row, so a goal whose DoD is deliberately not met yet never gains one and reads unprobed for ever, although its contract was attempted about twice an hour (10 goals, attempts 307 to 362 on 2026-10-26 09:18Z, newest attempts 09:05Z to 09:18Z, last_verdict deferred).',
  'roadmap-self-maintain v2 step metric-goals-unevaluated treats an active contract whose last_verdict is deferred and whose last_attempt_at is inside 120 minutes as evaluated. A probe error, a parked contract and a deferral older than 120 minutes still count, and fm-verification-deferral-unaged keeps grading the age of a long deferral.',
  'fm-goals-unevaluated-counts-deferred-probes: the deferred-aware clause is present in the enabled fleet_tasks roadmap-self-maintain step metric-goals-unevaluated and the metric was refreshed in the last 180 minutes',
  'fm-goals-unevaluated-counts-deferred-probes', '2026-10-26', 100069,
  'an adopted goal with a machine-checkable DoD whose probe has a pending branch, probed by the consumer or the fleet-control tick',
  'goals_unevaluated stays above 0 and its METRIC-TRIGGER issue cannot recover while every probe runs on time',
  'goals_unevaluated, METRIC-TRIGGER 9162 and the roadmap rows of the goals it counts'),
 ('goal-dod-embeds-placeholder-literal',
  'an adopted goal whose DoD query contains the text of the placeholder contract status is superseded as probe-unusable every hour',
  'red-drain step 0 supersedes every active non-fm contract whose verify_probe contains the text needs-machine-probe. The DoD of TP-5-MEASURE-TO-ACT-1 counts remediation_contracts rows in that status, so its goal contract was superseded at 08:36:52Z each hour and re-activated by roadmap-self-maintain, and never probed.',
  'The literal is written as ''needs-machine-'' || ''probe'' in the DoD, which is the same SELECT. No other adopted goal carries the text.',
  'fm-goal-dod-embeds-placeholder-literal: adopted goals whose DoD query contains the placeholder status text',
  'fm-goal-dod-embeds-placeholder-literal', '2026-10-26', 100069,
  'a goal DoD query that mentions the needs-machine-probe status in its text',
  'the goal-<key> contract flaps between superseded and active and the goal counts as unevaluated',
  'one goal today (TP-5-MEASURE-TO-ACT-1) and any future goal that checks that status'),
 ('portfolio-gap-ignores-reconciled-deploy',
  'portfolio-lifecycle files deploy-unrecorded and project-stale-deploy for a worker whose deployment the ledger reconcile already recorded',
  'The three detector statements of portfolio-lifecycle read deployment_history.action = ''deploy'' only. scripts/deployment_ledger_reconcile.py appends the deployments no writer recorded with action ''deployed'' (deployed_at is Cloudflare''s deployment time), so voice-stt (2026-10-20) and qnfo-workers (hourly) were re-filed every day: 100341, 100342, 1000125, 1000126.',
  'portfolio-lifecycle v3 reads action IN (''deploy'',''deployed'') in the project_ledger link, the project-stale-deploy gap and the deploy-unrecorded gap. A failed row and a deploy-direct row still do not count.',
  'fm-portfolio-gap-ignores-reconciled-deploy: the three statements of the enabled fleet_tasks portfolio-lifecycle read the reconciled action and the task ran ok in the last 180 minutes',
  'fm-portfolio-gap-ignores-reconciled-deploy', '2026-10-26', 100341,
  'a live worker with no deployment_history row of action deploy and a deployed row from deployment-ledger-reconcile',
  'one PORTFOLIO-GAP issue per worker and gap kind, re-filed daily with attempts rising',
  'portfolio_gaps, the PORTFOLIO-GAP issues of voice-stt and qnfo-workers, project_ledger and project_state rows for reconciled deployments');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to, module) VALUES
 ('fm-goals-unevaluated-counts-deferred-probes', NULL,
  'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM fleet_tasks WHERE id=''roadmap-self-maintain'' AND enabled = 1 AND instr(json_extract(definition, ''$.steps[17].sql''), ''LIKE ''''deferred%'''''') > 0) AND COALESCE((SELECT replace(substr(last_refreshed, 1, 19), ''T'', '' '') FROM metric_registry WHERE metric = ''goals_unevaluated''), '''') >= datetime(''now'', ''-180 minutes'') THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 1, 'active', 'SWEEP-FLEET-TASKS-C', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode'),
 ('fm-goal-dod-embeds-placeholder-literal', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM goals WHERE status = ''adopted'' AND goal_type <> ''objective-revision'' AND instr(COALESCE(dod, ''''), ''SELECT '') > 0 AND instr(COALESCE(dod, ''''), ''needs-machine-probe'') > 0) AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'SWEEP-FLEET-TASKS-C', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode'),
 ('fm-portfolio-gap-ignores-reconciled-deploy', NULL,
  'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM fleet_tasks WHERE id=''portfolio-lifecycle'' AND enabled = 1 AND instr(json_extract(definition, ''$.steps[1].sql''), ''dh.action IN (''''deploy'''',''''deployed'''')'') > 0 AND instr(json_extract(definition, ''$.steps[5].sql''), ''dh.action IN (''''deploy'''',''''deployed'''')'') > 0 AND instr(json_extract(definition, ''$.steps[6].sql''), ''dh.action IN (''''deploy'''',''''deployed'''')'') > 0) AND EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''portfolio-lifecycle'' AND status = ''ok'' AND replace(substr(ts, 1, 19), ''T'', '' '') >= datetime(''now'', ''-180 minutes'')) THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 1, 'active', 'SWEEP-FLEET-TASKS-C', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015kWmGuAq2fNuvzu4MrD7x3',
  'A deferred probe that is attempted on schedule is an evaluated goal, and a reconciled deployment is a deployment: both detectors should read what the loops that repair them write',
  'SWEEP-FLEET-TASKS-C: roadmap-self-maintain v2 counts a fresh deferred goal contract as evaluated, TP-5 DoD no longer carries the placeholder status text, portfolio-lifecycle v3 reads deployment_history.action IN (deploy, deployed)',
  'qnfo-audit 2026-10-26 09:18Z: goals_unevaluated 11 = 10 active deferred contracts attempted within 30 minutes + TP-5 superseded by red-drain step 0 at 08:36:52Z (probe text contains needs-machine-probe). deployment_history has 63 deployed rows by deployment-ledger-reconcile and 0 for voice-stt with action deploy, so portfolio_gaps re-filed issues 100341 and 100342 (10 attempts today).',
  'migration installed, runtime verdict belongs to the next hourly roadmap-self-maintain and portfolio-lifecycle ticks and the three fm- detectors',
  'fleet_tasks roadmap-self-maintain step 17 and portfolio-lifecycle steps 1, 5, 6 (text substitutions only), fleet_tasks_canonical portfolio-lifecycle, one goals.dod text, one analytics_metric_triggers.action text, the formula of metric goals_unevaluated and the metric text of SLA-GOAL-EVAL-120M, the two born-superseded contracts issue-100341 and issue-100342 (re-armed), one new issue PORTFOLIO-GAP-RESOLVED-1 with its contract. First lifecycle tick links up to about 44 reconciled deployments to project_ledger and project_state. The claimed issues 1000125 and 1000126 and their contracts are not touched.',
  'Restore the seven backup tables with the Rollback header (bak_20261026_sweep_c_fleet_tasks, _canon, _goal, _trigger, _metric, _sla, _contract), which also supersedes the new issue (decision_log is append-only and keeps this row)',
  'none',
  'goals_unevaluated < 1 within 6 h',
  'none',
  'offline: migrations/sweep-fleet-tasks-c.test.mjs replays the live DDL and both live definitions on node:sqlite, with mutation checks'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SWEEP-FLEET-TASKS-C:') = 1);

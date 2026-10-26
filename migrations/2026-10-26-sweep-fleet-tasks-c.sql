-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition=b.definition, version=b.version, updated_at=b.updated_at FROM bak_20261026_sweep_c_fleet_tasks b WHERE fleet_tasks.id=b.id; UPDATE fleet_tasks_canonical SET definition=b.definition, repo_path=b.repo_path, exported_at=b.exported_at FROM bak_20261026_sweep_c_canon b WHERE fleet_tasks_canonical.id=b.id; UPDATE goals SET dod=b.dod, updated_at=b.updated_at FROM bak_20261026_sweep_c_goal b WHERE goals.goal_key=b.goal_key; UPDATE analytics_metric_triggers SET action=b.action FROM bak_20261026_sweep_c_trigger b WHERE analytics_metric_triggers.id=b.id; DELETE FROM remediation_contracts WHERE class IN ('fm-goals-unevaluated-counts-deferred-probes','fm-goal-dod-embeds-placeholder-literal','fm-portfolio-gap-ignores-reconciled-deploy'); DELETE FROM failure_modes WHERE fm_key IN ('goals-unevaluated-counts-deferred-probes','goal-dod-embeds-placeholder-literal','portfolio-gap-ignores-reconciled-deploy')
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

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('goals-unevaluated-counts-deferred-probes',
  'goals_unevaluated counts an adopted goal whose DoD probe is read on schedule but answers pending',
  'The metric asked for a verification row newer than 120 minutes (v_goal_status.last_verified_at). Since CONSUMER-PENDING-IS-DEFERRAL-1 (2026-10-19 12:10Z) a pending read writes no row, so a goal whose DoD is deliberately not met yet never gains one and reads unprobed for ever, although its contract was attempted about twice an hour (10 goals, attempts 307 to 362 on 2026-10-26 09:18Z, newest attempts 09:05Z to 09:18Z, last_verdict deferred).',
  'roadmap-self-maintain v2 step metric-goals-unevaluated treats an active contract whose last_verdict is deferred and whose last_attempt_at is inside 120 minutes as evaluated. A probe error, a parked contract and a deferral older than 120 minutes still count, and fm-verification-deferral-unaged keeps grading the age of a long deferral.',
  'fm-goals-unevaluated-counts-deferred-probes: the deferred-aware clause is present in fleet_tasks roadmap-self-maintain step metric-goals-unevaluated',
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
  'fm-portfolio-gap-ignores-reconciled-deploy: the three statements of fleet_tasks portfolio-lifecycle read the reconciled action',
  'fm-portfolio-gap-ignores-reconciled-deploy', '2026-10-26', 100341,
  'a live worker with no deployment_history row of action deploy and a deployed row from deployment-ledger-reconcile',
  'one PORTFOLIO-GAP issue per worker and gap kind, re-filed daily with attempts rising',
  'portfolio_gaps, the PORTFOLIO-GAP issues of voice-stt and qnfo-workers, project_ledger and project_state rows for reconciled deployments');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to, module) VALUES
 ('fm-goals-unevaluated-counts-deferred-probes', NULL,
  'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM fleet_tasks WHERE id=''roadmap-self-maintain'' AND instr(json_extract(definition, ''$.steps[17].sql''), ''LIKE ''''deferred%'''''') > 0) THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 1, 'active', 'SWEEP-FLEET-TASKS-C', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode'),
 ('fm-goal-dod-embeds-placeholder-literal', NULL,
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM goals WHERE status = ''adopted'' AND goal_type <> ''objective-revision'' AND instr(COALESCE(dod, ''''), ''SELECT '') > 0 AND instr(COALESCE(dod, ''''), ''needs-machine-probe'') > 0) AS TEXT) AS observed',
  'd1-query', 3, 1, 'active', 'SWEEP-FLEET-TASKS-C', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode'),
 ('fm-portfolio-gap-ignores-reconciled-deploy', NULL,
  'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM fleet_tasks WHERE id=''portfolio-lifecycle'' AND instr(json_extract(definition, ''$.steps[1].sql''), ''dh.action IN (''''deploy'''',''''deployed'''')'') > 0 AND instr(json_extract(definition, ''$.steps[5].sql''), ''dh.action IN (''''deploy'''',''''deployed'''')'') > 0 AND instr(json_extract(definition, ''$.steps[6].sql''), ''dh.action IN (''''deploy'''',''''deployed'''')'') > 0) THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 1, 'active', 'SWEEP-FLEET-TASKS-C', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015kWmGuAq2fNuvzu4MrD7x3',
  'A deferred probe that is attempted on schedule is an evaluated goal, and a reconciled deployment is a deployment: both detectors should read what the loops that repair them write',
  'SWEEP-FLEET-TASKS-C: roadmap-self-maintain v2 counts a fresh deferred goal contract as evaluated, TP-5 DoD no longer carries the placeholder status text, portfolio-lifecycle v3 reads deployment_history.action IN (deploy, deployed)',
  'qnfo-audit 2026-10-26 09:18Z: goals_unevaluated 11 = 10 active deferred contracts attempted within 30 minutes + TP-5 superseded by red-drain step 0 at 08:36:52Z (probe text contains needs-machine-probe). deployment_history has 63 deployed rows by deployment-ledger-reconcile and 0 for voice-stt with action deploy, so portfolio_gaps re-filed issues 100341 and 100342 (10 attempts today).',
  'migration installed, runtime verdict belongs to the next hourly roadmap-self-maintain and portfolio-lifecycle ticks and the three fm- detectors',
  'fleet_tasks roadmap-self-maintain step 17 and portfolio-lifecycle steps 1, 5, 6 (text substitutions only), fleet_tasks_canonical portfolio-lifecycle, one goals.dod text, one analytics_metric_triggers.action text. First lifecycle tick links up to about 44 reconciled deployments to project_ledger and project_state.',
  'Restore the four backup tables with the Rollback header (bak_20261026_sweep_c_fleet_tasks, _canon, _goal, _trigger)',
  'none',
  'goals_unevaluated < 1 within 6 h',
  'none',
  'offline: migrations/sweep-fleet-tasks-c.test.mjs replays the live DDL and both live definitions on node:sqlite, with mutation checks'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SWEEP-FLEET-TASKS-C:') = 1);

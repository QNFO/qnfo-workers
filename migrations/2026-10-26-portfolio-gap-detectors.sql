-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition=b.definition, version=b.version, updated_at=b.updated_at FROM bak_20261026_portfolio_gap_detectors b WHERE fleet_tasks.id=b.id; UPDATE fleet_tasks_canonical SET definition=b.canonical_definition, repo_path=b.canonical_repo_path, exported_at=b.canonical_exported_at FROM bak_20261026_portfolio_gap_detectors b WHERE fleet_tasks_canonical.id=b.id AND b.canonical_definition IS NOT NULL; DROP VIEW IF EXISTS v_portfolio_gap_owner_not_deployable; DROP VIEW IF EXISTS v_portfolio_deploy_drift_deployable; DROP VIEW IF EXISTS v_portfolio_deployable_owner; UPDATE portfolio_gaps SET status=b.status, resolved_at=b.resolved_at, detail=b.detail FROM bak_20261026_portfolio_gap_rows b WHERE portfolio_gaps.kind=b.kind AND portfolio_gaps.entity=b.entity AND portfolio_gaps.day=b.day; UPDATE remediation_contracts SET status=b.status, last_verdict=b.last_verdict, last_attempt_at=b.last_attempt_at FROM bak_20261026_portfolio_gap_contracts b WHERE remediation_contracts.class=b.class AND instr(remediation_contracts.last_verdict,'PORTFOLIO-GAP-DETECTORS-1')>0; UPDATE agent_issues SET status=b.status, close_channel=b.close_channel, updated_at=b.updated_at FROM bak_20261026_portfolio_gap_issues b WHERE agent_issues.id=b.issue_id AND agent_issues.close_channel='auto:portfolio-gap-detectors'; UPDATE issue_triage SET triage_state=b.triage_state, close_evidence=b.close_evidence FROM bak_20261026_portfolio_gap_issues b WHERE issue_triage.issue_id=b.issue_id AND instr(issue_triage.close_evidence,'PORTFOLIO-GAP-DETECTORS-1 ')=1; DELETE FROM ops_config WHERE key='portfolio_gap_stub_services'; DELETE FROM remediation_contracts WHERE class IN ('fm-portfolio-gap-owner-not-deployable','belief-portfolio-gap-deployable-owner'); DELETE FROM failure_modes WHERE fm_key='portfolio-gap-owner-not-deployable'; DELETE FROM belief_registry WHERE belief_key='portfolio-gap-deployable-owner'; DELETE FROM control_registry WHERE control='portfolio_gap_deployable_owner_filter'; DELETE FROM capability_ledger WHERE capability='portfolio-gap-deployable-owner';
-- PORTFOLIO-GAP-DETECTORS-1. Charter pillar: autonomy. agent_issues 1000376 to 1000380 (PORTFOLIO-GAP project-stale-deploy BP26.*);
-- BREACH-DOCTOR-1 family tool-loop, TL-10 and R11 (stub registry entries); 1000264 (W.qnfo-agents).
--
-- DEFECT (read from live qnfo-audit, 2026-10-26 about 10:15Z, and again about 10:30Z after SWEEP-FLEET-TASKS-C). Two detectors judge
-- every active project that has an owner_service against deployment_history, and neither asks whether that owner can be deployed at all:
--   * project-stale-deploy: fleet_tasks portfolio-lifecycle (v3), the INSERT OR IGNORE INTO portfolio_gaps statement that reads
--     deployment_history for owner_service (first written by migrations/2026-10-18-portfolio-lifecycle.sql);
--   * project-never-deployed (and a second project-stale-deploy branch, and project-no-upgrade-tracked): the view
--     v_portfolio_deploy_drift, which fleet_tasks portfolio-deploy-sync (v1) reads in two steps (the INSERT OR IGNORE that files the gaps
--     and the UPDATE that resolves them). The spec for this change located the never-deployed detector in the sync task text; the string
--     'project-never-deployed' there is only the resolve step's kind list, the rows come from the view, so the view is what this file narrows.
-- Measured: five BP26 projects (status active, created 2026-10-26 08:31Z by the business-plan work) own 'program-manager:QNFO.OPS',
-- 'QNFO.RSCH', 'QNFO.INFRA' and 'QNFO.REACH', manager personas that service_registry does not list and that deployment_history can
-- never hold a row for. That gave 10 open portfolio_gaps rows (5 project-stale-deploy 'owner last deployed never', 5
-- project-never-deployed 'no recorded deployment for program-manager:...') and five high-priority PORTFOLIO-GAP issues (1000376 to
-- 1000380, no linked session, contracts born superseded) that no redeploy can close. Nobody else covers this: SWEEP-FLEET-TASKS-C
-- (migrations/2026-10-26-sweep-fleet-tasks-c.sql) made the stale-deploy and deploy-unrecorded statements count the action=deployed
-- reconcile rows, which is a different cause (a worker deployed outside the repository, recorded under another action name).
-- Stub registry entries: qnfo-workers (the retired Workers Builds root stub, GET /health answers HTTP 410, re-read 2026-10-26) and
-- voice-stt (no source directory in this repository, 200 on /health, unmanaged) are listed live and discovery rewrites their
-- service_registry rows every cycle, so a manual state edit would be reverted. SWEEP-FLEET-TASKS-C stops their stale-deploy rows only while
-- a reconcile row is younger than 30 days: voice-stt was last deployed 2026-10-20 and nothing in this repository redeploys it, so it files
-- again on 2026-11-19, and the drift view still judges both stubs. The nine open gap rows they already have (7 voice-stt, 2 qnfo-workers)
-- are resolved here, and so are the issues behind them except where somebody else is on the issue right now. 100342 is NOT closed here: it has
-- the closing contract SWEEP-FLEET-TASKS-C re-armed (status active, last verdict 'deferred', read 2026-10-26 10:51Z), a legitimate closer that
-- PORTFOLIO-GAP-RESOLVED-1 (filed by that migration) owns. 1000126 is closed here with the stub evidence: its linked_session b6445c2a is
-- attribution, not a claim (deploy-guard keeps linked_session after release, qnfo-deploy-guard/worker.js WORK-CLAIM-1 comment). The only claim
-- on it, work_claims id 5392 (path issue:1000126, holder b6445c2a, claimed 2026-10-25T07:41:20Z), was released at 07:43:07Z with outcome
-- 'abandoned', work_claims holds no unreleased, unexpired issue: row at 10:51Z, and its contract is superseded, so nothing else will close it.
-- The live claim ledger is what this file consults (see 5 below), never linked_session.
-- W.qnfo-agents is a real live worker whose deploys ARE recorded under its own resource_name (no mapping is needed): deployment_history
-- holds successful action=deploy rows for 'qnfo-agents' (0.2.1 at 09:11Z, 0.2.2 at 09:17Z) and action=deployed reconcile rows from 04:35Z.
-- Its gap was written at 05:10Z, before the first action=deploy row (the statement did not yet count the reconcile rows), and the
-- detector only inserts. Its own test is now false, so this file resolves that gap and closes 1000264 with that fact (no live claim,
-- no armed contract); the sibling deploy-unrecorded issue 1000263 is the other detector's and is left alone.
--
-- WHAT THIS FILE DOES
--   1. Backs up the two task definitions (and their canonical copies), the open stale/never gap rows, the issues linked to them and
--      those issues' contracts (CREATE TABLE IF NOT EXISTS ... AS SELECT: a replay keeps the first backup).
--   2. Seeds ops_config portfolio_gap_stub_services ('voice-stt,qnfo-workers'): the stub list is data, INSERT OR IGNORE so a later edit
--      survives.
--   3. Creates v_portfolio_deployable_owner (service_registry kind worker or member, state live, minus that list),
--      v_portfolio_deploy_drift_deployable (the existing drift view minus projects whose non-null owner is not deployable; a project
--      with no owner_service still shows, as before) and v_portfolio_gap_owner_not_deployable (gap rows of the two kinds whose project
--      owner is not deployable). All three are new objects: nothing is dropped and the live drift view is untouched.
--   4. Edits the two task definitions by replace() on a fragment that must occur exactly once, with json_valid checked on the result:
--      a replay (fragment gone), a concurrent edit (fragment changed or doubled) and an invalid JSON text are all no-ops. fleet_tasks
--      version +1, and fleet_tasks_canonical follows only a row that equalled the live text before this change and whose live text now
--      carries the filter (the drift gate fleet-tasks-drift-gate compares the two, so another session's unrelated edit stays visible to it).
--   5. Only when both definitions carry the filter, resolves the open gap rows the narrowed detectors no longer produce (status
--      'resolved' and a note in detail) and closes the linked issues: issue_triage.close_evidence names the entity, the owner_service and
--      the registry fact, close_channel auto:portfolio-gap-detectors. An issue with a live claim in the work_claims ledger (path issue:<id> or
--      issue_id = <id>, released_at NULL, expires_at in the future) held by another session, or with an armed (active or holding)
--      remediation contract, is left to that claim or contract: a closing probe somebody wrote is the closer, and
--      issue_close_evidence_required would refuse a close while one fails. A claim whose intent carries the tag PORTFOLIO-GAP-DETECTORS-1 is
--      this change's own (the session that pushes it takes the claim the work-claim procedure asks for) and never blocks its closes.
--      agent_issues.linked_session is not consulted: it is attribution that outlives the claim. Contracts of a closed issue are settled as
--      superseded, the way ISSUE-HYGIENE-1 does.
--   6. Failure mode portfolio-gap-owner-not-deployable with the d1-query detector fm-portfolio-gap-owner-not-deployable (expected 0), a
--      belief probe that the two definitions keep the filter, a control_registry row for the filter, a capability_ledger row and a
--      decision_log row.
-- NOT CHANGED: the deploy-unrecorded detector (gaps for voice-stt, qnfo-workers and qnfo-agents are open under 100341, 1000125 and 1000263),
-- the autopilot task, every worker.js and the dashboard. A live worker with no successful deploy in 30 days still files project-stale-deploy.
-- Closing probe (the spec's, returns 0 after this file; 10 before): SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM portfolio_gaps g
-- JOIN projects p ON p.project_code = g.entity WHERE g.status = 'open' AND g.kind IN ('project-stale-deploy','project-never-deployed')
-- AND p.owner_service LIKE 'program-manager:%') AS TEXT) AS observed.
-- spof-review: none added. The filter lives in D1 views read by two existing hourly tasks; the second path is the fm detector contract.

-- 1. Backups (a replay keeps the first copy)
CREATE TABLE IF NOT EXISTS bak_20261026_portfolio_gap_detectors AS SELECT t.id AS id, t.definition AS definition, t.version AS version, t.updated_at AS updated_at, c.definition AS canonical_definition, c.repo_path AS canonical_repo_path, c.exported_at AS canonical_exported_at FROM fleet_tasks t LEFT JOIN fleet_tasks_canonical c ON c.id = t.id WHERE t.id IN ('portfolio-lifecycle', 'portfolio-deploy-sync');

CREATE TABLE IF NOT EXISTS bak_20261026_portfolio_gap_rows AS SELECT g.kind AS kind, g.entity AS entity, g.day AS day, g.detail AS detail, g.status AS status, g.resolved_at AS resolved_at, g.issue_id AS issue_id FROM portfolio_gaps g WHERE g.status = 'open' AND g.kind IN ('project-stale-deploy', 'project-never-deployed');

CREATE TABLE IF NOT EXISTS bak_20261026_portfolio_gap_issues AS SELECT a.id AS issue_id, a.status AS status, a.close_channel AS close_channel, a.updated_at AS updated_at, t.triage_state AS triage_state, t.close_evidence AS close_evidence FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.id IN (SELECT g.issue_id FROM portfolio_gaps g WHERE g.status = 'open' AND g.kind IN ('project-stale-deploy', 'project-never-deployed') AND g.issue_id IS NOT NULL);

CREATE TABLE IF NOT EXISTS bak_20261026_portfolio_gap_contracts AS SELECT c.class AS class, c.status AS status, c.last_verdict AS last_verdict, c.last_attempt_at AS last_attempt_at FROM remediation_contracts c WHERE c.class LIKE 'issue-%' AND c.issue_id IN (SELECT g.issue_id FROM portfolio_gaps g WHERE g.status = 'open' AND g.kind IN ('project-stale-deploy', 'project-never-deployed') AND g.issue_id IS NOT NULL);

-- 2. The stub list is data
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('portfolio_gap_stub_services', 'voice-stt,qnfo-workers', 'PORTFOLIO-GAP-DETECTORS-1 (2026-10-26): comma-separated service_registry names that are listed live but that no deploy from this repository can change, so the portfolio deploy gaps skip them. qnfo-workers is the retired Workers Builds root stub (GET /health answers HTTP 410); voice-stt has no source directory here (worker_live_audit UNMANAGED_OK). Add a name by UPDATE with a note; a name leaves the list when its worker has a directory and a deploy path, or when discovery marks it kind stub. Revert: DELETE this row and every live worker is judged again.');

-- 3. One definition of a deployable owner, read by both detectors and by the failure-mode detector
CREATE VIEW IF NOT EXISTS v_portfolio_deployable_owner AS
SELECT s.service AS service FROM service_registry s
WHERE s.kind IN ('worker', 'member') AND s.state = 'live'
  AND instr(',' || replace(COALESCE((SELECT o.value FROM ops_config o WHERE o.key = 'portfolio_gap_stub_services'), ''), ' ', '') || ',', ',' || s.service || ',') = 0;

CREATE VIEW IF NOT EXISTS v_portfolio_deploy_drift_deployable AS
SELECT d.kind AS kind, d.ref AS ref, d.detail AS detail FROM v_portfolio_deploy_drift d
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.project_code = d.ref AND p.owner_service IS NOT NULL
  AND p.owner_service NOT IN (SELECT service FROM v_portfolio_deployable_owner));

CREATE VIEW IF NOT EXISTS v_portfolio_gap_owner_not_deployable AS
SELECT g.kind AS kind, g.entity AS entity, g.day AS day, g.status AS status, g.issue_id AS issue_id, p.owner_service AS owner_service
FROM portfolio_gaps g JOIN projects p ON p.project_code = g.entity
WHERE g.kind IN ('project-stale-deploy', 'project-never-deployed') AND p.owner_service IS NOT NULL
  AND p.owner_service NOT IN (SELECT service FROM v_portfolio_deployable_owner);

-- 4. The detectors. Each fragment must occur exactly once; the result must stay valid JSON.
UPDATE fleet_tasks SET
  definition = replace(definition, 'WHERE p.status=''active'' AND p.owner_service IS NOT NULL AND COALESCE(', 'WHERE p.status=''active'' AND p.owner_service IS NOT NULL AND p.owner_service IN (SELECT service FROM v_portfolio_deployable_owner) AND COALESCE('),
  version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'portfolio-lifecycle' AND json_valid(definition)
  AND length(definition) - length(replace(definition, 'WHERE p.status=''active'' AND p.owner_service IS NOT NULL AND COALESCE(', '')) = length('WHERE p.status=''active'' AND p.owner_service IS NOT NULL AND COALESCE(')
  AND json_valid(replace(definition, 'WHERE p.status=''active'' AND p.owner_service IS NOT NULL AND COALESCE(', 'WHERE p.status=''active'' AND p.owner_service IS NOT NULL AND p.owner_service IN (SELECT service FROM v_portfolio_deployable_owner) AND COALESCE('));

UPDATE fleet_tasks SET
  definition = replace(replace(definition, '''open'' FROM v_portfolio_deploy_drift"', '''open'' FROM v_portfolio_deploy_drift_deployable"'), 'SELECT 1 FROM v_portfolio_deploy_drift v WHERE v.kind', 'SELECT 1 FROM v_portfolio_deploy_drift_deployable v WHERE v.kind'),
  version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'portfolio-deploy-sync' AND json_valid(definition)
  AND length(definition) - length(replace(definition, '''open'' FROM v_portfolio_deploy_drift"', '')) = length('''open'' FROM v_portfolio_deploy_drift"')
  AND length(definition) - length(replace(definition, 'SELECT 1 FROM v_portfolio_deploy_drift v WHERE v.kind', '')) = length('SELECT 1 FROM v_portfolio_deploy_drift v WHERE v.kind')
  AND json_valid(replace(replace(definition, '''open'' FROM v_portfolio_deploy_drift"', '''open'' FROM v_portfolio_deploy_drift_deployable"'), 'SELECT 1 FROM v_portfolio_deploy_drift v WHERE v.kind', 'SELECT 1 FROM v_portfolio_deploy_drift_deployable v WHERE v.kind'));

UPDATE fleet_tasks_canonical SET
  definition = (SELECT t.definition FROM fleet_tasks t WHERE t.id = fleet_tasks_canonical.id),
  repo_path = 'migrations/2026-10-26-portfolio-gap-detectors.sql', exported_at = datetime('now')
WHERE id IN ('portfolio-lifecycle', 'portfolio-deploy-sync')
  AND definition <> (SELECT t.definition FROM fleet_tasks t WHERE t.id = fleet_tasks_canonical.id)
  AND definition = (SELECT b.definition FROM bak_20261026_portfolio_gap_detectors b WHERE b.id = fleet_tasks_canonical.id)
  AND instr((SELECT t.definition FROM fleet_tasks t WHERE t.id = fleet_tasks_canonical.id), CASE fleet_tasks_canonical.id WHEN 'portfolio-lifecycle' THEN 'v_portfolio_deployable_owner' ELSE 'v_portfolio_deploy_drift_deployable' END) > 0;

-- 5a. Evidence for the issues whose gap owner is not deployable (written only once both definitions carry the filter; an issue with a
-- live claim by another session in work_claims or an armed contract is left to that claim or contract; every close in 5a and 5c asks the
-- same question, the ledger and not agent_issues.linked_session, which is attribution that stays after a release)
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'PORTFOLIO-GAP-DETECTORS-1', 'triaged', 'portfolio-autopilot', datetime('now'),
  'PORTFOLIO-GAP-DETECTORS-1 ' || date('now') || ': ' || x.kind || ' ' || x.entity || ' is a false positive that the detectors no longer produce. The project owner_service is ''' || x.owner_service || ''', '
  || CASE WHEN instr(x.owner_service, 'program-manager:') = 1
       THEN 'a program-manager persona: service_registry holds ' || (SELECT COUNT(*) FROM service_registry r WHERE r.service = x.owner_service) || ' rows for it and deployment_history can never hold a deploy of a persona, so no redeploy can close this gap.'
       ELSE 'not a deployable worker: service_registry lists it as kind ' || COALESCE(s.kind, 'none') || ', state ' || COALESCE(s.state, 'none') || ', version ' || COALESCE(s.version, 'none')
         || CASE WHEN instr(',' || replace(COALESCE((SELECT o.value FROM ops_config o WHERE o.key = 'portfolio_gap_stub_services'), ''), ' ', '') || ',', ',' || x.owner_service || ',') > 0
              THEN ', and ops_config portfolio_gap_stub_services names it as a stub that no deploy from this repository can change.'
              ELSE ', which v_portfolio_deployable_owner does not accept (kind worker or member, state live).' END END
  || ' portfolio-lifecycle and portfolio-deploy-sync now judge only owners in v_portfolio_deployable_owner (service_registry kind worker or member, state live, minus that stub list).'
FROM agent_issues a
JOIN (SELECT DISTINCT n.issue_id AS issue_id, n.kind AS kind, n.entity AS entity, n.owner_service AS owner_service FROM v_portfolio_gap_owner_not_deployable n WHERE n.issue_id IS NOT NULL) x ON x.issue_id = a.id
LEFT JOIN service_registry s ON s.service = x.owner_service
WHERE a.status = 'open'
  AND a.id IN (SELECT b.issue_id FROM bak_20261026_portfolio_gap_issues b)
  AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE (w.path = 'issue:' || a.id OR w.issue_id = a.id) AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AND instr(COALESCE(w.intent, ''), 'PORTFOLIO-GAP-DETECTORS-1') = 0)
  AND EXISTS (SELECT 1 FROM fleet_tasks t WHERE t.id = 'portfolio-lifecycle' AND instr(t.definition, 'v_portfolio_deployable_owner') > 0)
  AND EXISTS (SELECT 1 FROM fleet_tasks t WHERE t.id = 'portfolio-deploy-sync' AND instr(t.definition, 'v_portfolio_deploy_drift_deployable') > 0)
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding'))
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence;

UPDATE agent_issues SET status = 'closed', close_channel = 'auto:portfolio-gap-detectors', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE status = 'open'
  AND id IN (SELECT b.issue_id FROM bak_20261026_portfolio_gap_issues b)
  AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE (w.path = 'issue:' || agent_issues.id OR w.issue_id = agent_issues.id) AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AND instr(COALESCE(w.intent, ''), 'PORTFOLIO-GAP-DETECTORS-1') = 0)
  AND id IN (SELECT n.issue_id FROM v_portfolio_gap_owner_not_deployable n WHERE n.issue_id IS NOT NULL)
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = agent_issues.id AND instr(t.close_evidence, 'PORTFOLIO-GAP-DETECTORS-1 ') = 1)
  AND EXISTS (SELECT 1 FROM fleet_tasks t WHERE t.id = 'portfolio-lifecycle' AND instr(t.definition, 'v_portfolio_deployable_owner') > 0)
  AND EXISTS (SELECT 1 FROM fleet_tasks t WHERE t.id = 'portfolio-deploy-sync' AND instr(t.definition, 'v_portfolio_deploy_drift_deployable') > 0)
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = agent_issues.id AND c.status IN ('active', 'holding'));

-- 5b. The gap rows the narrowed detectors no longer produce
UPDATE portfolio_gaps SET status = 'resolved', resolved_at = datetime('now'),
  detail = COALESCE(detail, '') || ' | PORTFOLIO-GAP-DETECTORS-1 ' || date('now') || ': resolved, owner_service ' || (SELECT p.owner_service FROM projects p WHERE p.project_code = portfolio_gaps.entity) || ' is not a deployable worker (a program-manager persona, a stub on ops_config portfolio_gap_stub_services, or a service that is not live in service_registry)'
WHERE status = 'open' AND kind IN ('project-stale-deploy', 'project-never-deployed')
  AND EXISTS (SELECT 1 FROM v_portfolio_gap_owner_not_deployable n WHERE n.kind = portfolio_gaps.kind AND n.entity = portfolio_gaps.entity AND n.day = portfolio_gaps.day)
  AND EXISTS (SELECT 1 FROM fleet_tasks t WHERE t.id = 'portfolio-lifecycle' AND instr(t.definition, 'v_portfolio_deployable_owner') > 0)
  AND EXISTS (SELECT 1 FROM fleet_tasks t WHERE t.id = 'portfolio-deploy-sync' AND instr(t.definition, 'v_portfolio_deploy_drift_deployable') > 0);

-- 5c. A live worker whose gap cleared by itself: the owner deployed inside the window the detector checks
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'PORTFOLIO-GAP-DETECTORS-1', 'triaged', 'portfolio-autopilot', datetime('now'),
  'PORTFOLIO-GAP-DETECTORS-1 ' || date('now') || ': project-stale-deploy ' || g.entity || ' is cleared by the detector''s own test. owner_service ''' || p.owner_service || ''' is a live worker (v_portfolio_deployable_owner) and deployment_history holds a successful action=deploy row for it inside the 30-day window (id ' || d.id || ', version ' || COALESCE(d.version_id, '?') || ', deployed_at ' || d.deployed_at || ', by ' || COALESCE(d.deployed_by, '?') || '). The gap row was first seen ' || g.first_seen || ', ' || CAST(ROUND((julianday(g.first_seen) - julianday(p.created_at)) * 1440) AS INTEGER) || ' minutes after the project was created, and the stale-deploy detector only inserts: it does not resolve a row when the owner deploys.'
FROM agent_issues a
JOIN portfolio_gaps g ON g.issue_id = a.id AND g.kind = 'project-stale-deploy' AND g.status = 'open'
JOIN projects p ON p.project_code = g.entity
JOIN deployment_history d ON d.id = (SELECT d2.id FROM deployment_history d2 WHERE d2.resource_name = p.owner_service AND d2.action = 'deploy' AND COALESCE(d2.status, 'success') = 'success' AND replace(substr(d2.deployed_at, 1, 19), 'T', ' ') >= datetime('now', '-30 days') ORDER BY d2.deployed_at DESC, d2.id DESC LIMIT 1)
WHERE a.status = 'open'
  AND a.id IN (SELECT b.issue_id FROM bak_20261026_portfolio_gap_issues b)
  AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE (w.path = 'issue:' || a.id OR w.issue_id = a.id) AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AND instr(COALESCE(w.intent, ''), 'PORTFOLIO-GAP-DETECTORS-1') = 0)
  AND p.owner_service IN (SELECT service FROM v_portfolio_deployable_owner)
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding'))
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence;

UPDATE agent_issues SET status = 'closed', close_channel = 'auto:portfolio-gap-detectors', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE status = 'open'
  AND id IN (SELECT b.issue_id FROM bak_20261026_portfolio_gap_issues b)
  AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE (w.path = 'issue:' || agent_issues.id OR w.issue_id = agent_issues.id) AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AND instr(COALESCE(w.intent, ''), 'PORTFOLIO-GAP-DETECTORS-1') = 0)
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = agent_issues.id AND instr(t.close_evidence, 'PORTFOLIO-GAP-DETECTORS-1 ') = 1)
  AND EXISTS (SELECT 1 FROM portfolio_gaps g JOIN projects p ON p.project_code = g.entity
    WHERE g.issue_id = agent_issues.id AND g.kind = 'project-stale-deploy' AND g.status = 'open'
      AND p.owner_service IN (SELECT service FROM v_portfolio_deployable_owner)
      AND EXISTS (SELECT 1 FROM deployment_history d WHERE d.resource_name = p.owner_service AND d.action = 'deploy' AND COALESCE(d.status, 'success') = 'success' AND replace(substr(d.deployed_at, 1, 19), 'T', ' ') >= datetime('now', '-30 days')))
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = agent_issues.id AND c.status IN ('active', 'holding'));

UPDATE portfolio_gaps SET status = 'resolved', resolved_at = datetime('now'),
  detail = COALESCE(detail, '') || ' | PORTFOLIO-GAP-DETECTORS-1 ' || date('now') || ': resolved, the owner deployed inside the 30-day window'
WHERE status = 'open' AND kind = 'project-stale-deploy'
  AND issue_id IN (SELECT a.id FROM agent_issues a WHERE a.status = 'closed' AND a.close_channel = 'auto:portfolio-gap-detectors')
  AND EXISTS (SELECT 1 FROM projects p WHERE p.project_code = portfolio_gaps.entity AND p.owner_service IN (SELECT service FROM v_portfolio_deployable_owner)
    AND EXISTS (SELECT 1 FROM deployment_history d WHERE d.resource_name = p.owner_service AND d.action = 'deploy' AND COALESCE(d.status, 'success') = 'success' AND replace(substr(d.deployed_at, 1, 19), 'T', ' ') >= datetime('now', '-30 days')));

-- 5d. Settle what the closes left behind: the triage row and the issue's own contracts
UPDATE issue_triage SET triage_state = 'closed', triaged_at = datetime('now')
WHERE instr(close_evidence, 'PORTFOLIO-GAP-DETECTORS-1 ') = 1 AND triage_state <> 'closed'
  AND issue_id IN (SELECT a.id FROM agent_issues a WHERE a.status = 'closed' AND a.close_channel = 'auto:portfolio-gap-detectors');

UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-superseded (PORTFOLIO-GAP-DETECTORS-1)', last_attempt_at = datetime('now')
WHERE class LIKE 'issue-%' AND status IN ('monitoring', 'escalated', 'active', 'holding', 'needs-machine-probe', 'probe-review-refused')
  AND issue_id IN (SELECT a.id FROM agent_issues a WHERE a.status = 'closed' AND a.close_channel = 'auto:portfolio-gap-detectors');

-- 6. Failure mode, detector, belief, control, capability, decision
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('portfolio-gap-owner-not-deployable', 'PORTFOLIO-GAP deploy gaps are filed for projects whose owner_service is not a deployable worker',
  'project-stale-deploy (portfolio-lifecycle) and project-never-deployed (v_portfolio_deploy_drift, read by portfolio-deploy-sync) judged every active project that has an owner_service against deployment_history, although a program-manager persona (the BP26 projects own program-manager:<program>) is not in service_registry and a stub registry entry (qnfo-workers answers HTTP 410, voice-stt has no source directory) cannot be changed by a deploy from this repository, so the autopilot filed high-priority PORTFOLIO-GAP issues that no redeploy could close',
  'PORTFOLIO-GAP-DETECTORS-1: both detectors read v_portfolio_deployable_owner (service_registry kind worker or member, state live, minus ops_config portfolio_gap_stub_services); the false rows and issues are resolved with evidence; the d1-query contract fm-portfolio-gap-owner-not-deployable counts any open gap of the two kinds whose project owner is not deployable',
  'the d1-query contract fm-portfolio-gap-owner-not-deployable counts open project-stale-deploy and project-never-deployed gaps whose project owner_service is not in v_portfolio_deployable_owner (expected 0)',
  'fm-portfolio-gap-owner-not-deployable', '2026-10-26', 1000376,
  'a project is created active with an owner_service that is a persona or a stub (a business-plan programme, a registry entry without a repository directory), or a detector definition is overwritten with the text that predates the filter',
  'five high-priority PORTFOLIO-GAP project-stale-deploy issues (1000376 to 1000380) and ten open gap rows with owner last deployed never; seven daily gap rows for W.voice-stt',
  'portfolio_gaps, agent_issues rows filed by portfolio-autopilot and the owner-facing open-issue counts; no data loss');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to, module)
VALUES ('fm-portfolio-gap-owner-not-deployable', NULL,
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM v_portfolio_gap_owner_not_deployable WHERE status = ''open''',
  'd1-query', 3, 1, 'active', 'PORTFOLIO-GAP-DETECTORS-1', 'failure-mode detector', 'qnfo-fleet-control', 'failure-mode');

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES ('portfolio-gap-deployable-owner', 'portfolio-lifecycle and portfolio-deploy-sync judge deploy gaps only for projects whose owner_service is a deployable worker',
  1.0, 'migrations/portfolio-gap-detectors.test.mjs runs both live task texts before and after: a manager-owned project and a stub file nothing, a live worker with no deploy in 30 days still files',
  'belief-portfolio-gap-deployable-owner', 'v_portfolio_deployable_owner over service_registry and ops_config portfolio_gap_stub_services');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to, module)
VALUES ('belief-portfolio-gap-deployable-owner', NULL,
  'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM fleet_tasks WHERE id = ''portfolio-lifecycle'' AND instr(definition, ''v_portfolio_deployable_owner'') > 0) = 1 AND (SELECT COUNT(*) FROM fleet_tasks WHERE id = ''portfolio-deploy-sync'' AND instr(definition, ''v_portfolio_deploy_drift_deployable'') > 0) = 1 THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 1, 'active', 'PORTFOLIO-GAP-DETECTORS-1', 'belief probe', 'qnfo-fleet-control', 'belief');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('portfolio_gap_deployable_owner_filter', 'qnfo-audit views v_portfolio_deployable_owner and v_portfolio_deploy_drift_deployable; fleet_tasks portfolio-lifecycle (stale-deploy step) and portfolio-deploy-sync (file and resolve steps)', 'filter',
  'High-priority PORTFOLIO-GAP issues for projects whose owner is a program-manager persona or a stub registry entry, which no redeploy can fix', 0, 'keep', 'applied',
  'The stub list is data (ops_config portfolio_gap_stub_services) and the rule hides no live worker: a live worker with no successful deploy in 30 days still files project-stale-deploy, and deploy-unrecorded is unchanged. The d1-query contract fm-portfolio-gap-owner-not-deployable counts what the filter should have removed.',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'PORTFOLIO-GAP-DETECTORS-1: migrations/portfolio-gap-detectors.test.mjs runs the live task texts offline, a manager-owned project and a stub file nothing, a live worker, a member service and a project with no owner_service still do',
  1000376, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('portfolio-gap-deployable-owner', 'PORTFOLIO-GAP-DETECTORS-1',
  'service_registry, ops_config portfolio_gap_stub_services, the portfolio-lifecycle and portfolio-deploy-sync hourly tasks',
  'migrations/portfolio-gap-detectors.test.mjs; hourly fm-portfolio-gap-owner-not-deployable and belief-portfolio-gap-deployable-owner',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'The portfolio deploy detectors file gaps only for owners that can be deployed; a persona or a stub owner produces no gap and no issue');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'A deploy gap is a defect only when a redeploy could close it: a program-manager persona is not in service_registry and a stub registry entry cannot be changed by a deploy from this repository, so a high-priority issue for either is a false positive and the right fix is in the detector, not in the issue',
  'PORTFOLIO-GAP-DETECTORS-1: portfolio-lifecycle and portfolio-deploy-sync read v_portfolio_deployable_owner (stub list in ops_config portfolio_gap_stub_services); the false gap rows are resolved and the issues 1000376 to 1000380, 1000264 and 1000126 are closed with close_evidence unless another session holds a live work_claims claim on one (linked_session is attribution and is not consulted; the 1000126 claim, work_claims 5392, was released as abandoned on 2026-10-25) or an armed contract answers for it (100342 keeps the contract SWEEP-FLEET-TASKS-C re-armed, PORTFOLIO-GAP-RESOLVED-1 closes it); failure mode portfolio-gap-owner-not-deployable with detector fm-portfolio-gap-owner-not-deployable',
  'Live qnfo-audit 2026-10-26 10:15Z and 10:30Z: 10 open gap rows for 5 BP26 projects owned by program-manager:* (not in service_registry, 0 deployment_history rows), 9 more for W.voice-stt and W.qnfo-workers (qnfo-workers /health answers 410), W.qnfo-agents deployed 09:11Z and 09:17Z under its own resource_name; offline replay of the pinned live task texts (portfolio-lifecycle v3) in node:sqlite',
  'migration installed; the next hourly portfolio-lifecycle and portfolio-deploy-sync runs file nothing for those owners',
  'portfolio_gaps rows of two kinds, up to seven portfolio-autopilot issues (1000376 to 1000380, 1000264, 1000126), two fleet_tasks definitions and their canonical copies; no worker, binding, cron or dashboard change',
  'Restore the two definitions and canonical copies, the gap rows and the issues from bak_20261026_portfolio_gap_detectors, bak_20261026_portfolio_gap_rows and bak_20261026_portfolio_gap_issues, then drop the three views, using the Rollback header',
  'portfolio-gap-deployable-owner',
  'fm-portfolio-gap-owner-not-deployable stays at 0 across the next two hourly ticks; no new PORTFOLIO-GAP issue is filed for a BP26 project, W.voice-stt or W.qnfo-workers, and issues 1000376 to 1000380, 1000264 and 1000126 are closed (100342 stays with its armed contract)',
  'none', 'D1 task definitions, views, gap rows and issue closes; offline node:sqlite replay of both live task texts before and after'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PORTFOLIO-GAP-DETECTORS-1:') = 1);

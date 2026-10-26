-- RUNTIME-LIVENESS-GAP-1 (2026-10-26, charter pillars autonomy and reach; metric runtime_verified_share_24h = 8.7 against a trigger under 10, PROBE-TRANSPORT-MONOCULTURE-1).
-- The share is runner-https (independent, runtime-observable) verifications over all verifications in 24 h: 2421 of 28236 on 2026-10-26 (8.6 %), 40 rows a day per hourly
-- contract (an hourly contract is due every 22 minutes since REMEDIATION-2X-1). Two causes, both measured on 2026-10-26 16:20Z:
--   1. Standing liveness contracts are parked for ever by a transient failure. red-drain step 2 (hourly, :35) escalates any active contract whose last verdict is 'fail' and whose
--      cumulative attempts exceed 5 x max_attempts, unless it is fm-/belief- or the only contract of an open issue. A standing liveness contract (module runtime-liveness-v1,
--      issue_id NULL) is none of those, its attempts grow by 40 a day, so one slow response in the 22 minutes before :35 parks it, and step 6 re-arms only detectors and issue
--      contracts. Six sat escalated:over-retried since 2026-10-19 to 2026-10-21 (rt-page-fleet-queue, rt-page-fleet-kpi, rt-page-fleet-api-kpi, rt-page-fleet-changelog,
--      rt-page-ideas, rt-page-paper-scholar-tags) and five of them pass today (200 with their marker, read 2026-10-26 16:22Z); the sixth fails only because fleet.qnfo.org no longer
--      carries the text "your queue" (its page is titled "QNFO fleet status"). That is 240 runtime verifications a day lost to a rule that was meant for open issues.
--   2. Seven deployed workers (q08-mind, qnfo-artifacts, qnfo-model-eval, qnfo-evolve, qnfo-github-steward, idea-hub, voice-stt) and the routes other workers depend on (the ideas.qnfo.org
--      feed, sitemap and sessions API, the fleet graph freshness read, the work-claim list, the scoreboard, watchmaker and cost JSON of fleet.qnfo.org) have no probe from outside
--      the Cloudflare account, so an outage there is seen only by the in-account audit (the issue-1190 artifact) or by a reader.
-- Fix: (a) red-drain never parks a standing liveness contract (step 2 gains the module exclusion, a new last step re-arms any that is parked), recorded with a failure mode and its
-- detector; (b) the six parked contracts are re-armed now (one with the marker the page carries today); (c) fifteen new hourly runner-https contracts, each a live URL that answered 200
-- with its marker when this file was written. 21 contracts x 40 rows = 840 runtime verifications a day more: (2421 + 840) / (28236 + 840) = 11.2 %. A probe that fails files
-- RUNTIME-PROBE-FAIL-1 after three straight failures (scripts/remediation_consumer.py), which is the point of the probe. Nothing is relabelled: every row is a GET from the GitHub runner.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT b.definition FROM bak_20261026_liveness_never_parked_task b WHERE b.id = 'red-drain'), version = version + 1 WHERE id = 'red-drain'; UPDATE fleet_tasks_canonical SET definition = (SELECT b.definition FROM bak_20261026_liveness_never_parked_task b WHERE b.id = 'red-drain') WHERE id = 'red-drain'; UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback RUNTIME-LIVENESS-GAP-1' WHERE module = 'runtime-liveness-v1' AND class IN ('rt-live-q08-mind', 'rt-live-qnfo-artifacts', 'rt-live-qnfo-model-eval', 'rt-live-qnfo-evolve', 'rt-live-qnfo-github-steward', 'rt-live-idea-hub', 'rt-live-voice-stt', 'rt-page-ideas-feed', 'rt-page-ideas-sitemap', 'rt-page-ideas-sessions', 'rt-live-fleet-graph', 'rt-live-work-locks', 'rt-page-fleet-api-status', 'rt-page-fleet-api-watchmaker', 'rt-page-fleet-api-cost')
-- spof-review: removes a silent loss of the only outside-the-account probes (a sweep that parked them for ever); adds no worker, cron or binding

CREATE TABLE IF NOT EXISTS bak_20261026_liveness_never_parked_task AS SELECT * FROM fleet_tasks WHERE id = 'red-drain';

UPDATE fleet_tasks SET
  definition = json_insert(json_set(definition,
    '$.steps[2].sql', replace(json_extract(definition, '$.steps[2].sql'), '/* PARKED-REARM-2 */',
      'AND COALESCE(module, '''') <> ''runtime-liveness-v1'' /* STANDING-LIVENESS-NEVER-PARKS-1 */
        /* PARKED-REARM-2 */')),
    '$.steps[#]', json_object('type', 'sql', 'db', 'AUDIT', 'sql', 'UPDATE remediation_contracts SET status=''active'', next_due_at=datetime(''now''),
        last_verdict=''rearmed: STANDING-LIVENESS-NEVER-PARKS-1 (was '' || substr(COALESCE(last_verdict,''?''),1,60) || ''; a standing liveness probe is never parked, three straight failures file RUNTIME-PROBE-FAIL-1)''
      WHERE status IN (''escalated'',''monitoring'') AND issue_id IS NULL AND COALESCE(module,'''') = ''runtime-liveness-v1'' /* STANDING-LIVENESS-NEVER-PARKS-1 */')),
  version = version + 1,
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'red-drain'
  AND instr(definition, 'STANDING-LIVENESS-NEVER-PARKS-1') = 0
  AND instr(json_extract(definition, '$.steps[2].sql'), 'PARKED-REARM-2') > 0;

-- The drift gate (fleet_tasks 'fleet-tasks-drift-gate') compares fleet_tasks with fleet_tasks_canonical: the canonical row moves with the live one, only when it matched the replaced definition.
UPDATE fleet_tasks_canonical SET
  definition = (SELECT t.definition FROM fleet_tasks t WHERE t.id = 'red-drain'),
  repo_path = 'migrations/2026-10-26-runtime-liveness-gap.sql',
  exported_at = datetime('now')
WHERE id = 'red-drain'
  AND definition = (SELECT b.definition FROM bak_20261026_liveness_never_parked_task b WHERE b.id = 'red-drain')
  AND instr((SELECT t.definition FROM fleet_tasks t WHERE t.id = 'red-drain'), 'STANDING-LIVENESS-NEVER-PARKS-1') > 0;

-- (b) the parked standing contracts go back to work; the fleet queue page is probed on the title it carries today
UPDATE remediation_contracts SET verify_probe = '{"url": "https://fleet.qnfo.org/", "status": 200, "contains": "<title>QNFO fleet status", "max_ms": 15000}'
 WHERE class = 'rt-page-fleet-queue' AND module = 'runtime-liveness-v1' AND verify_probe LIKE '%your queue%';
UPDATE remediation_contracts SET status = 'active', next_due_at = datetime('now'),
       last_verdict = 'rearmed: STANDING-LIVENESS-NEVER-PARKS-1 (was ' || substr(COALESCE(last_verdict, '?'), 1, 60) || '; the probe passes today)'
 WHERE status IN ('escalated', 'monitoring') AND issue_id IS NULL AND COALESCE(module, '') = 'runtime-liveness-v1';

-- (c) fifteen new standing liveness contracts on live URLs
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, next_due_at) VALUES
 ('rt-live-q08-mind', NULL, 'standing liveness: q08-mind /health answers with a version', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://q08-mind.q08.workers.dev/health", "status": 200, "contains": "version", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-live-qnfo-artifacts', NULL, 'standing liveness: qnfo-artifacts /health answers with a version', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://qnfo-artifacts.q08.workers.dev/health", "status": 200, "contains": "version", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-live-qnfo-model-eval', NULL, 'standing liveness: qnfo-model-eval /health answers with a version', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://qnfo-model-eval.q08.workers.dev/health", "status": 200, "contains": "version", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-live-qnfo-evolve', NULL, 'standing liveness: qnfo-evolve /health answers with a version', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://qnfo-evolve.q08.workers.dev/health", "status": 200, "contains": "version", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-live-qnfo-github-steward', NULL, 'standing liveness: qnfo-github-steward /health answers with a version', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://qnfo-github-steward.q08.workers.dev/health", "status": 200, "contains": "version", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-live-idea-hub', NULL, 'standing liveness: idea-hub /health answers with a version', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://idea-hub.q08.workers.dev/health", "status": 200, "contains": "version", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-live-voice-stt', NULL, 'standing liveness: voice-stt /health answers ok (an unmanaged stub with no source here; its health body is {"ok":true})', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://voice-stt.q08.workers.dev/health", "status": 200, "contains": "\"ok\":true", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-page-ideas-feed', NULL, 'standing liveness: ideas.qnfo.org/rss.xml serves RSS (feed readers)', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://ideas.qnfo.org/rss.xml", "status": 200, "contains": "<rss", "max_ms": 15000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-page-ideas-sitemap', NULL, 'standing liveness: ideas.qnfo.org/sitemap.xml serves a sitemap (crawlers)', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://ideas.qnfo.org/sitemap.xml", "status": 200, "contains": "<urlset", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-page-ideas-sessions', NULL, 'standing liveness: ideas.qnfo.org/api/sessions answers with its sessions (the idea intake hub API)', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://ideas.qnfo.org/api/sessions", "status": 200, "contains": "sessions", "max_ms": 20000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-live-fleet-graph', NULL, 'standing liveness: the fleet graph freshness read (qnfo-memory-mcp /fleet-graph/freshness) answers with its scopes', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://qnfo-memory-mcp.q08.workers.dev/fleet-graph/freshness", "status": 200, "contains": "scopes", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-live-work-locks', NULL, 'standing liveness: the work-claim list (qnfo-deploy-guard /work-locks) answers with its claims', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://qnfo-deploy-guard.q08.workers.dev/work-locks", "status": 200, "contains": "claims", "max_ms": 10000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-page-fleet-api-status', NULL, 'standing liveness: fleet.qnfo.org/api/status (the live scoreboard JSON) answers with its programs', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://fleet.qnfo.org/api/status", "status": 200, "contains": "by_program", "max_ms": 15000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-page-fleet-api-watchmaker', NULL, 'standing liveness: fleet.qnfo.org/api/watchmaker answers with its schema', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://fleet.qnfo.org/api/watchmaker", "status": 200, "contains": "watchmaker/v1", "max_ms": 15000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now')),
 ('rt-page-fleet-api-cost', NULL, 'standing liveness: fleet.qnfo.org/api/cost answers with its schema', 'none while it passes; 3 straight failures file RUNTIME-PROBE-FAIL-1', '{"url": "https://fleet.qnfo.org/api/cost", "status": 200, "contains": "fleet-cost/v1", "max_ms": 15000}', 'runner-https', 3, 'qnfo-ops', 1, 'active', 'runtime-liveness-v1', 45000, 5, datetime('now'));

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('standing-liveness-parked',
  'a standing runtime liveness contract (module runtime-liveness-v1, no issue) is parked as escalated or monitoring after one transient failure and is never probed again',
  'red-drain step 2 escalates an active contract whose last verdict is fail once its cumulative attempts pass 5 x max_attempts; a liveness contract gains 40 attempts a day, so one slow response before the :35 sweep parks it, and step 6 re-arms only detectors and issue contracts (six parked since 2026-10-19, five of them passing)',
  'RUNTIME-LIVENESS-GAP-1 (migrations/2026-10-26-runtime-liveness-gap.sql): red-drain step 2 excludes module runtime-liveness-v1 and a new last step re-arms any that is parked; the consumer files RUNTIME-PROBE-FAIL-1 after three straight failures, which is the designed response to a down page',
  'fm-standing-liveness-parked: no runtime-liveness-v1 contract with issue_id NULL is escalated or monitoring',
  'fm-standing-liveness-parked', '2026-10-26', NULL,
  'a standing liveness contract with status escalated or monitoring',
  'runtime_verified_share_24h slides under its trigger (8.6 on 2026-10-26) although every page still answers',
  'the independent runtime evidence of the fleet (PROBE-TRANSPORT-MONOCULTURE-1) and the outage detection of every probed page and worker');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-standing-liveness-parked', NULL, 'RUNTIME-LIVENESS-GAP-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts WHERE module = ''runtime-liveness-v1'' AND issue_id IS NULL AND status IN (''escalated'', ''monitoring'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-infra-breach-remediation',
  'an hourly outside-the-account probe of a live URL is runtime evidence, and a sweep written for open-issue probes must not park a standing probe that has no issue',
  'RUNTIME-LIVENESS-GAP-1: red-drain never parks runtime-liveness-v1 contracts and re-arms parked ones; six parked rt-page contracts re-armed; fifteen new hourly runner-https liveness contracts',
  'remediation_verifications 24 h on 2026-10-26 16:20Z: runner-https 2333 of 28236 (runtime share 8.57 %), 40 rows a day per hourly contract; rt-page-fleet-queue, rt-page-fleet-kpi, rt-page-fleet-api-kpi, rt-page-fleet-changelog, rt-page-ideas and rt-page-paper-scholar-tags escalated:over-retried since 2026-10-19..21 while five answer 200 with their marker; seven workers and eight routes with no outside probe; all fifteen new URLs answered 200 with their marker at 16:22Z',
  'applied by migration', 'fleet_tasks red-drain (two edits, backup bak_20261026_liveness_never_parked_task), fleet_tasks_canonical, remediation_contracts (21 rows), failure_modes, one detector; the consumer makes 21 more GETs every 22 minutes',
  'the Rollback line',
  'standing outside-in liveness that survives a transient failure', 'runtime_verified_share_24h above 10 (about 11.2) once a full 24 h of the new contracts is in the window, no contract of module runtime-liveness-v1 escalated at the next three :35 sweeps', NULL,
  'node migrations/runtime-liveness-gap.test.mjs; https GET of the 21 URLs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'RUNTIME-LIVENESS-GAP-1:%');

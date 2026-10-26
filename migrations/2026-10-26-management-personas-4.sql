-- MANAGEMENT-PERSONAS-4 / MANAGERS-PARKED-1 (2026-10-26, pillar autonomy). Owner, 2026-10-26 08:30Z, on the dashboard's
-- "10 things need you": "Why do so many things need me? I'm not doing any of them. Unless it's something very, very specific, these
-- all need to get resolved ... This is not autonomy."
--
-- Measured 2026-10-26 08:35Z: every one of the 10 items was a code_tasks row with status needs_human (the code loop parked it:
-- a large file without an anchor, a .sql file without a verifier, a model that proposed no change, a path outside its merge
-- scope). None was identity-bound. Five belonged to issues already closed or fixed (100445; 1000272, fixed by PR 4308). The
-- session resolved all 10 the same way this migration now does every hour (decision_log row MANAGERS-PARKED-1).
--
-- WHAT THE MANAGERS' HOURLY TICK NOW ALSO DOES (fleet_tasks management-personas, every decision a persona_actions row)
--   1. a parked task whose issue is closed (or names no issue that exists) is superseded: kind 'supersede-task';
--   2. any other task parked for 30 minutes or more gets one Cloudflare agent turn (cf_agent_requests instance 'parked-<task>')
--      that proposes a narrowed goal with a code-anchor, a different file, or evidence the issue is moot, and the task is returned
--      to the fleet as status 'failed' with a merge_note (kind 'replan'); the issue stays open for the planner and its contract;
--   3. the agent's answer is appended to the issue, so the next plan reads it (kind 'replan' to_value 'reported').
-- The owner queue (qnfo-fleet-dashboard 1.68.0) no longer counts code-loop or issue-loop items as owner items at all.
--
-- Stop the decisions without a deploy: INSERT OR REPLACE INTO ops_config (key, value) VALUES ('persona_actions', 'off');
-- Verify after apply:
--   SELECT COUNT(*) FROM code_tasks WHERE status = 'needs_human';   -- 0 within an hour of a park
--   SELECT * FROM persona_actions WHERE kind IN ('supersede-task', 'replan') ORDER BY id DESC LIMIT 10;
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_mp4_workflow
-- Rollback: DROP VIEW IF EXISTS v_parked_code_tasks; UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261026_mp4_workflow WHERE id = 'management-personas'), version = version + 1 WHERE id = 'management-personas'; UPDATE code_tasks SET status = 'needs_human' WHERE merge_note LIKE 'MANAGERS-PARKED-1%';

CREATE TABLE IF NOT EXISTS bak_20261026_mp4_workflow AS SELECT id, definition, version FROM fleet_tasks WHERE id = 'management-personas';

DROP VIEW IF EXISTS v_parked_code_tasks;
CREATE VIEW v_parked_code_tasks AS
SELECT p.task_id, p.path, p.issue_id, p.last_error, p.age_min,
  (SELECT a.status FROM agent_issues a WHERE a.id = p.issue_id) AS issue_status
FROM (
  SELECT t.id AS task_id, t.path, t.last_error,
    CASE WHEN instr(t.goal, 'issue #') > 0 THEN CAST(substr(t.goal, instr(t.goal, 'issue #') + 7, 9) AS INTEGER)
         WHEN t.id LIKE 'ct_im%' THEN CAST(substr(t.id, 6) AS INTEGER) END AS issue_id,
    CAST((julianday('now') - julianday(COALESCE(t.updated_at, t.created_at))) * 1440 AS INTEGER) AS age_min
  FROM code_tasks t WHERE t.status = 'needs_human'
) p;

UPDATE fleet_tasks
SET definition = json_insert(json_insert(json_insert(json_insert(json_insert(json_insert(json_insert(definition,
  '$.steps[#]', json('{"type":"sql","name":"parked-supersede-log","db":"AUDIT","sql":"INSERT INTO persona_actions (persona_key, kind, issue_id, from_value, to_value, evidence) SELECT ''program-manager:'' || COALESCE((SELECT m.program_code FROM issue_project_map m WHERE m.issue_id = v.issue_id LIMIT 1), ''QNFO.OPS''), ''supersede-task'', v.issue_id, ''needs_human:'' || v.task_id, ''superseded'', CASE WHEN v.issue_status IS NULL THEN ''the task names no issue that exists'' ELSE ''issue '' || v.issue_id || '' is '' || v.issue_status || ''; the parked task is moot'' END FROM v_parked_code_tasks v WHERE COALESCE(v.issue_status, ''missing'') <> ''open'' AND COALESCE((SELECT value FROM ops_config WHERE key = ''persona_actions''), ''on'') <> ''off''"}')),
  '$.steps[#]', json('{"type":"sql","name":"parked-supersede","db":"AUDIT","sql":"UPDATE code_tasks SET status = ''superseded'', merge_note = ''MANAGERS-PARKED-1: moot, its issue is closed (revert: status needs_human)'', updated_at = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') WHERE id IN (SELECT task_id FROM v_parked_code_tasks WHERE COALESCE(issue_status, ''missing'') <> ''open'') AND COALESCE((SELECT value FROM ops_config WHERE key = ''persona_actions''), ''on'') <> ''off''"}')),
  '$.steps[#]', json('{"type":"sql","name":"parked-agent-request","db":"AUDIT","sql":"INSERT INTO cf_agent_requests (requester, kind, prompt, instance, priority) SELECT ''program-manager:'' || COALESCE((SELECT m.program_code FROM issue_project_map m WHERE m.issue_id = v.issue_id LIMIT 1), ''QNFO.OPS''), ''run'', ''A code-loop task was parked as needs_human and is returned to the fleet. Task '' || v.task_id || '' on qnfo-workers path '' || v.path || '' for issue #'' || v.issue_id || ''. Its goal: '' || substr((SELECT t.goal FROM code_tasks t WHERE t.id = v.task_id), 1, 2500) || char(10) || ''Why it parked: '' || substr(COALESCE(v.last_error, ''''), 1, 600) || char(10) || ''Propose the smallest concrete next step the fleet can take without a person: (a) a narrowed goal plus a code-anchor line (verbatim text that occurs exactly once in the file near the edit), (b) a different file that should carry the change, or (c) evidence that the issue is moot or a false positive (for example a finding inside bundled vendor code). Answer in under 200 words.'', ''parked-'' || v.task_id, ''medium'' FROM v_parked_code_tasks v WHERE v.issue_status = ''open'' AND v.age_min >= 30 AND NOT EXISTS (SELECT 1 FROM cf_agent_requests r WHERE r.instance = ''parked-'' || v.task_id) AND COALESCE((SELECT value FROM ops_config WHERE key = ''persona_actions''), ''on'') <> ''off'' LIMIT 5"}')),
  '$.steps[#]', json('{"type":"sql","name":"parked-return-log","db":"AUDIT","sql":"INSERT INTO persona_actions (persona_key, kind, issue_id, from_value, to_value, evidence) SELECT r.requester, ''replan'', v.issue_id, ''needs_human:'' || v.task_id, ''failed'', ''returned to the fleet: Cloudflare agent asked for a narrowed goal and anchor (cf_agent_requests #'' || r.id || ''); parked reason: '' || substr(COALESCE(v.last_error, ''''), 1, 200) FROM v_parked_code_tasks v JOIN cf_agent_requests r ON r.instance = ''parked-'' || v.task_id WHERE v.issue_status = ''open'' AND COALESCE((SELECT value FROM ops_config WHERE key = ''persona_actions''), ''on'') <> ''off''"}')),
  '$.steps[#]', json('{"type":"sql","name":"parked-return","db":"AUDIT","sql":"UPDATE code_tasks SET status = ''failed'', merge_note = ''MANAGERS-PARKED-1: returned to the fleet, not the owner; the issue stays open for the planner and a Cloudflare agent re-plan (cf_agent_requests instance parked-'' || id || '') (revert: status needs_human)'', updated_at = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'') WHERE id IN (SELECT v.task_id FROM v_parked_code_tasks v WHERE v.issue_status = ''open'' AND EXISTS (SELECT 1 FROM cf_agent_requests r WHERE r.instance = ''parked-'' || v.task_id)) AND COALESCE((SELECT value FROM ops_config WHERE key = ''persona_actions''), ''on'') <> ''off''"}')),
  '$.steps[#]', json('{"type":"sql","name":"parked-report","db":"AUDIT","sql":"UPDATE agent_issues SET description = COALESCE(description, '''') || char(10) || char(10) || ''Re-plan by the Cloudflare agent for parked code task '' || (SELECT p.from_value FROM persona_actions p WHERE p.kind = ''replan'' AND p.to_value = ''failed'' AND p.issue_id = agent_issues.id ORDER BY p.id DESC LIMIT 1) || '': '' || substr((SELECT COALESCE(r.result, r.error, '''') FROM cf_agent_requests r WHERE r.instance = ''parked-'' || substr((SELECT p.from_value FROM persona_actions p WHERE p.kind = ''replan'' AND p.to_value = ''failed'' AND p.issue_id = agent_issues.id ORDER BY p.id DESC LIMIT 1), 13) ORDER BY r.id DESC LIMIT 1), 1, 2000), updated_at = CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000 WHERE status = ''open'' AND id IN (SELECT p.issue_id FROM persona_actions p JOIN cf_agent_requests r ON r.instance = ''parked-'' || substr(p.from_value, 13) WHERE p.kind = ''replan'' AND p.to_value = ''failed'' AND r.status IN (''done'', ''failed'', ''error''))"}')),
  '$.steps[#]', json('{"type":"sql","name":"parked-report-mark","db":"AUDIT","sql":"UPDATE persona_actions SET to_value = ''reported'' WHERE kind = ''replan'' AND to_value = ''failed'' AND EXISTS (SELECT 1 FROM cf_agent_requests r WHERE r.instance = ''parked-'' || substr(persona_actions.from_value, 13) AND r.status IN (''done'', ''failed'', ''error''))"}')),
  version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'management-personas' AND instr(definition, 'parked-supersede-log') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
VALUES ('management-personas (MANAGEMENT-PERSONAS-4)', 'a code task the code loop parks as needs_human is fleet work (HUMAN-ITEMS-AUTOMATIC-1), not an owner item',
  'managers supersede parked tasks of closed issues and return the rest to the fleet with a Cloudflare agent re-plan, hourly',
  'all 10 owner-queue items on 2026-10-26 08:30Z were parked code tasks; none identity-bound', 'pending',
  'code_tasks rows with status needs_human; the issues they name (description appended)',
  'ops_config persona_actions = off; or the Rollback line of migrations/2026-10-26-management-personas-4.sql',
  'managers resolve parked code tasks', 'code_tasks needs_human = 0 at every hourly tick after a 30-minute grace', 'code_tasks, cf_agent_requests, agent_issues');

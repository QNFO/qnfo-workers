-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN n = 0 THEN ''ok'' ELSE ''pending: '' || n || '' computed metrics on a 1h or 10m cadence not refreshed in 3 h ('' || COALESCE(names, '''') || '')'' END AS observed FROM (SELECT COUNT(*) AS n, group_concat(metric, '', '') AS names FROM metric_registry WHERE refresh_class = ''computed'' AND refresh_cadence IN (''1h'', ''10m'') AND state = ''MEASURED'' AND (last_refreshed IS NULL OR last_refreshed < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-3 hours'')))' WHERE class = 'issue-2192'; UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric=''fleet_ai_run_rate_30d_usd'') AS REAL) <= 15 THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'issue-1780'; UPDATE analytics_metric_triggers SET action = replace(action, 'fleet_ai_run_rate_30d_usd <= 95 (the trigger threshold and the registry target since COST-BUDGET-RECALIBRATION-1; CLOSER-PARITY-1)', 'fleet_ai_run_rate_30d_usd <= 15') WHERE id = 409
-- CLOSER-PARITY-1 (2026-10-13, pillar autonomy, failure mode two-closers-disagree; follows LOOP-ISSUE-FLAP-1 in -05). The
-- detector fm-two-closers-disagree found three more issues than -05 named:
-- (1) 2192 METRIC-REGISTRY-STALENESS-1 (17 reopens in 24 h). qnfo-lifecycle runMetricFreshness files it when any metric is
--     older than twice its refresh cadence or was never refreshed (UNDEFINED and never-read UNMEASURED/n/a rows excluded) and
--     closes it itself when none is. Its contract judged only computed metrics on a 1h or 10m cadence against a 3-hour limit,
--     so at :01 the contract closed it (ask_grounded_share_7d, refresh_class computed but cadence "hourly", was outside its
--     filter) and nine seconds later the lifecycle tick refiled it. The contract now applies the lifecycle rule itself.
-- (2) 1780 METRIC-TRIGGER-409 (fleet_ai_run_rate_30d_usd). The trigger fires above 95 and the registry target is <= 95
--     (COST-BUDGET-RECALIBRATION-1), but the contract and the trigger's action still closed at <= 15, so the issue could
--     close only through the trigger and never on its own contract. The contract and the action now use 95.
-- (3) The detector counted reopens over 24 hours, so it stayed red for a day after a fix. It now counts issues reopened three
--     or more times in the last four hours: an hourly flap shows at once and a fixed one clears within four hours.
-- Also Q08-COMPOSE-CHEAP-FIRST-1 (pillar cost): the q08 owner session (session_01BCBpN3cZdS57dweqCs9rwt, 2026-10-13 06:10Z)
-- asked for the writer-model reorder to wait for 24 h of q08-signal-engine 0.17.3 runs, so a quality change and a model change
-- are not confounded. A gate issue closes on its own probe 24 h after the latest q08-signal-engine deploy; the task issue
-- carries depends-on, so qnfo-code-orchestrator ISSUE-INTAKE-1 holds it until then (INTAKE-DEPENDS-1).
UPDATE remediation_contracts SET verify_transport = 'd1-query',
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN n = 0 THEN ''ok'' ELSE ''pending: '' || n || '' metrics older than twice their refresh cadence or never refreshed, the rule qnfo-lifecycle files this issue on ('' || COALESCE(names, '''') || '')'' END AS observed FROM (SELECT COUNT(*) AS n, group_concat(metric, '', '') AS names FROM (SELECT metric, last_refreshed, CASE WHEN c = ''hourly'' THEN 60 WHEN c = ''daily'' THEN 1440 WHEN c = ''weekly'' THEN 10080 WHEN c = ''monthly'' THEN 43200 WHEN c GLOB ''[*]/[0-9]*[mhd]'' AND substr(c, 3, length(c) - 3) NOT GLOB ''*[^0-9]*'' THEN CAST(substr(c, 3, length(c) - 3) AS INTEGER) * CASE substr(c, -1) WHEN ''m'' THEN 1 WHEN ''h'' THEN 60 ELSE 1440 END WHEN c GLOB ''[*]/[0-9]*'' AND substr(c, 3) NOT GLOB ''*[^0-9]*'' THEN CAST(substr(c, 3) AS INTEGER) WHEN c GLOB ''[0-9]*[mhd]'' AND substr(c, 1, length(c) - 1) NOT GLOB ''*[^0-9]*'' THEN CAST(substr(c, 1, length(c) - 1) AS INTEGER) * CASE substr(c, -1) WHEN ''m'' THEN 1 WHEN ''h'' THEN 60 ELSE 1440 END ELSE NULL END AS cad FROM (SELECT metric, last_refreshed, lower(trim(COALESCE(refresh_cadence, ''''))) AS c FROM metric_registry WHERE upper(COALESCE(state, '''')) <> ''UNDEFINED'' AND NOT (last_refreshed IS NULL AND lower(trim(COALESCE(state, ''''))) IN (''unmeasured'', ''n/a'')))) WHERE cad IS NULL OR last_refreshed IS NULL OR (julianday(''now'') - julianday(replace(substr(last_refreshed, 1, 19), ''T'', '' ''))) * 1440 > cad * 2)',
  status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2192';
UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric=''fleet_ai_run_rate_30d_usd'') AS REAL) <= 95 THEN ''1'' ELSE ''0'' END AS observed',
  next_due_at = datetime('now')
WHERE class = 'issue-1780';
UPDATE analytics_metric_triggers SET action = replace(action, 'fleet_ai_run_rate_30d_usd <= 15', 'fleet_ai_run_rate_30d_usd <= 95 (the trigger threshold and the registry target since COST-BUDGET-RECALIBRATION-1; CLOSER-PARITY-1)') WHERE id = 409;
UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT l.issue_id FROM issue_lifecycle l JOIN agent_issues a ON a.id = l.issue_id WHERE a.status = ''open'' AND l.event = ''reopened'' AND l.ts >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-4 hours'') GROUP BY l.issue_id HAVING COUNT(*) >= 3)) AS TEXT) AS observed',
  next_due_at = datetime('now')
WHERE class = 'fm-two-closers-disagree';
UPDATE failure_modes SET
  root_cause = root_cause || ' | 2026-10-13 CLOSER-PARITY-1: 2192 (qnfo-lifecycle files on every metric past twice its cadence; the contract judged only computed 1h/10m metrics) and 1780 (contract and trigger action closed at <= 15 while the trigger fires above 95)',
  remediation = remediation || ' | CLOSER-PARITY-1: the 2192 contract applies the lifecycle rule; 1780 and trigger 409 close at 95; the detector reads a 4-hour window',
  detector = 'fm-two-closers-disagree: no open issue reopened 3 or more times in the last 4 hours'
WHERE fm_key = 'two-closers-disagree';
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'Q08-COMPOSE-WAIT-1: 24 h of q08-signal-engine runs on its latest deploy before the writer model order changes',
  'Charter pillar: cost. Gate for Q08-COMPOSE-CHEAP-FIRST-1. The q08 owner session (session_01BCBpN3cZdS57dweqCs9rwt) shipped the inverted-pyramid lede rewrite as q08-signal-engine 0.17.0-0.17.3 (0.17.3 deployed 2026-10-13T06:10:50Z) and asked that the writer-model change wait 24 h, so the change that moves writing quality and gate pass rate is not confounded with a model change. This issue closes on its own probe 24 h after the latest successful q08-signal-engine deploy in deployment_history (a later deploy restarts the window); the task issue names it in depends-on.',
  'session_01Kddqwk5gQT5qSSHVKjT2EA', 'cost', 'medium', 'open',
  CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'Q08-COMPOSE-WAIT-1:%');
UPDATE remediation_contracts SET verify_transport = 'd1-query',
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN datetime(''now'') >= datetime(replace(substr((SELECT MAX(deployed_at) FROM deployment_history WHERE resource_name = ''q08-signal-engine'' AND action = ''deploy'' AND status = ''success''), 1, 19), ''T'', '' ''), ''+24 hours'') THEN ''ok'' ELSE ''pending: under 24 h since the latest q08-signal-engine deploy'' END AS observed',
  status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title LIKE 'Q08-COMPOSE-WAIT-1:%' ORDER BY id DESC LIMIT 1);
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'Q08-COMPOSE-CHEAP-FIRST-1: q08 composes on gpt-oss-120b first (304 neurons a call) with nemotron-3-120b as the per-request fallback',
  'Charter pillar: cost. Metrics fleet_ai_run_rate_30d_usd (102.61, trigger above 95), workers_ai_run_rate_usd (113.07) and q08_neurons_per_published_piece_7d (trigger above 6000). q08-signal-engine went from 43k neurons a day (2026-10-10) to 155-167k (10-11, 10-12). ai_call_counters 10-10..10-13: @cf/nvidia/nemotron-3-120b-a12b 325 calls, 240,061 neurons (739 a call, 2 errors); @cf/openai/gpt-oss-120b 215 calls, 65,333 neurons (304 a call, 0 errors). COMPOSE_MODELS tries nemotron first, so most compose calls pay 2.4 times the cost of the second model.' || char(10) ||
  'Edit, in q08-signal-engine/worker.js only, following TWIN-FLASH-1 (personal-api, OWNER-STANDING-GRANT-1: a cheaper model with a per-request fallback and an automatic revert, no A/B): (1) put "@cf/openai/gpt-oss-120b" first in COMPOSE_MODELS and "@cf/nvidia/nemotron-3-120b-a12b" second; compose() already falls through to the next model on an error, an empty reply or a draft of 200 characters or less, and keeps the best draft across models, so nemotron stays the per-request fallback. (2) Add a comment block Q08-COMPOSE-CHEAP-FIRST-1 above COMPOSE_MODELS that names the revert rule. (3) Revert on its own: before composing, read today''s ai_call_counters row for worker q08-signal-engine and model @cf/openai/gpt-oss-120b (the row this worker already writes); when it shows at least 10 calls and errors are 20% or more of calls, use the old order (nemotron first) for the rest of the day. Keep the editor pass (editOrder) unchanged: it reorders COMPOSE_MODELS by family on its own. Bump VERSION (minor: the worker takes a model decision on its own).' || char(10) ||
  'Done when: q08_neurons_per_published_piece_7d falls by at least a third against its value on the merge day, with q08_gate_pass_rate_7d not lower than on the merge day after 7 days; record both on this issue.' || char(10) ||
  'depends-on: #' || CAST((SELECT id FROM agent_issues WHERE title LIKE 'Q08-COMPOSE-WAIT-1:%' ORDER BY id DESC LIMIT 1) AS TEXT) || char(10) ||
  'code-task: repo=qnfo-workers path=q08-signal-engine/worker.js' || char(10) ||
  'code-anchor: var COMPOSE_MODELS = [' || char(10) ||
  'code-probe: {"paths": ["q08-signal-engine/worker.js"], "contains": "Q08-COMPOSE-CHEAP-FIRST-1"}',
  'session_01Kddqwk5gQT5qSSHVKjT2EA', 'cost', 'high', 'open',
  CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'Q08-COMPOSE-CHEAP-FIRST-1:%');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'an issue''s contract applies the rule its filer files on, or two closers flap it every hour',
   'CLOSER-PARITY-1: issue-2192 contract applies qnfo-lifecycle''s freshness rule; issue-1780 and trigger 409 close at 95; fm-two-closers-disagree reads a 4-hour window; Q08-COMPOSE-WAIT-1 gate and Q08-COMPOSE-CHEAP-FIRST-1 code task filed at the q08 owner session''s request',
   'issue_lifecycle 24 h: 2192 reopened 17 times (closed by its contract at :01, refiled by qnfo-lifecycle at :01:09), 1780 8 times; ai_call_counters 10-10..10-13: nemotron-3-120b 739 neurons a call, gpt-oss-120b 304',
   'merged through the canonical path', '2192 stays open until the registry is fresh and closes once; 1780 closes when the run rate is at or below 95; q08 compose cost falls after the gate', 'the Rollback line of this file; close the two Q08-COMPOSE issues as superseded',
   'issue closers agree with their filers', 'fm-two-closers-disagree reads 0 by 11:00 UTC on 2026-10-13; 2192 shows no reopen after 07:00 UTC', 'none', 'd1:issue_lifecycle, remediation_contracts, ai_call_counters, deployment_history; code:qnfo-lifecycle runMetricFreshness');

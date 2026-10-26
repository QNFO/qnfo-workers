-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS evolve_parse_pass_heavy_tick; DELETE FROM analytics_metric_triggers WHERE metric_key = 'evolve_parse_pass_pct_7d'; DELETE FROM metric_registry WHERE metric = 'evolve_parse_pass_pct_7d'; UPDATE transformation_levers SET path = NULL, anchor = NULL, status = 'session', note = 'needs a session: a code lever with no anchor yet (add path and anchor to the lever row to hand it to the code loop)' WHERE tp = 1 AND n = 7;
-- spof-review: fleet_tick_heavy has one producer until FLEET-TICK-HEAVY-SECOND-PRODUCER-1 lands; a missed heavy tick only delays this metric, and an empty 7-day window resets it to UNMEASURED (never stale, never a value). The trigger reads one table once and adds no view.
-- EVOLVE-REASK-1 (2026-10-26, charter pillar: autonomy; agent_issues 100317, transformation lever TP-1.7 evolve-parse-gate; session-old-issues-6d-2038).
-- Read 2026-10-26: lever 7 says "93 of 120 evolve candidates were rejected-parse; definition of done: evolve_parse_pass_pct_7d registered and >= 50". The 93 rows are
-- 2026-09-10 to 2026-09-25 and EVOLVE-JSON-1 (qnfo-fleet-control, 2026-10-02) fixed the parser; no rejected-parse row exists since. The same step now fails another way:
-- evModelJson returns null when the reasoning model (kimi-k2.7-code, max_tokens 2500) spends its budget before the JSON, so the row ends model-skip "no usable JSON ...
-- (empty reply, finish length)": evolve_candidates 117, 121, 122, 124, which is 4 of the 10 proposals since 2026-09-26 and 3 of the last 5. Nothing graded it, which is why the
-- lever could not be measured. This file does the part that is data: it registers the metric the lever's definition of done names (share of proposals in 7 days whose reply
-- gave a usable object; a rejected-parse row or a "no usable JSON" model-skip is a failure; a model that parsed and chose to skip is a pass), with a producer trigger on
-- fleet_tick_heavy, a trigger that files an issue under 50, a first measurement now, and the hand-off of the code change to the code loop (lever row path and anchor, and the
-- code-task lines on issue 100317). The code change itself (re-ask once in evModelJson) is a one-file edit in qnfo-fleet-control/worker.js, which the code loop takes; the
-- closing probe of 100317 is rewritten to read the metric, so the issue closes when the metric reads 50 or more and not when a task merges.
-- MEASURED 2026-10-26T18:0xZ (read-only): proposals in the last 30 days 10, parse failures 4 (60% pass); in the last 7 days 0 proposals, so the metric starts UNMEASURED.
-- Revert: the Rollback line; the lever returns to status session.

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class)
VALUES ('evolve_parse_pass_pct_7d', 'system', 'lagging',
  'ROUND(100 * (proposals - parse failures) / proposals, 1) over evolve_candidates created in the last 7 days whose status is neither proposing nor no-context; a parse failure is status rejected-parse or a model-skip whose note starts "no usable JSON"; UNMEASURED when the window holds no proposal (unknown is never a value)',
  'qnfo-audit.evolve_candidates (status, note), refreshed by trigger evolve_parse_pass_heavy_tick on fleet_tick_heavy',
  '22.5 (27 of 120 candidates parsed, 2026-09-10 to 2026-09-25)', '>= 50', 'qnfo-fleet-control',
  'its own trigger: re-ask once on an unusable reply (EVOLVE-REASK-1, agent_issues 100317)',
  'hourly', '< 50', '< 20', NULL, NULL, 'UNMEASURED', 'computed');

-- First measurement at apply (the same two statements the trigger runs, without the 50-minute gate).
UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT ROUND(100.0 * SUM(CASE WHEN status = 'rejected-parse' OR (status = 'model-skip' AND note LIKE 'no usable JSON%') THEN 0 ELSE 1 END) / COUNT(*), 1)
                        FROM evolve_candidates WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND status NOT IN ('proposing', 'no-context')) AS TEXT)
  WHERE metric = 'evolve_parse_pass_pct_7d'
    AND EXISTS (SELECT 1 FROM evolve_candidates WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND status NOT IN ('proposing', 'no-context'));
UPDATE metric_registry SET last_value = NULL, last_refreshed = NULL, state = 'UNMEASURED'
  WHERE metric = 'evolve_parse_pass_pct_7d' AND state = 'MEASURED'
    AND NOT EXISTS (SELECT 1 FROM evolve_candidates WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND status NOT IN ('proposing', 'no-context'));

-- Hourly refresh on the heavy heartbeat (one trigger, two gated statements).
CREATE TRIGGER IF NOT EXISTS evolve_parse_pass_heavy_tick AFTER INSERT ON fleet_tick_heavy
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT ROUND(100.0 * SUM(CASE WHEN status = 'rejected-parse' OR (status = 'model-skip' AND note LIKE 'no usable JSON%') THEN 0 ELSE 1 END) / COUNT(*), 1)
                          FROM evolve_candidates WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND status NOT IN ('proposing', 'no-context')) AS TEXT)
    WHERE metric = 'evolve_parse_pass_pct_7d' AND (last_refreshed IS NULL OR last_refreshed < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-50 minutes'))
      AND EXISTS (SELECT 1 FROM evolve_candidates WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND status NOT IN ('proposing', 'no-context'));
  UPDATE metric_registry SET last_value = NULL, last_refreshed = NULL, state = 'UNMEASURED'
    WHERE metric = 'evolve_parse_pass_pct_7d' AND state = 'MEASURED'
      AND NOT EXISTS (SELECT 1 FROM evolve_candidates WHERE ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days') AND status NOT IN ('proposing', 'no-context'));
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'evolve_parse_pass_pct_7d', 'Autonomy gap: evolve proposals die at the parse step (usable-reply share under 50% in 7 days)', 'registry', 'lt', 50, 'medium',
  'Pillar autonomy. evolve_parse_pass_pct_7d is the share of evolve_candidates in the last 7 days whose model reply gave a usable JSON object. Under 50 means most proposals die before an anchor is checked: evModelJson in qnfo-fleet-control returns null for an empty reply (finish_reason length: the reasoning model spent max_tokens before the JSON) and the row ends model-skip "no usable JSON". Run: SELECT id, ts, status, note FROM evolve_candidates WHERE ts >= datetime(''now'', ''-7 days'') ORDER BY id DESC. The lever is EVOLVE-REASK-1 (agent_issues 100317): one re-ask when the first reply gives no object, with a larger max_tokens after finish length. If it is merged and the metric is still under 50, read the second reply head in the model-skip note and change the model or the budget, not the threshold. Definition of done: metric_registry.evolve_parse_pass_pct_7d >= 50.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'EVOLVE-REASK-1 2026-10-26, registered with the metric so the lever of transformation lever TP-1.7 is graded (the metric starts UNMEASURED: no proposal in the last 7 days).'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'evolve_parse_pass_pct_7d');

-- Lever 7 of the transformation program: hand the code change to the code loop (path and anchor), as the lever note asks.
UPDATE transformation_levers SET path = 'qnfo-fleet-control/worker.js', anchor = 'async function evModelJson(env, model, system, user) {', status = 'pending',
    detail = 'evModelJson re-asks once when the first reply gives no object: with max_tokens 6000 after finish_reason length or an empty reply, otherwise with one added user message naming the problem; the metric evolve_parse_pass_pct_7d (registered by migrations/2026-10-26-evolve-parse-pass-metric.sql) grades it',
    note = 'EVOLVE-REASK-1 2026-10-26: the 93 rejected-parse rows predate EVOLVE-JSON-1 (none since 2026-09-25); the live failure is an empty reply with finish length (evolve_candidates 117, 121, 122, 124); metric registered; code change handed to the code loop on issue 100317',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
  WHERE tp = 1 AND n = 7 AND status = 'session';

UPDATE agent_issues SET description = description || char(10) || 'EVOLVE-REASK-1 (session-old-issues-6d-2038, 2026-10-26): the lever premise moved. The 93 rejected-parse rows are 2026-09-10 to 2026-09-25 and EVOLVE-JSON-1 fixed the parser; the same step now fails differently: evModelJson returns null when the reasoning model (kimi-k2.7-code, max_tokens 2500) spends its budget before the JSON, so evolve_candidates ends model-skip "no usable JSON ... (empty reply, finish length)": ids 117, 121, 122, 124, which is 4 of the 10 proposals since 2026-09-26 and 3 of the last 5. Change, in evModelJson only: if the first reply gives no object, ask once more. When finish_reason was length or the reply was empty, ask with max_tokens 6000 and the same messages; otherwise ask with the same messages plus one user message "Your previous reply was not a JSON object (<first 160 chars>). Reply with only the JSON object." At most one re-ask and none when the first parse succeeds. Keep EV_LAST_RAW for the final failure so a model-skip row still says what came back. Set a module variable EV_REASKED to true when the second call produced the object and write reasked: true into the proposal JSON next to model. Add to qnfo-fleet-control/evolve-json.test.mjs a case that runs evModelJson with a stubbed aiRunAttr (first reply empty with finish length and the second a valid object) and one where both are empty. Do not change EVOLVE_MODEL, any other max_tokens, or the 40-character anchor rule. The metric evolve_parse_pass_pct_7d and its trigger are registered by migrations/2026-10-26-evolve-parse-pass-metric.sql; the closing probe of this issue reads that metric (definition of done: registered and >= 50).' || char(10) || 'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) || 'code-anchor: async function evModelJson(env, model, system, user) {',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE id = 100317 AND status = 'open' AND instr(description, 'EVOLVE-REASK-1 (session-old-issues-6d-2038') = 0;

-- The BACKFILL contract of 100317 was refused as self-confirming (PROBE-REVIEW-1): it now measures the definition of done.
UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN CAST((SELECT last_value FROM metric_registry WHERE metric = ''evolve_parse_pass_pct_7d'' AND state = ''MEASURED'') AS REAL) >= 50 THEN ''1'' ELSE ''0'' END AS observed'
  WHERE class = 'issue-100317-BACKFILL-1' AND issue_id = 100317;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-old-issues-6d-2038',
  'a transformation lever is closed by its own definition of done, which needs a metric; when the lever premise has moved, the metric and the new failure are recorded before the code is handed on',
  'EVOLVE-REASK-1: register evolve_parse_pass_pct_7d with a producer trigger and a trigger, hand the evModelJson re-ask to the code loop (lever 7 path and anchor, code-task lines on issue 100317), and rewrite the refused closing probe of 100317 to read the metric',
  'qnfo-audit 2026-10-26 read-only: evolve_candidates rejected-parse 93 rows all 2026-09-10..25, none since; model-skip "no usable JSON ... empty reply, finish length" ids 117, 121, 122, 124; 10 proposals since 2026-09-26, 4 failures; evModelJson max_tokens 2500 in qnfo-fleet-control/worker.js',
  'migration merged',
  'one new metric_registry row, one trigger on fleet_tick_heavy, one analytics_metric_triggers row, lever 7 of transformation_levers, one appended note and one probe on issue 100317',
  'the Rollback header of migrations/2026-10-26-evolve-parse-pass-metric.sql',
  'the evolve proposer parse step is graded: a reply that dies at parse shows in evolve_parse_pass_pct_7d and files an issue under 50',
  'the metric reads 50 or more within 7 days of the re-ask landing and agent_issues 100317 closes by its contract',
  'none',
  'd1:qnfo-audit read-only, node:sqlite replay in migrations/evolve-parse-pass-metric.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'EVOLVE-REASK-1:%');

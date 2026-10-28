-- METRIC-UNMEASURED-EXEMPT-1 (2026-10-28, pillar autonomy; agent_issues 1000629, GitHub #5047, family METRIC-UNMEASURED-1).
-- Finding (read 2026-10-28 from live qnfo-audit): 24 enabled-trigger metrics read "unmeasured"; 15 carry [BP26] and are the BP26 sessions' producers. The other 9 split into two kinds:
--   (a) a producer exists and runs, and says so with a sample floor or no input: ask_helpful_rate_30d (5 ratings, floor 10), q08_forecast_void_share (floor 10 finished forecasts),
--       reply_velocity_60m_share_30d and substantive_reply_share_30d (social_replies has 0 rows), jobsearch_reply_rate_90d (floor 10 mature applications, jobsearch_events 0 rows),
--       credibility_events_90d and owner_question_answer_rate_14d (the producer writes "n/a: ..." while its readings are too few), evolve_parse_pass_pct_7d (no evolve_candidates
--       proposal since 2026-10-20, the metric is set back to UNMEASURED by evolve_parse_pass_heavy_tick when the window is empty);
--   (b) no producer value though one is declared: plain_article_coverage_pct (qnfo-gateway articlePublishMetrics): stays an open METRIC-UNMEASURED-1 issue for qnfo-gateway.
-- The hourly management-personas step mi-snapshot files one METRIC-UNMEASURED-1 issue per owner for every unmeasured non-BP26 metric, closes it when the owner's set empties and files it
-- again when a window rolls back to empty: 22 reopens across 11 issues in 7 days. A metric that cannot hold a value until volume arrives is not a missing producer, and writing a value by hand
-- is forbidden, so the kind (a) metrics get a NAMED exemption here: a row with the reason and the condition that ends it, listed in v_metric_unmeasured_exemptions (visible, not hidden), and
-- mi-snapshot treats an exempt metric as tracked elsewhere (the same flag the [BP26] metrics use) only while it holds no value. The moment a value arrives the exemption does nothing; a
-- metric that breaches with a value is judged as before. The trigger rows stay enabled; no probe, cap or guard is weakened.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261028_mue_workflow
-- Rollback: UPDATE fleet_tasks SET definition = (SELECT definition FROM bak_20261028_mue_workflow WHERE id = 'management-personas'), version = version + 1 WHERE id = 'management-personas'; DROP VIEW IF EXISTS v_metric_unmeasured_exemptions; DROP TABLE IF EXISTS metric_unmeasured_exemptions;

CREATE TABLE IF NOT EXISTS bak_20261028_mue_workflow AS SELECT id, definition, version FROM fleet_tasks WHERE id = 'management-personas';

CREATE TABLE IF NOT EXISTS metric_unmeasured_exemptions (
  metric_key TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  ends_when TEXT NOT NULL,
  doer TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

INSERT OR IGNORE INTO metric_unmeasured_exemptions (metric_key, reason, ends_when, doer) VALUES
 ('ask_helpful_rate_30d', 'producer qnfo-ai-search writes nothing below 10 visitor ratings (ask_feedback holds 5 on 2026-10-28)', 'ask_feedback holds 10 ratings in 30 days', 'qnfo-ai-search'),
 ('q08_forecast_void_share', 'producer q08 /api/metrics writes once at least 10 forecasts are finished', '10 q08_forecasts are resolved or void', 'q08-signal-engine'),
 ('reply_velocity_60m_share_30d', 'producer qnfo-social REACH-SIGNALS-1 is NULL while social_replies has no reply (0 rows on 2026-10-28)', 'social_replies holds a reply by another account', 'qnfo-social'),
 ('substantive_reply_share_30d', 'producer qnfo-social REACH-SIGNALS-1 is NULL while social_replies has no reply (0 rows on 2026-10-28)', 'social_replies holds a reply by another account', 'qnfo-social'),
 ('jobsearch_reply_rate_90d', 'unknown by design under 10 applications marked applied 21 to 90 days ago (jobsearch_events has 0 rows on 2026-10-28); no producer can exist before the owner applies', '10 applications are 21 days past applied', 'qnfo-jobsearch'),
 ('credibility_events_90d', 'producer qnfo-paper-indexer writes "n/a: ..." while OpenAlex readings cover too few of the selected works', 'the producer writes a number', 'qnfo-paper-indexer'),
 ('owner_question_answer_rate_14d', 'producer personal-companion writes "n/a" while fewer than the minimum after-event and triage questions were sent in 14 days', 'the producer writes a number', 'personal-companion'),
 ('evolve_parse_pass_pct_7d', 'evolve_parse_pass_heavy_tick leaves it UNMEASURED while evolve_candidates has no proposal in 7 days (newest 2026-10-20)', 'evolve_candidates holds a proposal that is not proposing or no-context', 'qnfo-fleet-control');

CREATE VIEW IF NOT EXISTS v_metric_unmeasured_exemptions AS
SELECT e.metric_key, e.doer, e.reason, e.ends_when, e.created_at,
       CASE WHEN r.last_value IS NULL OR trim(r.last_value) = '' OR r.last_value LIKE 'n/a%' THEN 'exempt' ELSE 'holds a value' END AS status
FROM metric_unmeasured_exemptions e LEFT JOIN metric_registry r ON r.metric = e.metric_key;

-- mi-snapshot: an exempt metric without a value counts as tracked elsewhere (the bp26 flag every filing, probe and close step already reads).
UPDATE fleet_tasks SET
  definition = json_set(definition,
    '$.steps[' || (SELECT j.key FROM json_each(fleet_tasks.definition, '$.steps') j WHERE json_extract(j.value, '$.name') = 'mi-snapshot') || '].sql',
    replace((SELECT json_extract(j.value, '$.sql') FROM json_each(fleet_tasks.definition, '$.steps') j WHERE json_extract(j.value, '$.name') = 'mi-snapshot'),
      'r.source_of_truth LIKE ''%[BP26]%'') THEN 1 ELSE 0 END AS bp26',
      'r.source_of_truth LIKE ''%[BP26]%'') OR (EXISTS (SELECT 1 FROM metric_unmeasured_exemptions e WHERE e.metric_key = t.metric_key) AND (t.val IS NULL OR trim(CAST(t.val AS TEXT)) = '''')) THEN 1 ELSE 0 END AS bp26')),
  version = version + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'management-personas' AND instr(definition, 'metric_unmeasured_exemptions') = 0
  AND instr(definition, 'r.source_of_truth LIKE ''%[BP26]%'') THEN 1 ELSE 0 END AS bp26') > 0;

-- Decision card (policy call surfaced by the WORKFLOW-FAILED-1 root cause, agent_issues 1000558): MERGE-STREAMLINE-1 (PR 4541, owner 2026-10-26) made every deploy-gate step advisory on
-- pull requests, so a violation merges and the strict push run turns red; issue 100412 (deploy-gate) was reopened 14 times in 7 days. Approve: the recommended option is the default.
INSERT OR IGNORE INTO human_actions (slug, title, why, default_in_effect, action, url, sev, status, source)
VALUES ('deploy-gate-pr-strictness',
  'Decide: keep deploy-gate advisory on pull requests, or make only the WORKERS-STANDARDS-GUARD-1 step strict',
  'Approve: make only WORKERS-STANDARDS-GUARD-1 (diff-only, ~15 s) a blocking step on pull requests; every other deploy-gate step stays advisory as MERGE-STREAMLINE-1 intended. Or: keep everything advisory (status quo). Evidence: deploy-gate on main failed on run 40680554551 (swallowed-catch in qnfo-memory-mcp/worker.js, merged because the PR check was advisory) and WORKFLOW-FAILED-1: deploy-gate was reopened 14 times in 7 days; each reopen refiles the ROOT-CAUSE-1 family issue 1000558.',
  'Status quo stays until the fleet applies the approved option: every deploy-gate step is advisory on pull requests, red lands on main, ci-watchdog files it, canary and revert remain the safety net.',
  'Approve the recommended option: a fleet code-task removes continue-on-error from the WORKERS-STANDARDS-GUARD-1 step in .github/workflows/deploy-gate.yml (the lane merges workflow changes since OWNER-AUTO-APPROVE-ALL-1). The card closes when that step has no continue-on-error on pull_request.',
  'https://fleet.qnfo.org', 'low', 'open', 'session:METRIC-UNMEASURED-EXEMPT-1');

-- AB-HARNESS-1 (2026-10-19, pillar autonomy; agent_issues 2828 MODEL-QUALITY-PARITY-1, qnfo-model-eval 1.6.0).
-- Owner-facing effect: when a worker starts using a different model, the fleet compares that model's answers with the old
-- ones on the same prompts, judged by two other model families, and writes the win rate against a stated threshold, so a
-- substitution that answers fluently and worse is a finding and not a silence.
--
-- WHY. On 2026-10-17 twenty workers moved off sub-frontier models. Every check that exists (ai_model_health, the cfmb battery,
-- the error counters) sees reachability, policy compliance or an ERROR; the one defect measurement did catch (kimi-k2.6 as a
-- hedge leg, empty on 11 of 11 then 9 of 18 calls) was visible only because it was an error. A model that answers worse and
-- fluently raises nothing. Nothing in qnfo-audit held a paired quality measurement (model_ab_runs did not exist).
--
-- WHAT THIS FILE ADDS (the worker side is qnfo-model-eval AB-HARNESS-1):
--   model_ab_runs         one row per paired run: pair, worker, task set, n fixtures with a verdict, win rate, the stated
--                         threshold, the verdict (pass, regression, inconclusive, error), the judges and their agreement.
--   model_ab_policy_seen  the model last seen per worker in scripts/model-policy.json, so a changed model is a run and a
--                         worker seen for the first time is a baseline.
--   cf_model_eval_config  ab_enabled (1), ab_threshold, ab_max_runs_per_tick, ab_daily_cap, ab_min_calls, ab_default_task_set.
--   control_registry      model-ab-switch (kill switch) and model-ab-run-cap (cap): each keep, with the alternate path.
--   failure_modes         model-change-unjudged with its fm-model-change-unjudged detector contract.
--   metric_registry       model_ab_judged_runs_7d, refreshed on every fleet_tick (the decision_log prediction subject).
--   remediation_contracts issue-2828: the superseded vacuous probe (it passed only after the close it was blocking) is
--                         replaced by a probe that reads the instrument: the table exists, a judged run with two judge models
--                         exists in the last 7 days, and the hourly tick ran in the last 130 minutes.
--
-- WHAT IS MEASURED AND WHAT IS NOT (2026-10-19, qnfo-audit ai_call_counters). The observed-change trigger reads, per worker, a
-- model with at least 20 calls yesterday or today that the worker did not use (fewer than 3 calls) in the 2 to 15 days before,
-- against its busiest earlier model. On real rows it names three changes: qnfo-research-exec kimi-k2.6 (547 calls, 282 errors;
-- earlier glm-5.3-flash), qnfo-code-orchestrator gpt-oss-120b (231 calls; earlier qwen2.5-coder-32b-instruct) and
-- qnfo-fleet-control nemotron-3-120b-a12b (32 calls; earlier gpt-oss-120b). Nothing here shows the answers got worse; the
-- first runs measure that. The fixtures are passage-grounded and generic (grounded-qa, summarize, reasoning-short, 8 each): they
-- catch empty, unsupported, wrong or truncated answers and are not a worker's own prompts. The seed baseline replies are
-- reference answers authored in qnfo-model-eval/worker.js, not machine recordings; a run with live_pre calls the pre-change
-- model instead. With 8 fixtures and a 0.10 margin below parity (0.5) a single run is a screen, not a proof: judge agreement and
-- the per-fixture rows are kept in detail, and a run with fewer than 6 verdicts or judges that disagree on most fixtures is
-- inconclusive. scripts/model-policy.json did not exist on main; it is added with no governed worker, so the declared trigger is
-- inert until a worker is listed, and the ai_call_counters trigger is the path that covers the changes nobody declared.
-- Path: the post-change model is asked through qnfo-ai with pin_model true; a reply the router served from another model (an id
-- outside its MODELS table such as nemotron-3-120b-a12b, or a spend-cap steer to a cheaper twin) is never scored, the same
-- prompt goes to the Workers AI id through the AI binding, and detail.post_paths records which path answered.
-- Cost: at most ab_max_runs_per_tick (2) runs an hour and ab_daily_cap (12) a day; a run is at most 8 post-change calls and 16
-- judge calls through qnfo-ai (pinned, 400 tokens a judge), so at most 288 calls a day. A breached ai_spend cap does not skip the
-- run (BUDGET-SOFT-ROUTE-1); the run cap is a cadence cap, not a spend budget.
--
-- No metric trigger for model_ab_judged_runs_7d (exemption named here): a week with no model change anywhere is not a breach,
-- and the alarm for a change that was NOT judged is the failure mode fm-model-change-unjudged below.
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS model_ab_judged_runs_tick; DELETE FROM metric_registry WHERE metric = 'model_ab_judged_runs_7d'; DELETE FROM remediation_contracts WHERE class = 'fm-model-change-unjudged'; DELETE FROM failure_modes WHERE fm_key = 'model-change-unjudged'; DELETE FROM control_registry WHERE control IN ('model-ab-switch', 'model-ab-run-cap'); DELETE FROM capability_ledger WHERE capability = 'model-ab-paired-quality'; DELETE FROM cf_model_eval_config WHERE key IN ('ab_enabled', 'ab_threshold', 'ab_max_runs_per_tick', 'ab_daily_cap', 'ab_min_calls', 'ab_default_task_set'); UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:closure-observing-probe (rollback of AB-HARNESS-1)', verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = 2828) AS observed' WHERE class = 'issue-2828'; DROP TABLE IF EXISTS model_ab_policy_seen; DROP TABLE IF EXISTS model_ab_runs

CREATE TABLE IF NOT EXISTS model_ab_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  run_id TEXT,
  model_pair TEXT NOT NULL,
  worker TEXT NOT NULL,
  task_set TEXT NOT NULL,
  pre_model TEXT NOT NULL,
  post_model TEXT NOT NULL,
  trigger_source TEXT NOT NULL DEFAULT 'manual',
  n INTEGER NOT NULL DEFAULT 0,
  win_rate REAL,
  threshold REAL NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('pass', 'regression', 'inconclusive', 'error')),
  judges TEXT,
  judge_agreement REAL,
  pre_source TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_model_ab_runs_created ON model_ab_runs (created_at);
CREATE INDEX IF NOT EXISTS idx_model_ab_runs_pair ON model_ab_runs (worker, post_model, created_at);

CREATE TABLE IF NOT EXISTS model_ab_policy_seen (
  worker TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  task_set TEXT,
  seen_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO cf_model_eval_config (key, value) VALUES ('ab_enabled', '1');
INSERT OR IGNORE INTO cf_model_eval_config (key, value) VALUES ('ab_threshold', '0.4');
INSERT OR IGNORE INTO cf_model_eval_config (key, value) VALUES ('ab_max_runs_per_tick', '2');
INSERT OR IGNORE INTO cf_model_eval_config (key, value) VALUES ('ab_daily_cap', '12');
INSERT OR IGNORE INTO cf_model_eval_config (key, value) VALUES ('ab_min_calls', '20');
INSERT OR IGNORE INTO cf_model_eval_config (key, value) VALUES ('ab_default_task_set', 'grounded-qa');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('model-ab-switch', 'qnfo-model-eval worker.js abTick(): cf_model_eval_config ab_enabled', 'kill-switch',
  'the A/B harness spending judge and post-change calls through qnfo-ai on a bad trigger, or filing regression issues from fixtures that do not represent a worker',
  0, 'keep', 'applied',
  'set ab_enabled = 0: the hourly tick stops running A/B work within one tick, no deploy; POST /ab/run still runs one pair by hand; ab-harness.test.mjs proves the off path and that the 6-hourly battery is untouched',
  '2026-10-19',
  'MEASURED 2026-10-19: no instrument compared the answers of a pre-change and a post-change model (model_ab_runs did not exist) while 20 workers changed model on 2026-10-17. The harness is bounded by this switch, by model-ab-run-cap and by dedupe on worker, pre and post model for 7 days; its judges are pinned through qnfo-ai and a reply served by another model is not counted.',
  2828),
 ('model-ab-run-cap', 'qnfo-model-eval worker.js abTick(): cf_model_eval_config ab_max_runs_per_tick (2) and ab_daily_cap (12)', 'cap',
  'a burst of detected model changes (a deploy that moves many workers at once) running dozens of A/B runs in an hour',
  0, 'keep', 'applied',
  'raise ab_max_runs_per_tick or ab_daily_cap in cf_model_eval_config, or run POST /ab/run by hand for one pair; unrun candidates are detected again on the next tick while the change is inside the 2-day observation window',
  '2026-10-19',
  'MEASURED 2026-10-19: three observed model changes in the last two days (qnfo-research-exec, qnfo-code-orchestrator, qnfo-fleet-control); at most 2 runs a tick drains them in two ticks. A run is at most 24 calls, so 12 runs a day is at most 288 calls through qnfo-ai. A cadence cap, not a spend budget: a breached ai_spend cap does not skip a run (BUDGET-SOFT-ROUTE-1).',
  2828);

-- the vacuous issue-2828 probe passed only after the close it was blocking (CLOSE-PROBE-CIRCULAR-1 superseded it); replace it
-- with one that reads the instrument. The row is copied to bak_20261019_issue_2828_contract first.
CREATE TABLE IF NOT EXISTS bak_20261019_issue_2828_contract AS
SELECT class, issue_id, precondition, action, verify_probe, verify_transport, status, last_verdict, module FROM remediation_contracts WHERE class = 'issue-2828';

UPDATE remediation_contracts SET
  precondition = 'AB-HARNESS-1 (qnfo-model-eval 1.6.0, migrations/2026-10-19-model-ab.sql)',
  action = 'a paired A/B quality harness: model_ab_runs holds a judged run (pass or regression, two judge models) from the last 7 days and the hourly tick that triggers it ran within 130 minutes; the superseded probe read only the issue''s own status',
  verify_transport = 'd1-query',
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE name = ''model_ab_runs'') THEN ''pending: model_ab_runs does not exist'' WHEN (SELECT COUNT(*) FROM model_ab_runs WHERE verdict IN (''pass'', ''regression'') AND instr(judges, '','') > 0 AND created_at >= datetime(''now'', ''-7 days'')) = 0 THEN ''pending: no judged A/B run with two judge models in 7 days'' WHEN COALESCE((SELECT MAX(fired_epoch_ms) FROM cron_fire_log WHERE task_id = ''qnfo-model-eval'' AND cron_expr = ''20 * * * *'' AND outcome = ''ok''), 0) < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 7800) * 1000 THEN ''pending: the qnfo-model-eval hourly tick has not run ok in 130 minutes'' ELSE ''ok'' END AS observed',
  module = 'issue-2828-ab-harness',
  status = 'active',
  last_verdict = NULL,
  attempts = 0
WHERE class = 'issue-2828';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('model-change-unjudged', 'a worker starts using a different model and nobody measures whether its answers got worse',
  'every instrument on a model reads reachability, policy compliance or an error count; a model that answers fluently and worse raises none of them, and a model that answers empty shows only as an error share (kimi-k2.6, 2026-10-17)',
  'AB-HARNESS-1 (qnfo-model-eval 1.6.0): the hourly tick compares the post-change model with the pre-change baseline on the same prompts, judged by two other families, and writes the win rate to model_ab_runs; a regression files an issue; cf_model_eval_config ab_enabled = 0 stops it',
  'no model that a worker used for the first time yesterday (at least 20 calls, fewer than 3 in the 2 to 15 days before, against a busier earlier model of the same worker) lacks a judged model_ab_runs row (pass, regression or inconclusive) from the last 7 days',
  'fm-model-change-unjudged', '2026-10-19', 2828,
  'a model or provider change for a worker, declared in scripts/model-policy.json or not', 'answers get worse or thinner after a model change and every health, error and policy check stays green', 'every caller of the changed worker: research, code planning, companion replies');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-model-change-unjudged', NULL, 'AB-HARNESS-1', 'failure mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM (SELECT y.worker AS w, y.model AS m FROM (SELECT worker, model, SUM(calls) AS c FROM ai_call_counters WHERE day = date(''now'', ''-1 day'') AND model IS NOT NULL GROUP BY worker, model HAVING SUM(calls) >= 20) y WHERE instr(y.model, ''bge'') = 0 AND instr(y.model, ''clef'') = 0 AND NOT EXISTS (SELECT 1 FROM ai_call_counters p WHERE p.worker = y.worker AND p.model = y.model AND p.day < date(''now'', ''-1 day'') AND p.day >= date(''now'', ''-15 day'') GROUP BY p.worker HAVING SUM(p.calls) >= 3) AND EXISTS (SELECT 1 FROM ai_call_counters q WHERE q.worker = y.worker AND q.model <> y.model AND instr(q.model, ''bge'') = 0 AND q.day < date(''now'', ''-1 day'') AND q.day >= date(''now'', ''-15 day'') GROUP BY q.worker, q.model HAVING SUM(q.calls) >= 20) AND NOT EXISTS (SELECT 1 FROM model_ab_runs a WHERE a.worker = y.worker AND a.post_model = y.model AND a.verdict IN (''pass'', ''regression'', ''inconclusive'') AND a.created_at >= datetime(''now'', ''-7 days'')))) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0);

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES ('model-ab-paired-quality', 'qnfo-model-eval 1.6.0 AB-HARNESS-1 (agent_issues 2828)', 'QNFO_AI service binding with props caller qnfo-model-eval, model_ab_runs, a judge pool of five model families',
  'new: the first judged runs are measured after the deploy; a single run of 8 fixtures is a screen, not a proof', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'the fleet can compare a worker''s post-change model with its pre-change baseline on the same prompts, judged by two other model families, and file a regression; before this, answer quality after a model change was unmeasured (model_ab_runs did not exist)');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('model_ab_judged_runs_7d', 'operational', 'leading',
  'COUNT(*) of model_ab_runs with verdict pass or regression created in the last 7 days (a paired, judged comparison of a pre-change and a post-change model)',
  'qnfo-audit.model_ab_runs (AB-HARNESS-1, migrations/2026-10-19-model-ab.sql)',
  '0 on 2026-10-19: model_ab_runs did not exist', '>= 1 in any week that follows a model change; 0 in a week with no change is not a breach', 'qnfo-model-eval', 'qnfo-fleet-control', 'hourly', NULL, NULL, NULL, NULL, 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS model_ab_judged_runs_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST(
      (SELECT COUNT(*) FROM model_ab_runs WHERE verdict IN ('pass', 'regression') AND created_at >= datetime('now', '-7 days')) AS TEXT)
  WHERE metric = 'model_ab_judged_runs_7d';
END;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-session:session_01JADz8uHqYt9eUMBTwbbBE6', 'a model change is safe only if its answers are not worse, and nothing measured that after the 2026-10-17 substitution of 20 workers',
  'AB-HARNESS-1: a paired A/B harness in qnfo-model-eval (fixtures in the worker, post-change model through qnfo-ai with pin_model, two judge families, win rate against a stated threshold in model_ab_runs), triggered by scripts/model-policy.json and by ai_call_counters',
  'qnfo-audit 2026-10-19: model_ab_runs absent; ai_call_counters names three model changes in two days (qnfo-research-exec kimi-k2.6 with 282 errors of 547 calls, qnfo-code-orchestrator gpt-oss-120b, qnfo-fleet-control nemotron-3-120b-a12b); issue 2828 contract was a superseded self-referential probe; scripts/model-policy.json absent on main',
  'pending', 'qnfo-model-eval spends at most 288 qnfo-ai calls a day on judging; it files a deduped agent_issues row for a regression; it changes no worker, route or model choice',
  'cf_model_eval_config ab_enabled = 0 (within one tick), or the Rollback header, or revert the qnfo-model-eval commit',
  'the fleet measures answer quality after a model change (paired, judged, repeatable offline) and files a regression',
  'model_ab_judged_runs_7d >= 1 within 24 h', 'none',
  'qnfo-audit ai_call_counters, model_ab_runs, cf_model_eval_config, qnfo-ai /v1/chat/completions contract (pin_model, props caller)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'AB-HARNESS-1: a paired A/B harness') = 1);

INSERT INTO fleet_tick (source) VALUES ('migration:model-ab');

-- STOP-WASTE-1 (2026-11-04, owner: "I see a lot of waste, a lot of churn"; charter pillar: cost).
-- Evidence (qnfo-audit.ai_call_counters, 3 full days to 2026-11-03): glm-5.3-flash research calls fail 25-79% (revise 252/319, ensemble 130/127,
--   reconcile 81/101 errors per day), each retry burning neurons for no output; code_tasks last 3 days: 532 superseded + 311 failed + 97 closed vs 422 merged.
-- Action: fewer parallel research lanes (fewer failing retries, same published output because the daily neuron budget is the real ceiling) and a smaller code planning cap.
-- A public stopped list (stopped_list) records each stop with its reason and revert line.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value='36' WHERE key='research_parallel'; UPDATE ops_config SET value='48' WHERE key='code_plan_daily_cap'; DROP TABLE stopped_list;
-- CAUSE-MAPPED: registers no metric_registry row.

CREATE TABLE IF NOT EXISTS stopped_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  evidence TEXT,
  revert TEXT NOT NULL,
  stopped_at TEXT NOT NULL DEFAULT (datetime('now'))
);

UPDATE ops_config SET value='12' WHERE key='research_parallel';
UPDATE ops_config SET value='24' WHERE key='code_plan_daily_cap';

INSERT OR IGNORE INTO stopped_list (item, reason, evidence, revert) VALUES
('research_parallel 36 -> 12', 'glm-5.3-flash research lanes fail 25-79% of calls; extra parallel lanes only multiply failing retries', 'ai_call_counters 2026-11-01..03: revise 252 errors of 319 calls/day', 'UPDATE ops_config SET value=''36'' WHERE key=''research_parallel'''),
('code_plan_daily_cap 48 -> 24', '532 of 1420 code tasks superseded and 311 failed in 3 days; planning more than merges is churn', 'code_tasks 2026-11-01..04: merged 422, superseded 532, failed 311', 'UPDATE ops_config SET value=''48'' WHERE key=''code_plan_daily_cap''');

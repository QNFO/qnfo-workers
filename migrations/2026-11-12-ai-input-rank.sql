-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_ai_input_rank_7d; DROP TABLE IF EXISTS ai_input_baseline;
-- AI-INPUT-CUT-1 (agent_issues 1001691, pillar cost; owner 2026-11-04: input tokens are the Workers AI cost driver). Ranks callers by input tokens
-- over 7 days from ai_call_counters (indexed by day) and keeps a baseline per change so in_tok per call can be compared before and after.
-- CAUSE-MAPPED: no metric registered; view and baseline table only.
CREATE VIEW IF NOT EXISTS v_ai_input_rank_7d AS
SELECT worker, SUM(calls) AS calls, SUM(in_tok) AS in_tok, SUM(out_tok) AS out_tok, ROUND(SUM(neurons)) AS neurons,
       ROUND(1.0 * SUM(in_tok) / MAX(SUM(calls), 1)) AS in_tok_per_call
FROM ai_call_counters WHERE day >= date('now', '-7 day') GROUP BY worker ORDER BY in_tok DESC;
CREATE TABLE IF NOT EXISTS ai_input_baseline (change_key TEXT, worker TEXT, purpose TEXT, calls INTEGER, in_tok INTEGER, in_tok_per_call REAL,
  predicted_in_tok_per_call REAL, measured_from TEXT, note TEXT, PRIMARY KEY (change_key, worker, purpose));
INSERT OR IGNORE INTO ai_input_baseline VALUES
 ('AI-INPUT-RANK','personal-companion','factcheck',2131,12383563,5811,NULL,'2026-11-05..2026-11-12','a plain 10-minute cache was tried and rejected: the prune loop re-asks an unchanged draft on purpose (verify.test.mjs); cut ground size instead'),
 ('AI-INPUT-RANK','qnfo-research-exec','*',3809,73151098,19205,NULL,'2026-11-05..2026-11-12','TOKEN-CUT-1 owns it'),
 ('AI-INPUT-RANK','qnfo-agents','*',4861,22385363,4605,NULL,'2026-11-05..2026-11-12','AGENTS-INPUT-CUT-1 (#7273) owns it'),
 ('AI-INPUT-RANK','qnfo-code-orchestrator','ladder',2562,18572575,7249,NULL,'2026-11-05..2026-11-12','top neurons (2.78M); claimed by code loop, queued as code-task'),
 ('AI-INPUT-RANK','qnfo-paper-reviser','binding',295,9113273,30892,NULL,'2026-11-05..2026-11-12','folded into research-exec; 29-33k in/call, queued');

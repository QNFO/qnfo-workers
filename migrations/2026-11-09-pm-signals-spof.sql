-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM spof_registry WHERE component IN ('q08-prediction-markets news evidence', 'q08-prediction-markets probability model');
-- spof-review: GDELT (api.gdeltproject.org) and Hacker News (hn.algolia.com) are the evidence sources and qnfo-ai (qnfo-ai.internal) the only model path of the signal strategy; either evidence source can fail alone (the other still supplies evidence) and if the evidence or the models fail the strategy opens nothing and the rest of the book keeps running (second path: none needed, a missing estimate is not a trade).
--
-- PM-SIGNALS-1 (2026-11-09, charter pillar personal; owner direction: short-term, non-sports predictions that the markets may undervalue).
-- q08-prediction-markets now reads recent headlines per market and asks the fleet AI router for a probability without showing it the market price.
-- Both are new external dependencies of the worker, recorded here as the doctrine and the SPOF review gate ask.
INSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, reviewed_at) VALUES
 ('q08-prediction-markets news evidence',
  'https://api.gdeltproject.org/api/v2/doc/doc and https://hn.algolia.com/api/v1/search_by_date (both free, no key) -> fetchNews() -> evidence for each candidate market, at most MAX_EST=3 markets per 5-minute tick, each re-estimated at most every 6 hours',
  'the two sources are independent (a failure of one still leaves the other); fewer than 3 pieces of evidence in total means the market is recorded as "no-evidence" and no trade is opened; existing positions, exits and the dashboard are unaffected',
  '2026-11-09',
  'q08-prediction-markets/worker.js fetchNews, estimate; tick.test.mjs "too few headlines opens nothing but is still recorded"',
  '2026-11-09'),
 ('q08-prediction-markets probability model',
  'QNFO_AI service binding (qnfo-ai /v1/chat/completions, three model families glm-5.3-flash, deepseek-v4-flash and qwen3-30b-a3b, caller prop q08-prediction-markets) -> askModel() -> parseEstimate() -> aggregate()',
  'the three members are independent: one failing leaves two, and fewer than two answers is no estimate and no trade; no binding means status "no-ai" in the tick result and no trade',
  '2026-11-09',
  'q08-prediction-markets/worker.js askModel, estimate; tick.test.mjs "without the AI binding the signal strategy reports no-ai and trades nothing"',
  '2026-11-09');

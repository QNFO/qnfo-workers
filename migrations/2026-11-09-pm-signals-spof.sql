-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM spof_registry WHERE component IN ('q08-prediction-markets news evidence', 'q08-prediction-markets probability model');
-- spof-review: GDELT (api.gdeltproject.org) is the only news source and qnfo-ai (qnfo-ai.internal) the only model path of the signal strategy; if either fails the strategy opens nothing and the rest of the book keeps running (second path: none needed, a missing estimate is not a trade).
--
-- PM-SIGNALS-1 (2026-11-09, charter pillar personal; owner direction: short-term, non-sports predictions that the markets may undervalue).
-- q08-prediction-markets now reads recent headlines per market and asks the fleet AI router for a probability without showing it the market price.
-- Both are new external dependencies of the worker, recorded here as the doctrine and the SPOF review gate ask.
INSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, reviewed_at) VALUES
 ('q08-prediction-markets news evidence',
  'https://api.gdeltproject.org/api/v2/doc/doc (free, no key) -> fetchNews() -> evidence for each candidate market, at most MAX_EST=3 markets per 5-minute tick, each re-estimated at most every 6 hours',
  'none needed: fewer than 3 headlines (or a failed call) means the market is recorded as "no-evidence" and no trade is opened; existing positions, exits and the dashboard are unaffected',
  '2026-11-09',
  'q08-prediction-markets/worker.js fetchNews, estimate; tick.test.mjs "too few headlines opens nothing but is still recorded"',
  '2026-11-09'),
 ('q08-prediction-markets probability model',
  'QNFO_AI service binding (qnfo-ai /v1/chat/completions, model glm-5.3-flash, caller prop q08-prediction-markets) -> askModel() -> parseEstimate()',
  'none needed: no binding or a router error means no estimate and no new signal trade (status "no-ai" in the tick result); the older price-only strategies stay off by default (STRATEGIES var)',
  '2026-11-09',
  'q08-prediction-markets/worker.js askModel, estimate; tick.test.mjs "without the AI binding the signal strategy reports no-ai and trades nothing"',
  '2026-11-09');

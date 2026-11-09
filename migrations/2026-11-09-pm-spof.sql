-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM spof_registry WHERE component = 'q08-prediction-markets market feed';
-- spof-review: gamma-api.polymarket.com is the only market-data source of q08-prediction-markets; the second path is the labelled synthetic feed in the same worker, and the paper book keeps ticking on it (no real money is ever at risk).
--
-- PM-CONSOLIDATE-1 (2026-11-09, charter pillar personal). q08-prediction-markets reads Polymarket's public Gamma API every 5 minutes (cron */5 * * * *).
-- The squash merge of PR 8768 dropped the commit-message line the SPOF review gate reads, so deploy-gate went red on that one push (ci-watchdog issue 8801);
-- this file is the durable record the gate and the doctrine ask for (a new single point of failure goes in spof_registry).
INSERT OR REPLACE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, reviewed_at) VALUES
 ('q08-prediction-markets market feed',
  'https://gamma-api.polymarket.com/markets (public, no key) -> q08-prediction-markets tick() every 5 minutes -> pt_market quotes and paper entries/exits',
  'fetchMarkets() falls back to syntheticMarkets(), a deterministic labelled feed (source "synthetic"); held positions keep their stored mark and exit only on a quote refreshed in the same tick; manual orders refuse a quote older than 15 minutes',
  '2026-11-09',
  'q08-prediction-markets/worker.js fetchMarkets, tick, manualOrder; tests q08-prediction-markets/tick.test.mjs; live GET https://markets.q08.org/api/state shows source per market',
  '2026-11-09');

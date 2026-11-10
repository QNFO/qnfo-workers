-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM paper_demos WHERE slug = 'institutionalized-unfalsifiability-as-an-evolutionarily-stable-strategy-in-scien';
-- PAPER-DEMOS-2 (pillar reach): second interactive demo, linked from its paper page by qnfo-gateway 3.67.0 (paper_demos, 2026-11-10-paper-demos.sql).
INSERT OR REPLACE INTO paper_demos (slug, url, repo, title, summary) VALUES (
  'institutionalized-unfalsifiability-as-an-evolutionarily-stable-strategy-in-scien',
  'https://qnfo.github.io/paper-demo-unfalsifiability-ess/',
  'QNFO/paper-demo-unfalsifiability-ess',
  'Open the interactive demo',
  'Set the reward for correct predictions and the cost of failure, then watch whether testable research spreads or dies out among 1,000 simulated researchers.'
);

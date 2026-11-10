-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS paper_demos;
-- PAPER-DEMOS-1 (pillar reach): interactive GitHub Pages demos linked from the paper page, like youtube_videos. Read by qnfo-gateway 3.67.0.
CREATE TABLE IF NOT EXISTS paper_demos (
  slug TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  repo TEXT,
  title TEXT,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR REPLACE INTO paper_demos (slug, url, repo, title, summary) VALUES (
  'cross-model-llm-convergence-as-a-bayesian-gate-check-for-fringe-physics-claims',
  'https://qnfo.github.io/paper-demo-llm-convergence-gate/',
  'QNFO/paper-demo-llm-convergence-gate',
  'Open the interactive demo',
  'Set the prior, the agreement chances and the panel size, and watch how much agreement between AI models is worth. A simulation checks the maths and a table reproduces the paper''s numbers.'
);

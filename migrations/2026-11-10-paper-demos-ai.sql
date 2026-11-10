-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM paper_demos WHERE url IN ('https://qnfo.github.io/paper-demo-agentic-collapse/','https://qnfo.github.io/paper-demo-agent-deadlock/','https://qnfo.github.io/paper-demo-hallucination-monna-map/','https://qnfo.github.io/paper-demo-subliminal-learning/');
-- PAPER-DEMOS-3 (pillar reach): one interactive demo (agentic collapse) for AI papers, linked from the paper page by qnfo-gateway paper_demos.
INSERT OR REPLACE INTO paper_demos (slug, url, repo, title, summary) VALUES
('agentic-collapse','https://qnfo.github.io/paper-demo-agentic-collapse/','QNFO/paper-demo-agentic-collapse','Open the interactive demo','Add steps to an AI agent''s task and watch its chance of success and the cost of checking its work collapse.');

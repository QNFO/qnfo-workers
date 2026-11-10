-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM paper_demos WHERE url IN ('https://qnfo.github.io/paper-demo-agentic-collapse/','https://qnfo.github.io/paper-demo-agent-deadlock/','https://qnfo.github.io/paper-demo-hallucination-monna-map/','https://qnfo.github.io/paper-demo-subliminal-learning/');
-- PAPER-DEMOS-3 (pillar reach): four interactive demos for AI papers, linked from the paper page by qnfo-gateway paper_demos.
INSERT OR REPLACE INTO paper_demos (slug, url, repo, title, summary) VALUES
('agentic-collapse','https://qnfo.github.io/paper-demo-agentic-collapse/','QNFO/paper-demo-agentic-collapse','Open the interactive demo','Add steps to an AI agent''s task and watch its chance of success and the cost of checking its work collapse.'),
('specification-induced-deadlock-in-zero-tolerance-agent-protocols-a-state-machine','https://qnfo.github.io/paper-demo-agent-deadlock/','QNFO/paper-demo-agent-deadlock','Open the interactive demo','Play the agent: disable a tool and see when a zero-tolerance protocol leaves it stuck instead of able to stop.'),
('monna-map-projection-of-ultrametric-thought-as-a-geometric-explanation-for-hallu','https://qnfo.github.io/paper-demo-hallucination-monna-map/','QNFO/paper-demo-hallucination-monna-map','Open the interactive demo','Move a query through a knowledge tree and see when the projected answer lands where nothing supports it.'),
('latent-manifold-inheritance-a-geometric-account-of-subliminal-trait-transfer-in-','https://qnfo.github.io/paper-demo-subliminal-learning/','QNFO/paper-demo-subliminal-learning','Open the interactive demo','Fine-tune a student on harmless-looking data from a teacher and watch the teacher''s hidden trait transfer.');

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM paper_demos WHERE url = 'https://qnfo.github.io/paper-demo-hallucination-monna-map/';
-- PAPER-DEMOS-3b (pillar reach): fourth AI-paper demo (Monna-map hallucination), linked from its paper page by qnfo-gateway paper_demos.
INSERT OR REPLACE INTO paper_demos (slug, url, repo, title, summary) VALUES
('monna-map-projection-of-ultrametric-thought-as-a-geometric-explanation-for-hallu','https://qnfo.github.io/paper-demo-hallucination-monna-map/','QNFO/paper-demo-hallucination-monna-map','Open the interactive demo','Move a query through a knowledge tree and see when the projected answer lands where nothing supports it.');

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM research_queue WHERE source = 'intent' AND source_id = 'int-12c5dfa2mw923hks';
-- CAUSE-MAPPED: no metric registered; queues one owner research request (issue 9688)

-- Issue 9688 (INTENT-TASK int-12c5dfa2mw923hks): owner asked to add this follow-up to the research pipeline.
INSERT OR IGNORE INTO research_queue (id, source, source_id, idea, summary, score, decision, status, created_at)
VALUES ('intent-int-12c5dfa2mw923hks', 'intent', 'int-12c5dfa2mw923hks',
 'Deep-dive follow-up on "Excluded Middle as Computational Boundary" (https://papers.qnfo.org/papers/excluded-middle-as-computational-boundary): ontological consequences of constructivist versus classical logic for computation. (1) Formal comparison of choice sequences and the Turing tape as models of physical reality. (2) Empirical testability of epistemic incompleteness claims. (3) Architectural proposals that embody rather than simulate constructivist principles.',
 'Owner request via qnfo-ai research gateway, intent int-12c5dfa2mw923hks.', 0.9, 'ACCEPT', 'queued', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

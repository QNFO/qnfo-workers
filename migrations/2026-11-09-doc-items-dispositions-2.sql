-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE issue_triage SET close_evidence = NULL WHERE issue_id IN (1002671, 1002685) AND close_evidence LIKE 'DOC-ITEMS-SWEEP-3:%';
-- CAUSE-MAPPED: no metric registered; dispositions for DOC-GATE-1 issues 9664 and 9689

-- DOC-ITEMS-SWEEP-3 (GitHub 9664, 9689). Each item has an explicit disposition.
UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-3: (1) Lighthouse key and (2) Arweave wallet are optional paid or credentialed extras, an owner-only step with no repository surface, not adopted. (3) KG write tool: superseded by KG-CURATE-1, scripts/kg_curate.mjs seeds nodes and edges from kg-curate.yml (docs/KNOWLEDGE-GRAPH.md). (4) papers.qnfo.org WAF allowing Python urllib: not applicable, fleet probes run from Workers and runners with their own user agents; no test depends on it.'
WHERE issue_id = 1002671 AND close_evidence IS NULL;

UPDATE issue_triage SET close_evidence = 'DOC-ITEMS-SWEEP-3: the 2026-07-19 handoff notes are session-local. Item 2 (no D1 handoff row) no longer applies: D1 is reachable from sessions and handoffs live in docs/handoff and GitHub issues. Item 1 (Meijer/Geesink deliverable files) is an owner-archive backup check that needs the owner's files; no repository code surface, not verified here.'
WHERE issue_id = 1002685 AND close_evidence IS NULL;

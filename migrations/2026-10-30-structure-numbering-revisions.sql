-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM research_queue WHERE source = 'remediation' AND source_id LIKE 'revision:%@structure-numbering#1' AND status = 'queued' AND attempt = 0;
-- STRUCTURE-NUMBERING-1, charter pillar research; refs #5188, internal issue 1000540.
-- Queue the eight incident papers for the existing versioned revision pipeline, never withdraw or rewrite published bodies here.
-- An existing queued, deferred, researching or review remediation owns the paper; do not create competing revisions.
WITH incident(slug) AS (VALUES
  ('quniverse-fleet-lessons'),
  ('ontological-re-entry-what-can-we-say-exists'),
  ('non-computable-reals-as-projection-artifacts-a-rec'),
  ('institutionalized-unfalsifiability-as-an-evolution'),
  ('non-archimedean-statistical-foundations-for-a-full'),
  ('p-adic-ultrametric-embeddings-for-explainable-hier'),
  ('ultrametric-passive-fault-tolerance-on-bruhat-tits'),
  ('passive-quantum-error-correction-via-ultrametric-g')
)
INSERT OR IGNORE INTO research_queue
  (id, source, source_id, idea, summary, score, decision, status, paper_slug, created_at, stage, attempt, revise_count, recover_count)
SELECT 'rem-structure-' || slug, 'remediation', 'revision:' || slug || '@structure-numbering#1',
  'Post-publication structural correction of the paper ' || slug || '. Preserve the complete paper, its correct claims, equations, citations and reference list. Renumber every third-level subsection a.b to match the numbered second-level section a above it; update all cross-references to any renumbered heading. Do not change mathematical values or source claims. Return a complete corrected paper with an auditable version history, not a list of changes. STRUCTURE-NUMBERING-1: this paper was named by issue 1000540.',
  '', 0.96, 'ACCEPT', 'queued', slug, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'ground', 0, 0, 0
FROM incident
WHERE NOT EXISTS (
  SELECT 1 FROM research_queue r WHERE r.source = 'remediation' AND r.paper_slug = incident.slug
    AND r.status IN ('queued', 'deferred', 'researching', 'review')
);

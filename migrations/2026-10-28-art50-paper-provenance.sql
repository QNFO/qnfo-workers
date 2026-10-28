-- APPLY-BY: ci
-- DB: living-paper
-- Rollback: DROP TRIGGER IF EXISTS paper_provenance_ai; the paper_provenance table is kept (it is the provenance record; dropping it would only make the page fall back to the fail-safe label fleet-generated).
-- BP26-AI-ACT-ART50-1 (2026-10-28, charter pillars research and security; agent_issues 1000341, finding of 2026-10-26). EU AI Act Art. 50 and the project's own rule 3 of docs/AI-USE-POLICY.md
-- ("never claim a review that did not happen") need a per-paper record of HOW a paper was made. Measured on living-paper 2026-10-28: 710 published, distributed or external_preprint papers;
-- 38 carry a "Use of Artificial Intelligence" declaration in the body, and one states that all claims were "reviewed and validated by the human author"; no column said whether the
-- fleet's research pipeline wrote the paper without a person reading it, and the change_actor of 645 published papers is NULL.
-- WHAT THIS ADDS (a separate table, so no row of papers is rewritten and PAPER-LEDGER-1 is not touched; papers.change_actor and change_reason are the writer's, this table has its own set_by and basis):
--   paper_provenance(slug, provenance, basis, set_by, set_at, reviewed_by, declaration_conflict): provenance is 'fleet-generated' (written by the fleet's pipelines, no person reviewed it;
--   the default) or 'ai-assisted-human-reviewed' (only with a named reviewed_by: the CHECK refuses the value without one, so the label can never claim a review nobody recorded).
--   Backfill: every paper that has a slug is 'fleet-generated', basis "no human review is recorded for this paper (backfill 2026-10-28)", because the repository holds no review record for any paper
--   (docs/AI-USE-POLICY.md section 2 rule 1: the fleet has no manual approval step). The owner or a reviewer upgrades one paper by UPDATE with reviewed_by set.
--   declaration_conflict = 1 where the body states a human review (instr on the body; D1 limits a LIKE pattern to 50 bytes): the page then shows the accurate pipeline label and the conflict is
--   listed for correction through the paper-revision path (a body change needs change_actor and change_reason, so it is not made here).
--   Trigger paper_provenance_ai: a new paper gets its row at insert (fleet-generated, set_by trigger plus the writer's change_actor); the gateway also treats a missing row as fleet-generated.
-- Revert: the Rollback line removes the trigger; the table and rows stay as the audit record.
CREATE TABLE IF NOT EXISTS paper_provenance (
  slug TEXT PRIMARY KEY,
  provenance TEXT NOT NULL DEFAULT 'fleet-generated' CHECK (provenance IN ('fleet-generated', 'ai-assisted-human-reviewed')),
  basis TEXT NOT NULL,
  set_by TEXT NOT NULL,
  set_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_by TEXT,
  declaration_conflict INTEGER NOT NULL DEFAULT 0,
  CHECK (provenance <> 'ai-assisted-human-reviewed' OR (reviewed_by IS NOT NULL AND length(trim(reviewed_by)) > 0))
);

INSERT OR IGNORE INTO paper_provenance (slug, provenance, basis, set_by, declaration_conflict)
SELECT slug, 'fleet-generated', 'no human review is recorded for this paper (backfill 2026-10-28)', 'migration:2026-10-28-art50-paper-provenance',
  CASE WHEN instr(lower(COALESCE(body_md, '')), 'reviewed and validated by the human') > 0 OR instr(lower(COALESCE(body_md, '')), 'reviewed by the human author') > 0 THEN 1 ELSE 0 END
FROM papers WHERE slug IS NOT NULL AND length(trim(slug)) > 0;

CREATE TRIGGER IF NOT EXISTS paper_provenance_ai AFTER INSERT ON papers FOR EACH ROW WHEN NEW.slug IS NOT NULL AND length(trim(NEW.slug)) > 0
BEGIN
  INSERT OR IGNORE INTO paper_provenance (slug, provenance, basis, set_by) VALUES (NEW.slug, 'fleet-generated', 'created by a fleet pipeline; no human review is recorded', 'trigger:paper_provenance_ai:' || COALESCE(NEW.change_actor, 'unattributed'));
END;

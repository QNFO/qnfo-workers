-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE owner_asks SET answer=NULL, answer_label=NULL, answered_at=NULL, answered_via=NULL WHERE kind='cv-skill' AND ref='eu_ai_act' AND answered_via='application:magic.dev:2026-11-12';
-- ANSWER-BANK-1 follow-up (review-gate finding on PR 11049, 2026-11-12): migrations/2026-11-12-jobsearch-magic-applied.sql answers the open eu_ai_act
-- cv-skill ask with an UPDATE that matches 0 rows when syncSkillAsks has not seeded the ask yet. Seed it the way syncSkillAsks does (INSERT OR IGNORE,
-- same question and options), then answer it from Rowan's own statement in the Magic application ("hands-on experience with the EU AI Act's risk tiers
-- and GDPR", 2026-11-12). Both statements are idempotent, so a row that was already answered is left alone.
-- Closing probe: SELECT COUNT(*) FROM owner_asks WHERE kind='cv-skill' AND ref IN ('eu_ai_act','gdpr') AND answer='yes'  (expect 2).
INSERT OR IGNORE INTO owner_asks (plane, kind, ref, question, cue, options_json, priority)
VALUES ('jobs', 'cv-skill', 'eu_ai_act', 'Have you worked with the EU AI Act (risk tiers, obligations for general-purpose or high-risk AI) in a design, policy or advisory task?',
        'Risk tiers, transparency duties, a compliance read for a product, policy work in the Netherlands.',
        '[{"key":"yes","label":"Yes"},{"key":"no","label":"No"},{"key":"unsure","label":"Not sure"}]', 2);
UPDATE owner_asks SET answer='yes', answer_label='Yes', answered_at='2026-11-12T07:59:00Z', answered_via='application:magic.dev:2026-11-12'
WHERE kind='cv-skill' AND ref='eu_ai_act' AND answered_at IS NULL;

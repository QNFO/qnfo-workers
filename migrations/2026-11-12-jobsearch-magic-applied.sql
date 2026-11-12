-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM jobsearch_events WHERE match_id='manual:magic.dev:mts-evals'; DELETE FROM jobsearch_matches WHERE id='manual:magic.dev:mts-evals'; DELETE FROM jobsearch_feedback WHERE source='status' AND company='Magic' AND title='Member of Technical Staff, Evals'; UPDATE owner_asks SET answer=NULL, answer_label=NULL, answered_at=NULL, answered_via=NULL WHERE kind='cv-skill' AND ref IN ('eu_ai_act','gdpr') AND answered_via='application:magic.dev:2026-11-12';
-- INFO-USEFUL-1 / ANSWER-BANK-1 (owner input 2026-11-12, charter pillar personal): Rowan applied on Ashby to Magic, "Member of Technical Staff, Evals"
-- (San Francisco or remote, full time, $200K-$550K) and sent screenshots of the submitted form. Routed here:
--  1. the application is a decided posting, so the search never shows it again under any id or board (decidedKeys reads company+title for both
--     the Ashby slug "magic.dev" and the display name "Magic");
--  2. in the same form Rowan wrote "hands-on experience with the EU AI Act's risk tiers and GDPR": that answers the open cv-skill ask eu_ai_act
--     and the new gdpr ask yes, so syncSkillAsks writes both into the CV bank and rwnq8/resume confirmed-skills puts them on the CV.
-- The answers themselves are qnfo-jobsearch ANSWER_BANK and rwnq8/resume docs/ANSWER-BANK.json.
-- Closing probe: SELECT COUNT(*) FROM jobsearch_matches WHERE id='manual:magic.dev:mts-evals' AND status='applied'  (expect 1).
INSERT OR IGNORE INTO jobsearch_matches (id, first_seen, last_seen, company, title, location, url, tier, score, verified, status, decided_at, note_md)
VALUES ('manual:magic.dev:mts-evals', '2026-11-12T07:59:00Z', '2026-11-12T07:59:00Z', 'magic.dev', 'Member of Technical Staff, Evals',
        'San Francisco; Remote', 'https://jobs.ashbyhq.com/magic.dev', 'A', NULL, 1, 'applied', '2026-11-12T07:59:00Z',
        'Applied by Rowan on Ashby, 2026-11-12. Screening answers: ANSWER_BANK (benchmark-gap, misleading-metric, career-goals, anything-else).');
INSERT INTO jobsearch_events (match_id, event, ts, note)
SELECT 'manual:magic.dev:mts-evals', 'applied', '2026-11-12T07:59:00Z', '{"version":1,"tier":"A","score":null,"features":[],"source":"owner screenshots 2026-11-12"}'
WHERE NOT EXISTS (SELECT 1 FROM jobsearch_events WHERE match_id='manual:magic.dev:mts-evals' AND event='applied');
INSERT INTO jobsearch_feedback (ts, title, company, verdict, source)
SELECT '2026-11-12T07:59:00Z', 'Member of Technical Staff, Evals', 'Magic', 'like', 'status'
WHERE NOT EXISTS (SELECT 1 FROM jobsearch_feedback WHERE source='status' AND company='Magic' AND title='Member of Technical Staff, Evals');
UPDATE owner_asks SET answer='yes', answer_label='Yes', answered_at='2026-11-12T07:59:00Z', answered_via='application:magic.dev:2026-11-12'
WHERE kind='cv-skill' AND ref='eu_ai_act' AND answered_at IS NULL;
INSERT OR IGNORE INTO owner_asks (plane, kind, ref, question, cue, options_json, priority, answered_at, answer, answer_label, answered_via)
VALUES ('jobs', 'cv-skill', 'gdpr', 'Have you worked hands-on with GDPR (lawful basis, data minimisation, a privacy review of a product or data pipeline)?',
        'A privacy review of a data product, consent and retention rules, work based in the Netherlands.',
        '[{"key":"yes","label":"Yes"},{"key":"no","label":"No"},{"key":"unsure","label":"Not sure"}]', 2,
        '2026-11-12T07:59:00Z', 'yes', 'Yes', 'application:magic.dev:2026-11-12');

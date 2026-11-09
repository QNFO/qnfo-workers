-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_11_09_JOBSEARCH_CONTENT_FIRST_1';
-- spof-review: no new cron, trigger, binding, host or credential; one ops_config row recording the directive and one decision_log row.
-- JOBSEARCH-CONTENT-FIRST-1 (2026-11-09, charter pillar personal): the rule text lives in CLAUDE.md; the code is qnfo-jobsearch scoreJob, semanticLens and the record-derived search queries.
-- CAUSE-MAPPED: registers no metric.
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_11_09_JOBSEARCH_CONTENT_FIRST_1',
  '{"id":"JOBSEARCH-CONTENT-FIRST-1","directive_verbatim":"title keywords are a terrible way to represent my experience. Don''t ever do that again. I have a much broader experience than can be represented in a title.","recorded":"2026-11-09","limits":["seniority words and residence restrictions still filter","owner preferences stay","no application is sent for the owner"]}',
  'Owner directive 2026-11-09: job matching reads the posting text through several lenses and never gates or caps on the title; CLAUDE.md carries the rule, explore.test.mjs holds it.');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session:content-first-matching (claude, QNFO.PERSONAL)',
  'The owner experience (transport network models, forecasting, machine learning, autonomous systems) does not fit title keywords, so a title-gated search shows poor results; the posting text carries the signal.',
  'JOBSEARCH-CONTENT-FIRST-1: qnfo-jobsearch 1.16.0 scoreJob reads text first (record-term overlap and evidence clusters), semanticLens (embeddings) boosts and rescues, record-derived search queries added; migration 2026-11-09-content-first-matching.sql',
  'Owner report 2026-11-09 ("No wonder I am getting such shitty results"). Earlier rule: a title outside the role families was dropped before its text was read and capped at 49.',
  'applied by code; the next scheduled run rescoring all postings',
  'which postings reach the owner list; no application is sent, nothing is deleted',
  'revert the qnfo-jobsearch release; the matches table is rewritten each run',
  'matching that shows the owner broader roles in which the text carries the record',
  'jobsearch_reply_rate_90d >= 0.1 within 720 h',
  'expected: more postings from employers and fields the old title gate hid. Unproven until the owner decides on them.',
  'qnfo-jobsearch scoreJob, rank, semanticLens, /api/matches'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'JOBSEARCH-CONTENT-FIRST-1:%');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'JOBSEARCH-CONTENT-FIRST-1.2: widen the employers searched from the record (transport modelling, simulation, evaluation, forecasting, systems research), not from a curated list of labs',
 'Charter pillar personal. Owner 2026-11-09: go in several different directions to find what my experience is. qnfo-jobsearch BOARDS is a curated set of boards (greenhouse, lever, ashby, recruitee, smartrecruiters, public sector); a posting at an employer in none of them is never fetched, however well its text matches the record.' || char(10) ||
 'code-task: repo=qnfo-workers path=qnfo-jobsearch/worker.js' || char(10) ||
 'code-anchor: // JOBSEARCH-DIRECTIONS-1: queries drawn from the record' || char(10) ||
 'Doer: the code loop. Add boards found by probing, for employers whose work matches the record (transportation and mobility planning and modelling firms, simulation and digital-twin companies, AI evaluation and assurance organisations, forecasting and geospatial analytics firms, policy-research institutes): probe each board slug, keep the ones that answer with postings, add them with the probe date as the comment (the style of the existing entries), and add a test that the added feeds are in ACTIVE_FEEDS.' || char(10) ||
 'closing probe: SELECT 0 WHERE (SELECT COUNT(DISTINCT company) FROM jobsearch_matches WHERE last_seen > datetime(''now'',''-3 days'')) >= 40',
 'session:content-first-matching', 'feature', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'JOBSEARCH-CONTENT-FIRST-1.2%');

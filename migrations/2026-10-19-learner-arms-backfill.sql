-- LEARNER-ARMS-2 backfill (2026-10-19, charter pillar reach; agent_issues 2722, qnfo-social 0.18.0): 124 of 137 social_learner_posts rows read
-- status 'not-arm' on 2026-10-19 (bluesky 73, substack 33, mastodon 7, x 7, linkedin 4), so the attention learner could not learn from them.
-- Two causes in qnfo-social, both fixed in 0.18.0: learnerTopicOf named a topic for three keyword lists only (a post that links
-- papers.qnfo.org now takes the paper's own shelf, else the generic arm research), and the channel-drain insert stored a null link_slug
-- (it now stores the paper slug). This file re-files the rows that can be recovered with the same rule, from the rows themselves:
--   * a dissem: or channel: row whose slug is a known paper (dissemination_tracker.paper_slug or research_queue.paper_slug) gets
--     link_slug = slug (the campaign the drain tagged the post with is that slug, so learnerVisits joins its utm clicks);
--   * such a row whose paper title or posted text carries none of the pillar-4 words (ultrametric, adelic, p-adic, autaxic, topos) and
--     no q08.org link becomes topic 'research' (the generic arm: the paper's shelf lives in living-paper, which a qnfo-audit migration
--     cannot join, so the historical rows take the generic arm and the worker applies the shelf to every post from 0.18.0 on), status
--     'pending'; the daily credit step (learnerCreditPending) then credits or closes each with the measured utm clicks or snapshot;
--   * a roll-up row (several papers), a pillar-4 or q08 row and a row that links no paper (the iPatent example thread) stay 'not-arm',
--     now with the reason in reward_detail. No arm is fabricated for them.
-- Measured live 2026-10-19 (read-only): 77 rows are recovered (bluesky 65, linkedin 2, mastodon 5, x 5), 11 stay not-arm as pillar 4 (bluesky 8,
-- linkedin 1, mastodon 1, x 1), 3 link no paper (iPatent example thread), 33 are roll-ups. The closing probe (issue-2722 and fm-learner-topic-null)
-- reads observed 0 with 73 of 75 paper-link posts of the last 7 days not-arm before this file; the same rule leaves 11 of about 85 after.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_learner_arms
-- Rollback: UPDATE social_learner_posts SET link_slug = (SELECT b.link_slug FROM bak_20261019_learner_arms b WHERE b.post_key = social_learner_posts.post_key), topic = (SELECT b.topic FROM bak_20261019_learner_arms b WHERE b.post_key = social_learner_posts.post_key), status = (SELECT b.status FROM bak_20261019_learner_arms b WHERE b.post_key = social_learner_posts.post_key), reward_detail = (SELECT b.reward_detail FROM bak_20261019_learner_arms b WHERE b.post_key = social_learner_posts.post_key) WHERE post_key IN (SELECT post_key FROM bak_20261019_learner_arms) AND status IN ('pending', 'not-arm'); UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM social_learner_posts WHERE status IN (''credited'',''pending'') AND chosen_by <> ''learner'') >= 20 THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'issue-2722'; DELETE FROM remediation_contracts WHERE class = 'fm-learner-topic-null'; DELETE FROM failure_modes WHERE fm_key = 'learner-topic-null'; DELETE FROM capability_ledger WHERE capability = 'paper-shelf-learner-arms'

-- 1. Backup: every not-arm row as it stood, with the two derived columns the updates below read (arm_txt: slug and paper title or posted text;
--    arm_excluded: pillar 4 or q08; arm_paper: the slug is a known paper).
CREATE TABLE IF NOT EXISTS bak_20261019_learner_arms AS
SELECT x.*,
  CASE WHEN instr(x.arm_txt, 'ultrametric') > 0 OR instr(x.arm_txt, 'adelic') > 0 OR instr(x.arm_txt, 'p-adic') > 0 OR instr(x.arm_txt, 'autaxic') > 0 OR instr(x.arm_txt, 'topos') > 0 OR instr(x.arm_txt, 'q08.org') > 0 THEN 1 ELSE 0 END AS arm_excluded,
  CASE WHEN EXISTS (SELECT 1 FROM dissemination_tracker d WHERE d.paper_slug = x.slug) OR EXISTS (SELECT 1 FROM research_queue q WHERE q.paper_slug = x.slug) THEN 1 ELSE 0 END AS arm_paper
FROM (SELECT l.*, lower(l.slug || ' ' || COALESCE((SELECT d.paper_title FROM dissemination_tracker d WHERE d.id = substr(l.post_key, 8) AND l.post_key LIKE 'dissem:%'), (SELECT m.content_preview FROM social_media_posts m WHERE m.id = substr(l.post_key, 9) AND l.post_key LIKE 'channel:%'), '')) AS arm_txt
      FROM social_learner_posts l WHERE l.status = 'not-arm') x;

-- 2. The paper slug on every recoverable paper post (a pillar-4 paper links a paper too, so it is counted as a paper-link post and stays not-arm).
UPDATE social_learner_posts SET link_slug = slug
WHERE status = 'not-arm' AND link_slug IS NULL AND substr(slug, 1, 7) <> 'rollup-'
  AND post_key IN (SELECT post_key FROM bak_20261019_learner_arms WHERE arm_paper = 1);

-- 3. The generic arm and the pending status for every paper post that is not pillar 4 or q08.
UPDATE social_learner_posts SET topic = 'research', status = 'pending'
WHERE status = 'not-arm' AND topic IS NULL AND link_slug IS NOT NULL AND substr(slug, 1, 7) <> 'rollup-'
  AND post_key IN (SELECT post_key FROM bak_20261019_learner_arms WHERE arm_paper = 1 AND arm_excluded = 0);

-- 4. The reason on every row that stays not-arm.
UPDATE social_learner_posts SET reward_detail = '{"not_arm":"roll-up post: it carries several papers, so no single arm (LEARNER-ARMS-2)"}'
WHERE status = 'not-arm' AND reward_detail IS NULL AND substr(slug, 1, 7) = 'rollup-';
UPDATE social_learner_posts SET reward_detail = '{"not_arm":"pillar 4 (ultrametric, adelic, p-adic, autaxic, topos) or a q08 link stays out of the learner arms (STRATEGY 2.3, LEARNER-ARMS-2)"}'
WHERE status = 'not-arm' AND reward_detail IS NULL AND substr(slug, 1, 7) <> 'rollup-'
  AND post_key IN (SELECT post_key FROM bak_20261019_learner_arms WHERE arm_excluded = 1);
UPDATE social_learner_posts SET reward_detail = '{"not_arm":"the post links no paper (a curated tool or essay thread): no paper shelf, no arm (LEARNER-ARMS-2)"}'
WHERE status = 'not-arm' AND reward_detail IS NULL AND substr(slug, 1, 7) <> 'rollup-' AND link_slug IS NULL
  AND post_key IN (SELECT post_key FROM bak_20261019_learner_arms WHERE arm_paper = 0 AND arm_excluded = 0);

-- 5. The decision, the failure mode with its detector, the closing probe of issue 2722 and the capability.
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
 ('session_01JADz8uHqYt9eUMBTwbbBE6/package-G',
  'a post that links a paper is an arm of the attention learner whichever of the three keyword pillars names it: the paper''s own shelf (living-paper paper_category) names the arm and the generic arm research takes the rest, while pillar 4, q08, roll-ups and posts that link no paper stay out',
  'qnfo-social 0.18.0 classifies a paper post by shelf (nine shelves, three keep their older arm names) with research as the fallback, stores the paper slug on channel-drain rows, joins utm clicks on the gateway campaign key and the row slug; this file re-files the 77 recoverable not-arm rows as research/pending and writes the reason on the 47 that stay not-arm',
  'live 2026-10-19: social_learner_posts not-arm 124 of 137 (bluesky 73, substack 33, mastodon 7, x 7, linkedin 4); the utm ledger keys the curated threads by thread slug (jps-metric 6 human clicks on mastodon while the learner link_slug joules-per-solution-metric reads 0) and cuts campaigns to 64 characters; paper_category covers 606 papers in nine shelves incl. decoherence (physics), functoriality (mathematics), braid-group (physics), thermodynamic-budgeting (energy)',
  'pending deploy',
  'social_learner_posts rows (backup bak_20261019_learner_arms); the Thompson draw of the Bluesky thread and dissemination drains now ranges over ten topic arms instead of three; the channel order draw is unchanged; no post text, schedule, cap or channel change',
  'revert the PR (restores the three arms and the old link_slug) and run the Rollback line of migrations/2026-10-19-learner-arms-backfill.sql, which restores the 124 rows from bak_20261019_learner_arms while they are still pending or not-arm',
  'the attention learner credits and learns from every post that links a paper, and reads the clicks of curated threads and long slugs',
  'learner_paper_link_not_arm_share_7d <= 0.2 within 24 h',
  'indirect: the learner can steer the next posts by the shelf and channel whose measured clicks it now credits; no direct change expected this week',
  'code, D1 (live social_learner_posts, utm ledger, living-paper paper_category), offline suites');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
  ('learner-topic-null',
   'a learner that can only learn from posts it can classify stores most posts as not-arm, so its posterior never moves',
   'learnerTopicOf named a topic for three keyword lists (energy, epistemics, operations) and returned null for every other paper, and the channel-drain insert stored link_slug null for a channel post whose thread row was gone; the utm join also keyed on the paper slug while the ledger is keyed by the campaign (the thread slug, cut to 64 characters)',
   'qnfo-social 0.18.0: a post that links a paper takes its paper_category shelf or the generic arm research; link_slug is the paper slug on every channel row; learnerVisits joins on the campaign key and the row slug; learner-arms.test.mjs holds the four named papers and the channel insert to it; migrations/2026-10-19-learner-arms-backfill.sql re-files the 77 recoverable rows',
   'the share of not-arm rows among the paper-link posts of the last 7 days is at most 0.2 (at least 10 such posts)',
   'fm-learner-topic-null', '2026-10-19', 2722,
   'a classifier keyed on a fixed keyword list is the only source of an arm, or a row is stored with a key the reader does not join on',
   'social_learner_posts: 124 of 137 rows not-arm, 73 of 75 paper-link posts of the last 7 days (measured 2026-10-19)',
   'the attention learner (topic, format, slot and channel posteriors): the Bluesky drains chose on a posterior built from 3 credited rows');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-learner-topic-null', 2722, 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM social_learner_posts WHERE link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) >= 10 AND (SELECT COUNT(*) FROM social_learner_posts WHERE status = ''not-arm'' AND link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) * 1.0 / MAX(1, (SELECT COUNT(*) FROM social_learner_posts WHERE link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days''))) <= 0.2 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query', 3, 1, 'active', 'LEARNER-ARMS-2', 'failure-mode detector', 'qnfo-fleet-control');

UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM social_learner_posts WHERE link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) >= 10 AND (SELECT COUNT(*) FROM social_learner_posts WHERE status = ''not-arm'' AND link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) * 1.0 / MAX(1, (SELECT COUNT(*) FROM social_learner_posts WHERE link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days''))) <= 0.2 THEN ''1'' ELSE ''0'' END AS observed',
  action = 'LEARNER-ARMS-2 (qnfo-social 0.18.0): the closing probe is the share of not-arm rows among the paper-link posts of the last 7 days, at most 0.2 over at least 10 posts'
WHERE class = 'issue-2722';

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence) VALUES
 ('paper-shelf-learner-arms', 'LEARNER-ARMS-2 (agent_issues 2722): qnfo-social 0.18.0',
  'living-paper paper_category (read-only binding LIVING_PAPER), qnfo-audit social_learner_posts and the utm ledger in reach_signals',
  'deterministic classifier; fail-soft to the generic arm when the shelf table is unreadable',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'qnfo-social/learner-arms.test.mjs; the closing probe of issue-2722');

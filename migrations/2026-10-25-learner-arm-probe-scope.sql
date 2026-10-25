-- LEARNER-ARMS-PROBE-SCOPE-1 (2026-10-25, issue 2722): the live classifier deliberately leaves q08 and pillar-4 paper links
-- not-arm. The prior seven-day guard counted them as classifier failures, so legitimate exclusions could keep the issue red.
-- Persist a machine-readable reason on new rows, backfill recent rows from their source text, and measure only eligible paper links.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261025_learner_arm_probe_scope_rows
-- Rollback: UPDATE social_learner_posts SET reward_detail = (SELECT b.reward_detail FROM bak_20261025_learner_arm_probe_scope_rows b WHERE b.post_key = social_learner_posts.post_key) WHERE post_key IN (SELECT post_key FROM bak_20261025_learner_arm_probe_scope_rows); UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261025_learner_arm_probe_scope_contracts b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261025_learner_arm_probe_scope_contracts b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261025_learner_arm_probe_scope_contracts); UPDATE failure_modes SET detector = (SELECT b.detector FROM bak_20261025_learner_arm_probe_scope_modes b WHERE b.fm_key = failure_modes.fm_key) WHERE fm_key IN (SELECT fm_key FROM bak_20261025_learner_arm_probe_scope_modes); DELETE FROM remediation_contracts WHERE class IN ('fm-learner-probe-exclusion-scope', 'belief-learner-exclusion-reasons-labelled') AND class NOT IN (SELECT class FROM bak_20261025_learner_arm_probe_scope_contracts); DELETE FROM failure_modes WHERE fm_key = 'learner-probe-exclusion-scope' AND fm_key NOT IN (SELECT fm_key FROM bak_20261025_learner_arm_probe_scope_modes); DELETE FROM belief_registry WHERE belief_key = 'learner-exclusion-reasons-labelled' AND belief_key NOT IN (SELECT belief_key FROM bak_20261025_learner_arm_probe_scope_beliefs); DELETE FROM capability_ledger WHERE capability = 'learner-arm-exclusion-provenance' AND capability NOT IN (SELECT capability FROM bak_20261025_learner_arm_probe_scope_capabilities)

CREATE TABLE IF NOT EXISTS bak_20261025_learner_arm_probe_scope_rows AS
SELECT post_key, reward_detail
FROM social_learner_posts
WHERE status = 'not-arm'
  AND link_slug IS NOT NULL
  AND slug NOT LIKE 'rollup-%'
  AND posted_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
  AND reward_detail IS NULL;

CREATE TABLE IF NOT EXISTS bak_20261025_learner_arm_probe_scope_contracts AS
SELECT class, verify_probe, action
FROM remediation_contracts
WHERE class IN ('issue-2722', 'fm-learner-topic-null', 'fm-learner-probe-exclusion-scope', 'belief-learner-exclusion-reasons-labelled');

CREATE TABLE IF NOT EXISTS bak_20261025_learner_arm_probe_scope_modes AS
SELECT fm_key, detector
FROM failure_modes
WHERE fm_key IN ('learner-topic-null', 'learner-probe-exclusion-scope');

CREATE TABLE IF NOT EXISTS bak_20261025_learner_arm_probe_scope_beliefs AS
SELECT belief_key
FROM belief_registry
WHERE belief_key = 'learner-exclusion-reasons-labelled';

CREATE TABLE IF NOT EXISTS bak_20261025_learner_arm_probe_scope_capabilities AS
SELECT capability
FROM capability_ledger
WHERE capability = 'learner-arm-exclusion-provenance';

WITH candidates AS (
  SELECT l.post_key,
    lower(COALESCE(l.slug, '') || ' ' ||
      CASE
        WHEN l.post_key LIKE 'dissem:%' THEN COALESCE((SELECT d.paper_title || ' ' || d.pages_url FROM dissemination_tracker d WHERE d.id = substr(l.post_key, 8) LIMIT 1), '')
        WHEN l.post_key LIKE 'channel:%' THEN COALESCE((SELECT p.content_preview FROM social_media_posts p WHERE p.id = substr(l.post_key, 9) LIMIT 1), '')
        WHEN l.post_key LIKE 'thread:%' THEN COALESCE((SELECT t.title || ' ' || t.posts FROM social_threads t WHERE t.id = substr(l.post_key, 8) LIMIT 1), '')
        ELSE ''
      END) AS arm_text
  FROM social_learner_posts l
  WHERE l.status = 'not-arm'
    AND l.link_slug IS NOT NULL
    AND l.slug NOT LIKE 'rollup-%'
    AND l.posted_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')
    AND l.reward_detail IS NULL
),
reasons AS (
  SELECT post_key,
    CASE WHEN instr(arm_text, 'q08.org') > 0 THEN 'q08 link' ELSE 'pillar 4' END AS reason
  FROM candidates
  WHERE instr(arm_text, 'q08.org') > 0
     OR instr(arm_text, 'ultrametric') > 0
     OR instr(arm_text, 'adelic') > 0
     OR instr(arm_text, 'p-adic') > 0
     OR instr(arm_text, 'autaxic') > 0
     OR instr(arm_text, 'topos') > 0
)
UPDATE social_learner_posts
SET reward_detail = (SELECT json_object('not_arm', reasons.reason) FROM reasons WHERE reasons.post_key = social_learner_posts.post_key)
WHERE post_key IN (SELECT post_key FROM reasons);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'c9fcf273-cabd-45f6-b243-3e5626637b7a',
  'q08 and pillar-4 paper links are intentional learner exclusions and must not be counted as classification failures; any unmarked not-arm paper link remains a real failure',
  'LEARNER-ARMS-PROBE-SCOPE-1: qnfo-social persists explicit q08/pillar-4 exclusion reasons; the issue and failure-mode probes measure only eligible paper links, and the issue probe also enforces the live data and posterior-depth DoD',
  'qnfo-social 0.19.0-no-registrar is live; worker.js excludes q08 and pillar-4 before the generic paper arm; migrations/2026-10-19-learner-arms-backfill.sql already records exclusion reasons for historical rows; the prior probe counted every linked not-arm row without that distinction',
  'pending live verification; issue 2722 stays open until its full seven-day DoD probe passes',
  'qnfo-social learner classification and issue 2722 / its detector contracts',
  'the Rollback line restores changed reward_detail, probes and detector text, and removes only rows this migration created; decision_log is append-only',
  'learner-arm-exclusion-provenance',
  'the seven-day exclusion-aware learner guard will stop counting q08 and pillar-4 rows as regressions while still failing an unmarked paper-linked not-arm row',
  'indirect: a correct learner-arm signal prevents intentional q08/pillar-4 content from distorting the research learner health measure',
  'worker classifier, source-text backfill, D1 issue probe and D1 detector probe'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'LEARNER-ARMS-PROBE-SCOPE-1:') = 1);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('learner-probe-exclusion-scope',
  'the learner-arm guard treats policy-required q08 and pillar-4 exclusions as classifier failures',
  'the seven-day probe counted every linked not-arm row even though the learner must exclude q08 links and pillar-4 content',
  'persist q08/pillar-4 exclusion reasons and scope the learner-arm ratio to eligible paper links',
  'no non-rollup paper-linked not-arm row in the last seven days lacks an explicit q08 or pillar-4 exclusion reason',
  'fm-learner-probe-exclusion-scope', '2026-10-25', 2722,
  'a learner probe counts intentional q08 or pillar-4 exclusions in its not-arm share',
  'issue-2722 and fm-learner-topic-null repeatedly observe 0 despite the deployed classifier retaining required exclusions',
  'issue 2722 closure and the learner-arm classification detector');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES ('fm-learner-probe-exclusion-scope', 2722, 'LEARNER-ARMS-PROBE-SCOPE-1', 'exclusion provenance detector',
  'SELECT ''1'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM social_learner_posts WHERE status = ''not-arm'' AND link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND NOT (lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%q08%'' OR lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%pillar 4%'')) THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'fm-learner-probe-exclusion-scope');

INSERT OR IGNORE INTO belief_registry (belief_key, claim, confidence, evidence, probe_class, built_on)
VALUES ('learner-exclusion-reasons-labelled',
  'Every intentional q08 or pillar-4 learner exclusion with a paper link is explicitly labelled, and every other linked not-arm row remains visible to the defect guard',
  0.95,
  'the production classifier explicitly excludes q08 and pillar-4 content; the migration backfills recent linked not-arm rows from their source text and new discovery rows persist the same reason',
  'belief-learner-exclusion-reasons-labelled', 'LEARNER-ARMS-PROBE-SCOPE-1');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module)
VALUES ('belief-learner-exclusion-reasons-labelled', NULL, 'DOCTRINE-1 belief', 'belief probe',
  'SELECT ''1'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM social_learner_posts WHERE status = ''not-arm'' AND link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND NOT (lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%q08%'' OR lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%pillar 4%'')) THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'belief');

UPDATE failure_modes
SET detector = 'the share of not-arm rows among eligible paper-link posts of the last 7 days is at most 0.2 over at least 10 rows; intentional q08 and pillar-4 exclusions are omitted only when their reason is recorded'
WHERE fm_key = 'learner-topic-null';

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM social_learner_posts WHERE link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND NOT (lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%q08%'' OR lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%pillar 4%'')) >= 10 AND (SELECT COUNT(*) FROM social_learner_posts WHERE status = ''not-arm'' AND link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND NOT (lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%q08%'' OR lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%pillar 4%'')) * 1.0 / MAX(1, (SELECT COUNT(*) FROM social_learner_posts WHERE link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND NOT (lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%q08%'' OR lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%pillar 4%''))) <= 0.2 AND (SELECT COUNT(*) FROM social_learner_posts WHERE status IN (''credited'', ''pending'') AND chosen_by <> ''learner'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'')) >= 20 AND (SELECT COUNT(*) FROM (SELECT topic FROM social_learner_posts WHERE status = ''credited'' AND topic IS NOT NULL AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') GROUP BY topic HAVING COUNT(*) >= 3)) >= 3 THEN ''1'' ELSE ''0'' END AS observed',
  action = 'LEARNER-ARMS-2 and LEARNER-ARMS-PROBE-SCOPE-1: the issue closes only when the exclusion-aware guard passes, at least 20 recent non-learner credited/pending rows exist, and at least three credited topic arms each have n >= 3'
WHERE class = 'issue-2722';

UPDATE remediation_contracts
SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM social_learner_posts WHERE link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND NOT (lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%q08%'' OR lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%pillar 4%'')) >= 10 AND (SELECT COUNT(*) FROM social_learner_posts WHERE status = ''not-arm'' AND link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND NOT (lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%q08%'' OR lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%pillar 4%'')) * 1.0 / MAX(1, (SELECT COUNT(*) FROM social_learner_posts WHERE link_slug IS NOT NULL AND slug NOT LIKE ''rollup-%'' AND posted_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-7 days'') AND NOT (lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%q08%'' OR lower(COALESCE(json_extract(reward_detail, ''$.not_arm''), '''')) LIKE ''%pillar 4%''))) <= 0.2 THEN ''1'' ELSE ''0'' END AS observed',
  action = 'LEARNER-ARMS-PROBE-SCOPE-1: measure not-arm share only among at least 10 eligible paper-link posts in the last seven days; intentional q08 and pillar-4 exclusions require explicit reasons'
WHERE class = 'fm-learner-topic-null';

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES ('learner-arm-exclusion-provenance', 'LEARNER-ARMS-PROBE-SCOPE-1 (agent_issues 2722)',
  'qnfo-social classification, social_learner_posts.reward_detail, source text in dissemination_tracker/social_media_posts/social_threads',
  'D1 detector fails closed for a linked not-arm row without an explicit policy-exclusion reason',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'qnfo-social/learner-arms.test.mjs; qnfo-social/learner-arm-probe.test.mjs; fm-learner-probe-exclusion-scope');

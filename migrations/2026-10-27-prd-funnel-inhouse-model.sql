-- PRD-FUNNEL-INHOUSE-1 + CADENCE-SOCIAL-SHARES-1 (2026-10-27, pillar reach; breaches prd_funnel_missing_transitions 456 and
-- cadence_overdue_over_120m 3, agent_issues from METRIC-TRIGGER-14017 and METRIC-TRIGGER-6050).
--
-- 1. PRD funnel measured a stage that owner directive NOZ-DOI-1 (2026-10-10) removed. v_prd_funnel_publications (created
--    2026-10-25, PRD-FUNNEL-MONITOR-1) counts a published paper as "missing a transition" unless it has a DOI (has_deposit) and
--    a social post joined BY DOI (has_distribution). Since NOZ-DOI-1 the fleet publishes in house: qnfo-research-exec writes
--    doi, zenodo_doi and zenodo_url NULL on every new or revised paper, and its papers.qnfo.org page is its record (research-exec
--    README "Publishing (NOZ-DOI-1)"; migrations/2026-10-11-retire-zenodo-metrics.sql). Measured 2026-10-26T18:00Z against live
--    qnfo-audit and living-paper:
--      * living-paper.papers created in the last 30 days: 297 rows, 0 with a doi; research_queue.doi is set on 28 of the 456
--        published papers (all published 2026-10-01..10-06, before NOZ-DOI-1); entity_map.doi on 0.
--      * of the 456 counted papers, 439 have an entity_map.page_url (the in-house address) and 317 have a dissemination_tracker row
--        (action posted, channel bluesky) with a non-empty post_id for their slug, i.e. a published platform identifier.
--      * the DOI join cannot match any of the 317, because no paper has a DOI to join on.
--    So 456 mixed two things: a deposit stage that cannot exist by decision, and a distribution join that cannot see real posts.
--    The new view keeps every strict rule of the old one (age over 120 minutes, count papers, no manufactured identifiers, a post
--    without a post_id proves nothing) and changes only what evidence counts:
--      has_deposit        a DOI of any kind (a third-party DOI stays valid) OR the in-house address (entity_map.page_url),
--      has_page_mapping   unchanged (entity_map.page_url),
--      has_distribution   the old DOI join OR a dissemination_tracker post with a non-empty post_id for the same slug
--                         (exact slug equality, no substring match).
--    Re-measured with the new definition (read-only, live qnfo-audit, 2026-10-26T18:10Z): 456 papers older than 120 minutes, 139
--    still missing a transition: 17 with no entity_map row (published 2026-10-19 or later: the page mapping was never written)
--    and 122 with a page but no identified post (the distribution backlog). That is what the metric exists to show. It stays a
--    guard at target 0 and still breaches while that backlog exists; it now names real work instead of a retired stage.
--
-- 2. cadence_sla "social" claimed one post every 120 minutes. The owner's weekly channel caps are scaled by the attention loop's
--    shares (ops_config attention_channel_share, ATTENTION-SHARE-1: bluesky 0 / mastodon 0 stopped, linkedin 0.5, x 0.5, with a
--    0.5 floor on the channel drain), so the allowance is a few posts a day and every channel waits for its own spacing (10080
--    minutes divided by its weekly allowance: x 1440, mastodon 1440, bluesky 1008, linkedin held at its weekly cap).
--    Measured 2026-10-26 over the union of social_media_posts, dissemination_tracker and social_threads: 19 to 30 posts a day on
--    2026-10-18..21 (largest gap 3 to 9 h) fell to 4 to 7 a day on 2026-10-22..26 (largest gaps 8, 11, 21, 8 and 23 h), the
--    qnfo-social run ledger reads "held:spacing (next 2026-10-26T23:20Z)" for every channel, so the overdue reading is the
--    shares at work, not a stall (the metric's own action text: "held:weekly-cap on every channel is the owner's cadence cap, so
--    correct interval_min in cadence_sla by migration with the cap evidence"). interval_min becomes 1440, the longest spacing the
--    current allowance can produce; sla_min stays 120, so social is overdue 26 hours after its last post. If the attention loop
--    restores shares the larger allowance only makes the real gap shorter than the interval, which is the safe direction.
--    q08.org and papers.qnfo.org are NOT touched: their gaps are real stalls (q08 gate_failed on reader-panel quality, research
--    publishing stalled) and stay breaches until the producers publish.
--
-- Decision recorded in decision_log (DECISION-AUTOPROCEED-1) with the revert path below; no cap, threshold or probe of another
-- surface changes, and no row is deleted (the view is dropped after its text is copied to the backup table).
--
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_prd_funnel_view_20261027
-- Rollback: DROP VIEW IF EXISTS v_prd_funnel_publications; CREATE VIEW v_prd_funnel_publications AS SELECT q.id, q.paper_slug, q.published_at, CASE WHEN COALESCE(NULLIF(trim(q.doi),''),NULLIF(trim(e.doi),'')) IS NOT NULL THEN 1 ELSE 0 END AS has_deposit, CASE WHEN trim(COALESCE(e.page_url,''))<>'' THEN 1 ELSE 0 END AS has_page_mapping, CASE WHEN EXISTS (SELECT 1 FROM social_media_posts p WHERE p.status='published' AND trim(COALESCE(NULLIF(trim(p.post_id),''),p.buffer_id,''))<>'' AND p.paper_doi=COALESCE(NULLIF(trim(q.doi),''),NULLIF(trim(e.doi),''))) THEN 1 ELSE 0 END AS has_distribution, MAX(0, CAST((julianday('now')-julianday(q.published_at))*1440 AS INTEGER)) AS age_min FROM research_queue q LEFT JOIN entity_map e ON e.slug=q.paper_slug WHERE q.status='published' AND julianday(q.published_at)>=julianday('now','-30 days'); UPDATE cadence_sla SET interval_min=120, schedule='the owner''s weekly channel caps; social runs every 2 hours', updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE surface='social'; (the old stage-view limitation texts are in bak_prd_funnel_view_20261027 and migrations/2026-10-25-prd-funnel-monitor.sql)

CREATE TABLE IF NOT EXISTS bak_prd_funnel_view_20261027 AS
SELECT name, sql FROM sqlite_master WHERE name IN ('v_prd_funnel_publications', 'v_prd_funnel_publication_stages');

DROP VIEW IF EXISTS v_prd_funnel_publications;

CREATE VIEW v_prd_funnel_publications AS
SELECT q.id, q.paper_slug, q.published_at,
  CASE WHEN COALESCE(NULLIF(trim(q.doi),''),NULLIF(trim(e.doi),'')) IS NOT NULL
         OR trim(COALESCE(e.page_url,''))<>'' THEN 1 ELSE 0 END AS has_deposit,
  CASE WHEN trim(COALESCE(e.page_url,''))<>'' THEN 1 ELSE 0 END AS has_page_mapping,
  CASE WHEN EXISTS (
    SELECT 1 FROM social_media_posts p
    WHERE p.status='published' AND trim(COALESCE(NULLIF(trim(p.post_id),''),p.buffer_id,''))<>''
      AND p.paper_doi=COALESCE(NULLIF(trim(q.doi),''),NULLIF(trim(e.doi),''))
  ) OR EXISTS (
    SELECT 1 FROM dissemination_tracker d
    WHERE d.action='posted' AND trim(COALESCE(d.post_id,''))<>'' AND d.paper_slug=q.paper_slug
  ) THEN 1 ELSE 0 END AS has_distribution,
  MAX(0, CAST((julianday('now')-julianday(q.published_at))*1440 AS INTEGER)) AS age_min
FROM research_queue q LEFT JOIN entity_map e ON e.slug=q.paper_slug
WHERE q.status='published' AND julianday(q.published_at)>=julianday('now','-30 days');

DROP VIEW IF EXISTS v_prd_funnel_publication_stages;

CREATE VIEW v_prd_funnel_publication_stages AS
SELECT 'publication' AS stage, 'research_queue' AS source, COUNT(*) AS value,
  MAX(published_at) AS latest_at, 'recorded publications, not publication throughput targets' AS limitation
FROM v_prd_funnel_publications
UNION ALL
SELECT 'deposit','research_queue.doi + entity_map.page_url',SUM(has_deposit),MAX(published_at),
  'in-house address or a third-party DOI (NOZ-DOI-1: the fleet registrar DOI is retired); external availability requires a runtime probe'
FROM v_prd_funnel_publications
UNION ALL
SELECT 'page','research_queue + entity_map',SUM(has_page_mapping),MAX(published_at),
  'URL mapping only; page and PDF content require runtime probes'
FROM v_prd_funnel_publications
UNION ALL
SELECT 'distribution','dissemination_tracker + social_media_posts',SUM(has_distribution),MAX(published_at),
  'published platform identifier joined by slug (dissemination post_id) or by DOI; unmatched posts and posts without an identifier do not prove delivery'
FROM v_prd_funnel_publications;

UPDATE metric_registry
SET formula = 'Published research_queue items in the last 30 days older than 120 minutes missing in-house publication evidence (an entity_map page address; a third-party DOI also counts, the fleet''s own registrar DOI is retired by NOZ-DOI-1) or a published platform identifier (a dissemination_tracker post_id for the slug, or a social_media_posts row joined by DOI); count papers, not missing fields'
WHERE metric = 'prd_funnel_missing_transitions';

UPDATE cadence_sla
SET interval_min = 1440,
    schedule = 'the owner''s weekly channel caps scaled by the attention shares (ops_config attention_channel_share): each channel waits 10080 minutes divided by its weekly allowance (x 1440, mastodon 1440, bluesky 1008), so the longest gap the allowance produces is 1440 minutes; social runs every 2 hours and records held:spacing/held:weekly-cap per channel (CADENCE-SOCIAL-SHARES-1, 2026-10-27)',
    updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE surface = 'social' AND interval_min = 120;

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'agent-breach-reach-slice',
  'A metric must measure what the system now does: NOZ-DOI-1 removed the fleet DOI, and the attention shares lowered the social allowance',
  'PRD-FUNNEL-INHOUSE-1 + CADENCE-SOCIAL-SHARES-1: v_prd_funnel_publications counts the in-house address as deposit evidence and a slug-joined dissemination post id as distribution evidence; cadence_sla social interval 120 -> 1440 minutes',
  'Live 2026-10-26: 0 of 297 papers created in 30 days carry a DOI; 317 of 456 counted papers have a dissemination post with a post_id; posts a day fell from 19-30 to 4-7 with the largest gap 8-23 h while every channel read held:spacing',
  'Applied by migration 2026-10-27-prd-funnel-inhouse-model.sql; the guard keeps target 0 and still breaches on papers with no page mapping or no identified post',
  'Two views, one metric formula text, one cadence_sla row; no worker, no external message, no data deleted (view text saved in bak_prd_funnel_view_20261027)',
  'Rollback line of the migration restores the old view text and the 120-minute interval',
  'The funnel guard and the social cadence guard now name real work instead of a retired stage and an unreachable interval',
  'prd_funnel_missing_transitions reads 139 (17 with no page mapping, 122 with no identified post) instead of 456 at the next 10 minute observer run; cadence_overdue_over_120m falls from 3 to 2 while social has posted inside 26 hours',
  'Distribution work is aimed at the 122 papers with a page and no identified post and the 17 with no page mapping, instead of 456 papers that include 317 already posted',
  'Live qnfo-audit views and tables, research_queue, entity_map, dissemination_tracker, social_media_posts, ops_config, the metric trigger actions, owner directive NOZ-DOI-1'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'PRD-FUNNEL-INHOUSE-1 + CADENCE-SOCIAL-SHARES-1%');

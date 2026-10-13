-- PUBLISH-FRESHNESS-1 (2026-10-13, pillar reach; owner 2026-10-13: "Audit and remediate this type of failure mode and its root
-- causes systemwide across the fleet"). The fleet audit of the q08.org and reading.q08.org stalls listed every worker that
-- publishes LLM-written text to outside readers. Only q08-signal-engine (q08_hours_since_last_piece) and personal-companion
-- (companion_hours_since_last_piece) measure how long ago they last published. Three scheduled publishers whose output lives in
-- this database had no such measure, so a stall there would be noticed by nobody:
--   qnfo-research-exec  papers.qnfo.org      research_queue.published_at  (measured 2026-10-13 06:20Z: 0.7 h; 22-31 papers a day)
--   idea-hub            ideas.qnfo.org       idea_proposals.created_at    (0.6 h; 36-96 a day)
--   qnfo-social         Bluesky and Buffer   social_media_posts.published_at, status published (29.4 h; 1-3 a day, held by the
--                       owner's weekly channel caps, so its bar is a week)
-- Each metric is refreshed by a D1 trigger on the fleet heartbeat (fleet_tick, first 10 minutes of each hour) and has a metric
-- trigger whose action names the lever and closes on recovery. The on-demand surfaces (ask.qwav.tech, the papers ask, iPatent drafts)
-- and the email replies publish only when someone asks, so a publishing-age metric would measure the visitors, not the worker; they
-- are exempt (METRIC-CLOSED-LOOP-1 exemption recorded here).
-- Idempotent: INSERT OR IGNORE, CREATE TRIGGER IF NOT EXISTS, UPDATE.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM spof_registry WHERE component = 'publish freshness metrics'; DROP TRIGGER IF EXISTS publish_freshness_tick; DELETE FROM analytics_metric_triggers WHERE notes = 'PUBLISH-FRESHNESS-1 2026-10-13'; DELETE FROM metric_registry WHERE metric IN ('papers_hours_since_last_publish', 'ideas_hours_since_last_proposal', 'social_hours_since_last_post')

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('papers_hours_since_last_publish', 'surface', 'guard', 'hours since MAX(research_queue.published_at): how long papers.qnfo.org has gone without a newly published paper', 'qnfo-audit.research_queue', '0.7 h on 2026-10-13 (22-31 papers a day since 2026-10-09)', '< 48', 'qnfo-research-exec', 'analytics_metric_triggers papers_hours_since_last_publish', '1h', '> 24', '> 72', 'UNMEASURED', 'd1-trigger'),
 ('ideas_hours_since_last_proposal', 'surface', 'guard', 'hours since MAX(idea_proposals.created_at): how long the public ideas feed (ideas.qnfo.org) has gone without a new proposal', 'qnfo-audit.idea_proposals', '0.6 h on 2026-10-13 (36-96 a day)', '< 24', 'idea-hub', 'analytics_metric_triggers ideas_hours_since_last_proposal', '1h', '> 12', '> 48', 'UNMEASURED', 'd1-trigger'),
 ('social_hours_since_last_post', 'surface', 'guard', 'hours since MAX(social_media_posts.published_at) over published rows: how long the social channels have gone without a post (the weekly channel caps hold it to a few a week)', 'qnfo-audit.social_media_posts', '29.4 h on 2026-10-13 (1-3 a day, held by weekly caps)', '< 168', 'qnfo-social', 'analytics_metric_triggers social_hours_since_last_post', '1h', '> 96', '> 240', 'UNMEASURED', 'd1-trigger');

CREATE TRIGGER IF NOT EXISTS publish_freshness_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST(ROUND((julianday('now') - julianday((SELECT MAX(published_at) FROM research_queue WHERE published_at IS NOT NULL))) * 24, 1) AS TEXT)
  WHERE metric = 'papers_hours_since_last_publish';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST(ROUND((julianday('now') - julianday((SELECT MAX(created_at) FROM idea_proposals))) * 24, 1) AS TEXT)
  WHERE metric = 'ideas_hours_since_last_proposal';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST(ROUND((julianday('now') - julianday((SELECT MAX(published_at) FROM social_media_posts WHERE status = 'published'))) * 24, 1) AS TEXT)
  WHERE metric = 'social_hours_since_last_post';
END;

UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
  last_value = CAST(ROUND((julianday('now') - julianday((SELECT MAX(published_at) FROM research_queue WHERE published_at IS NOT NULL))) * 24, 1) AS TEXT)
WHERE metric = 'papers_hours_since_last_publish';
UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
  last_value = CAST(ROUND((julianday('now') - julianday((SELECT MAX(created_at) FROM idea_proposals))) * 24, 1) AS TEXT)
WHERE metric = 'ideas_hours_since_last_proposal';
UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
  last_value = CAST(ROUND((julianday('now') - julianday((SELECT MAX(published_at) FROM social_media_posts WHERE status = 'published'))) * 24, 1) AS TEXT)
WHERE metric = 'social_hours_since_last_post';

WITH v(metric_key, title, threshold, owner, action) AS (VALUES
  ('papers_hours_since_last_publish', 'papers.qnfo.org has published no paper for more than 48 hours', 48, 'qnfo-research-exec',
   'Read research_queue for the newest rows and the stage each stopped at (status, last_error), group them by stage, and fix the stage that holds the most papers in qnfo-research-exec (finalGates, citationGate, qualityGate, completion rounds); a paper waiting on a cap is not a stall. Write the stage counts and the fix into the issue.'),
  ('ideas_hours_since_last_proposal', 'ideas.qnfo.org has had no new idea proposal for more than 24 hours', 24, 'idea-hub',
   'Read idea-hub''s loop runs (runOwnerCorpus, thinkLoop) and qnfo-audit idea_proposals for the newest rows; find whether the loop stopped running, the writer call failed, or the public filters (pubQuestion, publicTitle, near-duplicate) rejected everything, and fix that stage in idea-hub/worker.js. Write the cause into the issue.'),
  ('social_hours_since_last_post', 'the social channels have posted nothing for more than a week', 168, 'qnfo-social',
   'Read cloud_ops_events kind social-run for the last week: a run that says held:weekly-cap on every channel is the owner''s cadence cap working, and the cap''s week has to be checked against the posted count; a run that errors, an empty queue (social_threads queued = 0 with nothing composed) or a rejected thread is the stall. Fix that stage in qnfo-social/worker.js and write the cause into the issue.')
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, 'registry', 'gt', v.threshold, 3, v.action || ' Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy does not move the metric within a day, say so on the issue and try a different lever (remedy_efficacy_30d counts it).', v.owner, 'agent_issues', 12, 1, 'PUBLISH-FRESHNESS-1 2026-10-13'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);

-- SPOF-REVIEW-GATE-1: the new D1 trigger rides the fleet_tick heartbeat. It only measures; no publishing path depends on it.
INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at) VALUES
 ('publish freshness metrics', 'qnfo-audit trigger publish_freshness_tick on fleet_tick (PUBLISH-FRESHNESS-1)', 'the metrics'' own last_refreshed ages when the heartbeat stops, which the fleet''s stale-metric checks and LOOP-WATCH-1 heartbeat watch report; q08 and personal-companion keep their own worker-written stall metrics', NULL, 'measurement only: a stopped trigger delays stall detection for papers, ideas and social, it never stops a publishing surface', NULL, '2026-10-13');

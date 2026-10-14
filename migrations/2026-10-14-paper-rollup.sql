-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_paper_rollup
-- Rollback: run the sql column of bak_20261014_paper_rollup kind 'trigger' (dissemination_queue_newest_only) and kind 'view' (after DROP VIEW v_channel_impact_7d); UPDATE dissemination_tracker SET action = 'suppressed', post_text_snippet = (SELECT b.name FROM bak_20261014_paper_rollup b WHERE b.kind = 'restored' AND b.ref = dissemination_tracker.id) WHERE id IN (SELECT ref FROM bak_20261014_paper_rollup WHERE kind = 'restored') AND action = 'queued'; DROP TRIGGER IF EXISTS paper_rollup_tick; UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key = 'papers_queued_over_120m'
-- spof-review: no new single point of failure; Bluesky carries queued papers directly when Substack or Buffer fails, and the metric runs on the existing fleet_tick heartbeat
--
-- PAPER-ROLLUP-1 (charter pillar reach). Owner directive 2026-10-14, verbatim: "substack swapped for mastodon on buffer. update expectations
-- and post/outreach schedule accordingly and implement full-throated/full-throttle publication and dissemination pipelines....clear out
-- backlogs and queues now and forever...100% server-side and 100% automatically"
-- Read 11:48Z: SLA-DRAIN-1 (migrations/2026-10-14-sla-drain-1.sql, written when Bluesky's cap was one post a week) had suppressed 143 queued
-- papers (created 2026-10-01 onward) as "superseded by a newer queued post", and its trigger dissemination_queue_newest_only suppresses
-- every queued paper when the next one arrives. Intake is about 17 papers a day (116 in 7 days), so that rule discards about 16 a day.
-- qnfo-social 0.16.0 (PAPER-ROLLUP-1) disseminates every paper instead: an hourly Substack Note lists every queued paper (up to 60) and a
-- Bluesky thread carries up to 15 of them, one post each. This file drops the trigger, re-queues the 143 papers (the roll-up clears them in
-- about three hourly runs), points the SLA-DRAIN-1 detector at the real SLA (no paper queued over 120 minutes), measures it, and makes
-- v_channel_impact_7d count a Bluesky roll-up thread once.
CREATE TABLE IF NOT EXISTS bak_20261014_paper_rollup AS
  SELECT 'trigger' AS kind, name AS ref, sql AS name, sql FROM sqlite_master WHERE type = 'trigger' AND name = 'dissemination_queue_newest_only'
  UNION ALL SELECT 'view', name, sql, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_channel_impact_7d'
  UNION ALL SELECT 'restored', id, post_text_snippet, NULL FROM dissemination_tracker WHERE action = 'suppressed' AND post_text_snippet LIKE 'SLA-DRAIN-1:%' AND created_at >= datetime('now', '-30 days');
DROP TRIGGER IF EXISTS dissemination_queue_newest_only;
UPDATE dissemination_tracker SET action = 'queued', updated_at = datetime('now'),
  post_text_snippet = 'PAPER-ROLLUP-1: re-queued from SLA-DRAIN-1 suppression; the hourly roll-up disseminates every paper'
WHERE id IN (SELECT ref FROM bak_20261014_paper_rollup WHERE kind = 'restored') AND action = 'suppressed';

DROP VIEW IF EXISTS v_channel_impact_7d;
CREATE VIEW v_channel_impact_7d AS
WITH posts AS (
  SELECT 'bluesky' AS channel, (SELECT COUNT(*) FROM social_threads WHERE status = 'posted' AND posted_at >= datetime('now', '-7 days'))
    + (SELECT COUNT(*) FROM dissemination_tracker WHERE action = 'posted' AND channel = 'bluesky' AND COALESCE(mode, '') NOT LIKE 'rollup%' AND posted_at >= datetime('now', '-7 days'))
    + (SELECT COUNT(*) FROM social_media_posts WHERE platform = 'bluesky-rollup' AND published_at >= datetime('now', '-7 days')) AS posts_7d
  UNION ALL SELECT CASE platform WHEN 'buffer-x' THEN 'x' ELSE substr(platform, 8) END, COUNT(*) FROM social_media_posts
    WHERE platform LIKE 'buffer-%' AND status = 'published' AND published_at >= datetime('now', '-7 days') GROUP BY platform
  UNION ALL SELECT 'email', COUNT(*) FROM outreach_log WHERE status IN ('sent', 'followup') AND sent_at >= datetime('now', '-7 days')
), clicks AS (
  SELECT channel, SUM(value) AS human_clicks_7d FROM reach_signals WHERE source = 'utm' AND metric = 'clicks_human' AND date >= date('now', '-7 days') GROUP BY channel
)
SELECT p.channel, SUM(p.posts_7d) AS posts_7d, COALESCE(c.human_clicks_7d, 0) AS human_clicks_7d,
  ROUND(1.0 * COALESCE(c.human_clicks_7d, 0) / MAX(1, SUM(p.posts_7d)), 2) AS clicks_per_post_7d
FROM posts p LEFT JOIN clicks c ON c.channel = p.channel GROUP BY p.channel;

UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM dissemination_tracker WHERE action = ''queued'' AND updated_at < datetime(''now'', ''-120 minutes'')',
  precondition = 'SLA-DRAIN-1; probe replaced by PAPER-ROLLUP-1 (no paper queued over 120 minutes)'
WHERE class = 'fm-dissemination-queue-over-cadence';
UPDATE failure_modes SET remediation = 'PAPER-ROLLUP-1 (qnfo-social 0.16.0): every queued paper goes out in the hourly Substack roll-up and the Bluesky roll-up thread; the newest-only suppression of SLA-DRAIN-1 is retired',
  detector = 'no dissemination row queued over 120 minutes'
WHERE fm_key = 'fm-dissemination-queue-over-cadence';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('papers_queued_over_120m', 'external', 'target', 'dissemination rows queued longer than 120 minutes (dissemination_tracker action queued, updated_at)',
  'qnfo-audit.dissemination_tracker (PAPER-ROLLUP-1)', '143 re-queued at apply; the hourly roll-up clears up to 60 an hour',
  '0 (every published paper is disseminated within 120 minutes)', 'qnfo-social', 'trigger gt 0', '10m', '> 0', '> 20', NULL, NULL, 'MEASURED', 'computed');
CREATE TRIGGER IF NOT EXISTS paper_rollup_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COUNT(*) FROM dissemination_tracker WHERE action = 'queued' AND updated_at < datetime('now', '-120 minutes')) AS TEXT)
  WHERE metric = 'papers_queued_over_120m';
END;
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'papers_queued_over_120m', 'Dissemination SLA: a published paper waited more than 120 minutes', 'registry', 'gt', 0, 2,
  'Pillar reach (owner directive 2026-10-14: clear backlogs now and forever). Read the newest qnfo-social rollup runs: SELECT ts, status, substr(text, 1, 400) FROM cloud_ops_events WHERE kind = ''social-run'' AND text LIKE ''%rollup%'' ORDER BY ts DESC LIMIT 5. Levers in order: (1) substack held:no-channel: Buffer no longer lists Substack (social_channels); the Bluesky roll-up takes the rows meanwhile; (2) error:buffer: check social_engagements buffer auth_status; (3) held:no-live-links: the papers site does not answer for those slugs (probeLink transient); (4) raise ROLLUP_SUBSTACK_MAX in qnfo-social. Done: papers_queued_over_120m = 0 at two refreshes.',
  'qnfo-social', 'agent_issues', 2, 1, 'PAPER-ROLLUP-1 (migrations/2026-10-14-paper-rollup.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'papers_queued_over_120m');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, reviewed_at)
VALUES ('dissemination-queue-newest-only', 'D1 trigger dissemination_queue_newest_only (SLA-DRAIN-1)', 'filter', 'a posting queue older than its cadence can post', 'outreach',
  'remove', 'applied', 'PAPER-ROLLUP-1 roll-ups: hourly Substack Note of every queued paper and a Bluesky thread per gate slot', NULL,
  'removed 2026-10-14: at about 17 papers a day the newest-only rule discarded about 16 a day; 143 papers re-queued for the roll-up', datetime('now'));
-- WATCHMAKER-INDEX-1: the new recurring operation is listed in WATCHMAKER_OPS. qnfo-fleet-dashboard/worker.js is under a code-loop claim
-- (ct_7ksrutyg7lh56k) at authoring time, so the code loop makes the edit; the code-probe closes the issue when the entry is on main.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'PAPER-ROLLUP-WATCHMAKER-1: list the qnfo-social paper roll-up (hourly) in WATCHMAKER_OPS',
  'Pillar reach. qnfo-social 0.16.0 (PAPER-ROLLUP-1, migrations/2026-10-14-paper-rollup.sql) runs drainRollup on every hourly tick and records it with recordSocialRun op rollup (cloud_ops_events id social-rollup-<day>, meta.last_ok). WATCHMAKER-INDEX-1 requires the recurring operation in WATCHMAKER_OPS. Add, directly before the social-channels entry, the entry { key: "social-rollup", what: "Paper roll-up: every queued paper in an hourly Substack Note and a Bluesky thread per gate slot (PAPER-ROLLUP-1, qnfo-social, hourly; a run with nothing queued still counts as run)", runner: "cron:qnfo-social", cadence_h: 1, first_due: "2026-10-15T00:00:00Z", sql: "SELECT MAX(json_extract(meta, ''$.last_ok'')) AS last FROM cloud_ops_events WHERE id >= ''social-rollup-'' AND id < ''social-rollup.''" }, and bump VERSION (patch).
code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js
code-anchor: { key: "social-channels", what:
code-probe: {"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "key: \"social-rollup\""}',
  'session_01AEEBcczeW1o2nKSUBtXnUL:paper-rollup', 'reach', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'PAPER-ROLLUP-WATCHMAKER-1:%' AND status = 'open');
INSERT INTO fleet_tick (source) VALUES ('migration:paper-rollup');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01AEEBcczeW1o2nKSUBtXnUL', 'a backlog is cleared by carrying many items per post, not by discarding them; one Substack Note holds about 60 papers and a Bluesky thread 15, so every paper is disseminated at a cadence each platform tolerates',
  'PAPER-ROLLUP-1: dissemination_queue_newest_only dropped, 143 suppressed papers re-queued, hourly Substack roll-up and Bluesky roll-up threads (qnfo-social 0.16.0, cron 30 * * * *), metric papers_queued_over_120m with trigger, fm-dissemination-queue-over-cadence probe on the 120-minute SLA',
  '11:48Z: 143 papers suppressed by SLA-DRAIN-1, intake 116 in 7 days, 1 queued; Substack connected in Buffer by the owner (Mastodon moved to direct posting 08:31Z)',
  'merged through the canonical path (migration runner)', 'dissemination_tracker rows of 30 days; one trigger dropped, one added (metric only); v_channel_impact_7d recreated', 'the Rollback header',
  'every published paper reaches Substack within the hour and Bluesky within its gate; no paper is discarded for volume',
  'papers_queued_over_120m = 0 within 4 hours of the qnfo-social 0.16.0 deploy and stays 0 at the 24 h check',
  '143 backlog papers and about 17 new papers a day reach Substack and Bluesky', 'd1:dissemination_tracker, sqlite_master, remediation_contracts; code:qnfo-social drainRollup, migrations/2026-10-14-sla-drain-1.sql'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PAPER-ROLLUP-1:') = 1);

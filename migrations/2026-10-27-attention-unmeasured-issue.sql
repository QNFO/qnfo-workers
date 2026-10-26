-- ATTENTION-UNMEASURED-1 (2026-10-26, charter pillar: reach; guard metric attention_channels_stopped = 2 > 1).
-- The attention scorecard (qnfo-fleet-dashboard atChannelStats, daily) judges social channels on items it never measured:
-- an unmeasured post counts as an item with 0 engagements, so a channel is moved to IMPROVE or STOP on missing data.
-- MEASURED 2026-10-26 in qnfo-audit (read-only):
--   * Bluesky: 203 posts with an at:// uri in the 28-day window (9 social_threads + 194 dissemination_tracker); the 194
--     dissemination posts have no reach_signals / social_engagements row at all (qnfo-social collectEngagement stops at 100
--     uris, social_threads first: 141 threads in 60 days fill the cap, so dissemination posts are never fetched; a sibling
--     change in qnfo-social fixes the collector). Scorecard 2026-10-25: bluesky items 209, attention 0, verdict STOP.
--   * Buffer channels: linkedin 0 of 11 and x 0 of 20 sent posts in 28 days have any Buffer metric row (Buffer returns no
--     statistics for those networks; qnfo-social stores buffer_channel rows saying so, and its design comment says a metric
--     Buffer does not return is NOT a row of zeros). The dashboard already counts `unmetered` and only writes a note;
--     items and per_item still include those posts. Scorecard 2026-10-25: linkedin 10 items / 0 attention, x 19 items /
--     0 attention, both IMPROVE (half share) on no data.
-- The edit is one file, qnfo-fleet-dashboard/worker.js, which a live work claim holds (holder session-infra-breach-remediation,
-- FLEET-TICK-HEAVY-SECOND-PRODUCER-1, until 2026-10-26T19:03Z), so it is handed to the code loop as a code-task.
-- The migration only files the issue; it changes no verdict, threshold, share or metric.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: SELECT 'No-op: the issue and its lifecycle rows are the record; a cancellation needs a separately recorded disposition.';

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT
  'ATTENTION-UNMEASURED-1: the attention scorecard counts unmeasured posts as items with zero engagement',
  'Charter pillar: reach. Guard metric attention_channels_stopped = 2 (threshold > 1). Cause: qnfo-fleet-dashboard atChannelStats (daily attention scorecard) counts every posted item as an item and an unmeasured item as 0 engagements, which contradicts the function own rule (a source that cannot be read leaves its figure null and a note, never a fabricated zero).' || char(10) ||
  'MEASURED 2026-10-26 (qnfo-audit): Bluesky has 203 posts with an at:// uri in 28 days, 194 of them dissemination_tracker posts with no reach_signals row at all (qnfo-social collectEngagement caps at 100 uris, threads first, so they are never fetched; a sibling qnfo-social change fixes the collector). Scorecard 2026-10-25 bluesky: 209 items, attention 0, STOP. Buffer: linkedin 0 of 11 and x 0 of 20 sent posts have any Buffer metric row (Buffer returns no statistics for those networks and qnfo-social stores that fact as buffer_channel rows, never as zeros); the dashboard computes `unmetered` for them and only writes a note, so linkedin (10 items) and x (19 items) read 0 engagements per item and sit at IMPROVE (half share) on no data.' || char(10) ||
  'FIX (qnfo-fleet-dashboard/worker.js, pure helper named atMeasuredOnly so it is testable): an item counts toward items, per_item and the verdict only when it is MEASURED. Bluesky: measured iff reach_signals has at least one source=bluesky row for its uri in the window query (eng[uri] present). Buffer: measured iff met[buffer_id] is present; a post younger than 24 hours with no row is not yet due and is excluded from items too. Report the excluded count as stats.unmeasured, in the scorecard row extra JSON (add unmeasured) and in notes. When measured items fall under th.min_items the existing INSUFFICIENT path applies (full share, keep exploring). Do not change atVerdict STOP stickiness or the re-test logic, the thresholds, or any verdict by hand: a channel already in STOP stays STOP until its retest_at (bluesky 2026-11-03, mastodon 2026-11-16) by design, so attention_channels_stopped cannot fall under 2 before the bluesky re-test; the fix stops new verdicts resting on missing data and makes the re-test judge measured items.' || char(10) ||
  'Add qnfo-fleet-dashboard/attention-unmeasured.test.mjs (measured-only counting for both sources, younger-than-24h exclusion, INSUFFICIENT when measured items are under min_items), bump var VERSION as a patch, keep deployed-current.worker.js identical to worker.js, and use \u escapes for non-ASCII.' || char(10) ||
  'Definition of done: the next attention scorecard after the deploy (cloud_ops_events id attention-scorecard-<day> status ok) writes an unmeasured count in the extra of the bluesky, linkedin and x 28-day rows and linkedin and x items equal their measured posts; record before and after in issue_triage.close_evidence.' || char(10) ||
  'code-probe: {"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "function atMeasuredOnly("}' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js' || char(10) ||
  'code-anchor: const unmetered = posts.filter(function(p) { return !met[p.buffer_id] && Date.parse(String(p.published_at).replace(" ", "T") + "Z") < Date.parse(to + "T00:00:00Z") - DAY_MS; }).length;',
  'session', 'reach', 'high', 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (
  SELECT 1 FROM agent_issues
  WHERE title = 'ATTENTION-UNMEASURED-1: the attention scorecard counts unmeasured posts as items with zero engagement'
    AND status = 'open'
);

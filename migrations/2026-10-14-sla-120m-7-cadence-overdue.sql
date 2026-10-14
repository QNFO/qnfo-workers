-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_sla_120m_7
-- Rollback: UPDATE analytics_metric_triggers SET enabled = (SELECT CAST(b.v AS INTEGER) FROM bak_20261014_sla_120m_7 b WHERE b.kind = 'trigger' AND b.k = analytics_metric_triggers.metric_key), threshold = (SELECT CAST(b.v2 AS REAL) FROM bak_20261014_sla_120m_7 b WHERE b.kind = 'trigger' AND b.k = analytics_metric_triggers.metric_key) WHERE metric_key IN (SELECT k FROM bak_20261014_sla_120m_7 WHERE kind = 'trigger'); UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key = 'cadence_overdue_over_120m'; DROP TRIGGER IF EXISTS cadence_overdue_tick_10m; then recreate publish_freshness_tick, sla_definitions_120_tick and v_sla_over_120m from the sql column of bak_20261014_sla_120m_7 (kind 'sql') and restore the fm-view-alias-capture probe from kind 'probe'
-- spof-review: no new single point of failure; the metric is computed by the existing fleet_tick heartbeat (two producers) like every other computed metric
--
-- SLA-120M-7 PRODUCER-LATENESS-120M-1 (charter pillars autonomy and reach). Owner directive 2026-10-14, verbatim: "All SLAs systemwide
-- across the fleet shall be measured in 10-minute intervals/resolution, never hours or days. No SLA shall ever exceed 120 minutes and
-- action shall commence immediately >120 minutes to audit and remediate all such failure modes and their root causes."
-- SLA-120M-1 to -6 capped item SLAs (queue_sla, content stages, sla_registry), issue age, the doer SLA, trigger cooldowns and probe
-- cadences. Audit 2026-10-14 07:50Z found the last SLA family still measured in hours or days: how late a scheduled producer is.
--   papers_hours_since_last_publish  hours, refreshed hourly, alarm at 48 h      (qnfo-research-exec, papers.qnfo.org)
--   ideas_hours_since_last_proposal  hours, refreshed hourly, alarm at 24 h      (idea-hub, ideas.qnfo.org)
--   social_hours_since_last_post     hours, refreshed hourly, alarm at 168 h     (qnfo-social)
--   cf_changelog_audit_age_h         hours, alarm at 48 h for a daily loop       (qnfo-fleet-control CF-CHANGELOG-LOOP-1)
--   continuity_snapshot_age_h        hours, alarm at 26 h for a daily snapshot   (scripts/continuity_snapshot.py)
--   companion_hours_since_last_piece hours, no alarm at all (read 99.1 h)        (personal-companion, reading.q08.org)
--   q08_hours_since_last_piece       hours, no alarm at all                      (q08-signal-engine, q08.org)
-- A producer's interval (how often it is due) is its schedule, not an SLA. The SLA is how late it may be past its due time. This file:
--   cadence_sla        one row per producer: interval_min (its schedule) and sla_min (at most 120, on the 10-minute grid, by CHECK);
--   v_cadence_overdue  minutes since the last output, the due time and overdue_min, read live on every query. reading.q08.org is due at
--                      the first generation slot (GEN_HOURS_UTC 04, 08, 12, 16, 20) after its last piece; the others at last + interval;
--   cadence_overdue_over_120m  producers more than 120 minutes past due, refreshed on every fleet_tick insert (the 10-minute heartbeat),
--                      with its trigger (gt 0, cooldown 2 h) naming each producer's lever. It is also added to v_sla_over_120m's total,
--                      so sla_breaches_over_120m counts it; the fm-view-alias-capture probe sums the new column too;
--   the five hour/day alarms above are disabled (superseded; their metrics stay for history), publish_freshness_tick refreshes every
--   tick instead of once an hour, and the deploy_freshness_h alarm fires at 2 h (120 minutes) instead of 6 h;
--   sla_definitions_over_120m also counts a cadence_sla row above 120 minutes and an enabled alarm left on a superseded hour metric.
-- Intervals (from each producer's own schedule and record): companion slots as above; q08 480 (its own target, a piece at least every
-- 8 hours); papers 720 (5 papers in the 24 h to 07:04Z, longest gap 10.5 h; research-exec runs every 15 minutes); ideas 60 (idea-hub
-- runs hourly, 36-96 proposals a day); social 10080 (the owner's weekly channel caps set its cadence, a publishing cadence cap that
-- CLAUDE.md keeps); cf-changelog and continuity 1440 (daily). A wrong interval is corrected by a migration with its evidence.
-- Unchanged on purpose: rate windows (issue_drain_ratio_24h, tick_completion_24h, 7- and 30-day rates and MTTR statistics) are not
-- SLAs; v_content_pipeline.age_h is a display column (its over_sla already compares minutes). Two owners' code changes are filed as
-- code tasks, not made here: qnfo-cloud-ops INBOUND-SLA-1 (deadline_h 72, metrics every 3 h) and qnfo-fleet-dashboard
-- human_wait_oldest_days (alarm at 7 days); both files are under another session's live work claim.

CREATE TABLE IF NOT EXISTS bak_20261014_sla_120m_7 AS
  SELECT 'trigger' AS kind, metric_key AS k, CAST(enabled AS TEXT) AS v, CAST(threshold AS TEXT) AS v2, NULL AS sql FROM analytics_metric_triggers
    WHERE metric_key IN ('papers_hours_since_last_publish', 'ideas_hours_since_last_proposal', 'social_hours_since_last_post', 'cf_changelog_audit_age_h', 'continuity_snapshot_age_h', 'deploy_freshness_h')
  UNION ALL SELECT 'sql', name, NULL, NULL, sql FROM sqlite_master WHERE name IN ('publish_freshness_tick', 'sla_definitions_120_tick', 'v_sla_over_120m')
  UNION ALL SELECT 'probe', class, NULL, NULL, verify_probe FROM remediation_contracts WHERE class = 'fm-view-alias-capture'
  UNION ALL SELECT 'metric', metric, refresh_cadence, NULL, NULL FROM metric_registry WHERE metric IN ('papers_hours_since_last_publish', 'ideas_hours_since_last_proposal', 'social_hours_since_last_post');

CREATE TABLE IF NOT EXISTS cadence_sla (
  surface TEXT PRIMARY KEY,
  producer TEXT NOT NULL,
  interval_min INTEGER NOT NULL CHECK (interval_min >= 10),
  sla_min INTEGER NOT NULL CHECK (sla_min BETWEEN 10 AND 120 AND sla_min % 10 = 0),
  schedule TEXT,
  last_output TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
INSERT OR IGNORE INTO cadence_sla (surface, producer, interval_min, sla_min, schedule, last_output) VALUES
 ('reading.q08.org', 'personal-companion', 240, 120, 'generation slots 04, 08, 12, 16, 20 UTC (GEN_HOURS_UTC); due at the first slot after the last piece', 'personal-life companion_pieces via metric companion_hours_since_last_piece'),
 ('q08.org', 'q08-signal-engine', 480, 120, 'a piece at least every 8 hours (its own target); crons hourly at :00 and :30', 'q08-signal published_pieces via metric q08_hours_since_last_piece'),
 ('papers.qnfo.org', 'qnfo-research-exec', 720, 120, 'research-exec runs every 15 minutes; 5 papers in the 24 h to 2026-10-14 07:04Z, longest gap 10.5 h', 'research_queue.published_at'),
 ('ideas.qnfo.org', 'idea-hub', 60, 120, 'idea-hub runs hourly at :23; 36-96 proposals a day', 'idea_proposals.created_at'),
 ('social', 'qnfo-social', 10080, 120, 'the owner''s weekly channel caps; social runs every 2 hours', 'social_media_posts.published_at (status published)'),
 ('cf-changelog', 'qnfo-fleet-control', 1440, 120, 'CF-CHANGELOG-LOOP-1 runs once a day inside the hourly tick', 'cf_changelog_runs.ts (status ok or partial)'),
 ('continuity-snapshot', 'scripts/continuity_snapshot.py', 1440, 120, 'one continuity snapshot a day (doctrine section 14)', 'continuity_snapshots.ts (ok = 1)');

DROP VIEW IF EXISTS v_cadence_overdue;
CREATE VIEW v_cadence_overdue AS
SELECT vco_d.surface, vco_d.producer, strftime('%Y-%m-%dT%H:%M:%SZ', vco_d.lj) AS last_at,
  CAST((julianday('now') - vco_d.lj) * 1440 AS INTEGER) AS age_min, vco_d.interval_min,
  strftime('%Y-%m-%dT%H:%M:%SZ', vco_d.dj) AS due_at,
  CASE WHEN vco_d.dj IS NULL THEN NULL WHEN julianday('now') > vco_d.dj THEN CAST((julianday('now') - vco_d.dj) * 1440 AS INTEGER) ELSE 0 END AS overdue_min,
  vco_d.sla_min,
  CASE WHEN vco_d.dj IS NOT NULL AND (julianday('now') - vco_d.dj) * 1440 > vco_d.sla_min THEN 1 ELSE 0 END AS over_sla
FROM (
  SELECT vco_s.*,
    CASE WHEN vco_s.lj IS NULL THEN NULL
      WHEN vco_s.surface = 'reading.q08.org' THEN julianday(date(vco_s.lj)) + (CASE
        WHEN CAST(strftime('%H', vco_s.lj) AS INTEGER) < 4 THEN 4 WHEN CAST(strftime('%H', vco_s.lj) AS INTEGER) < 8 THEN 8
        WHEN CAST(strftime('%H', vco_s.lj) AS INTEGER) < 12 THEN 12 WHEN CAST(strftime('%H', vco_s.lj) AS INTEGER) < 16 THEN 16
        WHEN CAST(strftime('%H', vco_s.lj) AS INTEGER) < 20 THEN 20 ELSE 28 END) / 24.0
      ELSE vco_s.lj + vco_s.interval_min / 1440.0 END AS dj
  FROM (
    SELECT vco_c.surface, vco_c.producer, vco_c.interval_min, vco_c.sla_min, CASE vco_c.surface
      WHEN 'reading.q08.org' THEN (SELECT julianday(last_refreshed) - CAST(last_value AS REAL) / 24 FROM metric_registry WHERE metric = 'companion_hours_since_last_piece' AND last_value GLOB '[0-9]*')
      WHEN 'q08.org' THEN (SELECT julianday(last_refreshed) - CAST(last_value AS REAL) / 24 FROM metric_registry WHERE metric = 'q08_hours_since_last_piece' AND last_value GLOB '[0-9]*')
      WHEN 'papers.qnfo.org' THEN (SELECT julianday(MAX(published_at)) FROM research_queue WHERE published_at IS NOT NULL)
      WHEN 'ideas.qnfo.org' THEN (SELECT julianday(MAX(created_at)) FROM idea_proposals)
      WHEN 'social' THEN (SELECT julianday(MAX(published_at)) FROM social_media_posts WHERE status = 'published')
      WHEN 'cf-changelog' THEN (SELECT julianday(MAX(ts)) FROM cf_changelog_runs WHERE status IN ('ok', 'partial'))
      WHEN 'continuity-snapshot' THEN (SELECT julianday(MAX(ts)) FROM continuity_snapshots WHERE ok = 1)
      END AS lj
    FROM cadence_sla vco_c
  ) vco_s
) vco_d;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('cadence_overdue_over_120m', 'operational', 'target',
  'producers in cadence_sla more than sla_min (at most 120) minutes past their due time: v_cadence_overdue rows with over_sla = 1; due = the last output plus interval_min, or the first generation slot after the last piece for reading.q08.org',
  'qnfo-audit.v_cadence_overdue, cadence_sla (SLA-120M-7)', 'read 2026-10-14 07:58Z: 1 (reading.q08.org, 5757 minutes past due)',
  '0 (owner directive 2026-10-14: no SLA exceeds 120 minutes, measured at 10-minute resolution)', 'qnfo-fleet-control', 'trigger gt 0', '10m', '> 0', '> 2', NULL, NULL, 'MEASURED', 'computed');

DROP TRIGGER IF EXISTS cadence_overdue_tick_10m;
CREATE TRIGGER cadence_overdue_tick_10m AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM v_cadence_overdue WHERE over_sla = 1) AS TEXT)
  WHERE metric = 'cadence_overdue_over_120m';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'cadence_overdue_over_120m', 'SLA breach: a producer is more than 120 minutes past its due time (10-minute resolution)', 'registry', 'gt', 0, 2,
  'Pillars autonomy and reach (SLA-120M-7, owner directive 2026-10-14: no SLA exceeds 120 minutes; action starts at once past 120 minutes to audit and remediate the failure mode and its root cause). Read SELECT * FROM v_cadence_overdue WHERE over_sla = 1. For each producer past due, find why it missed its due time, fix that cause and write both into the issue: '
  || 'reading.q08.org (personal-companion): GET https://reading.q08.org/health and the last generation errors; issue 2552 (COMPANION-PUBLISH-STALL-AUTO-1) carries the diagnosis so far; fix the stage that rejected the last drafts in personal-companion/worker.js. '
  || 'q08.org (q08-signal-engine): GET https://q08.org/api/runs; fix the stage that rejected the last runs. '
  || 'papers.qnfo.org (qnfo-research-exec): read research_queue newest rows by status and stage with last_error; fix the stage that holds the most papers (a paper waiting on a cap is a capacity question for research_parallel, not a stall). '
  || 'ideas.qnfo.org (idea-hub): read the loop runs and idea_proposals; find whether the loop stopped, the writer failed or the public filters rejected everything; fix that stage in idea-hub/worker.js. '
  || 'social (qnfo-social): read cloud_ops_events kind social-run; held:weekly-cap on every channel is the owner''s cadence cap, so correct interval_min in cadence_sla by migration with the cap evidence; an error or an empty queue is the stall to fix in qnfo-social/worker.js. '
  || 'cf-changelog (qnfo-fleet-control CF-CHANGELOG-LOOP-1): GET https://qnfo-fleet-control.q08.workers.dev/cf-changelog and the newest cf_changelog_runs note. '
  || 'continuity-snapshot (scripts/continuity_snapshot.py): the newest continuity_snapshots rows (ok = 0 notes) and the workflow run that writes them. '
  || 'Definition of done: v_cadence_overdue reads over_sla = 0 for every producer (cadence_overdue_over_120m = 0); record the cause and the fix in issue_triage.close_evidence. A cause that recurs gets a failure_modes row and an fm- detector.',
  'qnfo-fleet-control', 'agent_issues', 2, 1, 'SLA-120M-7 2026-10-14'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'cadence_overdue_over_120m');

-- the hour and day alarms are superseded by the 120-minute lateness SLA; their metrics stay for history
UPDATE analytics_metric_triggers SET enabled = 0,
  notes = COALESCE(notes, '') || ' | superseded 2026-10-14 by cadence_overdue_over_120m (SLA-120M-7: lateness past due, at most 120 minutes)'
WHERE metric_key IN ('papers_hours_since_last_publish', 'ideas_hours_since_last_proposal', 'social_hours_since_last_post', 'cf_changelog_audit_age_h', 'continuity_snapshot_age_h')
  AND enabled = 1;
UPDATE analytics_metric_triggers SET threshold = 2,
  notes = COALESCE(notes, '') || ' | SLA-120M-7 2026-10-14: fires at 2 h (120 minutes) behind main, was 6 h'
WHERE metric_key = 'deploy_freshness_h' AND threshold > 2;

-- the publish ages refresh on every tick (10-minute resolution), not in the first 10 minutes of each hour
DROP TRIGGER IF EXISTS publish_freshness_tick;
CREATE TRIGGER publish_freshness_tick AFTER INSERT ON fleet_tick
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
UPDATE metric_registry SET refresh_cadence = '10m'
WHERE metric IN ('papers_hours_since_last_publish', 'ideas_hours_since_last_proposal', 'social_hours_since_last_post');

-- the master SLA view counts late producers too (aliases unique across the nested views, SLA-120M-VIEW-ALIAS-1)
DROP VIEW IF EXISTS v_sla_over_120m;
CREATE VIEW v_sla_over_120m AS
SELECT vsla_s.*, vsla_k.*, vsla_x.issues_open_over_120m, vsla_x.oldest_open_issue_min, vsla_c.content_items_over_sla,
  vsla_q.code_tasks_queued_over_120m, vsla_r.research_claims_over_120m, vsla_p.cadence_overdue_over_120m,
  vsla_x.issues_open_over_120m + vsla_s.research_review_error + vsla_s.research_head_stalled + vsla_s.research_queued_180m + vsla_s.intents_pending
    + vsla_s.outreach_waiting + vsla_s.code_tasks_stalled + vsla_s.issues_without_doer_3h + vsla_s.zenodo_exit_pending_stalled + vsla_s.research_held_over_sla
    + vsla_s.triage_gap + vsla_s.contracts_cadence_drift + vsla_q.code_tasks_queued_over_120m
    + vsla_k.predictions_unscored_over_sla + vsla_k.doctrine_proposals_waiting + vsla_c.content_items_over_sla + vsla_r.research_claims_over_120m
    + vsla_p.cadence_overdue_over_120m AS total_over_120m
FROM v_stuck_summary vsla_s, v_stuck_summary_kernel vsla_k,
  (SELECT COUNT(*) AS issues_open_over_120m, COALESCE(MAX(age_min), 0) AS oldest_open_issue_min FROM v_issue_age WHERE age_min > 120) vsla_x,
  (SELECT COALESCE(SUM(over_sla), 0) AS content_items_over_sla FROM v_content_pipeline) vsla_c,
  (SELECT COUNT(*) AS code_tasks_queued_over_120m FROM code_tasks WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-120 minutes')) vsla_q,
  (SELECT COUNT(*) AS research_claims_over_120m FROM research_queue WHERE status = 'researching' AND claimed_at IS NOT NULL
     AND claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) vsla_r,
  (SELECT COUNT(*) AS cadence_overdue_over_120m FROM v_cadence_overdue WHERE over_sla = 1) vsla_p;

UPDATE remediation_contracts SET verify_probe = replace(verify_probe, '+ research_claims_over_120m AND', '+ research_claims_over_120m + cadence_overdue_over_120m AND')
WHERE class = 'fm-view-alias-capture' AND instr(verify_probe, 'cadence_overdue_over_120m') = 0;
UPDATE metric_registry SET formula = formula || '; plus producers more than 120 minutes past their due time (v_cadence_overdue, SLA-120M-7)'
WHERE metric = 'sla_breaches_over_120m' AND instr(formula, 'SLA-120M-7') = 0;

-- the definitions guard metric counts a cadence row above 120 minutes and an alarm left enabled on a superseded hour metric
DROP TRIGGER IF EXISTS sla_definitions_120_tick;
CREATE TRIGGER sla_definitions_120_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM queue_sla WHERE sla_min > 120 OR sla_min % 10 <> 0 OR COALESCE(producer_cycle_min, cycle_min) > sla_min)
      + (SELECT COUNT(*) FROM content_stages WHERE sla_min IS NOT NULL AND (sla_min > 120 OR sla_min % 10 <> 0))
      + (SELECT COUNT(*) FROM sla_registry WHERE NOT (window GLOB '[0-9]*m' AND CAST(window AS INTEGER) BETWEEN 10 AND 120 AND CAST(window AS INTEGER) % 10 = 0))
      + (SELECT COUNT(*) FROM analytics_metric_triggers WHERE enabled = 1 AND (cooldown_hours > 2 OR cooldown_hours IS NULL))
      + (SELECT COUNT(*) FROM remediation_contracts WHERE status = 'active' AND expected_cadence_h > 2)
      + (SELECT COUNT(*) FROM cadence_sla WHERE sla_min > 120 OR sla_min % 10 <> 0)
      + (SELECT COUNT(*) FROM analytics_metric_triggers WHERE enabled = 1 AND metric_key IN ('papers_hours_since_last_publish',
          'ideas_hours_since_last_proposal', 'social_hours_since_last_post', 'cf_changelog_audit_age_h', 'continuity_snapshot_age_h')) AS TEXT)
  WHERE metric = 'sla_definitions_over_120m';
END;
UPDATE metric_registry SET formula = formula || '; plus cadence_sla rows above 120 minutes or off the grid and enabled alarms on the hour metrics SLA-120M-7 superseded'
WHERE metric = 'sla_definitions_over_120m' AND instr(formula, 'SLA-120M-7') = 0;

INSERT OR REPLACE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id,
  trigger_condition, symptom, blast_radius) VALUES
('producer-lateness-in-hours',
 'a scheduled producer can be late for hours or days before anything acts, because its freshness is an hour metric with a day-scale alarm or none',
 'PUBLISH-FRESHNESS-1 and the companion and q08 stall metrics measured age in hours, refreshed hourly or 2-hourly, with alarms at 24 to 168 h; SLA-120M-1 to -6 capped item SLAs only',
 'SLA-120M-7: cadence_sla holds each producer''s interval and an SLA of at most 120 minutes; v_cadence_overdue reads lateness in minutes; cadence_overdue_over_120m is refreshed every tick, has its trigger and is part of sla_breaches_over_120m',
 'no enabled alarm on a superseded hour metric, no cadence_sla row above 120 minutes, and cadence_overdue_over_120m refreshed within 30 minutes',
 'fm-producer-lateness-in-hours', '2026-10-14', NULL,
 'a new producer freshness metric registered in hours with its own alarm instead of a cadence_sla row',
 'reading.q08.org published nothing for 99 hours with no alarm; papers alarmed at 48 hours',
 'every scheduled publisher and daily loop');

INSERT OR REPLACE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts,
  escalate_to, expected_cadence_h, status, ts, module, budget_ms, max_items, requires_container, attempts) VALUES
('fm-producer-lateness-in-hours', NULL, 'SLA-120M-7', 'failure-mode detector',
 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM analytics_metric_triggers WHERE enabled = 1 AND metric_key IN (''papers_hours_since_last_publish'', ''ideas_hours_since_last_proposal'', ''social_hours_since_last_post'', ''cf_changelog_audit_age_h'', ''continuity_snapshot_age_h'')) + (SELECT COUNT(*) FROM cadence_sla WHERE sla_min > 120) + (SELECT COUNT(*) FROM metric_registry WHERE metric = ''cadence_overdue_over_120m'' AND (last_refreshed IS NULL OR last_refreshed < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes''))) AS TEXT) AS observed',
 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', datetime('now'), 'failure-mode', 45000, 5, 0, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a producer''s interval is its schedule, not an SLA; the SLA is how late it may be past its due time, at most 120 minutes, measured in minutes on every tick',
  'SLA-120M-7: cadence_sla and v_cadence_overdue for seven producers, cadence_overdue_over_120m with its trigger and in v_sla_over_120m, five hour/day alarms superseded, publish ages refreshed every tick, deploy_freshness_h alarm at 2 h',
  'read 2026-10-14 07:50Z: papers alarm 48 h, ideas 24 h, social 168 h, cf-changelog 48 h, continuity 26 h, deploy 6 h; companion and q08 freshness had no alarm (companion read 99.1 h); publish_freshness_tick ran once an hour',
  'migration merged', 'one view replaced, one view and table added, six alarm rows, two recreated fleet_tick triggers', 'see the Rollback header',
  'a producer that misses its due time is counted within 10 minutes and filed after 120 minutes, in minutes, for every scheduled publisher and daily loop',
  'cadence_overdue_over_120m reads 1 (reading.q08.org) on its first refresh and fm-producer-lateness-in-hours passes within 30 minutes of apply; sla_definitions_over_120m does not rise',
  'reading.q08.org lateness becomes a 120-minute SLA breach with a named lever instead of an unalarmed hour count',
  'd1:qnfo-audit metric_registry, analytics_metric_triggers, research_queue, idea_proposals, social_media_posts, cf_changelog_runs, continuity_snapshots, v_sla_over_120m'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-120M-7:') = 1);

INSERT INTO fleet_tick (source) VALUES ('migration:sla-120m-7');

-- DOCTRINE-REV4-1 (2026-10-09, pillar autonomy and reach; owner directive 2026-10-09, Autonomous Operation Doctrine revision 4,
-- adopted verbatim in docs/AUTONOMOUS-OPERATION-DOCTRINE.md with readings (e)-(h)). Machinery for the clauses revision 4 adds:
--   §14 decision fields: decision_log gains predicted_outcome, reach_gain, surfaces_tested and outcome_matched (1 the outcome
--       matched the prediction, 0 it did not, NULL not yet known). decision_log is append-only; outcome_matched is the one
--       field a later row may fill, through decision_outcomes (append-only), never by editing the decision.
--   §15 / §22 calibration: prediction_logged_share_7d (decisions with a prediction / decisions) and prediction_miss_rate_7d
--       (1 - matched share over decisions with a known outcome).
--   §15 autonomy rate: autonomy_rate_7d = decisions / (decisions + owner-gated cards opened), 7 days.
--   §15 depth: depth_signals_30d = replies + reposts + quotes on posts measured in 30 days (latest snapshot per post;
--       social_engagements stores daily cumulative counts).
--   §14 continuity and resurrection: continuity_snapshots (ledger written by scripts/continuity_snapshot.py from the GitHub
--       runner: D1 Time Travel bookmark plus a logical snapshot of the state tables to R2 and to an Actions artifact),
--       continuity_snapshot_age_h and continuity_integrity (snapshot rows / live rows at snapshot time, worst state table).
--   §15 freshness: asset_freshness_90d is written by the same script from living-paper.
--   §15 engagement velocity, discussion quality, reputation trend: no collector records reply times or reply text, so these are
--       not measured; REACH-SIGNALS-1 is filed to build them (never a number that is not measured).
-- In-D1 metrics refresh on the fleet tick at the top of the hour (doctrine_rev4_tick: metric_registry writes only, no issue
-- insert, so no deep trigger chain). Every metric has its analytics_metric_triggers row (METRIC-CLOSED-LOOP-1).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS doctrine_rev4_tick; DELETE FROM analytics_metric_triggers WHERE notes LIKE 'DOCTRINE-REV4-1%'; DELETE FROM metric_registry WHERE metric IN ('autonomy_rate_7d','prediction_logged_share_7d','prediction_miss_rate_7d','depth_signals_30d','continuity_snapshot_age_h','continuity_integrity','asset_freshness_90d') (added columns and ledgers stay; they hold evidence)

ALTER TABLE decision_log ADD COLUMN predicted_outcome TEXT;
ALTER TABLE decision_log ADD COLUMN reach_gain TEXT;
ALTER TABLE decision_log ADD COLUMN surfaces_tested TEXT;
ALTER TABLE decision_log ADD COLUMN outcome_matched INTEGER;

CREATE TABLE IF NOT EXISTS decision_outcomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id INTEGER NOT NULL,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  observed_outcome TEXT NOT NULL,
  matched INTEGER NOT NULL,
  evidence TEXT NOT NULL,
  actor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS continuity_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  tables_json TEXT NOT NULL,
  rows_total INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  r2_prefix TEXT,
  artifact TEXT,
  time_travel_bookmark TEXT,
  integrity REAL NOT NULL,
  ok INTEGER NOT NULL,
  note TEXT
);

CREATE VIEW IF NOT EXISTS v_decision_calibration AS
SELECT d.id, d.ts, d.actor, d.action, d.predicted_outcome,
  COALESCE(d.outcome_matched, (SELECT o.matched FROM decision_outcomes o WHERE o.decision_id = d.id ORDER BY o.id DESC LIMIT 1)) AS matched
FROM decision_log d;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('autonomy_rate_7d', 'operational', 'target', 'decision_log rows in 7 days / (those + human_actions opened in 7 days that v_human_action_gate gates to the owner) (doctrine rev 4 section 15 headline)', 'qnfo-audit.decision_log, human_actions, v_human_action_gate', 'measured at first refresh', '>= 0.95 (maximize)', 'qnfo-fleet-control', 'trigger lt 0.95', '1h', '< 0.95', '< 0.8', NULL, NULL, 'MEASURED', 'computed'),
 ('prediction_logged_share_7d', 'operational', 'target', 'decision_log rows in 7 days with predicted_outcome / decision_log rows in 7 days (section 14, section 22)', 'qnfo-audit.decision_log', 'measured at first refresh', '>= 0.8, rising to 1', 'qnfo-fleet-control', 'trigger lt 0.8', '1h', '< 0.8', '< 0.3', NULL, NULL, 'MEASURED', 'computed'),
 ('prediction_miss_rate_7d', 'operational', 'target', '1 - matched share over v_decision_calibration rows in 7 days with a known outcome (section 15 prediction calibration; 0 rows reads 0)', 'qnfo-audit.v_decision_calibration', 'measured at first refresh', '<= 0.3, non-increasing', 'qnfo-fleet-control', 'trigger gt 0.3', '1h', '> 0.3', '> 0.6', NULL, NULL, 'MEASURED', 'computed'),
 ('depth_signals_30d', 'external', 'target', 'replies + reposts + quotes, latest snapshot per post, posts measured in 30 days (section 15 depth; social_engagements)', 'qnfo-audit.social_engagements', 'measured at first refresh', 'increasing; >= 1 per published paper a month', 'qnfo-social', 'trigger lt 1', '1h', '< 10', '< 1', NULL, NULL, 'MEASURED', 'computed'),
 ('continuity_snapshot_age_h', 'operational', 'target', 'hours since the newest ok continuity_snapshots row (section 14 resurrection)', 'qnfo-audit.continuity_snapshots (scripts/continuity_snapshot.py)', 'none before 2026-10-09', '<= 26', 'remediation-consumer', 'trigger gt 26', '1h', '> 26', '> 72', NULL, NULL, 'MEASURED', 'computed'),
 ('continuity_integrity', 'operational', 'target', 'integrity of the newest ok continuity_snapshots row: worst state table snapshot rows / live rows (section 15 continuity integrity)', 'qnfo-audit.continuity_snapshots', 'none before 2026-10-09', '>= 0.99', 'remediation-consumer', 'trigger lt 0.99', '1h', '< 0.99', '< 0.9', NULL, NULL, 'MEASURED', 'computed'),
 ('asset_freshness_90d', 'external', 'target', 'published living-paper papers updated in the last 90 days / published papers (section 15 freshness; written by scripts/continuity_snapshot.py)', 'living-paper.papers', 'measured at first run', '>= 0.9', 'qnfo-research-exec', 'trigger lt 0.9', '24h', '< 0.9', '< 0.5', NULL, NULL, 'MEASURED', 'runner');

CREATE TRIGGER IF NOT EXISTS doctrine_rev4_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * d / MAX(d + s, 1), 3) FROM (
        SELECT (SELECT COUNT(*) FROM decision_log WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS d,
               (SELECT COUNT(*) FROM v_human_action_gate g JOIN human_actions h ON h.id = g.id
                 WHERE g.gate = 'owner' AND h.created_at > datetime('now', '-7 days')) AS s)) AS TEXT)
  WHERE metric = 'autonomy_rate_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT ROUND(1.0 * SUM(CASE WHEN TRIM(COALESCE(predicted_outcome, '')) <> '' THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 3)
      FROM decision_log WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS TEXT)
  WHERE metric = 'prediction_logged_share_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(1.0 - 1.0 * SUM(matched) / COUNT(*), 3) END
      FROM v_decision_calibration WHERE matched IS NOT NULL AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS TEXT)
  WHERE metric = 'prediction_miss_rate_7d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(SUM(e.value), 0) FROM social_engagements e
      WHERE e.metric IN ('replies', 'reposts', 'quotes') AND e.collected_at > strftime('%Y-%m-%d', 'now', '-30 days')
        AND e.collected_at = (SELECT MAX(x.collected_at) FROM social_engagements x WHERE x.platform = e.platform AND x.post_id = e.post_id AND x.metric = e.metric)) AS TEXT)
  WHERE metric = 'depth_signals_30d';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE(ROUND((julianday('now') - julianday(replace(replace(MAX(ts), 'T', ' '), 'Z', ''))) * 24, 1), 9999)
      FROM continuity_snapshots WHERE ok = 1) AS TEXT)
  WHERE metric = 'continuity_snapshot_age_h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
      SELECT COALESCE((SELECT integrity FROM continuity_snapshots WHERE ok = 1 ORDER BY id DESC LIMIT 1), 0)) AS TEXT)
  WHERE metric = 'continuity_integrity';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.k, v.t, 'registry', v.op, v.th, 2, v.a, v.o, 'agent_issues', 24, 1, 'DOCTRINE-REV4-1 (migrations/2026-10-09-09-doctrine-rev4.sql)'
FROM (
  SELECT 'autonomy_rate_7d' AS k, 'Autonomy gap: owner stops outweigh autonomous decisions' AS t, 'lt' AS op, 0.95 AS th, 'Pillar autonomy (doctrine rev 4 section 15 headline). Read v_human_action_gate gate=owner cards of the last 7 days: each must be interrupt-eligible (irreversible AND identity-bound AND no reversible path). Red-team each one (blocker_redteam with a surfaces: line); reroute the rest to the fleet; log every autonomous decision in decision_log. Done: autonomy_rate_7d >= 0.95 at two refreshes.' AS a, 'qnfo-fleet-control' AS o
  UNION ALL SELECT 'prediction_logged_share_7d', 'Calibration gap: decisions logged without a predicted outcome', 'lt', 0.8, 'Pillar autonomy (section 14, section 22). Every writer of decision_log (sessions, migrations, wip_self_tune, loops) sets predicted_outcome before acting and records the observed result in decision_outcomes. Find the actors with the most rows lacking a prediction (GROUP BY actor) and add the field in their write. Done: prediction_logged_share_7d >= 0.8.', 'qnfo-fleet-control'
  UNION ALL SELECT 'prediction_miss_rate_7d', 'Calibration gap: predictions miss their outcomes', 'gt', 0.3, 'Pillar autonomy (section 22). Read v_decision_calibration rows with matched = 0: flag the belief behind each in belief_registry with a belief- probe and correct or falsify it in the same cycle. Done: prediction_miss_rate_7d <= 0.3.', 'qnfo-fleet-control'
  UNION ALL SELECT 'depth_signals_30d', 'Reach gap: no depth signals (replies, reposts, quotes) in 30 days', 'lt', 1, 'Pillar reach (section 20 signal hierarchy). Read social_engagements by post: shares and replies, not likes, are the target. Levers: a named series, a specific closing question per post, reposting best performers, replying to substantive replies within the hour where the platform permits automation (reading g). Done: depth_signals_30d >= 1 and rising.', 'qnfo-social'
  UNION ALL SELECT 'continuity_snapshot_age_h', 'Continuity gap: no verified snapshot of qnfo-audit in 26 hours', 'gt', 26, 'Pillar core (section 14 resurrection). scripts/continuity_snapshot.py runs in remediation-consumer.yml when the newest ok snapshot is older than 20 h. Read the step log of the latest consumer run and cloud_ops_events kind continuity-snapshot; fix the step (token, R2 write, Time Travel API). Done: continuity_snapshot_age_h <= 26.', 'remediation-consumer'
  UNION ALL SELECT 'continuity_integrity', 'Continuity gap: the latest snapshot misses rows of a state table', 'lt', 0.99, 'Pillar core (section 15 continuity integrity). continuity_snapshots.tables_json lists live and snapshot rows per table; a table under 0.99 was truncated (page limit, timeout). Raise the page budget or split the table in scripts/continuity_snapshot.py. Done: continuity_integrity >= 0.99.', 'remediation-consumer'
  UNION ALL SELECT 'asset_freshness_90d', 'Citability gap: published papers not refreshed in 90 days', 'lt', 0.9, 'Pillar reach (section 20 citability: freshness dominates). The reviser member of qnfo-research-exec (reviserMod) refreshes published papers; point it at the oldest updated_at first. Done: asset_freshness_90d >= 0.9.', 'qnfo-research-exec'
) v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.k);

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'REACH-SIGNALS-1: engagement velocity, discussion quality and reputation trend are not measured',
  'Charter pillar: reach (doctrine rev 4 section 15 and section 20). social_engagements stores daily cumulative counts (likes, replies, reposts, quotes) per Bluesky post, not reply records, so replies within 60 minutes of publish, substantive (3+ word) comments and sentiment cannot be computed; a number for them would not be measured. Build: the collector that writes social_engagements also stores each reply (platform, post_id, reply uri, author handle hash, created_at, text length, word count) in a social_replies table, from the public Bluesky getPostThread endpoint; then metrics reply_velocity_60m_share_30d (replies created within 60 min of the post / replies) and substantive_reply_share_30d (replies with 3+ words / replies), each with an analytics_metric_triggers row. No reply is posted by this change (reading g). Closes when both metrics exist with a value.',
  'session_01CWLpf5v1NjC9GXbM6rnH4k', 'reach', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'REACH-SIGNALS-1:%');

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM metric_registry WHERE metric IN (''reply_velocity_60m_share_30d'', ''substantive_reply_share_30d'') AND last_value IS NOT NULL) = 2 THEN ''1'' ELSE ''0'' END AS observed'
WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE title LIKE 'REACH-SIGNALS-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'revision 4 binds once each new clause has machinery or a filed builder', 'adopted doctrine revision 4 verbatim with readings (e)-(h); decision fields, calibration, autonomy-rate, depth, continuity and freshness metrics with triggers; REACH-SIGNALS-1 for the unmeasured reach signals', 'owner text 2026-10-09; 17 decisions logged in 7 days, none with a prediction; qnfo-audit had no fleet-made snapshot', 'every section 15 headline is measured or has a builder', 'metric_registry, analytics_metric_triggers, decision_log columns', 'the Rollback line', 'the fleet grades its own calibration, autonomy rate, depth and continuity', 'prediction_logged_share_7d breaches at first refresh (near 0) and files its issue; continuity_snapshot_age_h reads <= 26 after the first consumer run', 'depth and freshness become graded reach levers', 'doctrine file, CLAUDE.md, D1 metric loop, GitHub runner'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'adopted doctrine revision 4%');

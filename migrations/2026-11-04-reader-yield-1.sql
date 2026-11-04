-- READER-YIELD-1 (2026-11-04, charter pillar reach; programs QNFO.REACH and QNFO.RSCH). Owner directive 2026-11-04: managers think in strategy, features and quality; goals are
-- people actually reading the research, cost under USD 200-300 a month, a fast simple dashboard.
-- WHAT WAS MEASURED (qnfo-audit reach_signals, research_queue, ai_call_counters and the live Cloudflare RUM GraphQL, 2026-11-04 15:00-17:00Z):
--  * Output is far ahead of readers, and readers do not follow output. research_queue.published_at: 2 to 89 papers a day (71, 89, 56 on 10-19..10-21, then 1 to 16 a day). GA4
--    engaged sessions on the public sites (reach_signals source ga4, entity_type channel, 10-25..11-03): 12 to 41 a day, 122 in the last 7 days. Site-level external referred
--    page loads fell from 26..58 a day (10-06..10-15) to 1..9 (late October) through the 10x output surge. No per-paper or per-topic signal separates papers.
--  * The measure that is called human clicks is not readers. utm_clicks_human (qnfo-gateway utm_clicks, ua_class by a user-agent regex) was 1260 in the 10 days to 11-03; GA4
--    counted 180 sessions from organic social in the same days and 25 of them engaged: about 2 engaged sessions per 100 counted clicks. By source: bluesky 22 sessions and 1
--    engaged, substack 110 and 0, linkedin 20 and 5, mastodon 9 and 0; x 19 and 17, google 34 and 28, referral 44 and 40. 1525 of 1833 sessions are direct (7.5 percent engaged).
--  * Every paper carries the same floor. Over the 506 papers published since 10-01, utm_clicks_human per paper has p10 3, p50 6, p90 11 (100 percent non-zero), human RUM
--    page loads p10 4, p50 8 (99 percent non-zero), and neither rises with idea source (proposal 8.6, remediation 11.5 per paper), score band or paper age. A human readership is
--    heavy-tailed; a constant floor is automation (link previews, probes, renders). Only external-referrer loads are clean: 0.12 per paper, 7 percent of papers.
--  * The Bluesky queue is empty (1 queued item; 460 paper-posts in 34 days), so choosing which papers take outreach slots changes nothing; 87 percent of Bluesky paper-posts get no
--    human-classed click in 72 hours.
--  * Research cost does not follow readers: qnfo-research-exec spent 988k and 997k neurons on 11-02 and 11-03 against ops_config research_daily_neurons 360000, for 9 and 16 papers.
--    Seven days to 11-03: 4,585,257 neurons (research-exec, paper-reviser, errata-hub), 39 papers, 122 engaged sessions: 37,583 neurons per engaged session.
--  * Not a cap: pageviews_30d is not limited by the GraphQL row limit. The live bot-filtered 30 day total is 19,660 to 20,500 (31 days of rows sum to the same figure). The stored
--    value flaps between 19.6k, 0, 10000, 25000 and 26000 (metric_write_audit_log, five times in 12 hours); a code task below removes the cause.
-- WHAT THIS ADDS (no worker is edited): (1) reader_yield_daily, a daily ledger of GA4 engaged sessions, counted UTM clicks, external referrals, papers published and research neurons;
-- (2) paper_readership, one row per paper (30 day and 7 day windows, the week before, GA4 sessions, external-referrer loads) joined to research_queue (idea source, score, publish
-- time), with v_reader_yield_by_source and v_paper_readers_top; (3) three metrics and their output_quality_measures rows: engaged_reader_sessions_7d and
-- research_neurons_per_engaged_session_7d are outcomes of the papers surface, outreach_engaged_per_100_clicks_7d is a validity measure of the promotion surface (it says how much of
-- outreach_human_clicks_7d is reading); (4) v_research_volume_target and a daily fleet_task that moves ops_config research_daily_neurons toward engaged readers a day x
-- research_yield_neurons_per_engaged_day, inside [research_yield_floor, research_yield_ceiling], at most research_yield_step_pct a day, and only when nobody else has written the key
-- (research_yield_last_written); (5) four ROADMAP-1 rows for the next items, each with a code-task.
-- PREDICTION (decision_log, written below): the first governor step moves research_daily_neurons from 360000 to about 349000 (engaged 17.4 a day x 20000), a dead-band size change, not a
-- cut; engaged_reader_sessions_7d stays within 20 percent of its 122 baseline for 14 days whatever the research volume does; if the cap binds (the enforcement is another session's
-- work) papers a day fall and research_neurons_per_engaged_session_7d falls below 30000 within 14 days. Falsifier: engaged_reader_sessions_7d down more than 20 percent in 14 days
-- with outreach cadence unchanged: set research_yield_governor to off and restore the key from bak_20261104_research_neurons_cfg.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = 'off', updated_at = datetime('now') WHERE key = 'research_yield_governor'; UPDATE ops_config SET value = (SELECT value FROM bak_20261104_research_neurons_cfg), note = (SELECT note FROM bak_20261104_research_neurons_cfg), updated_at = datetime('now') WHERE key = 'research_daily_neurons' AND EXISTS (SELECT 1 FROM bak_20261104_research_neurons_cfg); UPDATE analytics_metric_triggers SET action = (SELECT action FROM bak_20261104_outreach_trigger_action WHERE metric_key = 'outreach_human_clicks_7d') WHERE metric_key = 'outreach_human_clicks_7d' AND EXISTS (SELECT 1 FROM bak_20261104_outreach_trigger_action); UPDATE fleet_crons SET enabled = 0 WHERE name = 'reader-yield-refresh-daily'; UPDATE fleet_tasks SET enabled = 0 WHERE id = 'reader-yield-refresh'; UPDATE output_quality_measures SET role = 'proxy' WHERE metric IN ('engaged_reader_sessions_7d', 'research_neurons_per_engaged_session_7d', 'outreach_engaged_per_100_clicks_7d');
-- Rollback note: the tables, views, metric rows, decision_log and issue rows stay as evidence; the rollback stops every writer (governor, refresh, trigger text) and takes the three measures out of the verdict.
-- spof-review: the refresh has one producer (fleet_tasks reader-yield-refresh on the fleet cron); a missed run leaves the 7 day windows one day old and the governor holds its value.
-- runtime-probe (D1): SELECT metric, last_value, last_refreshed FROM metric_registry WHERE metric = 'engaged_reader_sessions_7d' -- expected a number and a refresh within 30 h
-- CAUSE-MAPPED: INSERT INTO metric_breach_cause below maps the three metrics (publishing, measurement, spend) in this same file.

-- ---- backups of the two live rows this change edits -------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bak_20261104_research_neurons_cfg AS
SELECT key, value, note, updated_at FROM ops_config WHERE key = 'research_daily_neurons';

CREATE TABLE IF NOT EXISTS bak_20261104_outreach_trigger_action AS
SELECT metric_key, action FROM analytics_metric_triggers WHERE metric_key = 'outreach_human_clicks_7d';

-- ---- the ledgers ------------------------------------------------------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reader_yield_daily (
  day TEXT PRIMARY KEY,
  ga4_sessions REAL,
  ga4_engaged REAL,
  ga4_sessions_social REAL,
  ga4_engaged_social REAL,
  utm_clicks_human REAL,
  ext_referred_pv REAL,
  papers_published INTEGER,
  research_neurons REAL,
  refreshed_at TEXT
);

CREATE TABLE IF NOT EXISTS paper_readership (
  key64 TEXT PRIMARY KEY,
  slug TEXT,
  pv_30d REAL,
  ext_30d REAL,
  cont_30d REAL,
  utm_30d REAL,
  ga4_sessions_30d REAL,
  pv_7d REAL,
  pv_prev_7d REAL,
  utm_7d REAL,
  utm_prev_7d REAL,
  published_at TEXT,
  idea_source TEXT,
  idea_score REAL,
  refreshed_at TEXT
);

-- One row a day for the last 14 complete UTC days. A column is NULL where its source has no row for that day (GA4 starts 2026-10-25), never a zero.
CREATE VIEW IF NOT EXISTS v_reader_yield_source AS
WITH RECURSIVE d(day, n) AS (
  SELECT date('now', '-1 day'), 1
  UNION ALL
  SELECT date(day, '-1 day'), n + 1 FROM d WHERE n < 14
)
SELECT d.day AS day,
  (SELECT SUM(value) FROM reach_signals WHERE source = 'ga4' AND entity_type = 'channel' AND metric = 'sessions' AND date = d.day) AS ga4_sessions,
  (SELECT SUM(value) FROM reach_signals WHERE source = 'ga4' AND entity_type = 'channel' AND metric = 'engagedSessions' AND date = d.day) AS ga4_engaged,
  (SELECT SUM(value) FROM reach_signals WHERE source = 'ga4' AND entity_type = 'channel' AND metric = 'sessions' AND entity_id = 'organic social' AND date = d.day) AS ga4_sessions_social,
  (SELECT SUM(value) FROM reach_signals WHERE source = 'ga4' AND entity_type = 'channel' AND metric = 'engagedSessions' AND entity_id = 'organic social' AND date = d.day) AS ga4_engaged_social,
  (SELECT SUM(value) FROM reach_signals WHERE source = 'utm' AND entity_type = 'campaign' AND metric = 'clicks_human' AND date = d.day) AS utm_clicks_human,
  (SELECT SUM(value) FROM reach_signals WHERE source = 'cf-rum-human' AND entity_type IN ('page', 'paper') AND metric = 'external_pageviews' AND date = d.day) AS ext_referred_pv,
  (SELECT COUNT(*) FROM research_queue WHERE published_at >= d.day AND published_at < date(d.day, '+1 day')) AS papers_published,
  (SELECT SUM(neurons) FROM ai_call_counters WHERE day = d.day AND worker IN ('qnfo-research-exec', 'qnfo-paper-reviser', 'errata-hub')) AS research_neurons,
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS refreshed_at
FROM d;

-- One row per paper key (the 64 character lower-case campaign key the UTM ledger uses). Reads three indexed slices of reach_signals (about 6k rows) and the last 90 days of research_queue.
-- ext_30d is the only per-paper count that is not a floor: page loads with a referrer outside the fleet. cont_30d, pv_30d and utm_30d are kept because their floor is the finding.
CREATE VIEW IF NOT EXISTS v_paper_readership_source AS
WITH s AS (
  SELECT lower(substr(entity_id, 1, 64)) AS k, entity_id AS slug, date, metric, value, 'rum' AS src
  FROM reach_signals
  WHERE source = 'cf-rum-human' AND entity_type = 'paper' AND metric IN ('pageviews', 'external_pageviews', 'continuation_pageviews') AND date >= date('now', '-30 days')
  UNION ALL
  SELECT lower(substr(entity_id, 1, 64)), entity_id, date, metric, value, 'utm'
  FROM reach_signals
  WHERE source = 'utm' AND entity_type = 'campaign' AND metric = 'clicks_human' AND date >= date('now', '-30 days')
  UNION ALL
  SELECT lower(substr(substr(entity_id, 9), 1, 64)), substr(entity_id, 9), date, 'ga4_sessions', value, 'ga4'
  FROM reach_signals
  WHERE source = 'ga4' AND entity_type = 'page' AND metric = 'sessions' AND entity_id LIKE '/papers/%' AND entity_id NOT LIKE '/papers/%/%' AND date >= date('now', '-30 days')
), a AS (
  SELECT k,
    MAX(CASE WHEN src = 'rum' THEN slug END) AS slug_rum,
    MAX(slug) AS slug_any,
    SUM(CASE WHEN src = 'rum' AND metric = 'pageviews' THEN value ELSE 0 END) AS pv_30d,
    SUM(CASE WHEN metric = 'external_pageviews' THEN value ELSE 0 END) AS ext_30d,
    SUM(CASE WHEN metric = 'continuation_pageviews' THEN value ELSE 0 END) AS cont_30d,
    SUM(CASE WHEN src = 'utm' THEN value ELSE 0 END) AS utm_30d,
    SUM(CASE WHEN src = 'ga4' THEN value ELSE 0 END) AS ga4_sessions_30d,
    SUM(CASE WHEN src = 'rum' AND metric = 'pageviews' AND date >= date('now', '-7 days') THEN value ELSE 0 END) AS pv_7d,
    SUM(CASE WHEN src = 'rum' AND metric = 'pageviews' AND date >= date('now', '-14 days') AND date < date('now', '-7 days') THEN value ELSE 0 END) AS pv_prev_7d,
    SUM(CASE WHEN src = 'utm' AND date >= date('now', '-7 days') THEN value ELSE 0 END) AS utm_7d,
    SUM(CASE WHEN src = 'utm' AND date >= date('now', '-14 days') AND date < date('now', '-7 days') THEN value ELSE 0 END) AS utm_prev_7d
  FROM s GROUP BY k
), q AS (
  SELECT lower(substr(paper_slug, 1, 64)) AS k, MAX(published_at) AS published_at, MAX(source) AS idea_source, MAX(score) AS idea_score
  FROM research_queue WHERE paper_slug IS NOT NULL AND published_at >= date('now', '-90 days') GROUP BY 1
)
SELECT a.k AS key64, COALESCE(a.slug_rum, a.slug_any) AS slug, a.pv_30d, a.ext_30d, a.cont_30d, a.utm_30d, a.ga4_sessions_30d, a.pv_7d, a.pv_prev_7d, a.utm_7d, a.utm_prev_7d,
  q.published_at, q.idea_source, q.idea_score, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS refreshed_at
FROM a LEFT JOIN q ON q.k = a.k;

-- Yield by where the idea came from, for papers published in the last 45 days. share_with_ext_visit is the share of papers an outsider reached from another site.
CREATE VIEW IF NOT EXISTS v_reader_yield_by_source AS
SELECT COALESCE(idea_source, '(unknown)') AS idea_source, COUNT(*) AS papers,
  ROUND(AVG(ext_30d), 3) AS ext_visits_per_paper,
  ROUND(1.0 * SUM(CASE WHEN ext_30d > 0 THEN 1 ELSE 0 END) / COUNT(*), 3) AS share_with_ext_visit,
  ROUND(AVG(ga4_sessions_30d), 3) AS ga4_sessions_per_paper,
  ROUND(AVG(utm_30d), 2) AS utm_clicks_per_paper_unverified
FROM paper_readership
WHERE published_at >= date('now', '-45 days')
GROUP BY 1;

-- Papers someone outside the fleet reached, or that GA4 saw a few times. suspect_automated marks 50 or more sessions with no external referrer (one page had 110 in a day on 11-03).
CREATE VIEW IF NOT EXISTS v_paper_readers_top AS
SELECT slug, ext_30d, ga4_sessions_30d, cont_30d, pv_30d, utm_30d, published_at, idea_source,
  ROUND(ext_30d * 5.0 + MIN(ga4_sessions_30d, 20), 1) AS reader_score,
  CASE WHEN ga4_sessions_30d >= 50 AND ext_30d = 0 THEN 1 ELSE 0 END AS suspect_automated
FROM paper_readership
WHERE ext_30d > 0 OR ga4_sessions_30d >= 3
ORDER BY reader_score DESC;

-- The three metrics, from the last 7 days that have GA4 rows. NULL (never a zero) until 7 such days exist.
CREATE VIEW IF NOT EXISTS v_reader_yield_metrics AS
WITH w AS (SELECT * FROM reader_yield_daily WHERE ga4_engaged IS NOT NULL ORDER BY day DESC LIMIT 7)
SELECT 'engaged_reader_sessions_7d' AS metric,
  CASE WHEN COUNT(*) >= 7 THEN SUM(ga4_engaged) END AS value
FROM w
UNION ALL
SELECT 'outreach_engaged_per_100_clicks_7d',
  CASE WHEN COUNT(*) >= 7 AND SUM(utm_clicks_human) > 0 THEN ROUND(100.0 * SUM(ga4_engaged_social) / SUM(utm_clicks_human), 2) END
FROM w
UNION ALL
SELECT 'research_neurons_per_engaged_session_7d',
  CASE WHEN COUNT(*) >= 7 AND SUM(ga4_engaged) > 0 AND SUM(research_neurons) IS NOT NULL THEN ROUND(SUM(research_neurons) / SUM(ga4_engaged)) END
FROM w;

-- ---- the research volume governor -------------------------------------------------------------------------------------------------------------------------------------------
INSERT OR IGNORE INTO ops_config (key, value, note, updated_at) VALUES
  ('research_yield_governor', 'on', 'READER-YIELD-1 2026-11-04: on = the daily fleet_task reader-yield-refresh moves research_daily_neurons toward engaged readers a day x research_yield_neurons_per_engaged_day, inside the floor and ceiling, at most research_yield_step_pct a day. off = it never writes the key. Revert: set off and restore research_daily_neurons from bak_20261104_research_neurons_cfg.', datetime('now')),
  ('research_yield_neurons_per_engaged_day', '20000', 'READER-YIELD-1 2026-11-04: calibration, not a law. 17.4 engaged GA4 sessions a day (7 days to 11-03) x 20000 = 348k, so the first step is a dead-band move from 360000; USD 0.22 of Workers AI per engaged-session-day.', datetime('now')),
  ('research_yield_floor', '180000', 'READER-YIELD-1 2026-11-04: half of the 2026-10-21 budget; research never stops, it runs at 50 percent when readers fall.', datetime('now')),
  ('research_yield_ceiling', '450000', 'READER-YIELD-1 2026-11-04: the most the governor sets, about USD 5 a day; a higher key is the owner or ops session writing it, and pauses the governor.', datetime('now')),
  ('research_yield_step_pct', '10', 'READER-YIELD-1 2026-11-04: largest move per day, percent of the current value.', datetime('now')),
  ('research_yield_min_days', '7', 'READER-YIELD-1 2026-11-04: days of GA4 engaged-session rows needed before the governor moves; fewer is neutral.', datetime('now'));

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at)
SELECT 'research_yield_last_written', value, 'READER-YIELD-1 2026-11-04: the value the governor last wrote to research_daily_neurons (seeded with the value found at install). If the key differs, another writer changed it and the governor pauses until this key is set to an empty string or to the current value.', datetime('now')
FROM ops_config WHERE key = 'research_daily_neurons';

CREATE VIEW IF NOT EXISTS v_research_volume_target AS
WITH cfg AS (
  SELECT
    COALESCE((SELECT value FROM ops_config WHERE key = 'research_yield_governor'), 'off') AS gov,
    CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'research_yield_neurons_per_engaged_day'), '20000') AS REAL) AS per_eng,
    CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'research_yield_floor'), '180000') AS REAL) AS fl,
    CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'research_yield_ceiling'), '450000') AS REAL) AS ceil,
    CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'research_yield_step_pct'), '10') AS REAL) / 100.0 AS step,
    CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'research_yield_min_days'), '7') AS INTEGER) AS min_days,
    CAST(NULLIF(COALESCE((SELECT value FROM ops_config WHERE key = 'research_daily_neurons'), ''), '') AS REAL) AS cur,
    COALESCE((SELECT value FROM ops_config WHERE key = 'research_yield_last_written'), '') AS lw
), w AS (
  SELECT COUNT(*) AS days, SUM(ga4_engaged) AS eng
  FROM (SELECT ga4_engaged FROM reader_yield_daily WHERE ga4_engaged IS NOT NULL ORDER BY day DESC LIMIT 7)
), t AS (
  SELECT cfg.*, w.days AS days, w.eng / NULLIF(w.days, 0) AS per_day,
    MIN(cfg.ceil, MAX(cfg.fl, w.eng / NULLIF(w.days, 0) * cfg.per_eng)) AS clamped
  FROM cfg, w
), r AS (
  SELECT gov, days, per_day, cur, clamped, per_eng, fl, ceil, step,
    CASE
      WHEN gov <> 'on' THEN 'governor off'
      WHEN cur IS NULL THEN 'research_daily_neurons unreadable'
      WHEN days < min_days THEN 'needs ' || min_days || ' days of GA4 engaged sessions, has ' || days
      WHEN lw <> '' AND CAST(lw AS REAL) <> cur THEN 'paused: research_daily_neurons was changed by another writer'
      WHEN cur < fl OR cur > ceil THEN 'paused: current value is outside the governor band'
      WHEN clamped IS NULL THEN 'no engaged-session rows'
      WHEN ABS(clamped - cur) < 0.02 * cur THEN 'inside the 2 percent dead band'
      ELSE 'moving'
    END AS reason
  FROM t
)
SELECT gov, days, ROUND(per_day, 2) AS engaged_per_day, cur, ROUND(clamped) AS target, per_eng, fl AS floor_neurons, ceil AS ceiling_neurons,
  ROUND(CASE WHEN cur IS NULL OR clamped IS NULL THEN NULL ELSE cur + MAX(-step * cur, MIN(step * cur, clamped - cur)) END) AS step_target,
  reason, CASE WHEN reason = 'moving' THEN 1 ELSE 0 END AS eligible
FROM r;

-- ---- the daily refresh (fleet_tasks workflow on the fleet cron; one statement a step) --------------------------------------------------------------------------------------
INSERT OR REPLACE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at) VALUES (
  'reader-yield-refresh',
  'READER-YIELD-1: engaged-reader ledger, per-paper readership, metrics and the research volume governor',
  'workflow',
  '{"steps":[
    {"type":"sql","db":"AUDIT","name":"daily-ledger","sql":"INSERT OR REPLACE INTO reader_yield_daily (day, ga4_sessions, ga4_engaged, ga4_sessions_social, ga4_engaged_social, utm_clicks_human, ext_referred_pv, papers_published, research_neurons, refreshed_at) SELECT day, ga4_sessions, ga4_engaged, ga4_sessions_social, ga4_engaged_social, utm_clicks_human, ext_referred_pv, papers_published, research_neurons, refreshed_at FROM v_reader_yield_source"},
    {"type":"sql","db":"AUDIT","name":"paper-readership","sql":"INSERT OR REPLACE INTO paper_readership (key64, slug, pv_30d, ext_30d, cont_30d, utm_30d, ga4_sessions_30d, pv_7d, pv_prev_7d, utm_7d, utm_prev_7d, published_at, idea_source, idea_score, refreshed_at) SELECT key64, slug, pv_30d, ext_30d, cont_30d, utm_30d, ga4_sessions_30d, pv_7d, pv_prev_7d, utm_7d, utm_prev_7d, published_at, idea_source, idea_score, refreshed_at FROM v_paper_readership_source"},
    {"type":"sql","db":"AUDIT","name":"metrics","sql":"UPDATE metric_registry SET last_value = (SELECT CASE WHEN m.value = CAST(m.value AS INTEGER) THEN CAST(CAST(m.value AS INTEGER) AS TEXT) ELSE CAST(m.value AS TEXT) END FROM v_reader_yield_metrics m WHERE m.metric = metric_registry.metric), last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric IN (SELECT metric FROM v_reader_yield_metrics WHERE value IS NOT NULL)"},
    {"type":"sql","db":"AUDIT","name":"governor","sql":"UPDATE ops_config SET value = CAST(CAST((SELECT step_target FROM v_research_volume_target) AS INTEGER) AS TEXT), note = ''READER-YIELD-1 governor '' || strftime(''%Y-%m-%dT%H:%MZ'', ''now'') || '': engaged readers a day '' || COALESCE((SELECT CAST(engaged_per_day AS TEXT) FROM v_research_volume_target), ''?'') || '' x research_yield_neurons_per_engaged_day, inside the floor and ceiling, at most research_yield_step_pct a day. Earlier text: bak_20261104_research_neurons_cfg. Revert: research_yield_governor = off.'', updated_at = datetime(''now'') WHERE key = ''research_daily_neurons'' AND (SELECT eligible FROM v_research_volume_target) = 1"},
    {"type":"sql","db":"AUDIT","name":"remember-write","sql":"UPDATE ops_config SET value = (SELECT value FROM ops_config WHERE key = ''research_daily_neurons''), updated_at = datetime(''now'') WHERE key = ''research_yield_last_written'' AND (SELECT note FROM ops_config WHERE key = ''research_daily_neurons'') LIKE ''READER-YIELD-1 governor %'' AND (SELECT updated_at FROM ops_config WHERE key = ''research_daily_neurons'') >= datetime(''now'', ''-2 minutes'')"},
    {"type":"sql","db":"AUDIT","name":"decision","sql":"INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) SELECT ''fleet_task reader-yield-refresh'', ''research volume should follow the audience that reads, with a floor'', ''research_daily_neurons set to '' || c.value, ''GA4 engaged sessions 7d '' || COALESCE((SELECT value FROM metric_registry WHERE metric = ''engaged_reader_sessions_7d''), ''?'') || ''; target row: '' || COALESCE((SELECT engaged_per_day || '' a day, step_target '' || step_target FROM v_research_volume_target), ''?''), ''applied by the governor'', ''qnfo-research-exec daily neuron budget only'', ''set ops_config research_yield_governor to off and restore research_daily_neurons from bak_20261104_research_neurons_cfg'', ''the research budget follows engaged readers, inside the floor and ceiling'', ''the key keeps moving at most 10 percent a day; engaged_reader_sessions_7d stays inside 20 percent of its baseline'', ''none: cost and measurement'', ''v_research_volume_target'' FROM ops_config c WHERE c.key = ''research_daily_neurons'' AND c.note LIKE ''READER-YIELD-1 governor %'' AND c.updated_at >= datetime(''now'', ''-2 minutes'') AND NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.actor = ''fleet_task reader-yield-refresh'' AND replace(substr(d.ts, 1, 19), ''T'', '' '') >= c.updated_at)"},
    {"type":"sql","db":"AUDIT","name":"ledger","sql":"INSERT OR IGNORE INTO cloud_ops_events (id, ts, kind, text, meta, job, status) SELECT ''reader-yield-'' || strftime(''%Y%m%d'', ''now''), datetime(''now''), ''reader-yield'', ''READER-YIELD-1: engaged readers a day '' || COALESCE(CAST(engaged_per_day AS TEXT), ''?'') || '' over '' || days || '' days; research_daily_neurons '' || COALESCE(CAST(CAST(cur AS INTEGER) AS TEXT), ''?'') || '', governor target '' || COALESCE(CAST(CAST(target AS INTEGER) AS TEXT), ''?'') || '': '' || reason, NULL, ''reader-yield-refresh'', ''ok'' FROM v_research_volume_target"}
  ]}',
  60000, 1, 1, 1, datetime('now')
);

INSERT OR REPLACE INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, last_fired, next_fire, updated_at)
VALUES ('reader-yield-refresh-daily', '40 5 * * *', 'reader-yield-refresh', 1, 'UTC', NULL, NULL, datetime('now'));

-- ---- first fill (the same statements the task runs), so the baseline exists the moment this merges -----------------------------------------------------------------------------
INSERT OR REPLACE INTO reader_yield_daily (day, ga4_sessions, ga4_engaged, ga4_sessions_social, ga4_engaged_social, utm_clicks_human, ext_referred_pv, papers_published, research_neurons, refreshed_at)
SELECT day, ga4_sessions, ga4_engaged, ga4_sessions_social, ga4_engaged_social, utm_clicks_human, ext_referred_pv, papers_published, research_neurons, refreshed_at FROM v_reader_yield_source;

INSERT OR REPLACE INTO paper_readership (key64, slug, pv_30d, ext_30d, cont_30d, utm_30d, ga4_sessions_30d, pv_7d, pv_prev_7d, utm_7d, utm_prev_7d, published_at, idea_source, idea_score, refreshed_at)
SELECT key64, slug, pv_30d, ext_30d, cont_30d, utm_30d, ga4_sessions_30d, pv_7d, pv_prev_7d, utm_7d, utm_prev_7d, published_at, idea_source, idea_score, refreshed_at FROM v_paper_readership_source;

-- ---- the three metrics, their classification, cause mapping and history backfill ------------------------------------------------------------------------------------------------
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
  ('engaged_reader_sessions_7d', 'fleet', 'leading',
   'sum of GA4 engagedSessions (a session of 10 seconds or more, two page views or a conversion) over the last 7 days that have GA4 rows, all channels of the public sites; fleet_tasks reader-yield-refresh (READER-YIELD-1) from reach_signals source ga4',
   'qnfo-audit.reader_yield_daily <- reach_signals source ga4 entity_type channel metric engagedSessions (qnfo-fleet-dashboard reach ingest)',
   '122 (2026-10-28..11-03, 17.4 a day; GA4 rows start 2026-10-25)',
   'rising; no absolute gate. The research budget follows it (v_research_volume_target)',
   'qnfo-fleet-control', 'IMPROVEMENT-LOOP-1 files METRIC-REGRESSION-1 on a decline (exempt from a threshold trigger: a threshold would file an issue for a number that outreach and search move, not research; READER-YIELD-1)',
   'daily', '< 70', NULL, 'UNMEASURED', 'computed'),
  ('outreach_engaged_per_100_clicks_7d', 'fleet', 'leading',
   '100 x GA4 engaged sessions from the organic social channel / utm_clicks_human over the last 7 days that have GA4 rows (READER-YIELD-1); a validity measure of outreach_human_clicks_7d',
   'qnfo-audit.reader_yield_daily <- reach_signals sources ga4 and utm',
   '2.0 (2026-10-25..11-03: 25 engaged social sessions per 1260 counted clicks)',
   'rising: counted clicks that are readers; fix by classing automated fetchers as bots in the gateway (ROADMAP-1 row filed with this migration)',
   'qnfo-social', 'exempt from a threshold trigger: validity information with no lever of its own until the gateway classifier changes (READER-YIELD-1 ROADMAP-1 row)',
   'daily', '< 1', NULL, 'UNMEASURED', 'computed'),
  ('research_neurons_per_engaged_session_7d', 'fleet', 'leading',
   'Workers AI neurons of qnfo-research-exec, qnfo-paper-reviser and errata-hub in the last 7 days that have GA4 rows / GA4 engaged sessions in the same days (READER-YIELD-1); cost of one engaged reader',
   'qnfo-audit.reader_yield_daily <- ai_call_counters and reach_signals source ga4',
   '37583 (2026-10-28..11-03: 4,585,257 neurons, 122 engaged sessions)',
   'falling; the research governor and ops_config research_daily_neurons are the levers',
   'qnfo-fleet-control', 'exempt from a threshold trigger: fleet_cost_bound_month_usd and the ai_spend caps judge cost; this reads cost per reader (READER-YIELD-1)',
   'daily', '> 60000', NULL, 'UNMEASURED', 'computed');

UPDATE metric_registry
SET last_value = (SELECT CASE WHEN m.value = CAST(m.value AS INTEGER) THEN CAST(CAST(m.value AS INTEGER) AS TEXT) ELSE CAST(m.value AS TEXT) END FROM v_reader_yield_metrics m WHERE m.metric = metric_registry.metric),
    last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    state = 'MEASURED'
WHERE metric IN (SELECT metric FROM v_reader_yield_metrics WHERE value IS NOT NULL);

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
  ('engaged_reader_sessions_7d', 'publishing', 'READER-YIELD-1 2026-11-04: engaged readers move with distribution (search, referrals, X), not with the number of papers; the lever is where outreach goes and what search can find.'),
  ('outreach_engaged_per_100_clicks_7d', 'measurement', 'READER-YIELD-1 2026-11-04: a low value says the counted clicks are fetchers, not readers; the repair is the gateway classifier, not more posts.'),
  ('research_neurons_per_engaged_session_7d', 'spend', 'READER-YIELD-1 2026-11-04: neurons spent per engaged reader; the lever is the research budget (research_daily_neurons, the governor), not a model change.');

INSERT OR IGNORE INTO metric_history (metric, day, value, meets, target, ts)
SELECT 'engaged_reader_sessions_7d', r.day,
  (SELECT SUM(x.ga4_engaged) FROM reader_yield_daily x WHERE x.day <= r.day AND x.day > date(r.day, '-7 days')),
  NULL, 'rising', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM reader_yield_daily r
WHERE r.ga4_engaged IS NOT NULL
  AND (SELECT COUNT(*) FROM reader_yield_daily x WHERE x.day <= r.day AND x.day > date(r.day, '-7 days') AND x.ga4_engaged IS NOT NULL) = 7;

INSERT OR IGNORE INTO metric_history (metric, day, value, meets, target, ts)
SELECT 'outreach_engaged_per_100_clicks_7d', r.day,
  (SELECT ROUND(100.0 * SUM(x.ga4_engaged_social) / NULLIF(SUM(x.utm_clicks_human), 0), 2) FROM reader_yield_daily x WHERE x.day <= r.day AND x.day > date(r.day, '-7 days')),
  NULL, 'rising', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM reader_yield_daily r
WHERE r.ga4_engaged IS NOT NULL
  AND (SELECT COUNT(*) FROM reader_yield_daily x WHERE x.day <= r.day AND x.day > date(r.day, '-7 days') AND x.ga4_engaged IS NOT NULL) = 7;

INSERT OR IGNORE INTO metric_history (metric, day, value, meets, target, ts)
SELECT 'research_neurons_per_engaged_session_7d', r.day,
  (SELECT ROUND(SUM(x.research_neurons) / NULLIF(SUM(x.ga4_engaged), 0)) FROM reader_yield_daily x WHERE x.day <= r.day AND x.day > date(r.day, '-7 days')),
  NULL, 'falling', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
FROM reader_yield_daily r
WHERE r.ga4_engaged IS NOT NULL
  AND (SELECT COUNT(*) FROM reader_yield_daily x WHERE x.day <= r.day AND x.day > date(r.day, '-7 days') AND x.ga4_engaged IS NOT NULL) = 7;

INSERT OR IGNORE INTO output_quality_measures (metric, surface, role, polarity, tol_rel, tol_abs, judged_by, caveat) VALUES
  ('engaged_reader_sessions_7d', 'papers', 'outcome', 1, 0.2, 10,
   'people: GA4 engaged sessions on the public sites (10 seconds or more, two page views or a conversion), the one reader count the generators cannot satisfy',
   'GA4 runs in the browser, so ad blockers undercount it; the direct channel (83 percent of sessions) holds headless renders that never engage, so the total is a floor on readers, not a count of people. GA4 rows start 2026-10-25: no verdict before 2026-11-07.'),
  ('research_neurons_per_engaged_session_7d', 'papers', 'outcome', -1, 0.2, 2000,
   'cost of one engaged reader: Workers AI neurons of the research workers over GA4 engaged sessions, same 7 days',
   'cutting spend alone improves it: read it with engaged_reader_sessions_7d, which must not fall. The neuron count includes revisions and errata work, whose readers it cannot tell apart.'),
  ('outreach_engaged_per_100_clicks_7d', 'promotion', 'validity', 1, 0.2, 0.5,
   'share of counted UTM human clicks that became GA4 engaged sessions from organic social, per 100',
   'about 2 per 100 on 2026-11-03: outreach_human_clicks_7d and outreach_clicks_per_post_7d count fetchers and previews as people; read them only with this measure. GA4 undercounts readers who block scripts.');

-- ---- the outreach trigger text says where the volume goes: read the reader-grade measure first --------------------------------------------------------------------------------------
UPDATE analytics_metric_triggers
SET action = 'READER-YIELD-1 (2026-11-04): clicks are not readers. Before lever (2) below shifts volume to the channel with the most clicks per post, read SELECT metric, last_value FROM metric_registry WHERE metric IN (''outreach_engaged_per_100_clicks_7d'', ''engaged_reader_sessions_7d''): on 2026-11-03 about 2 of every 100 counted clicks became an engaged session, and GA4 shows bluesky 1 engaged of 22 sessions, substack 0 of 110, x 17 of 19, google 28 of 34. Move volume only toward a channel whose engaged sessions per post rise (GA4 source rows in reach_signals), not whose clicks do. ' || char(10) || char(10) || action
WHERE metric_key = 'outreach_human_clicks_7d' AND action NOT LIKE 'READER-YIELD-1 (2026-11-04)%';

-- ---- the predictions, on record (decision_log is append-only; predicted_outcome is parsed by decision_predictions_parse as "<metric> <op> <value> within <N> d") -----------------------------
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session:reader-yield (claude, QNFO.REACH / QNFO.RSCH)',
  'Research output is not what moves readers: engaged readers come from search, X and referrals and were flat through a 10x swing in papers a day, while each paper carries the same floor of automated visits. Tying the research budget to engaged readers with a floor is safer than a flat cut and than a flat cap that spend ignores.',
  'READER-YIELD-1 migration 2026-11-04-reader-yield-1.sql: reader ledger and per-paper readership tables, three measures (two outcomes, one validity), research volume governor on ops_config research_daily_neurons (floor 180000, ceiling 450000, 10 percent a day, pauses on a foreign write), outreach trigger text amended, four ROADMAP-1 rows. Prediction: the first governor step is 360000 to about 349000 (engaged 17.4 a day x 20000), then at most 10 percent a day; engaged readers stay inside 20 percent of the 122 baseline whatever research volume does (readers do not follow research volume). Falsifier: engaged_reader_sessions_7d down more than 20 percent in 14 days with outreach cadence unchanged.',
  'GA4 engaged sessions 12..41 a day, 122 in 7 days to 11-03 (reach_signals); utm_clicks_human 1260 vs 25 engaged organic-social sessions in the same 10 days; per paper utm p10 3 / p50 6 / p90 11, external-referrer loads 0.12 per paper (7 percent of papers); publications 2..89 a day; research neurons 988k and 997k on 11-02 and 11-03 against a key of 360000; pageviews_30d live 19,660..20,500, stored 0/10000/25000/26000 five times in 12 hours.',
  'applied by migration; the governor takes its first step at the next 05:40Z run',
  'qnfo-research-exec daily neuron budget (ops_config research_daily_neurons) and three new metric rows; no worker code changes',
  'ops_config research_yield_governor = off, then restore research_daily_neurons from bak_20261104_research_neurons_cfg; the migration header Rollback line lists the rest',
  'a reader-grade ledger the fleet can learn from: engaged readers per day and per paper, cost per engaged reader, the share of counted clicks that are readers',
  'engaged_reader_sessions_7d >= 98 within 14 d',
  'no direct reach gain expected from this change; it makes reader growth measurable and stops spend that readers do not reward. Reach levers filed: gateway fetcher classification, verified-reader amplification in qnfo-social.',
  'live qnfo-audit D1 reads and the Cloudflare RUM GraphQL read on 2026-11-04; node:sqlite apply-and-run test migrations/reader-yield-1.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'READER-YIELD-1 migration%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session:reader-yield (claude, QNFO.REACH / QNFO.RSCH)',
  'If research_daily_neurons is enforced (the spend-cap work of another session), the governor holds it at about 349k and research neurons per engaged reader fall from 37.6k to about 20k; if it is not enforced the metric stays near 37k and the cap is the next thing to fix.',
  'READER-YIELD-1 cost prediction for the cap that spend does not yet respect (7 days to 11-03: 4,585,257 neurons, 39 papers, 122 engaged sessions)',
  'ai_call_counters: research-exec 988,203 and 996,539 neurons on 11-02 and 11-03 against the key 360000; paper-reviser about 85k and errata-hub 18k..39k a day.',
  'recorded; scored by decision_predictions at the due date',
  'cost only',
  'none needed: a prediction row',
  'cost per engaged reader on record',
  'research_neurons_per_engaged_session_7d <= 30000 within 14 d',
  'none',
  'ai_call_counters and reader_yield_daily'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'READER-YIELD-1 cost prediction%');

-- ---- ROADMAP-1: the next items, each with a doer ------------------------------------------------------------------------------------------------------------------------------------
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: QNFO.REACH READER-YIELD-1.1: classify automated fetchers as bots in the UTM ledger so outreach clicks mean readers',
 'code-task: repo=qnfo-workers path=qnfo-gateway/worker.js' || char(10) ||
 'code-anchor: var UTM_BOT_RE = /bot|crawler|spider|preview|facebookexternalhit|slackbot|twitterbot|linkedinbot|mastodon|bluesky|cardyb|headless/i;' || char(10) ||
 'code-probe: {"paths": ["qnfo-gateway/worker.js"], "contains": "UTM-READER-CLASS-1"}' || char(10) || char(10) ||
 'Charter pillar reach (program QNFO.REACH). Metric it should move: outreach_engaged_per_100_clicks_7d (2.0 on 2026-11-03; target 8 or more) while engaged_reader_sessions_7d does not fall; outreach_human_clicks_7d is expected to FALL, which is the correction, not a regression.' || char(10) ||
 'Evidence (READER-YIELD-1, migrations/2026-11-04-reader-yield-1.sql): utm_clicks_human 1260 in 10 days vs 25 engaged organic-social GA4 sessions; every paper carries a floor of utm_clicks_human p10 3 / p50 6 / p90 11, flat across idea source, score and age; GA4 bluesky 22 sessions 1 engaged, substack 110 sessions 0 engaged. ua_class is bot only when the user agent matches UTM_BOT_RE, so link-preview fetchers, probes and HTTP libraries read as human.' || char(10) ||
 'EDIT: mark the load as bot when the user agent is not a browser (does not start with Mozilla/5.0 and name Chrome, Safari, Firefox or Edge) or names a fetcher (python-requests, curl, wget, node-fetch, undici, axios, Go-http-client, okhttp, Java, libwww, Embedly, WhatsApp, Discord, Telegram, Pinterest, Mastodon, http.rb), or when the request lacks Sec-Fetch-Mode: navigate and Accept-Language; keep the 64 character campaign and the counter unchanged; name the change UTM-READER-CLASS-1 in a comment; add a test with the user-agent strings that read as human today.' || char(10) ||
 'Definition of done: merged and verified live by the canonical deploy; outreach_engaged_per_100_clicks_7d reads 8 or more two days running; record the before and after in issue_triage.close_evidence. The gateway file is claimed by another session at the time of filing: take the work claim before editing.',
 'session:reader-yield', 'feature', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'ROADMAP-1: QNFO.REACH READER-YIELD-1.1: classify automated fetchers as bots in the UTM ledger so outreach clicks mean readers');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: QNFO.REACH READER-YIELD-1.2: pageviews_30d flaps between 0, 10000, 25000 and the true 19.7k; derive it from the stored daily series',
 'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js' || char(10) ||
 'code-anchor: async function refreshRegistryMetrics(env) {' || char(10) ||
 'code-probe: {"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "PAGEVIEWS-STABLE-1"}' || char(10) || char(10) ||
 'Charter pillar reach and core (program QNFO.REACH). Metric it should move: the Readers screen and metric_registry pageviews_30d read the true 30 day human total (19.7k) at every refresh.' || char(10) ||
 'Evidence: a live bot-filtered RUM read on 2026-11-04 gave 19,660 and 20,500 for 30 days (31 daily rows sum to 19,660), so the value is not capped by the GraphQL row limit. metric_write_audit_log shows pageviews_30d written as 0 (02:00, 08:00, 12:01, 14:01Z), 25000 (14:46Z on 11-03), 26000 (10:01Z) and 10000 (15:00:54Z) between hours of 19.6k to 20.2k; referral_30d flaps 550, 610, 1000 the same way. The refresh stamps last_refreshed on every write, and refreshRegistryMetrics skips for 55 minutes after any write, so a bad value stays about an hour. The sampled count is quantised to multiples of 10, and the account GraphQL budget was depleted ("Rate limiter budget depleted") during this session.' || char(10) ||
 'EDIT: in refreshRegistryMetrics derive pageviews_30d as the sum of the stored daily cf-rum-human page and paper pageviews rows (reach_signals, 30 complete days), written only when at least 28 of 30 days have rows; keep the GraphQL read for the prior window and as a fallback only when the stored series is short; never write a value below half of the previous one without a second read (the guard the human-audience metrics already use); do not touch last_refreshed on a skipped write; name the change PAGEVIEWS-STABLE-1 in a comment. Find and remove the second writer if one exists: SELECT ts, prev_value, new_value FROM metric_write_audit_log WHERE metric = ''pageviews_30d'' ORDER BY id DESC LIMIT 40.' || char(10) ||
 'Definition of done: merged and verified live by the canonical deploy; no metric_write_audit_log row for pageviews_30d outside 12000..40000 for 48 hours; record before and after in issue_triage.close_evidence. qnfo-fleet-dashboard/worker.js is claimed by another session at the time of filing.',
 'session:reader-yield', 'bug', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'ROADMAP-1: QNFO.REACH READER-YIELD-1.2: pageviews_30d flaps between 0, 10000, 25000 and the true 19.7k; derive it from the stored daily series');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: QNFO.REACH READER-YIELD-1.3: give the papers an outsider reached a second post, from v_paper_readers_top',
 'code-task: repo=qnfo-workers path=qnfo-social/worker.js' || char(10) ||
 'code-anchor: async function drainRollup(env, opts) {' || char(10) ||
 'code-probe: {"paths": ["qnfo-social/worker.js"], "contains": "v_paper_readers_top"}' || char(10) || char(10) ||
 'Charter pillar reach (program QNFO.REACH). Metric it should move: engaged_reader_sessions_7d (122 baseline) and ext_30d per paper for the amplified papers against matched papers that were not (paper_readership, same slugs a week apart).' || char(10) ||
 'Evidence (READER-YIELD-1): the Bluesky queue is empty, so selecting among new papers changes nothing; the only unspent lever is repeat exposure of papers that an outsider already read. paper_readership lists them: 7 percent of papers (about 35 of 506) have an external-referrer visit in 30 days; v_paper_readers_top ranks them (ext_30d x 5 + GA4 sessions capped at 20) and marks suspect_automated rows (50 or more sessions, no external referrer: one page had 110 sessions on 11-03). GA4 engaged sessions come from google (28 of 34), x (17 of 19) and referrals (40 of 44), so the second post goes to X and Mastodon, not the Substack and Bluesky roll-ups that produce 0 and 1 engaged sessions.' || char(10) ||
 'EDIT: when drainRollup has spare gate capacity (queue empty), pick at most one paper a day from v_paper_readers_top where suspect_automated = 0 and the paper was not announced in the last 14 days, post it once to the channels that carried an engaged session (X, LinkedIn, Mastodon) with a new first line (LEDE-SOCIAL-1) and the paper utm tags; record the pick in dissemination_tracker (mode amplify) so paper_readership can compare it with matched papers; never exceed the weekly caps and spacing already in the gate, never post a retracted paper.' || char(10) ||
 'Definition of done: merged and verified live; after 14 days compare ext_30d and GA4 sessions of the amplified papers with matched non-amplified papers of the same age (v_reader_yield_by_source and paper_readership), keep the lane only if the amplified papers gained engaged sessions, otherwise replace the lever. Take the work claim on qnfo-social/worker.js before editing.',
 'session:reader-yield', 'feature', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'ROADMAP-1: QNFO.REACH READER-YIELD-1.3: give the papers an outsider reached a second post, from v_paper_readers_top');

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'ROADMAP-1: QNFO.REACH READER-YIELD-1.4: GA4 ingest by campaign and country, so engaged sessions are attributable to papers, posts and origin',
 'code-task: repo=qnfo-workers path=qnfo-fleet-dashboard/worker.js' || char(10) ||
 'code-anchor: async function ga4Ingest(env, opts) {' || char(10) ||
 'code-probe: {"paths": ["qnfo-fleet-dashboard/worker.js"], "contains": "sessionCampaignName"}' || char(10) || char(10) ||
 'Charter pillar reach (program QNFO.REACH). Metric it should move: it moves none by itself; it makes yield per paper and per post measurable. Done when paper_readership can carry ga4_engaged_30d per paper and outreach_engaged_per_100_clicks_7d can be split by channel.' || char(10) ||
 'Evidence (READER-YIELD-1): the GA4 ingest writes sessions and engagedSessions by channel group, source and host, and sessions (not engaged) by page and country, so an engaged session cannot be tied to the paper or post that earned it. The tagged links already carry utm_campaign = paper slug and utm_source = channel, which GA4 exposes as sessionCampaignName and sessionSource. X, LinkedIn and Mastodon have 14, 7 and 14 slots a week for about 60 new papers a week, so which papers take those slots is a real choice there (the Bluesky and Substack roll-ups carry every paper); GA4 shows X at 17 engaged of 19 sessions and Bluesky at 1 of 22, but nothing says which X post earned them. Singapore is 55 percent of GA4 sessions (1002 of 1833) and no row says how many of them engage.' || char(10) ||
 'EDIT: in ga4Ingest add two runReports for the complete day: dimensions sessionCampaignName and sessionSource with metrics sessions and engagedSessions (limit 1000, rows with an empty or (not set) campaign skipped), written as reach_signals rows source ga4, channel = the source, entity_type campaign, entity_id = the campaign lower-cased to 64 characters (the UTM ledger key); and dimensions country and sessionDefaultChannelGroup with metrics sessions and engagedSessions as entity_type country_channel, entity_id country || chr(124) || channel. Keep quality human; do not change any existing row shape; name the change GA4-CAMPAIGN-1 in a comment.' || char(10) ||
 'Definition of done: merged and verified live by the canonical deploy; SELECT COUNT(*) FROM reach_signals WHERE source = ''ga4'' AND entity_type = ''campaign'' AND metric = ''engagedSessions'' is above 0 for the previous day; record the before and after in issue_triage.close_evidence. The file is claimed by another session at the time of filing: take the work claim first. Follow-up once rows exist: add ga4_engaged_30d to paper_readership and rank v_paper_readers_top by it.',
 'session:reader-yield', 'feature', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title = 'ROADMAP-1: QNFO.REACH READER-YIELD-1.4: GA4 ingest by campaign and country, so engaged sessions are attributable to papers, posts and origin');

INSERT OR IGNORE INTO roadmap_proposals (program_code, request_instance, title, rationale, path, anchor_line, status, issue_id, created_at, updated_at)
SELECT 'QNFO.REACH', 'session-reader-yield-20261104-1', 'Classify automated fetchers as bots in the UTM ledger so outreach clicks mean readers',
  'READER-YIELD-1: counted human clicks 1260 vs 25 engaged organic-social sessions in 10 days; metric outreach_engaged_per_100_clicks_7d.', 'qnfo-gateway/worker.js',
  'code-anchor: var UTM_BOT_RE = /bot|crawler|spider|preview|facebookexternalhit|slackbot|twitterbot|linkedinbot|mastodon|bluesky|cardyb|headless/i;', 'proposed',
  (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'ROADMAP-1: QNFO.REACH READER-YIELD-1.1:%'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now');

INSERT OR IGNORE INTO roadmap_proposals (program_code, request_instance, title, rationale, path, anchor_line, status, issue_id, created_at, updated_at)
SELECT 'QNFO.REACH', 'session-reader-yield-20261104-2', 'pageviews_30d flaps between 0, 10000, 25000 and the true 19.7k; derive it from the stored daily series',
  'READER-YIELD-1: live RUM 30 day human total 19,660..20,500; stored value flaps (metric_write_audit_log).', 'qnfo-fleet-dashboard/worker.js',
  'code-anchor: async function refreshRegistryMetrics(env) {', 'proposed',
  (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'ROADMAP-1: QNFO.REACH READER-YIELD-1.2:%'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now');

INSERT OR IGNORE INTO roadmap_proposals (program_code, request_instance, title, rationale, path, anchor_line, status, issue_id, created_at, updated_at)
SELECT 'QNFO.REACH', 'session-reader-yield-20261104-3', 'Give the papers an outsider reached a second post, from v_paper_readers_top',
  'READER-YIELD-1: the Bluesky queue is empty; repeat exposure of papers with an external-referrer visit is the unspent lever; measured against matched papers.', 'qnfo-social/worker.js',
  'code-anchor: async function drainRollup(env, opts) {', 'proposed',
  (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'ROADMAP-1: QNFO.REACH READER-YIELD-1.3:%'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now');

INSERT OR IGNORE INTO roadmap_proposals (program_code, request_instance, title, rationale, path, anchor_line, status, issue_id, created_at, updated_at)
SELECT 'QNFO.REACH', 'session-reader-yield-20261104-4', 'GA4 ingest by campaign and country, so engaged sessions are attributable to papers, posts and origin',
  'READER-YIELD-1: engaged sessions cannot be tied to the paper or post that earned them; X, LinkedIn and Mastodon have 14, 7 and 14 slots a week for about 60 new papers a week, so slot choice matters there.', 'qnfo-fleet-dashboard/worker.js',
  'code-anchor: async function ga4Ingest(env, opts) {', 'proposed',
  (SELECT MAX(id) FROM agent_issues WHERE title LIKE 'ROADMAP-1: QNFO.REACH READER-YIELD-1.4:%'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now');

-- Q08-METRICS-1 (2026-10-02, #1759, pillar: reach). q08-signal-engine measures itself for METRIC-CLOSED-LOOP-1.
-- Applied live by the session that wrote it; idempotent (safe to re-run).
--
-- Source: q08-signal-engine 0.8.2+ computes the 7d aggregates (also served at GET https://q08.org/api/metrics) and writes
-- metric_registry.last_value itself after every generation cron (every 2 hours; writeOwnMetrics). Baselines read 2026-10-02 12:40Z:
--   gate pass rate 7d 28/74 = 0.38; about 2.5k neurons per published piece (ai_call_counters, 10-01..10-02);
--   0 confirmed subscribers; human reads were not measured before 0.8.2 (published_pieces.reads counts every GET);
--   1 vote since POST-only voting (0.7.39, 09:12Z); votes count only from 2026-10-03T00:00Z.
--
-- One trigger per metric, or a named exemption:
--   q08_gate_pass_rate_7d             trigger lt 0.5   (quality-gate failures waste compute and stall publishing)
--   q08_neurons_per_published_piece_7d trigger gt 6000 (about 2.4x today's ~2.5k; a regression in compose cost)
--   q08_human_reads_7d                trigger lt 50    (the #1716 review bar: 50 human reads a week)
--   q08_verified_votes_7d             EXEMPT: report only; a handful of votes a week is too few to judge, and the
--                                      reader-verdict loop (feedbackScan) already acts on them.
--   q08_confirmed_subscribers         EXEMPT: covered fleet-wide by subscribers_growth_monthly and its trigger (#1753).

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('q08_gate_pass_rate_7d', 'surface', 'leading', 'engine_runs with piece_published=1 / finished engine_runs (not running, abandoned or async-done) over 7d (q08 GET /api/metrics windows.7d.gate_pass_rate)', 'https://q08.org/api/metrics', '0.38 (2026-10-02)', '>= 0.5', 'q08-signal-engine', 'analytics_metric_triggers q08_gate_pass_rate_7d', '2h', '< 0.5', '< 0.25', 'MEASURED', NULL),
 ('q08_neurons_per_published_piece_7d', 'surface', 'lagging', 'Workers AI neurons attributed to q08-signal-engine in ai_call_counters over 7d / pieces published in 7d (q08 GET /api/metrics windows.7d.neurons_per_published_piece)', 'https://q08.org/api/metrics', 'about 2500 (2026-10-01..02)', '<= 6000', 'q08-signal-engine', 'analytics_metric_triggers q08_neurons_per_published_piece_7d', '2h', '> 6000', '> 12000', 'MEASURED', NULL),
 ('q08_human_reads_7d', 'surface', 'lagging', 'GETs of /p/<slug> in 7d whose user agent is not a crawler (q08 0.8.2 q08_daily_reads.human; no IP, cookie or referrer stored)', 'https://q08.org/api/metrics', 'unmeasured before 2026-10-02', '>= 50 (the #1716 review bar)', 'q08-signal-engine', 'analytics_metric_triggers q08_human_reads_7d; owner review #1716 on 2026-10-31', '2h', '< 50', '< 10', 'MEASURED', NULL),
 ('q08_verified_votes_7d', 'surface', 'leading', 'q08_feedback rows (POST-only votes) created in 7d and on or after 2026-10-03T00:00Z (q08 GET /api/metrics windows.7d.verified_votes)', 'https://q08.org/api/metrics', '0 (votes count from 2026-10-03)', 'report only', 'q08-signal-engine', 'report only (EXEMPT in migrations/2026-10-02-q08-metrics.sql)', '2h', NULL, NULL, 'MEASURED', NULL),
 ('q08_confirmed_subscribers', 'surface', 'lagging', 'subscribers with status confirmed in the q08-signal D1 (q08 GET /api/metrics windows.7d.confirmed_subscribers)', 'https://q08.org/api/metrics', '0 (2026-10-02)', 'report only', 'q08-signal-engine', 'report only (EXEMPT: subscribers_growth_monthly and #1753 cover subscriber growth fleet-wide)', '2h', NULL, NULL, 'MEASURED', NULL);

WITH v(metric_key, title, operator, threshold, priority, action, cooldown) AS (VALUES
  ('q08_gate_pass_rate_7d', 'q08 quality gate rejects most drafts (7d pass rate under 50%)', 'lt', 0.5, 6,
   'Pillar reach. Read the sub-causes: SELECT error, COUNT(*) FROM engine_runs WHERE status = ''gate_failed'' AND ran_at >= datetime(''now'',''-7 days'') GROUP BY 1 ORDER BY 2 DESC (q08-signal D1). Fix the most frequent cause in the prompt or in normalizeDraft without loosening the FACTS rule or the fabrication checks in gate(): those are invariants, not levers (#1760).', 72),
  ('q08_neurons_per_published_piece_7d', 'q08 compose cost per published piece regressed (over 6000 neurons)', 'gt', 6000, 6,
   'Pillar cost. Read ai_call_counters WHERE worker = ''q08-signal-engine'' by day and model; a higher cost per piece usually means more retries per published piece (see q08_gate_pass_rate_7d) or a model change in COMPOSE_MODELS. Lower retries first; change the model only among the approved ones.', 72),
  ('q08_human_reads_7d', 'q08 has under 50 human reads a week', 'lt', 50, 6,
   'Pillar reach. The 2026-10-31 owner review (#1716) decides keep or retire on this metric; until then lower spend, not reach claims: the perf-lever q08-cadence (ops_config q08_max_per_day, bounds 2..10, PERFORMANCE-LOOP-1) is the lever. Never re-enable Q08_SOCIAL_QUEUE (it posts under the owner''s personal account).', 168)
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, 'registry', v.operator, v.threshold, v.priority, v.action || ' Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).', 'q08-signal-engine', 'agent_issues', v.cooldown, 1, 'Q08-METRICS-1 2026-10-02'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);

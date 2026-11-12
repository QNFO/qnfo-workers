-- SIGNALS-ENGINE-2 (2026-11-12, charter pillar research; owner 2026-11-12: "we need a more full-featured signals engine that definitely doesn't
-- rely on certain hard-coded sources"). Registers the three stream metrics q08-signal-engine 0.52.0 writes on every signal tick (sigWriteMetrics),
-- with a trigger each so a stream the engine's own remediation cannot repair files an issue for the code loop. Measured before: 442 of 583
-- signals in 21 days (76%) were Hacker News. Idempotent (INSERT OR IGNORE).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM analytics_metric_triggers WHERE metric_key IN ('signal_max_publisher_share_24h','signal_sources_active','signal_topics_covered_24h') AND notes LIKE 'SIGNALS-ENGINE-2%'; DELETE FROM metric_breach_cause WHERE metric_key IN ('signal_max_publisher_share_24h','signal_sources_active','signal_topics_covered_24h'); DELETE FROM metric_registry WHERE metric IN ('signal_max_publisher_share_24h','signal_sources_active','signal_topics_covered_24h');
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('signal_max_publisher_share_24h', 'surface', 'target', 'Largest single publisher''s share of q08-signal.signal_log rows created in the last 24 hours (q08-signal-engine sigHealthOf, every signal tick)', 'https://q08.org/api/signals/health', '0.76 (Hacker News, 21 days to 2026-11-12)', '<= 0.35', 'q08-signal-engine', 'q08-signal-engine sigTick remediation (halves the dominant publisher''s cap for 24 h)', '30m', '> 0.35', '> 0.6', 'UNMEASURED', NULL),
 ('signal_sources_active', 'surface', 'target', 'Rows in q08-signal.sig_sources with state active (q08-signal-engine, every signal tick)', 'https://q08.org/api/signals/health', '5 hard-coded scrapers before 2026-11-12', '>= 20', 'q08-signal-engine', 'q08-signal-engine sigTick remediation (releases quarantined sources, widens discovery, reseeds)', '30m', '< 20', '< 8', 'UNMEASURED', NULL),
 ('signal_topics_covered_24h', 'surface', 'target', 'Topics (of 11: macro, markets, energy, geopolitics, policy, science, health, climate, technology, ai, security) with at least one signal in the last 24 hours', 'https://q08.org/api/signals/health', 'unmeasured before 2026-11-12', '>= 8', 'q08-signal-engine', 'q08-signal-engine sigSchedule (topic deficit raises a topic''s sources) and topic searches', '30m', '< 8', '< 5', 'UNMEASURED', NULL);
INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('signal_max_publisher_share_24h', 'structure', 'SIGNALS-ENGINE-2 2026-11-12: source mix of the signal stream'),
 ('signal_sources_active', 'structure', 'SIGNALS-ENGINE-2 2026-11-12: source registry health'),
 ('signal_topics_covered_24h', 'structure', 'SIGNALS-ENGINE-2 2026-11-12: topic coverage of the signal stream');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes, created_at)
SELECT 'signal_max_publisher_share_24h', 'q08 signal stream dominated by one publisher (over 35% of 24-hour signals)', 'registry', 'gt', 0.35, 5,
 'Pillar research. The engine halves the dominant publisher''s per-tick cap every tick it is over 35%; a breach that survives that means too few other sources produce. Read https://q08.org/api/signals/health (registry, by_kind, uncovered_topics) and SELECT id, state, quality, fail_streak, last_error FROM sig_sources ORDER BY state, quality (q08-signal D1). Raise SIG_FETCH_PER_TICK or SIG_DISCOVER_PER_TICK, or fix the parser for the failing kind. Definition of done: the metric is at or under 0.35 in metric_registry.
code-task: repo=qnfo-workers path=q08-signal-engine/worker.js
code-anchor: async function sigTick(env) {', 'q08-signal-engine', 'agent_issues', 2, 1, 'SIGNALS-ENGINE-2 2026-11-12', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'signal_max_publisher_share_24h');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes, created_at)
SELECT 'signal_sources_active', 'q08 signal registry has under 20 active sources', 'registry', 'lt', 20, 5,
 'Pillar research. The engine releases quarantined sources early and widens discovery while active sources are under 20. A breach that survives means sources fail in common: read last_error in sig_sources (q08-signal D1) grouped by kind; a blocked host family or a parser gap is fixed in sigFetchSource or sigParseFeed. Definition of done: the metric is 20 or more in metric_registry.
code-task: repo=qnfo-workers path=q08-signal-engine/worker.js
code-anchor: async function sigFetchSource(env, src, domains) {', 'q08-signal-engine', 'agent_issues', 2, 1, 'SIGNALS-ENGINE-2 2026-11-12', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'signal_sources_active');
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes, created_at)
SELECT 'signal_topics_covered_24h', 'q08 signal stream covers under 8 of 11 topics', 'registry', 'lt', 8, 5,
 'Pillar research. Uncovered topics already boost their sources and searches in sigSchedule. A breach that survives means the topic keywords miss the stream or the topic searches fail: read uncovered_topics and topic_share at https://q08.org/api/signals/health and widen SIG_TOPICS for the missing topic. Definition of done: the metric is 8 or more in metric_registry.
code-task: repo=qnfo-workers path=q08-signal-engine/worker.js
code-anchor: function sigTopicOf(text, hint) {', 'q08-signal-engine', 'agent_issues', 2, 1, 'SIGNALS-ENGINE-2 2026-11-12', datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'signal_topics_covered_24h');

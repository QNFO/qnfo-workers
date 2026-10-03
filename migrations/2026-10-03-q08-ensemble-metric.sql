-- Q08-ENSEMBLE-1 (2026-10-03, pillar: reach). Registers q08_panel_effective_votes_30d with its trigger, in the same migration
-- (METRIC-CLOSED-LOOP-1). Applied live against qnfo-audit by the session that wrote it; idempotent (INSERT OR IGNORE, guarded INSERT).
--
-- What it measures: q08 0.8.5 has two reader judges from different model families score every draft. Their pass/fail agreement
-- across 30 days gives a phi coefficient; n_eff = 2 / (1 + phi) is how many independent votes the pair is worth (2 = independent,
-- 1 = one voice heard twice). Published research says LLM judges correlate strongly (Kim et al., ICML 2025: models agree 60% of the
-- time they are both wrong; "Nine Judges, Two Effective Votes", 2026: 9 judges over 7 families = 2.18 effective votes), so a value
-- near 1 is the expected failure and the reason the deterministic gate, real reader votes and the owner's verdict stay in the loop.
-- It is unmeasured (NULL) until 20 paired panel reads exist. v_metric_trigger_state compares NULL as not hit.
-- Threshold lt 1.3 is a judgement (phi above about 0.54), not a measurement; revisit after the first 30 days of data.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('q08_panel_effective_votes_30d', 'surface', 'leading', 'Over 30d of q08_reader_tests rows with role=judge, pair the two judges of each panel read and compute phi on pass/fail; n_eff = 2 / (1 + phi). Needs 20 paired reads, else unmeasured (q08 0.8.5 writeOwnMetrics)', 'https://q08.org/api/metrics', 'unmeasured before 2026-10-03', '>= 1.3 (judges not collapsed into one voice; judgement set 2026-10-03)', 'q08-signal-engine', 'analytics_metric_triggers q08_panel_effective_votes_30d', '2h', '< 1.3', '< 1.1', 'UNMEASURED', NULL);

WITH v(metric_key, title, operator, threshold, priority, action, cooldown) AS (VALUES
  ('q08_panel_effective_votes_30d', 'q08 reader-panel judges agree so closely that two judges are one voice (n_eff under 1.3)', 'lt', 1.3, 6,
   'Pillar reach. Read q08_reader_tests (q08-signal D1): SELECT family, AVG(pass), COUNT(*) FROM q08_reader_tests WHERE role = ''judge'' AND created_at >= datetime(''now'',''-30 days'') GROUP BY family. Find the family whose pass/fail tracks the others most closely and replace it in PANEL_POOL with a model whose training lineage differs (check model_ladder_models.family; do not add a model from a family already in the pool, and do not add a paid provider while fleet_budget ai_spend caps are breached). Do not raise the pass bar or add more judges: more judges from the same lineage add about 0.2 effective votes past five, and a stricter bar only removes output. Definition of done: n_eff >= 1.3 over a fresh 30-day window, and q08_neurons_per_published_piece_7d not higher than before the change.

code-task: repo=qnfo-workers path=q08-signal-engine/worker.js
code-anchor: var PANEL_POOL = [', 168)
)
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, 'registry', v.operator, v.threshold, v.priority, v.action, 'q08-signal-engine', 'agent_issues', v.cooldown, 1, 'Q08-ENSEMBLE-1 2026-10-03'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);

-- Added after independent review of PR 562: the panel fails open when no judge returns a verdict, so a panel that silently never
-- runs would look healthy. q08 0.8.5 writes a 'panel_unavailable' row for every such read; this metric is their 7-day share.
-- Unmeasured (NULL) until 5 panel reads exist. Threshold gt 0.25 is a judgement.
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('q08_panel_unavailable_share_7d', 'surface', 'guard', 'Over 7d of q08_reader_tests: panel_unavailable rows / (judge rows / 2 + panel_unavailable rows); needs 5 panel reads, else unmeasured (q08 0.8.5 writeOwnMetrics)', 'https://q08.org/api/ensemble', 'unmeasured before 2026-10-03', '<= 0.25 (judgement set 2026-10-03)', 'q08-signal-engine', 'analytics_metric_triggers q08_panel_unavailable_share_7d', '2h', '> 0.25', '> 0.5', 'UNMEASURED', NULL);

WITH v(metric_key, title, operator, threshold, priority, action, cooldown) AS (VALUES
  ('q08_panel_unavailable_share_7d', 'q08 reader panel returned no verdict on over a quarter of reads, so the ensemble is not gating', 'gt', 0.25, 6,
   'Pillar reach. The panel fails open on purpose, so this metric is the only alarm for a panel that is not running. Read GET https://q08.org/api/ensemble (panel_unavailable, by_family) and the Workers AI errors for the ids in PANEL_POOL (all five exist in the Cloudflare catalog as of 2026-10-03; three are reasoning models and need the 2000-token READER_MAX_TOKENS budget). Replace a judge that errors or returns no JSON with another family; do not raise READER_MAX_TOKENS past 4000 or add judges. Definition of done: the share is at or below 0.25 over a fresh 7 days.

code-task: repo=qnfo-workers path=q08-signal-engine/worker.js
code-anchor: var READER_MAX_TOKENS = 2000;', 168)
)
INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, 'registry', v.operator, v.threshold, v.priority, v.action, 'q08-signal-engine', 'agent_issues', v.cooldown, 1, 'Q08-ENSEMBLE-1 review 2026-10-03'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);

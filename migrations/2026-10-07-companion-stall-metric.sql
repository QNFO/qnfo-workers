-- COMPANION-PUBLISH-STALL-AUTO-1 (2026-10-07, pillar core, agent_issues 2106). Registers companion_hours_since_last_piece,
-- written by personal-companion 1.13.0 companionStallDetector on every hourly tick (hours since the newest
-- personal-life.companion_pieces row, rounded to 0.1; no model call). No analytics_metric_triggers row on purpose: the
-- detector files and closes COMPANION-PUBLISH-STALL-AUTO-1 itself (q08 Q08-STALL-METRIC-1 pattern), so a trigger would
-- file a duplicate. Idempotent (INSERT OR IGNORE).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'companion_hours_since_last_piece';
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('companion_hours_since_last_piece', 'surface', 'guard', 'Hours since MAX(companion_pieces.created_at) in personal-life, rounded to 0.1 (personal-companion 1.13.0 companionStallDetector, hourly)', 'https://reading.q08.org/health', '47.9 on 2026-10-07 08:00Z (DeepSeek 402 stall)', '< 12 (generation hours 04/08/12/16/20 UTC, up to 5 pieces a day)', 'personal-companion', 'personal-companion companionStallDetector (agent_issues COMPANION-PUBLISH-STALL-AUTO-1)', '1h', '>= 12', '>= 24', 'UNMEASURED', NULL);

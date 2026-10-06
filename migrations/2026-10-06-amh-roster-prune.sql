-- AMH-ROSTER-PRUNE-1 (2026-10-06, pillar autonomy, transformation lever T5.11): ai_model_health held 42 rows, 24 of them
-- external ids registered on 2026-09-19 (anthropic/*, openai/*, alibaba/qwen3.8, deepseek/deepseek-chat, typesafe/jev) that
-- no fleet prober has ever probed (last_probe_ts NULL), with no override, no failure and no gateway failure in 7 days.
-- qnfo-ai reads health only for its own MODELS keys, none of which is among them; the scorecard and dashboard counted them
-- as healthy models. The per-tick prune meant to remove them in qnfo-ai-calibration never ran (wrong bind receiver) and is
-- removed in host 1.3.3. This file backs the table up, then deletes exactly those 24 ids, each still guarded by the same
-- three conditions, so a row that has since been probed or failed is kept. The 4 other ids outside the probe roster have
-- producers (the calibration host probes deepseek-v4-flash and deepseek-v4-flash-thinking; the gateway sweep writes
-- deepseek/deepseek-v4-flash) and stay. Applied by MIGRATION-RUNNER-1, which checks the backup right before the DELETE.
-- Also records lever T5.2 (PROBE-TEMPLATES-1, PR 694, applied by the runner on its merge; see migration_runs) as landed.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261006_ai_model_health
-- Rollback: INSERT OR IGNORE INTO ai_model_health SELECT * FROM bak_20261006_ai_model_health; UPDATE transformation_levers SET status = 'pending', landed_at = NULL WHERE tp = 5 AND n IN (2, 11);

CREATE TABLE IF NOT EXISTS bak_20261006_ai_model_health AS SELECT * FROM ai_model_health;

DELETE FROM ai_model_health
WHERE model_id IN (
    'alibaba/qwen3.8',
    'anthropic/claude-3-5-sonnet-20241022', 'anthropic/claude-3-7-sonnet-20250219', 'anthropic/claude-3.5-haiku-latest',
    'anthropic/claude-opus-4-1', 'anthropic/claude-opus-4-20250514', 'anthropic/claude-sonnet-4-20250514',
    'anthropic/claude-sonnet-4-5', 'anthropic/claude-sonnet-4-5-20250929', 'anthropic/claude-sonnet-4.5',
    'deepseek/deepseek-chat',
    'openai/gpt-5', 'openai/gpt-5-codex', 'openai/gpt-5-mini', 'openai/gpt-5.1-codex', 'openai/gpt-5.1-codex-max',
    'openai/gpt-5.2-codex', 'openai/gpt-5.3-chat', 'openai/gpt-5.3-codex', 'openai/gpt-5.5', 'openai/gpt-5.6-luna',
    'openai/gpt-5.6-sol', 'openai/gpt-5.6-terra',
    'typesafe/jev')
  AND last_probe_ts IS NULL
  AND COALESCE(consecutive_failures, 0) = 0
  AND ctx_override IS NULL AND vision_override IS NULL AND reasoning_override IS NULL
  AND NOT EXISTS (SELECT 1 FROM ai_gateway_failures f WHERE f.model = ai_model_health.model_id
                  AND f.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days'))
  AND EXISTS (SELECT 1 FROM bak_20261006_ai_model_health b WHERE b.model_id = ai_model_health.model_id);

UPDATE transformation_levers
SET status = 'landed',
    landed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    note = COALESCE(note || ' | ', '') || 'AMH-ROSTER-PRUNE-1: 24 never-probed external ids pruned after backup bak_20261006_ai_model_health by migration (runner); dead per-tick prune removed in qnfo-ai-calibration 1.3.3. The 4 other outside-roster ids have producers and stay.',
    updated_at = datetime('now')
WHERE tp = 5 AND n = 11 AND status <> 'landed';

UPDATE transformation_levers
SET status = 'landed',
    landed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    note = COALESCE(note || ' | ', '') || 'PROBE-TEMPLATES-1 (PR 694): D1 trigger contract_probe_templates_v1 gives a METRIC-TRIGGER issue''s contract its trigger''s probe at birth (issues 2022 and 2040 templated on apply); TOOL-FAILURE deliberately not templated (its 7-day probe would never pass for ops_d1_query)',
    updated_at = datetime('now')
WHERE tp = 5 AND n = 2 AND status <> 'landed';

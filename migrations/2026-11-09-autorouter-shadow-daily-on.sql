-- AUTOROUTER-EVAL-1.3 (agent_issues 1002121, GitHub 7939; charter pillar cost, program QNFO.INFRA): qnfo-ai autoRouterShadowRun now sends cf-aig-allowed-providers: workers-ai and records
-- status skipped_pool when the selected model is not @cf/, so the replay can no longer reach an anthropic, openai or xai model. This releases the latch set by 2026-11-05-gateway-cost-f4b.sql.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE ops_config SET value = 'off', updated_at = datetime('now') WHERE key = 'autorouter_shadow_daily';
UPDATE ops_config SET value = 'on', note = 'AUTOROUTER-EVAL-1.3 2026-11-09: pool restricted to Workers AI in qnfo-ai autoRouterShadowRun; latch released', updated_at = datetime('now') WHERE key = 'autorouter_shadow_daily';

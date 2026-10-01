-- UNIFIED-AI-SPEND-1 (#1683, 2026-10-01): per-provider 30-day soft caps, BYOK included. qnfo-fleet-control
-- 0.4.51 writes the measured 30d spend into fleet_budget.current every hour and raises one digest alert per
-- breached cap per day. Caps sum to the $150/30d owner ceiling; target is the ~$110/month objective (2.3).
-- These are alert thresholds; hard blocking of BYOK traffic is an AI Gateway setting the owner controls.
INSERT OR IGNORE INTO fleet_budget (node_class, cap, target, current, unit, updated_at) VALUES
  ('ai_spend:total',    150, 110, 0, 'usd_30d', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ai_spend:openai',    60,  40, 0, 'usd_30d', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ai_spend:deepseek',  50,  40, 0, 'usd_30d', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ai_spend:workers-ai',25,  15, 0, 'usd_30d', strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('ai_spend:anthropic', 15,  10, 0, 'usd_30d', strftime('%Y-%m-%dT%H:%M:%SZ','now'));

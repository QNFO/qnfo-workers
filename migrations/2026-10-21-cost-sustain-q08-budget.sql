-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'q08_daily_neurons';
-- COST-SUSTAIN-2 (2026-10-21, owner directive: research and publication <= USD 300/month all-in, quality must not drop; pillar cost).
-- q08-signal-engine 0.33.0 reads ops_config q08_daily_neurons as a hard daily neuron budget paced over the UTC day (generate() and
-- auditPublished() wait when today's spend is past the pace; nothing is skipped, no gate changes). Measured 2026-10-14..10-20:
-- 135-288k neurons/day (USD 1.5-3.2/day). 150000 = USD 1.65/day. Together with research_daily_neurons 360000 (qnfo-research-exec
-- 0.31.0) and code_loop_daily_calls 100, the fleet's model spend is bounded at about USD 7.6/day = USD 230/month before the plan.
INSERT INTO ops_config (key, value, note, updated_at) VALUES ('q08_daily_neurons', '150000', 'COST-SUSTAIN-2 2026-10-21: hard daily neuron budget for q08-signal-engine, paced over the UTC day (q08 0.33.0). 150k = USD 1.65/day. 0 disables (owner override only). Revert: delete row (code default 150000).', datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = excluded.updated_at;

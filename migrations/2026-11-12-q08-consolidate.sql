-- CONSOLIDATE-1 (2026-11-12, charter pillar cost; owner directive 2026-11-12: consolidate Q08, keep the proof of concept lean). q08-signal-engine now runs
-- signals-only (no model call) and q08-prediction-markets turns its price-hidden estimator off, so the essay-chain and estimator metrics can no longer move.
-- Their triggers are disabled, not deleted, with the reason in notes; the rollback re-enables exactly these rows. Kept: q08_human_reads_7d, the two
-- forecast-record metrics, pm_chain_ok (the frozen forecast log still has to verify).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET enabled = 1 WHERE notes LIKE '%CONSOLIDATE-1%';
UPDATE analytics_metric_triggers
SET enabled = 0, notes = trim(coalesce(notes, '') || ' CONSOLIDATE-1 2026-11-12: disabled; the essay engine runs signals-only (ops_config q08_mode = full restores it, then re-enable).')
WHERE metric_key IN ('q08_gate_pass_rate_7d', 'q08_neurons_per_published_piece_7d', 'q08_verified_votes_7d', 'q08_panel_effective_votes_30d', 'q08_panel_unavailable_share_7d')
  AND enabled = 1;
UPDATE analytics_metric_triggers
SET enabled = 0, notes = trim(coalesce(notes, '') || ' CONSOLIDATE-1 2026-11-12: disabled; the price-hidden estimator is off (q08-prediction-markets PM_ESTIMATE = off) and its record is frozen.')
WHERE metric_key IN ('pm_breaker_active', 'pm_brier_gain', 'pm_shadow_roi', 'pm_graduation_ready', 'pm_inconsistent_share', 'pm_lookahead_share')
  AND enabled = 1;

-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_breach_cause WHERE metric_key = 'product_plus_deployed_7d' AND note LIKE 'METRIC-CAUSE-AT-REGISTRATION-1:%';
-- Charter pillar: autonomy. Repair the already-applied PLUSSING-3 registration without replaying its workflow mutation.
INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
  ('product_plus_deployed_7d', 'code-loop', 'METRIC-CAUSE-AT-REGISTRATION-1: the product plus is delivered by the roadmap/code/deploy loop; repair its stalled execution, not the count');

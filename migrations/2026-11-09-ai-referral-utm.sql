-- AI-REFERRAL-UTM-1 (2026-11-09, charter pillar reach; agent_issues 1002092 / GitHub 8100): qnfo-infra 1.17.0 stores reach-ae rows of entity_type ref-utm
-- ("<referrer or direct>|<utm_source>") so a visit that carries utm_source=chatgpt.com but no referrer is counted. This view counts a ref-utm row toward an answer
-- engine when its utm part is in ai_referrer_hosts and its referrer part is not (no double count with the referrer rows). v_ai_reach_daily is left as it is;
-- compare answer_engine_referrals_edge with answer_engine_referrals_utm_only for 14 days before changing which one the metric reads.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_ai_reach_utm_daily;
-- NOOP-OK: CREATE VIEW IF NOT EXISTS is idempotent.
CREATE VIEW IF NOT EXISTS v_ai_reach_utm_daily AS
SELECT date,
  CAST(COALESCE(SUM(CASE WHEN substr(entity_id, instr(entity_id, '|') + 1) IN (SELECT host FROM ai_referrer_hosts)
                          AND substr(entity_id, 1, instr(entity_id, '|') - 1) NOT IN (SELECT host FROM ai_referrer_hosts) THEN value END), 0) AS INTEGER) AS answer_engine_referrals_utm_only
FROM reach_signals
WHERE source = 'reach-ae' AND entity_type = 'ref-utm' AND date >= date('now', '-30 days')
GROUP BY date;

-- VALUE-FOR-MONEY-1 (2026-10-29, charter pillar cost, serves reach and research). Owner question 2026-10-29: "What am I getting for the cost? ... When we talk
-- about quality, what are we really talking about?" The fleet measured cost (cost_usd_30d) and output (publications_30d) in separate places and never divided
-- one by the other, so spend had no unit. This view prices each rung of the outcome ladder in docs/VALUE-FOR-MONEY.md from live metric_registry values.
-- The q08 retraction share stays its own metric (q08_retraction_rate_30d); D1 caps a compound SELECT at 5 terms.
-- It adds a view only: no new metric, so no trigger is owed. Every input is an existing registered metric.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_value_for_money;
CREATE VIEW IF NOT EXISTS v_value_for_money AS
WITH m AS (
  SELECT
    MAX(CASE WHEN metric = 'cost_usd_30d' THEN CAST(last_value AS REAL) END) AS cost_30d,
    MAX(CASE WHEN metric = 'publications_30d' THEN CAST(last_value AS REAL) END) AS pubs_30d,
    MAX(CASE WHEN metric = 'papers_with_open_high_errata_pct' THEN CAST(last_value AS REAL) END) AS errata_pct,
    MAX(CASE WHEN metric = 'q08_retraction_rate_30d' THEN CAST(last_value AS REAL) END) AS q08_retraction,
    MAX(CASE WHEN metric = 'engaged_human_sessions_28d' THEN CAST(last_value AS REAL) END) AS human_sessions,
    MAX(CASE WHEN metric = 'outreach_human_clicks_7d' THEN CAST(last_value AS REAL) END) AS clicks_7d,
    MAX(CASE WHEN metric = 'referral_30d' THEN CAST(last_value AS REAL) END) AS referrals_30d,
    MAX(CASE WHEN metric = 'subscribers_growth_monthly' THEN CAST(last_value AS REAL) END) AS new_subscribers
  FROM metric_registry
)
SELECT 'R0 published (what the cost counts today)' AS rung, cost_30d / NULLIF(pubs_30d, 0) AS usd_per_unit, pubs_30d AS units_30d,
       'proxy: any paper that passed a gate' AS note FROM m
UNION ALL
SELECT 'R1 correct (no open high-severity erratum)', cost_30d / NULLIF(pubs_30d * (1 - errata_pct / 100.0), 0), pubs_30d * (1 - errata_pct / 100.0),
       'outcome: falsifying reviewer; errata_pct is the stock share, so read as an upper bound on correct output' FROM m
UNION ALL
SELECT 'R2 read (engaged human session)', cost_30d / NULLIF(human_sessions * 30.0 / 28.0, 0), human_sessions * 30.0 / 28.0,
       'outcome: people; site-wide, not per paper, until per-paper reads exist' FROM m
UNION ALL
SELECT 'R3 pulled (human click or referral)', cost_30d / NULLIF(clicks_7d * 30.0 / 7.0 + referrals_30d, 0), clicks_7d * 30.0 / 7.0 + referrals_30d,
       'outcome: promotion reach' FROM m
UNION ALL
SELECT 'R4 retained (new subscriber)', cost_30d / NULLIF(new_subscribers, 0), new_subscribers,
       'outcome: NULL usd means zero units: the cost buys nothing at this rung' FROM m;

-- IDA-SIGNAL-1 (2026-11-17, charter pillar reach, cost; owner 2026-11-17: QNFO is expensive to maintain and has poor reach and impact, poor signal-to-value, against OpenSci's IDA explorer).
-- Live read of paper_readership on 2026-11-17: 285 published "proposal" papers older than 14 days drew 34 outside-referred views in 30 days (0.12 a paper, 93.7 percent with none), while 13 "remediation" papers drew 0.62 a paper.
-- v_paper_signal_value ranks each paper source by outside readers per paper, so the research queue can steer volume toward sources readers reach. Cloudflare RUM only (no cookie, no consent gate); zero AI calls.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP VIEW IF EXISTS v_paper_signal_value; UPDATE metric_registry SET state = 'RETIRED' WHERE metric = 'paper_zero_reader_share_30d';

CREATE VIEW IF NOT EXISTS v_paper_signal_value AS
SELECT COALESCE(NULLIF(idea_source, ''), 'unknown') AS idea_source,
  COUNT(*) AS papers,
  ROUND(SUM(COALESCE(ext_30d, 0)), 0) AS ext_30d,
  ROUND(SUM(COALESCE(pv_30d, 0)), 0) AS pv_30d,
  ROUND(1.0 * SUM(COALESCE(ext_30d, 0)) / COUNT(*), 2) AS ext_per_paper,
  ROUND(1.0 * SUM(CASE WHEN COALESCE(ext_30d, 0) = 0 THEN 1 ELSE 0 END) / COUNT(*), 3) AS zero_ext_share
FROM paper_readership
WHERE published_at IS NOT NULL AND published_at < date('now', '-14 days')
GROUP BY 1;

-- CAUSE-MAPPED: paper_zero_reader_share_30d is informational with no trigger; the finding is the view above, and the research queue reads it in a later change (issue 12305).
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state, last_value, last_refreshed)
VALUES ('paper_zero_reader_share_30d', 'external', 'target', 'share of published papers older than 14 days with no outside-referred view in 30 days', 'qnfo-audit.v_paper_signal_value (IDA-SIGNAL-1)', '<= 0.8', 'manager:reach', 'agent:analytics-loop', 'hourly', 'MEASURED', NULL, NULL);

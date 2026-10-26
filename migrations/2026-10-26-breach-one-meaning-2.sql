-- BREACH-ONE-MEANING-2 (2026-10-26, charter pillar autonomy). Follows migrations/2026-10-26-breach-one-meaning.sql. Live read 08:48Z: 62 breaches
-- (was 70); 4 read cause 'unmapped' because they are metrics registered after the mapping (the BP26 best-practice catalogue, portfolio drift,
-- external referred pageviews). This maps them. A later new metric is not mapped by guess: the hourly fm-breach-unmapped contract flags it.
-- breaches_unmapped has no analytics_metric_triggers row on purpose (METRIC-CLOSED-LOOP-1 exemption): fm-breach-unmapped is its detector.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_breach_cause WHERE note = 'BREACH-ONE-MEANING-2';
INSERT OR REPLACE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('external_referred_pageviews_7d', 'publishing', 'BREACH-ONE-MEANING-2'),
 ('portfolio_drift', 'structure', 'BREACH-ONE-MEANING-2'),
 ('bp26_metrics_unmeasured', 'structure', 'BREACH-ONE-MEANING-2'),
 ('bp26_issues_open', 'structure', 'BREACH-ONE-MEANING-2');
UPDATE metric_registry SET last_value = CAST((SELECT COALESCE(SUM(breaches), 0) FROM v_breach_by_cause WHERE cause_key = 'unmapped') AS TEXT),
  last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE metric = 'breaches_unmapped';
UPDATE metric_registry SET refresh_cadence = 'hourly via contract fm-breach-unmapped (trigger exemption: the contract is the detector)' WHERE metric = 'breaches_unmapped';

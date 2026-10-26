-- BREACH-ONE-MEANING-3 (2026-10-26, charter pillar autonomy). Live read 09:15Z: 63 breaches, 3 with cause 'unmapped' (autonomy_rate_7d,
-- doctrine_proposals_open, tracker_drift), flagged by fm-breach-unmapped. This maps them: autonomy rate and doctrine proposals are owner-routing
-- (work handed to the owner or a session instead of the fleet), tracker drift is structure (registries out of step).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_breach_cause WHERE note = 'BREACH-ONE-MEANING-3';
INSERT OR REPLACE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('autonomy_rate_7d', 'owner-routing', 'BREACH-ONE-MEANING-3'),
 ('doctrine_proposals_open', 'owner-routing', 'BREACH-ONE-MEANING-3'),
 ('tracker_drift', 'structure', 'BREACH-ONE-MEANING-3');
UPDATE metric_registry SET last_value = CAST((SELECT COALESCE(SUM(breaches), 0) FROM v_breach_by_cause WHERE cause_key = 'unmapped') AS TEXT),
  last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE metric = 'breaches_unmapped';

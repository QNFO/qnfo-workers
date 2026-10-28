-- BREACH-UNMAPPED-3 (2026-10-28, charter pillar autonomy, agent_issues 1000513). Live read 19:30Z: v_breach_by_cause reads 34 breaching metrics with cause 'unmapped'
-- (BP26 catalogue measurements, drift, research and doctor-era metrics registered after BREACH-ONE-MEANING-2). Each is mapped to the cause whose lever is the one the
-- metric's own trigger names: a BP26 catalogue practice not yet implemented is structural debt (the precedent of BREACH-ONE-MEANING-2 for bp26_issues_open); the
-- paper-quality and research-budget metrics are publishing; backlog and drain ratios are issue-backlog; fleet_cost_pace is spend; worker_health is heartbeat.
-- INSERT OR IGNORE: a row a session mapped with better evidence is not overwritten. A later new metric is not mapped by guess (fm-breach-unmapped flags it).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_breach_cause WHERE note = 'BREACH-UNMAPPED-3';
INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('drift_total', 'structure', 'BREACH-UNMAPPED-3'),
 ('worker_health_failure_rate', 'heartbeat', 'BREACH-UNMAPPED-3'),
 ('driver_drain_24h', 'issue-backlog', 'BREACH-UNMAPPED-3'),
 ('workers_compat_date_behind', 'structure', 'BREACH-UNMAPPED-3'),
 ('breaches_without_ticket', 'breach-doctor', 'BREACH-UNMAPPED-3'),
 ('roadmap_open_unplaced', 'structure', 'BREACH-UNMAPPED-3'),
 ('closure_branching_ratio_24h', 'issue-backlog', 'BREACH-UNMAPPED-3'),
 ('fleet_cost_pace_30d_usd', 'spend', 'BREACH-UNMAPPED-3'),
 ('post_deploy_error_workers', 'code-loop', 'BREACH-UNMAPPED-3'),
 ('research_budget_member_share', 'publishing', 'BREACH-UNMAPPED-3'),
 ('correction_latency_p95_h', 'publishing', 'BREACH-UNMAPPED-3'),
 ('forecast_resolution_criteria_complete', 'publishing', 'BREACH-UNMAPPED-3'),
 ('paper_version_immutability', 'publishing', 'BREACH-UNMAPPED-3'),
 ('a11y_violations_serious', 'structure', 'BREACH-UNMAPPED-3'),
 ('social_bot_label_enabled', 'structure', 'BREACH-UNMAPPED-3'),
 ('ai_label_coverage', 'structure', 'BREACH-UNMAPPED-3'),
 ('ai_interaction_disclosure', 'structure', 'BREACH-UNMAPPED-3'),
 ('records_past_retention', 'structure', 'BREACH-UNMAPPED-3'),
 ('pii_in_logs', 'structure', 'BREACH-UNMAPPED-3'),
 ('non_essential_cookies_set', 'structure', 'BREACH-UNMAPPED-3'),
 ('third_party_trackers', 'structure', 'BREACH-UNMAPPED-3'),
 ('dmarc_aligned_pass_rate', 'structure', 'BREACH-UNMAPPED-3'),
 ('rfc8058_headers_present', 'structure', 'BREACH-UNMAPPED-3'),
 ('kv_used_for_locking', 'structure', 'BREACH-UNMAPPED-3'),
 ('gateway_coverage', 'structure', 'BREACH-UNMAPPED-3'),
 ('ai_cache_hit_rate', 'spend', 'BREACH-UNMAPPED-3'),
 ('deploys_via_gradual', 'structure', 'BREACH-UNMAPPED-3'),
 ('security_headers_pass', 'structure', 'BREACH-UNMAPPED-3'),
 ('turnstile_on_public_forms', 'structure', 'BREACH-UNMAPPED-3'),
 ('slo_attainment_28d_min', 'structure', 'BREACH-UNMAPPED-3'),
 ('postmortem_coverage', 'structure', 'BREACH-UNMAPPED-3'),
 ('ci_gate_bypass_count', 'structure', 'BREACH-UNMAPPED-3'),
 ('metrics_worsening_7d', 'issue-backlog', 'BREACH-UNMAPPED-3'),
 ('ask_plain_share_7d', 'publishing', 'BREACH-UNMAPPED-3');
UPDATE metric_registry SET last_value = CAST((SELECT COALESCE(SUM(breaches), 0) FROM v_breach_by_cause WHERE cause_key = 'unmapped') AS TEXT),
  last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE metric = 'breaches_unmapped';

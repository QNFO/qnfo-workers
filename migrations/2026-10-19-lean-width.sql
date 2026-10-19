-- LEAN-WIDTH-1 (2026-10-19, charter pillar: cost). The failure mode behind the breaching metrics workers_ai_run_rate_usd
-- (410.84 vs 95) and fleet_cost_run_rate_usd, measured 2026-10-19 on ai_call_counters and research_queue.
-- qnfo-research-exec ran 48 concurrent stage slots (ops_config research_parallel 96, clamped) while the workers-ai spend cap was
--    breached: 10-18 made 7720 calls, 3140 failed on glm-5.3-flash rate limits and were retried or re-run, 3.77M neurons for 24
--    papers (10-09..10-12 at width 8: 22-31 papers a day at about 13k neurons each). 0.20.0 caps the width at
--    research_parallel_lean (24) while a cap is breached. Detector: research-exec's error share today stays under 25%.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-research-width-rate-limit'; DELETE FROM failure_modes WHERE fm_key = 'research-width-rate-limit'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('research-width-rate-limit', 'qnfo-research-exec runs so many concurrent stages that its cheap model is rate-limited and failed calls are retried and re-run', 'research_parallel was raised to 96 (clamped to 48) for throughput while the workers-ai spend cap was breached; leanEnsemble trimmed only the third ensemble leg, never the width', 'qnfo-research-exec 0.20.0 LEAN-WIDTH-1: the width is at most research_parallel_lean (24) while an ai_spend cap is breached', 'fm-research-width-rate-limit: errors / calls for qnfo-research-exec today in ai_call_counters under 0.25 (once 200 calls are made)', 'fm-research-width-rate-limit', '2026-10-17T00:00:00Z', NULL, 'research_parallel above about 24 with a breached ai_spend cap', '40% of research-exec calls fail; neurons per paper 6-12x the 10-10 level', 'fleet Workers AI spend (research-exec 7.35M neurons in 7 days vs 1.15M the week before)');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-research-width-rate-limit', NULL, 'LEAN-WIDTH-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT CASE WHEN SUM(calls) >= 200 AND 1.0 * SUM(errors) / SUM(calls) >= 0.25 THEN 1 ELSE 0 END FROM ai_call_counters WHERE worker = ''qnfo-research-exec'' AND day = strftime(''%Y-%m-%d'', ''now'')) AS TEXT) AS observed', 'd1-query', 3, 'qnfo-research-exec', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

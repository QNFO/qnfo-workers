-- KIMI-TIMEOUT-FALLBACK-1 (2026-10-19, charter pillar: research). Measured on qnfo-audit.ai_call_counters: kimi-k2.6, the second
-- model of qnfo-research-exec's revise stage, failed 109 of 221 calls on 2026-10-18 and 159 of 299 on 2026-10-19 (purpose
-- binding:revise, about 210 s and 45k input chars a call), each a 3046 Request timeout that aiText retried up to three times
-- before returning empty, so the revise ended "no applicable edit ... from two models" and the row stalled in review/publish
-- (fm-head-of-line, research_review_error 9). 0.21.1 sends a kimi timeout straight to glm-5.3-flash.
-- Detector: no kimi 3046 retry is logged in 120 minutes.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-revise-second-model-timeout'; DELETE FROM failure_modes WHERE fm_key = 'revise-second-model-timeout'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('revise-second-model-timeout', 'the research revise stage''s second model times out on long papers and is retried until the revise gives up', 'kimi-k2.6 answers a 45k-char revise prompt in about 210 s and returns 3046 Request timeout on half the calls; aiText treated 3046 as transient and retried the same model three times with no other fallback', 'qnfo-research-exec 0.21.1 KIMI-TIMEOUT-FALLBACK-1: a kimi timeout falls back at once to glm-5.3-flash', 'fm-revise-second-model-timeout: no "kimi-k2.6 transient (3046" retry in cloud_ops_events within 120 minutes', 'fm-revise-second-model-timeout', '2026-10-18T00:00:00Z', NULL, 'a revise patch prompt over about 40k chars sent to kimi-k2.6', 'revise ends with no applicable edit from two models; ai_model_error_rate_max_1d 0.77', 'research publication throughput and Workers AI spend (failed calls are billed)');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-revise-second-model-timeout', NULL, 'KIMI-TIMEOUT-FALLBACK-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''ai-warn'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'') AND text LIKE ''%kimi-k2.6 transient (3046%'') AS TEXT) AS observed', 'd1-query', 3, 'qnfo-research-exec', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

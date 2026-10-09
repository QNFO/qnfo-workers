-- FALSE-STOP-SCAN-1 (2026-10-09, pillar autonomy). The owner kernel 8.0.0 (docs/DOCTRINE-KERNEL.md, PR 854) recognises nine
-- signatures in its own output (conditional offer, report ending in a question, menu, un-red-teamed blocker, false stop,
-- user as executor, silent drop, friction, missing direction) and keeps a false_stop_register. PR 854 maps the register to
-- v_human_action_gate, which judges owner cards only; nothing scans what the fleet's model-backed agents emit. This file files
-- that builder with a machine owner and a closing probe, and a decision_log row. No worker, cron, metric or model call.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: none needed (the builder issue and the decision_log row hold evidence; close the builder with close_evidence if withdrawn)

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'FALSE-STOP-REGISTER-1: no register of false stops and no scan of fleet agent replies for conditional offers, menus or questions',
  'Charter pillar: autonomy (docs/DOCTRINE-KERNEL.md sections RECOGNITION and TICK self_adoption_gate). The kernel names nine output signatures (conditional offer, report ending in a question, menu, un-red-teamed blocker, false stop, user as executor, silent drop, friction, missing direction) and asks for a false_stop_register; v_human_action_gate covers owner cards only (pattern, cause_class, detection_heuristic, auto_remediation). Nothing scans what the fleet model-backed agents (qnfo-ops answers in ops_ai_log, personal-api twin replies, qnfo-ai-search answers) emit. Machine owner: qnfo-fleet-control. Build, with no new cron and no model call: a false_stop_register table seeded with the nine signatures as deterministic patterns; an hourly scan inside an existing tick over the last hour of agent replies that writes one row per hit (source, reply id, pattern); metric false_stops_7d (hits in 7 days) with its trigger. Kernel reading (p): a reply that states a refusal, a limit, or a step under a live claim of another session, with its reason, is a disposition, not a false stop, and is excluded by pattern. Trigger: this issue is open. Verification: the closing probe reads false_stops_7d with a value.',
  'claude-chat-false-stop-scan-20261009', 'autonomy', 'high', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE title LIKE 'FALSE-STOP-REGISTER-1:%');

UPDATE remediation_contracts SET verify_transport = 'd1-query', status = 'active',
  verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT last_value FROM metric_registry WHERE metric = ''false_stops_7d'') IS NOT NULL THEN ''1'' ELSE ''0'' END AS observed'
WHERE class IN (SELECT 'issue-' || id FROM agent_issues WHERE title LIKE 'FALSE-STOP-REGISTER-1:%');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-chat-false-stop-scan-20261009', 'the kernel recognitions are about agent output, which v_human_action_gate does not see', 'filed FALSE-STOP-REGISTER-1 (agent-reply scan) and corrected the kernel map row from live to partial; withdrew a duplicate kernel adoption (PR 855 first version) in favour of PR 854', 'PR 854 merged 2026-10-09 ~10:25Z with the kernel, readings (m)-(q), doctrine_lineage and v_trust_ledger', 'every kernel registry is live or has a builder with a closing probe', 'one agent_issues row and its contract; one map row in docs/DOCTRINE-KERNEL.md', 'revert the doctrine commit; close the builder with close_evidence', 'a named path to scanning fleet agent replies for conditional offers, menus and questions', 'the builder stays open with its probe reading 0 until false_stops_7d exists', 'none directly', 'doctrine files, D1 builder issue'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'filed FALSE-STOP-REGISTER-1%');

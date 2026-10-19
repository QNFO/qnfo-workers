-- SLA-120M-INBOUND-1 (2026-10-19, RESOLVE-ALL-OPEN-1, agent_issues 2583, pillar autonomy)
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET enabled = 1 WHERE metric_key = 'inbound_unactioned_72h'; DELETE FROM analytics_metric_triggers WHERE metric_key = 'inbound_unactioned_120m';
--
-- qnfo-cloud-ops 1.31.0 writes inbound_unactioned_120m every */15 member tick (owner directive 2026-10-14: no SLA over 120
-- minutes). The minute metric gets its trigger and the 72 h trigger it replaces is disabled (the 72 h metric is still written
-- for history).

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state)
VALUES ('inbound_unactioned_120m', 'fleet', 'leading',
 'human inbound messages of any age still waiting more than 120 minutes (INBOUND_SLA.first_action_min) with no first fleet action: no INBOUND-SLA-1 decision, no sent_at, no outbound mail to the sender (SLA-120M-INBOUND-1 target 0)',
 'qnfo-audit email_reply_queue + cloud_ops_events inbound-sla-q-* + outbound emails (qnfo-email-orchestrator INBOUND-SLA-1)',
 '0', 'qnfo-email-orchestrator', 'fleet', '*/10m', 'PENDING');

INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES ('inbound_unactioned_120m', 'Inbound human mail waits over 120 minutes with no fleet action', 'registry', 'gt', 0, 1,
 'Pillar autonomy (SLA-120M-INBOUND-1). A human inbound message has had no first fleet action (INBOUND-SLA-1 decision, send, or outbound mail to the sender) for more than 120 minutes. Read email_reply_queue rows with decision escalate or pending older than 120 minutes and no cloud_ops_events inbound-sla-q-<id> row; check the inbound-sla-run-<day> ledger in cloud_ops_events for the step error, then decide each row through the INBOUND-SLA-1 category map.',
 'qnfo-cloud-ops', 'agent_issues', 2, 1, 'SLA-120M-INBOUND-1: replaces the inbound_unactioned_72h trigger');

UPDATE analytics_metric_triggers SET enabled = 0, notes = COALESCE(notes, '') || ' | disabled 2026-10-19 by SLA-120M-INBOUND-1: inbound_unactioned_120m replaces it' WHERE metric_key = 'inbound_unactioned_72h';

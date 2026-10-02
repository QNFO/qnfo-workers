-- INBOUND-SLA-1 (2026-10-02, pillar: reach). Owner directives: incoming communication is handled by the fleet with no
-- manual action, and the fleet measures and improves its effectiveness (METRIC-CLOSED-LOOP-1). qnfo-email-orchestrator
-- 0.5.0 gives every human inbound message a fleet action within 72h inside docs/STRATEGY.md section 5, and refreshes the
-- two metrics below itself on its 3-hourly cron (inboundSlaMetrics, INSERT OR IGNORE + UPDATE; the same definitions as
-- here, so whichever runs first creates the row). Idempotent (safe to re-run). Not applied by the session that wrote it.
--
-- Baseline, measured read-only on qnfo-audit 2026-10-02 (before INBOUND-SLA-1):
--   - email_reply_queue: 51 rows (closed 16, escalate 10, sent 14, skip 11); the 10 'escalate' rows had no consumer.
--   - inbound_first_response_h_median_30d = 84.2 h (16 human rows received in the last 30 days; waiting rows at their age).
--   - inbound_unactioned_72h = 5 (human rows still waiting more than 72h with no fleet action, oldest 57 days).
-- Expected after deploy: the first */15 run closes 9 of the 10 and holds 1 (nothing is sent), so inbound_unactioned_72h
-- reads 0. The median first rises (to about 102 h) because two September rows get their first action only then; it falls
-- as the rows decided before 2026-10-02 leave the 30-day window (all by 2026-11-01).

-- 1. The two metrics (same text as qnfo-email-orchestrator inboundSlaMetrics; baseline and bands added here).
INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('inbound_first_response_h_median_30d', 'fleet', 'lagging', 'median hours from a human inbound message (email_reply_queue, last 30 days, machine/solicitation/automated excluded) to the first fleet action: INBOUND-SLA-1 decision, sent_at, or an outbound mail to the sender; unanswered rows count at their current age', 'qnfo-audit email_reply_queue + cloud_ops_events inbound-sla-q-* + outbound emails (qnfo-email-orchestrator INBOUND-SLA-1)', '84.2 (2026-10-02, before INBOUND-SLA-1)', '<=24', 'qnfo-email-orchestrator', 'fleet', '*/3h', '> 48', '> 72', 'MEASURED', 'computed'),
 ('inbound_unactioned_72h', 'fleet', 'leading', 'human inbound messages of any age still waiting (escalate/pending) more than 72h with no fleet action: no INBOUND-SLA-1 decision, no sent_at, no outbound mail to the sender (INBOUND-SLA-1 target 0)', 'qnfo-audit email_reply_queue + cloud_ops_events inbound-sla-q-* + outbound emails (qnfo-email-orchestrator INBOUND-SLA-1)', '5 (2026-10-02, before INBOUND-SLA-1)', '0', 'qnfo-email-orchestrator', 'fleet', '*/3h', '> 0', '> 3', 'MEASURED', 'computed');

-- 2. Their triggers (METRIC-CLOSED-LOOP-1: threshold, owner, concrete lever, definition of done). Each files one deduped
-- agent_issues row through qnfo-fleet-control evaluateMetricTriggers.
WITH v(metric_key, title, source_table, operator, threshold, priority, action, owner, cooldown) AS (VALUES
  ('inbound_unactioned_72h', 'Reach gap: a human inbound message waited more than 72h with no fleet action', 'registry', 'gt', 0, 7, 'Pillar reach. INBOUND-SLA-1 (qnfo-email-orchestrator) did not act on a human inbound message within 72h. Find the rows: SELECT q.id, q.decision, q.received_at, q.skip_reason FROM email_reply_queue q WHERE q.decision IN (''escalate'', ''pending'') AND q.sent_at IS NULL AND julianday(q.received_at) < julianday(''now'', ''-72 hours'') AND NOT EXISTS (SELECT 1 FROM cloud_ops_events d WHERE d.id = ''inbound-sla-q-'' || q.id). Then the cause, in this order: the run ledger (cloud_ops_events id inbound-sla-run-<today>: status ''disabled'' means ops_config inbound_sla_enabled is off; a stale meta.last_ok means the */15 cron is not running); repeated send failures (cloud_ops_events id inbound-sla-fail-<queue id>-*: qnfo-email /send refused EMAIL_API_KEY or the recipient); a row carrying ''cleared for auto-send'' that the drain never sent (the step skips those). Fix the step or its send path in qnfo-email-orchestrator; never close or answer a message by hand.', 'qnfo-email-orchestrator', 24),
  ('inbound_first_response_h_median_30d', 'Reach gap: human inbound mail waits over 48h (median, 30 days) for a first fleet action', 'registry', 'gt', 48, 6, 'Pillar reach. The median time from a human inbound message to the first fleet action is over 48h (target 24h). First check whether every row above 48h was received before 2026-10-02 (decided late by the first INBOUND-SLA-1 run): those leave the 30-day window by 2026-11-01 and need no action. Otherwise: lower INBOUND_SLA_RULES after_h for the slow categories (read the category of slow rows from cloud_ops_events inbound-sla-q-* meta), check deferrals in the run ledger meta (sends paused by external_sends_enabled, cadence caps), and check send failures (inbound-sla-fail-* rows). Never answer outside the docs/STRATEGY.md section 5 gates to make the number move.', 'qnfo-email-orchestrator', 168)
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, v.source_table, v.operator, v.threshold, v.priority, v.action || ' Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence. If the remedy you try does not move the metric within 7 days, say so on the issue and try a different lever (remedy_efficacy_30d counts it).', v.owner, 'agent_issues', v.cooldown, 1, 'INBOUND-SLA-1 2026-10-02'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);

-- 3. The kill switch, made visible (absent = on; '0', 'off', 'false' or 'no' stops the step; sends also need qnfo-outreach
-- pipeline_state.external_sends_enabled).
INSERT OR IGNORE INTO ops_config (key, value, note, updated_at) VALUES ('inbound_sla_enabled', '1', 'INBOUND-SLA-1 kill switch for qnfo-email-orchestrator inboundSlaStep: set 0 to stop every inbound decision and send (absent = on). Every send also needs qnfo-outreach pipeline_state.external_sends_enabled = 1.', datetime('now'));
